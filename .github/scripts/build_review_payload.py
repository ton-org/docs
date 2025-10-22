#!/usr/bin/env python3
"""
Build a GitHub Pull Request review payload from Pitaya results.

Inputs:
  - --run-dir: path to pitaya results/run_* directory (contains instances/)
  - --repo:    owner/repo for link rewriting (GITHUB_REPOSITORY)
  - --sha:     PR head SHA for absolute blob links (PR_HEAD_SHA)
  - --severities: comma-separated list of severities to include as inline comments (e.g., "HIGH" or "HIGH,MEDIUM,LOW")
  - --max-comments: hard cap for number of inline comments (default 40)

Output:
  JSON to stdout:
    {
      "body": "<composer summary with absolutized Location links>",
      "event": "APPROVE|REQUEST_CHANGES|COMMENT",
      "comments": [
        {"path":"...", "side":"RIGHT", "line":123, "start_line":120, "start_side":"RIGHT", "body":"..."}
      ]
    }
"""
from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

# ---------- Utilities ----------

def _read_json(path: Path) -> Optional[dict]:
    try:
        txt = path.read_text(encoding="utf-8", errors="replace")
        return json.loads(txt)
    except Exception:
        return None


def _iter_instance_jsons(run_dir: Path) -> Iterable[Tuple[Path, dict]]:
    inst = run_dir / "instances"
    if not inst.is_dir():
        return []
    files = list(inst.rglob("*.json"))
    for p in files:
        data = _read_json(p)
        if isinstance(data, dict):
            yield p, data


def _role_of(obj: dict) -> Optional[str]:
    # Strategy stores role either at top-level or under metadata.pr_review.role
    role = obj.get("role")
    if isinstance(role, str) and role:
        return role
    md = obj.get("metadata")
    if isinstance(md, dict):
        prr = md.get("pr_review")
        if isinstance(prr, dict):
            r = prr.get("role")
            if isinstance(r, str):
                return r
    return None


def _final_message_of(obj: dict) -> Optional[str]:
    msg = obj.get("final_message")
    return msg if isinstance(msg, str) else None


def _metrics_of(obj: dict) -> Dict[str, object]:
    m = obj.get("metrics")
    return m if isinstance(m, dict) else {}


# ---------- Link rewriting (replicates rewrite_review_links.py) ----------

def _absolutize_location_links(body: str, repo: Optional[str], sha: Optional[str]) -> str:
    if not body or not repo:
        return body
    blob_prefix = f"https://github.com/{repo}/blob/"
    doc_blob_prefix = f"{blob_prefix}{sha or 'main'}/"
    style_blob_prefix = f"{blob_prefix}main/"
    style_rel = "contribute/style-guide-extended.mdx"

    def absolutize_path(path: str) -> str:
        if path.startswith("http://") or path.startswith("https://"):
            return path
        normalized = path.lstrip("./")
        base = style_blob_prefix if normalized.startswith(style_rel) else doc_blob_prefix
        return f"{base}{normalized}"

    lines: List[str] = []
    for line in body.splitlines():
        stripped = line.lstrip()
        indent_len = len(line) - len(stripped)
        for marker in ("- Location:", "Location:", "* Location:"):
            if stripped.startswith(marker):
                prefix, _, rest = stripped.partition(":")
                link = rest.strip()
                if link:
                    link = absolutize_path(link)
                    stripped = f"{prefix}: {link}"
                    line = " " * indent_len + stripped
                break
        lines.append(line)

    rewritten = "\n".join(lines)

    style_pattern = re.compile(rf"{re.escape(style_rel)}\?plain=1#L\d+(?:-L\d+)?")

    def replace_style_links(text: str) -> str:
        result: list[str] = []
        last = 0
        for match in style_pattern.finditer(text):
            start, end = match.span()
            result.append(text[last:start])
            link = match.group(0)
            prefix_start = max(0, start - len(style_blob_prefix))
            if text[prefix_start:start] == style_blob_prefix:
                result.append(link)
            else:
                result.append(f"{style_blob_prefix}{link.lstrip('./')}")
            last = end
        result.append(text[last:])
        return "".join(result)

    rewritten = replace_style_links(rewritten)

    # Ensure doc blob URLs use PR head SHA (style guide stays on main)
    if sha:
        doc_prefix_regex = re.compile(rf"{re.escape(blob_prefix)}([^/]+)/([^\s)]+)")

        def fix_doc(match: re.Match[str]) -> str:
            base = match.group(1)
            remainder = match.group(2)
            target = "main" if remainder.startswith(style_rel) else sha
            if base == target:
                return match.group(0)
            return f"{blob_prefix}{target}/{remainder}"

        rewritten = doc_prefix_regex.sub(fix_doc, rewritten)

    return rewritten


# ---------- Finding parsing ----------

_H_RE = re.compile(r"^###\s*\[(HIGH|MEDIUM|LOW)\]\s*(.+?)\s*$", re.IGNORECASE)
_LOC_RE = re.compile(
    r"^Location:\s*([^\s?#]+)(?:\?plain=1)?#L(?P<start>\d+)(?:-L(?P<end>\d+))?\s*$",
    re.IGNORECASE,
)


@dataclass
class Finding:
    severity: str
    title: str
    path: str
    start: int
    end: int
    desc: str
    suggestion_raw: str
    suggestion_replacement: Optional[str] = None

    def key(self) -> Tuple[str, int, int, str]:
        t = re.sub(r"\W+", " ", self.title or "").strip().lower()
        return (self.path, self.start, self.end, t)


def _extract_first_code_block(text: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Return (lang, content) for the first fenced code block in text.
    """
    m = re.search(r"```([a-zA-Z0-9_-]*)\s*\n([\s\S]*?)\n```", text)
    if not m:
        return None, None
    lang = (m.group(1) or "").strip().lower()
    content = m.group(2)
    return lang, content


def _parse_findings(md: str) -> List[Finding]:
    lines = md.splitlines()
    i = 0
    items: List[Finding] = []

    while i < len(lines):
        m = _H_RE.match(lines[i])
        if not m:
            i += 1
            continue
        severity = m.group(1).upper()
        title = m.group(2).strip()
        i += 1

        # Expect blocks with Location:, Description:, Suggestion:
        loc_path = ""
        loc_start = 0
        loc_end = 0
        desc_lines: List[str] = []
        sugg_lines: List[str] = []

        # Scan until next heading or end
        section = "none"
        while i < len(lines) and not _H_RE.match(lines[i]):
            line = lines[i]
            if line.strip().lower().startswith("location:"):
                lm = _LOC_RE.match(line.strip())
                if lm:
                    loc_path = lm.group(1).strip()
                    loc_start = int(lm.group("start"))
                    loc_end = int(lm.group("end") or lm.group("start"))
                section = "location"
            elif line.strip().lower().startswith("description:"):
                section = "desc"
            elif line.strip().lower().startswith("suggestion:"):
                section = "sugg"
            else:
                if section == "desc":
                    desc_lines.append(line)
                elif section == "sugg":
                    sugg_lines.append(line)
            i += 1

        if not (loc_path and loc_start > 0 and loc_end >= loc_start):
            # Skip malformed entries
            continue
        desc = "\n".join(desc_lines).strip()
        sugg_raw = "\n".join(sugg_lines).strip()

        # Try to derive a GH suggestion replacement from the first non-diff code block
        replacement: Optional[str] = None
        lang, content = _extract_first_code_block(sugg_raw)
        if content:
            if lang and lang != "diff" and lang != "patch":
                replacement = content
            elif not lang:
                # Unspecified language — assume it's a replacement snippet
                replacement = content
            # else: diff/patch -> skip automated suggestion; keep raw in comment

        items.append(
            Finding(
                severity=severity,
                title=title,
                path=loc_path,
                start=loc_start,
                end=loc_end,
                desc=desc,
                suggestion_raw=sugg_raw,
                suggestion_replacement=replacement,
            )
        )
    return items


def _aggregate_verdict_from_metrics(metrics_list: List[Dict[str, object]]) -> Optional[str]:
    """
    Return "PASS" or "NEEDS_CHANGES" if present in any metrics dicts; prefer NEEDS_CHANGES.
    """
    verdict = None
    for m in metrics_list:
        v = m.get("pr_review_verdict")
        if isinstance(v, str):
            v = v.upper()
            if v == "NEEDS_CHANGES":
                return v
            if v == "PASS":
                verdict = v
    return verdict


# ---------- Main ----------

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run-dir", required=True, help="Pitaya results/run_* directory")
    ap.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY") or "", help="owner/repo")
    ap.add_argument("--sha", default=os.environ.get("PR_HEAD_SHA") or "", help="PR head SHA")
    ap.add_argument("--severities", default=os.environ.get("INLINE_SEVERITIES") or "HIGH")
    ap.add_argument("--max-comments", type=int, default=int(os.environ.get("MAX_COMMENTS") or 40))
    args = ap.parse_args()

    run_dir = Path(args.run_dir)
    repo = args.repo.strip()
    sha = args.sha.strip()
    include_sevs = {s.strip().upper() for s in (args.severities or "HIGH").split(",") if s.strip()}

    files = list(_iter_instance_jsons(run_dir))
    if not files:
        raise SystemExit("No instance JSON files found in run dir")

    composer_body: Optional[str] = None
    composer_metrics: Dict[str, object] = {}
    validator_messages: List[str] = []
    metrics_list: List[Dict[str, object]] = []

    for path, obj in files:
        role = _role_of(obj) or ""
        fm = _final_message_of(obj)
        metrics = _metrics_of(obj)
        if role == "composer":
            if fm and not composer_body:
                composer_body = fm
            if metrics:
                composer_metrics.update(metrics)
        elif role == "validator":
            if fm:
                validator_messages.append(fm)
            if metrics:
                metrics_list.append(metrics)
        else:
            # Heuristic: treat messages that end with a fenced JSON trailer as validator outputs
            if isinstance(fm, str) and re.search(r"```json\s*\{[\s\S]*\}\s*```\s*$", fm, re.IGNORECASE):
                validator_messages.append(fm)
                if metrics:
                    metrics_list.append(metrics)

    # Fallback verdict from validators' metrics if composer metrics missing
    verdict = composer_metrics.get("pr_review_verdict")
    if not isinstance(verdict, str):
        verdict = _aggregate_verdict_from_metrics(metrics_list)
    verdict_str = (verdict or "").upper()

    # Determine review event
    if verdict_str == "PASS":
        event = "APPROVE"
    elif verdict_str == "NEEDS_CHANGES":
        event = "REQUEST_CHANGES"
    else:
        event = "COMMENT"

    # Rewrite composer body links; if missing, produce a minimal body
    body = composer_body or ""
    body = _absolutize_location_links(body, repo if repo else None, sha if sha else None)
    if not body.strip():
        body = "Automated review summary is unavailable for this run."

    # Parse validator findings and deduplicate
    findings: List[Finding] = []
    for msg in validator_messages:
        findings.extend(_parse_findings(msg or ""))

    # Filter by severities
    findings = [f for f in findings if f.severity in include_sevs]

    # Deduplicate by (path, start, end, normalized title)
    seen: set[Tuple[str, int, int, str]] = set()
    deduped: List[Finding] = []
    for f in findings:
        k = f.key()
        if k in seen:
            continue
        seen.add(k)
        deduped.append(f)

    # Cap number of comments
    deduped = deduped[: max(0, int(args.max_comments))]

    # Build inline comments
    comments: List[Dict[str, object]] = []
    # Optional bounds check against workspace files to reduce 422 errors
    repo_root = Path(os.environ.get("GITHUB_WORKSPACE") or ".")
    for f in deduped:
        # Clamp line numbers to file length when possible
        file_path = (repo_root / f.path).resolve()
        if file_path.is_file():
            try:
                line_count = sum(1 for _ in file_path.open("r", encoding="utf-8", errors="ignore"))
                if f.end > line_count:
                    f.end = line_count
                if f.start > line_count:
                    # Skip invalid locations entirely
                    continue
            except Exception:
                pass
        # Compose comment body with optional suggestion
        parts: List[str] = []
        parts.append(f"### [{f.severity}] {f.title}")
        # Absolute link for convenience
        abs_link = f"https://github.com/{repo}/blob/{sha or 'main'}/{f.path}?plain=1#L{f.start}-L{f.end}"
        parts.append(f"Location: {abs_link}")
        if f.desc.strip():
            parts.append("")
            parts.append("Description:")
            parts.append(f.desc.strip())
        if f.suggestion_replacement:
            parts.append("")
            parts.append("Suggested change:")
            parts.append("```suggestion")
            parts.append(f.suggestion_replacement.rstrip("\n"))
            parts.append("```")
        elif f.suggestion_raw.strip():
            parts.append("")
            parts.append("Suggestion:")
            parts.append(f.suggestion_raw.strip())
        body_text = "\n".join(parts).strip()

        c: Dict[str, object] = {
            "path": f.path,
            "side": "RIGHT",
            "body": body_text,
        }
        if f.start == f.end:
            c["line"] = f.end
        else:
            c["start_line"] = f.start
            c["line"] = f.end
            c["start_side"] = "RIGHT"
        comments.append(c)

    out = {
        "body": body,
        "event": event,
        "comments": comments,
    }
    json.dump(out, fp=os.fdopen(1, "w"), ensure_ascii=False)


if __name__ == "__main__":
    main()

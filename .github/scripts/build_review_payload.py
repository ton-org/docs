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
      "event": "COMMENT",
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

    # 1) Fix explicit Location: lines when present
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

    # 2) Convert any doc links like path/to/file.mdx?plain=1#L10-L20 anywhere in text
    #    Avoid variable-width lookbehinds; match optional scheme as a capture and skip when present.
    if repo:
        generic_pattern = re.compile(
            r"(?P<prefix>https?://)?(?P<path>[A-Za-z0-9_./\-]+\.(?:md|mdx|json))\?plain=1#L\d+(?:-L\d+)?"
        )

        def repl(match: re.Match[str]) -> str:
            if match.group("prefix"):
                # Already absolute; leave as-is
                return match.group(0)
            p = match.group("path").lstrip("./")
            base = style_blob_prefix if p.startswith(style_rel) else doc_blob_prefix
            # Append the anchor part after the path
            suffix = match.group(0)[len(match.group("path")) :]
            return f"{base}{p}{suffix}"

        rewritten = generic_pattern.sub(repl, rewritten)

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


def _build_from_sidecar(sidecar: dict, *, repo: str, sha: str, repo_root: Path) -> Tuple[str, str, List[Dict[str, object]]]:
    """Return (body, event, comments[]) from sidecar index.json. Event is always COMMENT."""
    body = str(sidecar.get("intro") or "").strip()
    # Force COMMENT-only behavior regardless of sidecar content
    event = "COMMENT"
    commit_id = str(sidecar.get("commit_id") or "").strip()
    if commit_id:
        sha = commit_id
    items = sidecar.get("selected_details") or []
    comments: List[Dict[str, object]] = []
    def sanitize_code_for_gh_suggestion(code: str) -> str:
        """Normalize a suggestion snippet for GitHub suggestions.
        - If a fenced block is present, extract its inner content.
        - Remove diff headers and treat leading '+' additions as plain text; drop '-' lines.
        """
        # Extract inner of first fenced block when present
        lang, inner = _extract_first_code_block(code)
        text = inner if inner is not None else code
        out: List[str] = []
        for ln in text.splitlines():
            if ln.startswith('--- ') or ln.startswith('+++ ') or ln.startswith('@@'):
                continue
            if ln.startswith('+') and not ln.startswith('++'):
                out.append(ln[1:])
                continue
            if ln.startswith('-') and not ln.startswith('--'):
                # Skip removed lines in GH suggestion body
                continue
            out.append(ln)
        return "\n".join(out).rstrip("\n")

    for it in items:
        try:
            path = str(it.get("path") or "").strip()
            start = int(it.get("start") or 0)
            end = int(it.get("end") or 0)
            # severity is not required for comment body; skip storing it
            title = str(it.get("title") or "").strip()
            desc = str(it.get("desc") or "").strip()
            sugg = it.get("suggestion") or {}
            code = str(sugg.get("code") or "")
        except Exception:
            continue
        if not (path and start > 0 and end >= start and title):
            continue
        # Clamp to file length when available
        file_path = (repo_root / path).resolve()
        if file_path.is_file():
            try:
                line_count = sum(1 for _ in file_path.open("r", encoding="utf-8", errors="ignore"))
                if end > line_count:
                    end = line_count
                if start > line_count:
                    continue
            except Exception:
                pass
        # Build comment body with title + description and optional suggestion fence
        code = code.rstrip("\n")
        parts: List[str] = []
        # Prefer including severity in heading when present in sidecar
        sev = (it.get("severity") or "").strip().upper()
        if title:
            heading = f"### [{sev}] {title}".strip()
            parts.append(heading)
        if desc:
            parts.append("")
            parts.append(desc)
        # When replacement text is present, include a GitHub suggestion block.
        # Allow empty replacement (deletion) suggestions: GitHub treats an empty block as delete selected lines.
        if code is not None:
            repl = sanitize_code_for_gh_suggestion(code)
            repl_lines = repl.splitlines()
            n_range = end - start + 1
            if (
                (n_range == 1 and len(repl_lines) == 1) or
                (n_range > 1 and len(repl_lines) == n_range) or
                (repl == "" and n_range >= 1)
            ):
                parts.append("")
                parts.append("```suggestion")
                if repl:
                    parts.append(repl)
                parts.append("```")
        else:
            # No auto-fix block; rely on title/description and CTA only.
            pass
        # Always include the feedback CTA
        parts.append("")
        parts.append("Please leave a reaction 👍/👎 to this suggestion to improve future reviews for everyone!")
        body_text = "\n".join(parts).strip()
        body_text = _absolutize_location_links(body_text, repo or None, sha or None)

        c: Dict[str, object] = {"path": path, "side": "RIGHT", "body": body_text}
        if start == end:
            c["line"] = end
        else:
            c["start_line"] = start
            c["line"] = end
            c["start_side"] = "RIGHT"
        comments.append(c)
    # Rewrite links in top-level body
    body = _absolutize_location_links(body, repo or None, sha or None)
    return body, event, comments


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
    uid: Optional[str] = None

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


_TRAILER_JSON_RE = re.compile(r"```json\s*(\{[\s\S]*?\})\s*```\s*$", re.IGNORECASE | re.MULTILINE)
# Remove any fenced code blocks (```lang ... ```), used when we can't submit a proper GH suggestion
_FENCED_BLOCK_RE = re.compile(r"```[a-zA-Z0-9_-]*\s*\n[\s\S]*?\n```", re.MULTILINE)

def _strip_trailing_json_trailer(text: str) -> str:
    """Remove a trailing fenced JSON block (validator trailer) from text."""
    return _TRAILER_JSON_RE.sub("", text).rstrip()


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
        # Remove any trailing validator JSON trailer that might have been captured
        sugg_raw = _strip_trailing_json_trailer(sugg_raw)

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


def _parse_trailer_findings(md: str) -> List[dict]:
    """Parse the fenced JSON trailer at the end and return .findings list when present."""
    m = re.search(r"```json\s*(\{[\s\S]*?\})\s*```\s*$", md, flags=re.IGNORECASE | re.MULTILINE)
    if not m:
        return []
    try:
        obj = json.loads(m.group(1))
        if isinstance(obj, dict):
            f = obj.get("findings")
            if isinstance(f, list):
                out = []
                for it in f:
                    if isinstance(it, dict):
                        out.append(it)
                return out
    except Exception:
        return []
    return []


# Removed verdict aggregation logic: event selection is fixed to COMMENT.


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

    # Prefer sidecar when present (new strategy contract)
    sidecar_path = run_dir / "review" / "index.json"
    if sidecar_path.exists():
        try:
            sidecar = json.loads(sidecar_path.read_text(encoding="utf-8", errors="replace"))
        except Exception as e:
            raise SystemExit(f"Failed to read sidecar {sidecar_path}: {e}")
        body, _event, comments = _build_from_sidecar(sidecar, repo=repo, sha=sha, repo_root=Path(os.environ.get("GITHUB_WORKSPACE") or "."))
        # Always submit a COMMENT review regardless of findings
        out = {
            "body": body or "No documentation issues detected.",
            "event": "COMMENT",
            "comments": comments,
            "commit_id": (sidecar.get("commit_id") or sha) or None,
        }
        json.dump(out, fp=os.fdopen(1, "w"), ensure_ascii=False)
        return

    # Fallback: derive from instances when sidecar is absent
    files = list(_iter_instance_jsons(run_dir))
    if not files:
        raise SystemExit("No instance JSON files found in run dir and no sidecar present")

    composer_body: Optional[str] = None
    composer_metrics: Dict[str, object] = {}
    validator_messages: List[str] = []
    validator_trailer_findings: List[dict] = []
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
                # collect trailer findings if present
                validator_trailer_findings.extend(_parse_trailer_findings(fm))
            if metrics:
                metrics_list.append(metrics)
        else:
            # Heuristic: treat messages that end with a fenced JSON trailer as validator outputs
            if isinstance(fm, str) and re.search(r"```json\s*\{[\s\S]*\}\s*```\s*$", fm, re.IGNORECASE):
                validator_messages.append(fm)
                validator_trailer_findings.extend(_parse_trailer_findings(fm))
                if metrics:
                    metrics_list.append(metrics)

    # Removed verdict computation; not used for event selection.

    # Event will be set by simplified rule after building comments.

    # Derive selected finding IDs and a human body from composer output (new composer may return JSON)
    selected_ids: List[str] = []
    body = composer_body or ""
    composer_json = None
    try:
        composer_json = json.loads(body) if body.strip().startswith("{") else None
    except Exception:
        composer_json = None
    if isinstance(composer_json, dict) and ("intro" in composer_json or "selected_ids" in composer_json):
        intro = composer_json.get("intro")
        if isinstance(intro, str) and intro.strip():
            body = intro.strip()
        else:
            body = "Automated review summary"
        ids = composer_json.get("selected_ids")
        if isinstance(ids, list):
            seen_ids = set()
            for v in ids:
                if isinstance(v, str) and v not in seen_ids:
                    selected_ids.append(v)
                    seen_ids.add(v)
    # Fallback to original markdown body
    body = _absolutize_location_links(body, repo if repo else None, sha if sha else None)
    if not body.strip():
        body = "No documentation issues detected."

    # Parse validator findings and deduplicate
    findings: List[Finding] = []
    for msg in validator_messages:
        parsed = _parse_findings(msg or "")
        # Attempt to attach UIDs from trailer by matching on (path,start,end,severity,title)
        if validator_trailer_findings:
            trailer_index: Dict[Tuple[str, int, int, str, str], str] = {}
            for it in validator_trailer_findings:
                path = str(it.get("path") or "").strip()
                start = int(it.get("start") or 0)
                end = int(it.get("end") or 0)
                sev = str(it.get("severity") or "").strip().upper()
                title = str(it.get("title") or "").strip()
                uid = str(it.get("uid") or "").strip()
                if path and start > 0 and end >= start and sev and title and uid:
                    trailer_index[(path, start, end, sev, title)] = uid
            for f in parsed:
                key = (f.path, f.start, f.end, f.severity.upper(), f.title)
                if key in trailer_index:
                    f.uid = trailer_index[key]
        findings.extend(parsed)

    # Build selected findings list (preserve order) when composer provided UIDs
    selected_findings: List[Finding] = []
    if selected_ids:
        # Index validator trailer findings by uid and tuple for robust matching
        trailer_by_uid: Dict[str, dict] = {}
        for it in validator_trailer_findings:
            uid = str(it.get("uid") or "").strip()
            if uid:
                trailer_by_uid[uid] = it
        # Index parsed findings for lookup by (path,start,end,sev,title)
        parsed_index: Dict[Tuple[str, int, int, str, str], Finding] = {}
        parsed_alt_index: Dict[Tuple[str, int, int, str], Finding] = {}
        for f in findings:
            parsed_index[(f.path, f.start, f.end, f.severity.upper(), f.title)] = f
            parsed_alt_index[(f.path, f.start, f.end, f.severity.upper())] = f
        for uid in selected_ids:
            fobj: Optional[Finding] = None
            t = trailer_by_uid.get(uid)
            if t:
                key = (
                    str(t.get("path") or "").strip(),
                    int(t.get("start") or 0),
                    int(t.get("end") or 0),
                    str(t.get("severity") or "").strip().upper(),
                    str(t.get("title") or "").strip(),
                )
                fobj = parsed_index.get(key)
                if not fobj:
                    key2 = (key[0], key[1], key[2], key[3])
                    fobj = parsed_alt_index.get(key2)
                if not fobj and key[0] and key[1] > 0 and key[2] >= key[1]:
                    # Create a minimal finding from trailer
                    fobj = Finding(
                        severity=key[3] or "HIGH",
                        title=key[4] or "Selected finding",
                        path=key[0],
                        start=key[1],
                        end=key[2],
                        desc="",
                        suggestion_raw="",
                    )
                    fobj.uid = uid
            else:
                # Fallback: search parsed findings by uid
                fobj = next((pf for pf in findings if pf.uid == uid), None)
            if fobj and fobj.severity in include_sevs:
                selected_findings.append(fobj)
        base_list = selected_findings
    else:
        # Filter by severities, then dedupe
        findings = [f for f in findings if f.severity in include_sevs]
        seen: set[Tuple[str, int, int, str]] = set()
        deduped: List[Finding] = []
        for f in findings:
            k = f.key()
            if k in seen:
                continue
            seen.add(k)
            deduped.append(f)
        base_list = deduped

    # Cap number of comments
    base_list = base_list[: max(0, int(args.max_comments))]

    # Build inline comments
    comments: List[Dict[str, object]] = []
    # Optional bounds check against workspace files to reduce 422 errors
    repo_root = Path(os.environ.get("GITHUB_WORKSPACE") or ".")
    for f in base_list:
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
        if f.desc.strip():
            parts.append("")
            parts.append(f.desc.strip())
        # Only submit commit suggestions when the replacement likely covers the full selected range
        submitted_suggestion = False
        if f.suggestion_replacement is not None:
            repl = f.suggestion_replacement.rstrip("\n")
            repl_lines = repl.splitlines()
            n_range = f.end - f.start + 1
            if (
                (n_range == 1 and len(repl_lines) == 1) or
                (n_range > 1 and len(repl_lines) == n_range) or
                (repl == "" and n_range >= 1)
            ):
                parts.append("")
                parts.append("```suggestion")
                if repl:
                    parts.append(repl)
                parts.append("```")
                submitted_suggestion = True
        if not submitted_suggestion and f.suggestion_raw.strip():
            # Detect deletion-only diffs and convert to empty GH suggestion
            raw = f.suggestion_raw
            lang, inner = _extract_first_code_block(raw)
            text = inner if inner is not None else raw
            lines = [ln.strip() for ln in text.splitlines()]
            has_add = any(ln.startswith('+') and not ln.startswith('++') for ln in lines)
            has_del = any(ln.startswith('-') and not ln.startswith('--') for ln in lines)
            if has_del and not has_add:
                parts.append("")
                parts.append("```suggestion")
                parts.append("```")
                submitted_suggestion = True
        if not submitted_suggestion and f.suggestion_raw.strip():
            parts.append("")
            # Do not include fenced blocks if we can't guarantee a commit suggestion
            cleaned = _TRAILER_JSON_RE.sub("", f.suggestion_raw.strip())
            cleaned = _FENCED_BLOCK_RE.sub("", cleaned).strip()
            if cleaned:
                parts.append(cleaned)
        # Always include the feedback CTA
        parts.append("")
        parts.append("Please leave a reaction 👍/👎 to this suggestion to improve future reviews for everyone!")
        body_text = "\n".join(parts).strip()
        # Rewrite style-guide references to clickable blob URLs
        body_text = _absolutize_location_links(body_text, repo if repo else None, sha if sha else None)

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

    # Always submit a COMMENT review, never approve or request changes.
    event = "COMMENT"

    out = {
        "body": body,
        "event": event,
        "comments": comments,
        "commit_id": sha or None,
    }
    json.dump(out, fp=os.fdopen(1, "w"), ensure_ascii=False)


if __name__ == "__main__":
    main()

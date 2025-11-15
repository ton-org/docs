#!/usr/bin/env python3
"""
Docs stats tool

- Reads navigation from docs.json (only visible pages)
- Filters stubs by explicit <Stub .../> tag only
- Counts words/images and prints a concise summary
- Optional: history (last commit per UTC day, committer date) and simple charts

Usage:
  python3 scripts/stats.py            # latest
  python3 scripts/stats.py latest     # same as above
  python3 scripts/stats.py history    # build stats/history.{jsonl,csv}
  python3 scripts/stats.py charts     # render simple charts from history.csv
  python3 scripts/stats.py all        # latest + history + charts
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

REPO_ROOT = Path(__file__).resolve().parents[1]
DOCS_JSON_PATH = REPO_ROOT / "docs.json"
STATS_DIR = REPO_ROOT / "stats"
CHART_DIR = STATS_DIR / "charts"
HISTORY_CSV = STATS_DIR / "history.csv"
EXCLUDE_UTC_DAYS = {
    "2025-09-02",  # temporary nav anomaly
}


# -------- navigation --------
def read_json(path: Path) -> dict:
    return json.loads(path.read_text("utf-8"))


def nav_slugs(docs: dict) -> List[str]:
    pages = docs.get("navigation", {}).get("pages", [])
    out: List[str] = []

    def visit(node):
        if isinstance(node, str):
            out.append(node)
        elif isinstance(node, dict):
            if isinstance(node.get("pages"), list):
                for ch in node["pages"]:
                    visit(ch)
            if isinstance(node.get("page"), str):
                out.append(node["page"])

    for n in pages:
        visit(n)
    seen = set()
    uniq = []
    for s in out:
        if s not in seen:
            seen.add(s)
            uniq.append(s)
    return uniq


def resolve_file(slug: str) -> Optional[str]:
    for rel in (
        f"{slug}.mdx",
        f"{slug}.md",
        str(Path(slug) / "index.mdx"),
        str(Path(slug) / "index.md"),
    ):
        if (REPO_ROOT / rel).exists():
            return rel
    return None


# -------- content helpers --------
def strip_frontmatter(s: str) -> str:
    if s.startswith("---"):
        end = s.find("\n---", 3)
        if end != -1:
            end = s.find("\n", end + 4)
            return s[end + 1 :] if end != -1 else s
    return s


def strip_imports(s: str) -> str:
    return re.sub(r"^\s*(import|export)\s[^\n]*$", " ", s, flags=re.M)


def split_fences(s: str) -> Tuple[str, str]:
    """Split content into prose (no fenced blocks) and fenced code text."""
    prose_lines: List[str] = []
    code_lines: List[str] = []
    in_fence = False
    fence = re.compile(r"^\s*(```|~~~)")
    for line in s.splitlines():
        if fence.match(line):
            in_fence = not in_fence
            continue
        if in_fence:
            code_lines.append(line)
        else:
            prose_lines.append(line)
    return "\n".join(prose_lines), "\n".join(code_lines)


def extract_counts(s: str) -> Tuple[int, int, int]:
    """Return prose_words, code_block_lines, code_block_words.

    Inline code policy: count words inside inline code spans, but if a span
    contains more than 20 words, treat it as prose (drop backticks and keep
    the content in the prose stream) rather than as special inline code.

    - prose_words: words after removing fenced code and markup, plus words from
      small inline code spans (≤ 20 words). Large spans (> 20 words) are kept in prose.
    - code_block_lines: non-empty lines inside fenced blocks (``` or ~~~)
    """
    s = strip_frontmatter(s)
    s = strip_imports(s)
    prose, code_blocks = split_fences(s)
    # inline code (outside fences)
    inline_small_words = 0
    pattern = re.compile(r"`([^`]+)`")

    def repl(m: re.Match) -> str:
        nonlocal inline_small_words
        content = m.group(1)
        wc = len(re.findall(r"\w+", content))
        if wc > 20:
            # treat as prose: drop backticks, keep content
            return f" {content} "
        inline_small_words += wc
        # remove small inline span from prose; we'll add its words separately
        return " "

    prose = pattern.sub(repl, prose)
    # drop images/links/tags from prose
    prose = re.sub(r"!\[[^\]]*\]\([^\)]+\)", " ", prose)
    prose = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", prose)
    prose = re.sub(r"<[^>]+>", " ", prose)
    prose_words = len(re.findall(r"\w+", prose)) + inline_small_words
    # count non-empty lines and words in fenced blocks
    code_block_lines = sum(1 for ln in code_blocks.splitlines() if ln.strip())
    code_block_words = len(re.findall(r"\w+", code_blocks))
    return prose_words, code_block_lines, code_block_words


def count_words(s: str) -> int:
    return len(re.findall(r"\w+", s, flags=re.UNICODE))


def count_images(src: str) -> int:
    return (
        len(re.findall(r"!\[[^\]]*\]\([^\)]+\)", src))
        + len(re.findall(r"<img\b[^>]*>", src, flags=re.I))
        + len(re.findall(r"<Image\b[^>]*?/?>", src, flags=re.I))
    )


def is_stub(content: str) -> bool:
    # Deterministic: page is a stub iff it contains <Stub .../>
    return re.search(r"<\s*Stub\b", content, flags=re.I) is not None


# -------- stats core --------
def summarize(words: List[int]) -> Dict[str, int]:
    if not words:
        return dict(min=0, p25=0, median=0, p75=0, max=0, average=0)
    xs = sorted(words)
    n = len(xs)

    def pick(q: int) -> int:
        k = max(0, min(n - 1, int((q / 100.0) * n + 0.5) - 1))
        return xs[k]

    return dict(
        min=xs[0],
        p25=pick(25),
        median=pick(50),
        p75=pick(75),
        max=xs[-1],
        average=round(sum(xs) / n),
    )


def write_json(path: Path, obj: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def run_latest() -> None:
    docs = read_json(DOCS_JSON_PATH)
    slugs = nav_slugs(docs)
    pages_all: List[Dict] = []
    stubs: List[Dict] = []
    warnings: List[str] = []

    for slug in slugs:
        rel = resolve_file(slug)
        if not rel:
            warnings.append(f"Unresolved slug: {slug}")
            continue
        content = (REPO_ROOT / rel).read_text("utf-8")
        prose_words, code_block_lines, code_block_words = extract_counts(content)
        row = {
            "slug": slug,
            "path": rel,
            "stub": is_stub(content),
            "words": prose_words,
            "images": count_images(content),
            "codeBlockLines": code_block_lines,
            "codeBlockWords": code_block_words,
        }
        pages_all.append(row)
        if row["stub"]:
            stubs.append(row)

    included = [p for p in pages_all if not p["stub"]]
    totals = {
        "pages": len(included),
        "words": sum(p["words"] for p in included),
        "images": sum(p["images"] for p in included),
        "codeBlockLines": sum(p.get("codeBlockLines", 0) for p in included),
        "codeBlockWords": sum(p.get("codeBlockWords", 0) for p in included),
    }
    dist = summarize([p["words"] for p in included])

    write_json(
        STATS_DIR / "latest.json",
        {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "totals": totals,
            "distribution": dist,
        },
    )
    write_json(STATS_DIR / "pages-latest.json", included)
    if stubs:
        write_json(STATS_DIR / "stubs-latest.json", stubs)
    if warnings:
        write_json(STATS_DIR / "warnings-latest.json", warnings)

    print("Docs stats (latest)")
    print(f"Pages:  {totals['pages']}")
    print(f"Words:  {totals['words']}")
    print(f"Images: {totals['images']}")
    print(f"Code block lines:  {totals['codeBlockLines']}")
    print(f"Code block words:  {totals['codeBlockWords']}")
    print(
        f"Distribution: min={dist['min']} p25={dist['p25']} median={dist['median']} p75={dist['p75']} max={dist['max']} avg={dist['average']}"
    )


def git(cmd: List[str]) -> str:
    return subprocess.check_output(["git", *cmd], cwd=str(REPO_ROOT)).decode(
        "utf-8", errors="replace"
    )


def day_commits() -> List[Tuple[str, str]]:
    lines = [
        l
        for l in git(
            ["log", "--date=iso-strict", "--pretty=format:%H%x09%cI"]
        ).splitlines()
        if l.strip()
    ]
    seen = set()
    out: List[Tuple[str, str]] = []
    for ln in lines:
        h, iso = ln.split("\t", 1)
        try:
            d = (
                datetime.fromisoformat(iso.replace("Z", "+00:00"))
                .astimezone(timezone.utc)
                .strftime("%Y-%m-%d")
            )
        except Exception:
            d = iso[:10]
        if d not in seen:
            seen.add(d)
            out.append((d, h))
    out.reverse()
    return out


def _git_show_silent(sha: str, rel: str) -> Optional[str]:
    try:
        cp = subprocess.run(
            ["git", "show", f"{sha}:{rel}"],
            cwd=str(REPO_ROOT),
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            check=True,
        )
        return cp.stdout.decode("utf-8", errors="replace")
    except subprocess.CalledProcessError:
        return None


def resolve_at_commit(slug: str, sha: str) -> Optional[Tuple[str, str]]:
    for rel in (
        f"{slug}.mdx",
        f"{slug}.md",
        str(Path(slug) / "index.mdx"),
        str(Path(slug) / "index.md"),
    ):
        content = _git_show_silent(sha, rel)
        if content is not None:
            return rel, content
    return None


def compute_snapshot(docs_json_str: str, sha: str) -> Tuple[Dict, Dict, List[Dict]]:
    docs = json.loads(docs_json_str)
    slugs = nav_slugs(docs)
    pages: List[Dict] = []
    stubs: List[Dict] = []
    for slug in slugs:
        hit = resolve_at_commit(slug, sha)
        if not hit:
            continue
        rel, content = hit
        prose_words, code_block_lines, code_block_words = extract_counts(content)
        row = {
            "slug": slug,
            "path": rel,
            "stub": is_stub(content),
            "words": prose_words,
            "images": count_images(content),
            "codeBlockLines": code_block_lines,
            "codeBlockWords": code_block_words,
        }
        if not row["stub"]:
            pages.append(row)
        else:
            stubs.append(row)
    totals = {
        "pages": len(pages),
        "words": sum(p["words"] for p in pages),
        "images": sum(p["images"] for p in pages),
        "codeBlockLines": sum(p.get("codeBlockLines", 0) for p in pages),
        "codeBlockWords": sum(p.get("codeBlockWords", 0) for p in pages),
    }
    dist = summarize([p["words"] for p in pages])
    return totals, dist, stubs


def run_history() -> None:
    STATS_DIR.mkdir(parents=True, exist_ok=True)
    (STATS_DIR / "history.jsonl").write_text("", encoding="utf-8")
    (STATS_DIR / "history.csv").write_text(
        "date,commit,pages,words,images,min,p25,median,p75,max,avg\n", encoding="utf-8"
    )
    for day, sha in day_commits():
        if day in EXCLUDE_UTC_DAYS:
            continue
        docs_str = _git_show_silent(sha, "docs.json")
        if docs_str is None:
            continue
        totals, dist, _ = compute_snapshot(docs_str, sha)
        with (STATS_DIR / "history.jsonl").open("a", encoding="utf-8") as jf:
            jf.write(
                json.dumps(
                    {"date": day, "commit": sha, "totals": totals, "distribution": dist}
                )
                + "\n"
            )
        with (STATS_DIR / "history.csv").open("a", encoding="utf-8") as cf:
            cf.write(
                f"{day},{sha},{totals['pages']},{totals['words']},{totals['images']},{dist['min']},{dist['p25']},{dist['median']},{dist['p75']},{dist['max']},{dist['average']}\n"
            )
        print(f"{day} {sha[:7]} pages={totals['pages']} words={totals['words']}")
    print("History written to stats/history.jsonl and stats/history.csv")


def run_charts() -> None:
    if not HISTORY_CSV.exists():
        print("stats/history.csv not found; run: python3 scripts/stats.py history")
        return
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import matplotlib.dates as mdates
    except Exception as e:
        print("[charts] matplotlib not available:", e)
        return
    rows = []
    with HISTORY_CSV.open("r", encoding="utf-8") as f:
        r = csv.DictReader(f)
        for d in r:
            rows.append(
                {
                    "date": datetime.strptime(d["date"], "%Y-%m-%d"),
                    "pages": int(d["pages"]),
                    "words": int(d["words"]),
                }
            )
    if not rows:
        print("history.csv empty")
        return

    def plot(field: str, title: str, color: str, out: Path):
        x = [r["date"] for r in rows]
        y = [r[field] for r in rows]
        fig, ax = plt.subplots(figsize=(10, 3), dpi=140)
        ax.plot(x, y, color=color, linewidth=2)
        ax.set_title(title)
        locator = mdates.AutoDateLocator()
        ax.xaxis.set_major_locator(locator)
        ax.xaxis.set_major_formatter(mdates.ConciseDateFormatter(locator))
        ax.grid(True, color="#e5e7eb")
        fig.tight_layout()
        out.parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(out, bbox_inches="tight")
        plt.close(fig)

    plot("words", "Total Words Over Time", "#3b82f6", CHART_DIR / "total_words.png")
    plot("pages", "Total Pages Over Time", "#10b981", CHART_DIR / "total_pages.png")
    print("Charts written: stats/charts/total_words.png, total_pages.png")


def main():
    if not DOCS_JSON_PATH.exists():
        print("docs.json not found", file=sys.stderr)
        sys.exit(1)
    ap = argparse.ArgumentParser(description="Docs stats (clean)")
    ap.add_argument(
        "cmd",
        nargs="?",
        choices=["latest", "history", "charts", "all"],
        default="latest",
    )
    args = ap.parse_args()
    if args.cmd in ("latest", "all"):
        run_latest()
    if args.cmd in ("history", "all"):
        run_history()
    if args.cmd in ("charts", "all"):
        run_charts()


if __name__ == "__main__":
    main()

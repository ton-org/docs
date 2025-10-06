#!/usr/bin/env python3
"""
Unified docs statistics tool

Single entry point that:
- Computes latest stats (only pages visible via docs.json, with stub filtering)
- Computes per-day history in UTC (last commit per day)
- Renders charts (PNG via matplotlib): total_words, total_pages
- Prints console summaries (totals, distribution, extremes)

Usage:
  python3 scripts/stats.py  # runs everything (latest + history + charts)

Outputs are written to stats/ (gitignored by repo).
"""

from __future__ import annotations

import csv
import json
import re
import sys
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple
from urllib.parse import urlparse

REPO_ROOT = Path(__file__).resolve().parents[1]
DOCS_JSON_PATH = REPO_ROOT / 'docs.json'
STATS_DIR = REPO_ROOT / 'stats'
CHART_DIR = STATS_DIR / 'charts'
HISTORY_CSV = STATS_DIR / 'history.csv'
EXCLUDE_UTC_DAYS = {
    # Exclude anomalous spike introduced by temporary nav on Sep 2, 2025
    '2025-09-02',
}


# ----------------- helpers -----------------

def read_json(path: Path) -> dict:
    with path.open('r', encoding='utf-8') as f:
        return json.load(f)


def get_navigation_slugs_from_docs_json(obj: dict) -> List[str]:
    pages = obj.get('navigation', {}).get('pages', [])
    out: List[str] = []

    def visit(node):
        if isinstance(node, str):
            out.append(node)
            return
        if isinstance(node, dict):
            if 'pages' in node and isinstance(node['pages'], list):
                for child in node['pages']:
                    visit(child)
            if 'page' in node and isinstance(node['page'], str):
                out.append(node['page'])

    for n in pages:
        visit(n)

    # Deduplicate preserving order
    seen = set()
    result = []
    for s in out:
        if s not in seen:
            seen.add(s)
            result.append(s)
    return result


def resolve_order(slug: str) -> List[str]:
    return [
        f"{slug}.mdx",
        f"{slug}.md",
        str(Path(slug) / 'index.mdx'),
        str(Path(slug) / 'index.md'),
    ]


def resolve_slug_to_path_latest(slug: str) -> Optional[str]:
    for rel in resolve_order(slug):
        p = REPO_ROOT / rel
        if p.exists():
            return rel
    return None


def git_show(sha: str, rel_path: str) -> Optional[str]:
    try:
        cp = subprocess.run(
            ['git', 'show', f'{sha}:{rel_path}'],
            cwd=str(REPO_ROOT),
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            check=True,
        )
        return cp.stdout.decode('utf-8', errors='replace')
    except subprocess.CalledProcessError:
        return None


def resolve_slug_to_path_at_commit(slug: str, sha: str) -> Optional[Tuple[str, str]]:
    for rel in resolve_order(slug):
        content = git_show(sha, rel)
        if content is not None:
            return rel, content
    return None


# --- content normalization and counting ---
ALLOWED_TEXT_PROPS = {'title', 'sidebarTitle', 'description', 'label', 'eyebrow'}


def strip_frontmatter(src: str) -> str:
    if src.startswith('---\n') or src.startswith('---\r\n'):
        idx = src.find('\n---\n', 4)
        if idx == -1:
            idx = src.find('\r\n---\r\n', 4)
            if idx != -1:
                return src[idx + len('\r\n---\r\n'):]
        else:
            return src[idx + len('\n---\n'):]
    return src


def remove_fenced_code_blocks(src: str) -> str:
    lines = src.splitlines()
    out = []
    in_fence = False
    for line in lines:
        if re.match(r'^\s*```', line):
            in_fence = not in_fence
            continue
        if not in_fence:
            out.append(line)
    return '\n'.join(out)


def get_attr_value(attr_str: str, key: str) -> Optional[str]:
    patterns = [
        re.compile(rf"{re.escape(key)}\s*=\s*\"([\s\S]*?)\"", re.I),
        re.compile(rf"{re.escape(key)}\s*=\s*'([\s\S]*?)'", re.I),
        re.compile(rf"{re.escape(key)}\s*=\s*\{{\s*`([\s\S]*?)`\s*\}}", re.I),
        re.compile(rf"{re.escape(key)}\s*=\s*\{{\s*\"([\s\S]*?)\"\s*\}}", re.I),
        re.compile(rf"{re.escape(key)}\s*=\s*\{{\s*'([\s\S]*?)'\s*\}}", re.I),
    ]
    for pat in patterns:
        m = pat.search(attr_str)
        if m:
            return m.group(1)
    return None


def extract_text_props_from_tags(src: str) -> str:
    texts: List[str] = []
    tag_regex = re.compile(r"<([A-Za-z][\w.-]*)\s+([^>]*?)/?>(?![\s\S]*?</\1>)")
    for m in tag_regex.finditer(src):
        attrs = m.group(2) or ''
        for key in ALLOWED_TEXT_PROPS:
            val = get_attr_value(attrs, key)
            if val:
                texts.append(val)
    return ' '.join(texts)


def normalize_for_word_count(src: str) -> str:
    s = src
    s = strip_frontmatter(s)
    s = re.sub(r'^\s*(import|export)\s[^\n]*$', ' ', s, flags=re.M)
    s = remove_fenced_code_blocks(s)
    s = re.sub(r'`[^`]*`', ' ', s)
    s = re.sub(r'!\[[^\]]*\]\([^\)]+\)', ' ', s)
    s = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', s)
    text_from_props = extract_text_props_from_tags(src)
    s = re.sub(r'<[^>]+>', ' ', s)
    if text_from_props:
        s = s + '\n' + text_from_props
    return s


def count_words(text: str) -> int:
    tokens = re.findall(r'\w+', text, flags=re.UNICODE)
    return len(tokens)


def parse_attrs(attr_str: str) -> Dict[str, str]:
    attrs: Dict[str, str] = {}
    re_attrs = re.compile(r"(\w[\w:-]*)\s*=\s*(\"([\s\S]*?)\"|'([\s\S]*?)'|\{\s*\"([\s\S]*?)\"\s*\}|\{\s*'([\s\S]*?)'\s*\}|\{\s*`([\s\S]*?)`\s*\})")
    for m in re_attrs.finditer(attr_str):
        key = m.group(1)
        val = m.group(3) or m.group(4) or m.group(5) or m.group(6) or m.group(7) or ''
        attrs[key] = val
    return attrs


def count_images(src: str) -> int:
    images: List[Dict[str, str]] = []
    md_img_re = re.compile(r'!\[([^\]]*)\]\(([^\)]+)\)')
    for m in md_img_re.finditer(src):
        images.append({'kind': 'md', 'alt': (m.group(1) or '').strip(), 'src': (m.group(2) or '').strip()})
    img_tag_re = re.compile(r'<img\b([^>]*?)>', re.I)
    for m in img_tag_re.finditer(src):
        attrs = parse_attrs(m.group(1) or '')
        alt = attrs.get('alt', '')
        src_attr = attrs.get('src', '')
        images.append({'kind': 'html', 'alt': alt, 'src': src_attr})
    mdx_image_re = re.compile(r'<Image\b([^>]*?)/?>', re.I)
    for m in mdx_image_re.finditer(src):
        attrs = parse_attrs(m.group(1) or '')
        images.append({'kind': 'mdx', 'alt': attrs.get('alt') or attrs.get('darkAlt') or '', 'src': attrs.get('src') or ''})

    count = 0
    seen_keys = set()
    for img in images:
        kind = img.get('kind')
        if kind == 'html':
            key = None
            alt = (img.get('alt') or '').trim() if hasattr(str, 'trim') else (img.get('alt') or '').strip()
            src_attr = (img.get('src') or '').strip()
            if alt:
                key = f"alt:{alt}"
            elif src_attr:
                key = f"src:{src_attr}"
            if key is not None:
                if key not in seen_keys:
                    seen_keys.add(key)
                    count += 1
            else:
                count += 1
        elif kind == 'mdx':
            count += 1
        elif kind == 'md':
            count += 1
    return count


def summarize_word_distribution(word_counts: List[int]) -> Dict[str, int]:
    n = len(word_counts)
    if n == 0:
        return {"min": 0, "p25": 0, "median": 0, "p75": 0, "max": 0, "average": 0}
    sorted_counts = sorted(word_counts)
    _min = sorted_counts[0]
    _max = sorted_counts[-1]

    import math
    def p(q: int) -> int:
        rank = math.ceil((q / 100.0) * n)
        idx = max(0, min(n - 1, rank - 1))
        return sorted_counts[idx]

    total = sum(word_counts)
    average = round(total / n)
    return {"min": _min, "p25": p(25), "median": p(50), "p75": p(75), "max": _max, "average": average}


def ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)


def get_head_commit() -> str:
    out = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=str(REPO_ROOT))
    return out.decode('utf-8').strip()


def get_commit_log_hashes_with_dates() -> List[Tuple[str, str]]:
    out = subprocess.check_output([
        'git', 'log', '--date=iso-strict', "--pretty=format:%H%x09%aI"
    ], cwd=str(REPO_ROOT)).decode('utf-8', errors='replace')
    lines = [l for l in out.splitlines() if l.strip()]
    result: List[Tuple[str, str]] = []
    for line in lines:
        parts = line.split('\t', 1)
        if len(parts) == 2:
            result.append((parts[0], parts[1]))
    return result


def bucket_commits_per_utc_day_last_commit() -> List[Tuple[str, str, str]]:
    entries = get_commit_log_hashes_with_dates()  # newest first
    seen = set()
    day_to_commit: List[Tuple[str, str, str]] = []
    for commit, iso in entries:
        try:
            d = datetime.fromisoformat(iso.replace('Z', '+00:00'))
        except Exception:
            d = datetime.strptime(iso[:19], '%Y-%m-%dT%H:%M:%S').replace(tzinfo=timezone.utc)
        day = d.astimezone(timezone.utc).strftime('%Y-%m-%d')
        if day not in seen:
            seen.add(day)
            day_to_commit.append((day, commit, d.astimezone(timezone.utc).isoformat()))
    day_to_commit.reverse()
    return day_to_commit


# -------------- stub classification --------------
PLACEHOLDER_SINGLE = {'stub', 'wip', 'todo', 'tbd', 'draft', 'placeholder'}
PLACEHOLDER_PHRASES = {
    ('coming', 'soon'),
    ('under', 'construction'),
    ('work', 'in', 'progress'),
    ('to', 'be', 'done'),
    ('to', 'be', 'determined'),
    ('under', 'reconstruction'),
}
PLACEHOLDER_TOKENS = PLACEHOLDER_SINGLE | {t for tpl in PLACEHOLDER_PHRASES for t in tpl}


def is_stub_text(normalized_text: str) -> bool:
    text = normalized_text.strip()
    if not text:
        return True
    tokens = re.findall(r'\w+', text.lower())
    if len(tokens) == 0:
        return True
    if tuple(tokens) in PLACEHOLDER_PHRASES or (len(tokens) == 1 and tokens[0] in PLACEHOLDER_SINGLE):
        return True
    if len(tokens) <= 6 and all(tok in PLACEHOLDER_TOKENS for tok in tokens):
        return True
    return False


def is_structural_stub(content: str, normalized_text: str) -> Tuple[bool, List[str]]:
    reasons: List[str] = []
    body = remove_fenced_code_blocks(strip_frontmatter(content))
    lines = [ln for ln in body.splitlines() if ln.strip()]
    if not lines:
        reasons.append('empty-body')
        return True, reasons

    has_subheading = any(re.match(r"\s{0,3}#{2,6}\s+", ln) for ln in lines) or bool(re.search(r"(?i)<h[2-6]\b", body))
    bullet_re = re.compile(r"^\s*(?:[-*+]|\d+[\.)])\s+")
    is_bullet = [bool(bullet_re.match(ln)) for ln in lines]
    bullet_lines = sum(1 for b in is_bullet if b)
    paragraph_lines = sum(1 for b in is_bullet if not b)
    content_lines = len(lines)
    bullet_ratio = (bullet_lines / content_lines) if content_lines else 0.0

    url_re = re.compile(r"https?://\S+")
    url_lines = sum(1 for ln in lines if url_re.search(ln))
    url_count = len(url_re.findall(body))

    tokens = re.findall(r"\w+", normalized_text.lower())
    token_count = len(tokens)

    score = 0
    if token_count <= 20:
        score += 1; reasons.append('short-text')
    if bullet_lines >= 1 and paragraph_lines == 0:
        score += 1; reasons.append('only-bullets')
    if bullet_ratio >= 0.6 and paragraph_lines <= 1:
        score += 1; reasons.append('bullet-dominant')
    if url_count >= 1 and (token_count <= 10 or url_lines >= content_lines):
        score += 1; reasons.append('link-dominant')
    if not has_subheading:
        score += 1; reasons.append('no-subheadings')

    return (score >= 3), reasons


def is_stub_page(content: str) -> Tuple[bool, List[str]]:
    normalized = normalize_for_word_count(content)
    body = remove_fenced_code_blocks(strip_frontmatter(content))
    lead = [ln.strip() for ln in body.splitlines() if ln.strip()][:5]
    lead_lc = [ln.lower() for ln in lead]
    lead_placeholder = False
    placeholder_line_re = re.compile(r"^(stub|wip|todo|tbd|draft)\b[\s.!:;\-]*$", re.I)
    phrase_hits = ("coming soon" in " ".join(lead_lc)) or ("under construction" in " ".join(lead_lc)) or ("placeholder" in " ".join(lead_lc))
    for ln in lead_lc:
        if placeholder_line_re.match(ln):
            lead_placeholder = True
            break
    if phrase_hits:
        lead_placeholder = True
    if lead_placeholder:
        tokens = re.findall(r"\w+", normalized.lower())
        if len(tokens) <= 150:
            return True, ['lead-placeholder']

    url_re = re.compile(r"https?://\S+")
    urls = url_re.findall(body)
    if urls:
        lines_pre = [ln for ln in body.splitlines() if ln.strip()]
        docs_line_re = re.compile(r"https?://docs\.ton\.org\S*", re.I)
        docs_lines = sum(1 for ln in lines_pre if docs_line_re.search(ln))
        if len(lines_pre) > 0 and docs_lines == len(lines_pre):
            return True, ['docs-only-links']

    if is_stub_text(normalized):
        return True, ['placeholder-text']
    struct, reasons = is_structural_stub(content, normalized)
    if struct:
        return True, reasons
    return False, []


# -------------- stats computation --------------
def compute_stats_for_snapshot(get_file_content: Callable[[str], Optional[str]], docs_json_content: str) -> Dict:
    try:
        docs_obj = json.loads(docs_json_content)
    except Exception as e:
        raise RuntimeError('Failed to parse docs.json in snapshot') from e

    slugs = get_navigation_slugs_from_docs_json(docs_obj)
    pages_all: List[Dict] = []
    warnings: List[str] = []

    stub_pages: List[Dict] = []
    for slug in slugs:
        file_rel: Optional[str] = None
        content: Optional[str] = None
        for rel in resolve_order(slug):
            c = get_file_content(rel)
            if c is not None:
                file_rel = rel
                content = c
                break
        if not file_rel or content is None:
            warnings.append(f"Unresolved slug: {slug}")
            continue
        normalized = normalize_for_word_count(content)
        words = count_words(normalized)
        images = count_images(content)
        stub, why = is_stub_page(content)
        row = {"slug": slug, "path": file_rel, "words": words, "images": images, "stub": stub}
        if stub and why:
            row["stubWhy"] = why
        pages_all.append(row)
        if stub:
            stub_pages.append(row)

    pages = [p for p in pages_all if not p.get('stub')]
    word_counts = [p['words'] for p in pages]
    image_counts = [p['images'] for p in pages]
    totals = {
        'pages': len(pages),
        'words': sum(word_counts),
        'images': sum(image_counts),
    }
    distribution = summarize_word_distribution(word_counts)
    return {"pages": pages, "totals": totals, "distribution": distribution, "warnings": warnings, "stubs": stub_pages}


def write_json(path: Path, obj: dict) -> None:
    ensure_dir(path.parent)
    with path.open('w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write('\n')


def run_latest() -> None:
    head = get_head_commit()
    docs = read_json(DOCS_JSON_PATH)
    slugs = get_navigation_slugs_from_docs_json(docs)
    pages_all: List[Dict] = []
    warnings: List[str] = []
    stub_pages: List[Dict] = []
    for slug in slugs:
        rel = resolve_slug_to_path_latest(slug)
        if not rel:
            warnings.append(f"Unresolved slug: {slug}")
            continue
        content = (REPO_ROOT / rel).read_text('utf-8')
        normalized = normalize_for_word_count(content)
        words = count_words(normalized)
        images = count_images(content)
        stub, why = is_stub_page(content)
        row = {"slug": slug, "path": rel, "words": words, "images": images, "stub": stub}
        if stub and why:
            row["stubWhy"] = why
        pages_all.append(row)
        if stub:
            stub_pages.append(row)

    pages = [p for p in pages_all if not p.get('stub')]
    word_counts = [p['words'] for p in pages]
    image_counts = [p['images'] for p in pages]
    totals = {
        'pages': len(pages),
        'words': sum(word_counts),
        'images': sum(image_counts),
    }
    distribution = summarize_word_distribution(word_counts)
    out = {"generatedAt": datetime.now(timezone.utc).isoformat(), "commit": head, "totals": totals, "distribution": distribution}
    write_json(STATS_DIR / 'latest.json', out)
    write_json(STATS_DIR / 'pages-latest.json', pages)
    if stub_pages:
        write_json(STATS_DIR / 'stubs-latest.json', stub_pages)
    if warnings:
        write_json(STATS_DIR / 'warnings-latest.json', warnings)

    print('Docs stats (latest)')
    print(f'Commit: {head}')
    print(f'Pages:  {totals["pages"]}')
    print(f'Words:  {totals["words"]}')
    print(f'Images: {totals["images"]}')
    d = distribution
    print('Distribution (words per page):')
    print(f'  min={d["min"]} p25={d["p25"]} median={d["median"]} p75={d["p75"]} max={d["max"]} avg={d["average"]}')

    def top_k(rows: List[Dict], k: int, reverse: bool = False) -> List[Dict]:
        return sorted(rows, key=lambda r: (r.get('words', 0), r.get('path', '')))[:k] if not reverse else \
               sorted(rows, key=lambda r: (r.get('words', 0), r.get('path', '')), reverse=True)[:k]

    def fmt_row(r: Dict) -> str:
        return f"{r.get('words', 0)} — {r.get('path')} ({r.get('slug')})"

    def fmt_row_stub(r: Dict) -> str:
        why = ','.join(r.get('stubWhy', [])) if r.get('stubWhy') else ''
        suffix = f" [why: {why}]" if why else ''
        return f"{r.get('words', 0)} — {r.get('path')} ({r.get('slug')}){suffix}"

    inc_short = top_k(pages, 3)
    inc_long = top_k(pages, 3, reverse=True)
    st_short = top_k(stub_pages, 3)
    st_long = top_k(stub_pages, 3, reverse=True)

    print('Included pages — shortest:')
    for r in inc_short:
        print('  ' + fmt_row(r))
    print('Included pages — longest:')
    for r in inc_long:
        print('  ' + fmt_row(r))
    if stub_pages:
        print('Stub pages (filtered) — shortest:')
        for r in st_short:
            print('  ' + fmt_row_stub(r))
        print('Stub pages (filtered) — longest:')
        for r in st_long:
            print('  ' + fmt_row_stub(r))


def run_history() -> None:
    day_commits = bucket_commits_per_utc_day_last_commit()
    STATS_DIR.mkdir(parents=True, exist_ok=True)
    jsonl_path = STATS_DIR / 'history.jsonl'
    csv_path = STATS_DIR / 'history.csv'
    jsonl_path.write_text('', encoding='utf-8')
    csv_path.write_text('date,commit,pages,words,images,min,p25,median,p75,max,avg\n', encoding='utf-8')

    for day, hash_, _iso in day_commits:
        if day in EXCLUDE_UTC_DAYS:
            print(f"Skipped anomalous day {day} {hash_}")
            continue
        docs_content = git_show(hash_, 'docs.json')
        if docs_content is None:
            continue
        snapshot = compute_stats_for_snapshot(lambda rel: git_show(hash_, rel), docs_content)
        record = {
            'date': day,
            'commit': hash_,
            'totals': snapshot['totals'],
            'distribution': snapshot['distribution'],
        }
        with jsonl_path.open('a', encoding='utf-8') as jf:
            jf.write(json.dumps(record) + '\n')
        t = snapshot['totals']
        d = snapshot['distribution']
        csv_row = f"{day},{hash_},{t['pages']},{t['words']},{t['images']},{d['min']},{d['p25']},{d['median']},{d['p75']},{d['max']},{d['average']}\n"
        with csv_path.open('a', encoding='utf-8') as cf:
            cf.write(csv_row)
        print(f"Processed {day} {hash_} pages={t['pages']} words={t['words']}")

    print(f"History written: {jsonl_path}, {csv_path}")


def run_charts() -> None:
    if not HISTORY_CSV.exists():
        print('stats/history.csv not found. Run history first (python3 scripts/stats.py history).')
        return
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        import matplotlib.dates as mdates
    except Exception as e:
        print('[charts] matplotlib is not available:', e)
        print('Install it and rerun: python3 -m pip install --user matplotlib')
        return

    def load_history(csv_path: Path):
        rows = []
        with csv_path.open('r', encoding='utf-8') as f:
            r = csv.DictReader(f)
            for d in r:
                try:
                    rows.append({
                        'date': datetime.strptime(d['date'], '%Y-%m-%d'),
                        'commit': d['commit'],
                        'pages': int(d['pages']),
                        'words': int(d['words']),
                        'images': int(d['images']),
                        'min': int(d['min']),
                        'p25': int(d['p25']),
                        'median': int(d['median']),
                        'p75': int(d['p75']),
                        'max': int(d['max']),
                        'avg': int(d['avg']),
                    })
                except Exception:
                    continue
        return rows

    def style_axes(ax, ylabel: str):
        ax.grid(True, color='#e5e7eb')
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.set_ylabel(ylabel)
        locator = mdates.AutoDateLocator()
        ax.xaxis.set_major_locator(locator)
        ax.xaxis.set_major_formatter(mdates.ConciseDateFormatter(locator))
        ax.xaxis.get_offset_text().set_visible(False)

    def total_chart(rows, field: str, title: str, color: str, outfile: Path):
        x = [r['date'] for r in rows]
        y = [r[field] for r in rows]
        fig, ax = plt.subplots(figsize=(11, 3.4), dpi=150)
        ax.plot(x, y, color=color, linewidth=2.2)
        ax.set_title(title)
        ylabel = 'Words' if field == 'words' else 'Pages'
        style_axes(ax, ylabel=ylabel)
        fig.tight_layout()
        outfile.parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(outfile, bbox_inches='tight')
        plt.close(fig)

    rows = load_history(HISTORY_CSV)
    if not rows:
        print('history.csv has no rows.')
        return
    total_chart(rows, 'words', 'Total Words Over Time', '#3b82f6', CHART_DIR / 'total_words.png')
    total_chart(rows, 'pages', 'Total Pages Over Time', '#10b981', CHART_DIR / 'total_pages.png')
    print('Charts written: stats/charts/total_words.png, total_pages.png')


def main():
    if not DOCS_JSON_PATH.exists():
        print('docs.json not found at repo root', file=sys.stderr)
        sys.exit(1)
    # Always run the full pipeline
    run_latest()
    run_history()
    run_charts()


if __name__ == '__main__':
    main()

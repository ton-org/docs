#!/usr/bin/env python3
"""Convert repo-relative doc links in the review body to absolute blob URLs."""

from __future__ import annotations

import os
import re
import sys


def main() -> None:
    text = sys.stdin.read()
    if not text:
        sys.stdout.write(text)
        return

    repo = os.environ.get("GITHUB_REPOSITORY")
    sha = os.environ.get("PR_HEAD_SHA")
    if not repo:
        sys.stdout.write(text)
        return

    blob_prefix = f"https://github.com/{repo}/blob/"
    doc_blob_prefix = f"{blob_prefix}{sha or 'main'}/"
    style_blob_prefix = f"{blob_prefix}main/"
    style_rel = "contribute/style-guide-extended.mdx"

    def absolutize_location(path: str) -> str:
        if path.startswith("http://") or path.startswith("https://"):
            return path
        normalized = path.lstrip("./")
        base = style_blob_prefix if normalized.startswith(style_rel) else doc_blob_prefix
        return f"{base}{normalized}"

    lines: list[str] = []
    for line in text.splitlines():
        stripped = line.lstrip()
        indent_len = len(line) - len(stripped)
        for marker in ("- Location:", "Location:", "* Location:"):
            if stripped.startswith(marker):
                prefix, _, rest = stripped.partition(":")
                link = rest.strip()
                if link:
                    link = absolutize_location(link)
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

    # Ensure any doc blob URLs use the PR head SHA (style guide stays on main)
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

    sys.stdout.write(rewritten)


if __name__ == "__main__":
    main()

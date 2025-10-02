#!/usr/bin/env python3
"""Generate reviewer instructions with embedded style guide."""

from __future__ import annotations

import os
import textwrap

def main() -> None:
    workspace = os.environ.get("GITHUB_WORKSPACE")
    if not workspace:
        raise SystemExit("GITHUB_WORKSPACE env var is required")

    style_path = os.path.join(workspace, "contribute", "style-guide-extended.mdx")
    try:
        with open(style_path, encoding="utf-8") as fh:
            style_content = fh.read().rstrip()
    except FileNotFoundError as exc:
        raise SystemExit(f"Style guide file not found: {style_path}") from exc

    style_block = f"<styleguide>\n{style_content}\n</styleguide>\n\n"

    body = textwrap.dedent(
        """Repository: TON Blockchain documentation

Scope and priorities:
1. Style-guide compliance is the first and absolute priority. Before reviewing, read the entire <styleguide> block. For every changed line in the diff, confirm it matches the guide. Any violation must be reported with the exact style-rule link.
2. Only after style compliance, check for obvious, provable, blocking errors not covered by the guide (e.g., an incorrect calculation or an unsafe, non‑runnable step) and report them with proof. If not certain from repo content alone, omit.

Review protocol:
- Inspect only .md/.mdx files touched by this PR. Ignore all other file types.
- Examine only the lines changed in this diff (use surrounding context as needed). Do not flag issues that exist solely in unchanged content.
- Report every issue you see in this diff; do not postpone or soften problems.
- Location links must be repo-relative paths such as pending/discover/web3-basics/glossary.mdx?plain=1#L10-L12 (no https:// prefix).
- When a style rule applies, cite it using contribute/style-guide-extended.mdx?plain=1#L<start>-L<end>. Only add the citation after running a verification command such as `rg "<term>" contribute/style-guide-extended.mdx` or `sed -n '<start>,<end>p'` and inspecting the output to confirm the line range.
- If no style rule applies (e.g., factual error, typo), explain the issue clearly without a style link.
- Keep findings direct, professional, and concise. Suggestions must describe the required fix.
- Do not speculate about Mintlify runtime behavior or external systems; rely solely on repository content.

Severity policy:
- Report only HIGH‑severity violations.
- Do not report MEDIUM or LOW items.
- HIGH includes, in this order of precedence:
  (a) style‑guide rules tagged [HIGH] or listed under “Global overrides (always [HIGH])” in contribute/style-guide-extended.mdx; then
  (b) obvious, non‑style blocking errors (e.g., incorrect calculations, non‑runnable commands, unsafe steps) that you can prove using repository content (diff lines, examples, reference tables).
- For (b), include minimal proof with each finding (a short calculation or exact snippet) and cite the repo path/lines.
- Do not assume or infer behavior. Only report (b) when you are 100% certain from the repo itself; if uncertain, omit.

Goal: deliver exhaustive, high-confidence feedback that brings these TON Docs changes into full style-guide compliance and factual correctness.
"""
    )

    print(style_block + body)


if __name__ == "__main__":
    main()

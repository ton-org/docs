import json
import os
import sys
import textwrap
import mistletoe

WORKSPACE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
MDX_PATH = os.path.join(WORKSPACE_ROOT, "tvm", "instructions.mdx")

START_MARK = "{/* STATIC_START tvm_instructions */}"
END_MARK = "{/* STATIC_END tvm_instructions */}"


def humanize_category(key: str) -> str:
    if not key:
        return "Uncategorized"
    words = [p.capitalize() for p in key.replace("_", " ").split() if p]
    return " ".join(words) or "Uncategorized"


def render_alias(alias):
    return f"""
- `{alias['mnemonic']}`<br />
{textwrap.indent(alias['description'].replace('\n', '<br />'), "  ")}
""".strip()


def render_instruction(insn, aliases):
    return f"""
#### `{insn['doc']['opcode']}` {insn['mnemonic']}

{insn['doc']['description'].replace('\n', '<br />')}<br />
**Category:** {humanize_category(insn['doc']['category'])} ({insn['doc']['category']})<br />

```fift Fift
{insn['doc']['fift']}
```

{'**Aliases**:' if aliases else ''}
{'\n'.join(render_alias(alias) for alias in aliases)}
""".strip()


def render_static_mdx(spec) -> str:
    return '\n\n'.join(render_instruction(insn, [alias for alias in spec['aliases'] if alias['alias_of'] == insn['mnemonic']]) for insn in spec['instructions'])


def inject_into_mdx(mdx_path: str, new_block: str) -> None:
    with open(mdx_path, "r", encoding="utf-8") as fh:
        src = fh.read()
    start_idx = src.find(START_MARK)
    end_idx = src.find(END_MARK) + len(END_MARK)
    if start_idx == -1 or end_idx == -1 or end_idx <= start_idx:
        raise RuntimeError("Static markers not found or malformed in instructions.mdx")

    # Preserve everything outside markers; replace inside with marker + newline + content + newline + end marker
    before = src[: start_idx + len(START_MARK)]
    after = src[end_idx:]

    # Hide the static block in the rendered page to avoid duplicating the
    # interactive table. Keeping it in the DOM still enables full-text search.
    wrapped_block = f"<div hidden>\n{new_block}\n</div>"
    replacement = f"{START_MARK}\n{wrapped_block}\n{END_MARK}"

    updated = before + replacement[len(START_MARK):] + after

    with open(mdx_path, "w", encoding="utf-8") as fh:
        fh.write(updated)


def generate(spec_input_path, spec_output_path, instructions_mdx_path) -> int:
    with open(spec_input_path) as f:
        spec = json.load(f)
    static_block = render_static_mdx(spec)
    inject_into_mdx(instructions_mdx_path, static_block)
    update_doc_cp0(spec, spec_output_path)


def update_doc_cp0(spec, spec_output_path):
    for insn in spec['instructions']:
        doc = insn['doc']
        doc['description'] = mistletoe.markdown(doc['description'])
    for alias in spec['aliases']:
        alias['description'] = mistletoe.markdown(alias['description'])
    with open(spec_output_path, 'w', encoding='utf-8') as f:
        json.dump(spec, f, ensure_ascii=False, separators=(',', ':'))


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print(f"Usage: {sys.argv[0]} <cp0-input-path> <cp0-output-path> <instructions-mdx-path>")
        sys.exit(1)
    generate(sys.argv[1], sys.argv[2], sys.argv[3])
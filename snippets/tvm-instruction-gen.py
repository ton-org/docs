import json
import os
import sys
import urllib.request
from typing import Any, Dict, List
try:
    import markdown  # type: ignore
except Exception:
    markdown = None  # Will be validated at runtime

SPEC_REPO = "https://github.com/ton-community/tvm-spec"
SPEC_COMMIT = "6f7a7dd91e06790a05137eb0243a0514e317aa2b"
SPEC_URL = f"{SPEC_REPO.replace('github.com', 'raw.githubusercontent.com')}/{SPEC_COMMIT}/cp0.json"

WORKSPACE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
MDX_PATH = os.path.join(WORKSPACE_ROOT, "tvm", "instructions.mdx")

START_MARK = "{/* STATIC_START tvm_instructions */}"
END_MARK = "{/* STATIC_END tvm_instructions */}"


def load_spec() -> Dict[str, Any]:
    with urllib.request.urlopen(SPEC_URL) as resp:
        if resp.status != 200:
            raise RuntimeError(f"Failed to fetch spec: HTTP {resp.status}")
        data = resp.read()
    return json.loads(data.decode("utf-8"))


def humanize_category(key: str) -> str:
    if not key:
        return "Uncategorized"
    words = [p.capitalize() for p in key.replace("_", " ").split() if p]
    return " ".join(words) or "Uncategorized"


def format_gas(gas: Any) -> str:
    if gas is None:
        return "N/A"
    if isinstance(gas, list):
        return " / ".join(str(x) for x in gas) if gas else "N/A"
    return str(gas)


def extract_instructions(spec: Dict[str, Any]) -> List[Dict[str, Any]]:
    alias_by_mnemonic: Dict[str, List[Dict[str, Any]]] = {}
    for alias in spec.get("aliases", []) or []:
        if not alias or not alias.get("alias_of"):
            continue
        alias_by_mnemonic.setdefault(alias["alias_of"], []).append(alias)

    result: List[Dict[str, Any]] = []
    for raw in spec.get("instructions", []) or []:
        doc = raw.get("doc") or {}
        bytecode = raw.get("bytecode") or {}
        value_flow = raw.get("value_flow") or {}
        opcode = bytecode.get("prefix") or ""
        since = raw.get("since_version") or 0
        category_key = doc.get("category") or "uncategorized"
        fift = doc.get("fift") or ""
        description = doc.get("description") or ""
        stack_doc = doc.get("stack") or ""
        gas = format_gas(doc.get("gas"))

        inputs = ((value_flow.get("inputs") or {}).get("stack")) or []
        outputs = ((value_flow.get("outputs") or {}).get("stack")) or []

        result.append(
            {
                "mnemonic": raw.get("mnemonic") or "",
                "since": since,
                "category_key": category_key,
                "category_label": humanize_category(category_key),
                "opcode": opcode,
                "fift": fift,
                "description": description,
                "stack_doc": stack_doc,
                "gas": gas,
                "inputs": inputs,
                "outputs": outputs,
                "aliases": alias_by_mnemonic.get(raw.get("mnemonic"), []),
            }
        )
    return result


def render_instruction_block(item: Dict[str, Any]) -> str:
    """Render a compact MDX block per instruction (no HTML tags, only MDX)."""
    def mdx_escape(text: Any) -> str:
        if text is None:
            return ""
        s = str(text)
        # Escape ampersand first to avoid double escaping
        s = s.replace("&", "&amp;")
        s = s.replace("<", "&lt;")
        s = s.replace(">", "&gt;")
        # Escape square brackets so markdown/MDX doesn't treat them as link refs
        s = s.replace("[", "&#91;").replace("]", "&#93;")
        s = s.replace("{", "&#123;").replace("}", "&#125;")
        return s

    alias_text = " ".join(
        mdx_escape(a.get("mnemonic"))
        for a in (item.get("aliases") or [])
        if a.get("mnemonic")
    )

    title = mdx_escape(item.get("mnemonic"))
    opcode = mdx_escape(item["opcode"])
    lines: List[str] = []

    # Heading
    lines.append(f"#### `{opcode}` {title}")
    lines.append(f"Fift: {item['fift']}\nDescription: {item['description']}\nCategory: {item['category_key']} {item['category_label']}")
    for alias in item["aliases"]:
        lines.append(f"Alias: {alias['mnemonic']} {alias['description']}")
    lines.append("")
    return "\n".join(lines).replace("{", f"&#{ord('{')}").replace("}", f"&#{ord('}')}")


def render_static_mdx(instructions: List[Dict[str, Any]]) -> str:
    # Emit pure MDX content (no HTML wrapper). We'll hide it at runtime by
    # wrapping between STATIC_START/STATIC_END markers in the client script.
    return "\n".join(render_instruction_block(i) for i in instructions)


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
    # We also embed the original spec JSON in a non-executing script tag so the
    # client does not need to fetch it over the network.
    wrapped_block = f"<div hidden>\n{new_block}\n</div>"
    replacement = f"{START_MARK}\n{wrapped_block}\n{END_MARK}"

    updated = before + replacement[len(START_MARK):] + after

    with open(mdx_path, "w", encoding="utf-8") as fh:
        fh.write(updated)


def generate() -> int:
    spec = load_spec()
    instructions = extract_instructions(spec)
    # Sort by opcode then mnemonic for stable output
    def opcode_key(op: str) -> int:
        try:
            return int((op or "").replace(" ", ""), 16)
        except Exception:
            return 1 << 30

    instructions.sort(key=lambda x: (opcode_key(x.get("opcode", "")), x.get("mnemonic", "")))
    static_block = render_static_mdx(instructions)
    inject_into_mdx(MDX_PATH, static_block)
    return len(instructions)


if __name__ == "__main__":
    try:
        count = generate()
        print(f"Injected static TVM instruction content for {count} instructions into {MDX_PATH}")
    except Exception as e:
        print(f"tvm-instruction-gen failed: {e}", file=sys.stderr)
        sys.exit(1)
    
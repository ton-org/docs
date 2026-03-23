import ast
import html
import json
import os
import re
import sys
import textwrap
import time
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse
from urllib.error import URLError
from urllib.request import Request, urlopen

try:
    import mistletoe
except ModuleNotFoundError:
    mistletoe = None

WORKSPACE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir, os.pardir))
MDX_PATH = os.path.join(WORKSPACE_ROOT, "tvm", "instructions.mdx")

START_MARK = "{/* STATIC_START tvm_instructions */}"
END_MARK = "{/* STATIC_END tvm_instructions */}"

FETCH_TIMEOUT_SECONDS = 20
FETCH_RETRY_COUNT = 3
FETCH_RETRY_DELAY_SECONDS = 1

TXTRACER_BUNDLE_RE = re.compile(
    r"n=JSON\.parse\('((?:\\.|[^'])*)'\),s=JSON\.parse\('((?:\\.|[^'])*)'\),i=\{\$schema:e,version:t,instructions:n,fift_instructions:s\}",
    re.S,
)
TXTRACER_ASSET_RE = re.compile(r"""(?:(?:href)|(?:src))=['"]([^'"]*tvm-specification-[^'"]+\.js)['"]""")
JSON_PARSE_RE = re.compile(r"JSON\.parse\('((?:\\.|[^'])*)'\)")
HTML_TAG_RE = re.compile(r"</?[A-Za-z][^>]*>")
HTML_CODE_RE = re.compile(r"(<code>)(.*?)(</code>)", re.S)
HTML_LIST_ITEM_WITH_NESTED_LIST_RE = re.compile(
    r"<li>(\s*)(?!<p\b|<ul\b|<ol\b)((?:(?!<(?:ul|ol)\b|</li>).)+?)(\s*)(<(?:ul|ol)\b[^>]*>)",
    re.S,
)

EXACT_REMOTE_NAME_MAP = {
    "SWAP2": "2SWAP",
    "DROP2": "2DROP",
    "DUP2": "2DUP",
    "OVER2": "2OVER",
    "ROLLX": "ROLL",
    "MULCONST": "MULINT",
    "STBREFR_ALT": "STBREFR",
    "CALLXARGS_VAR": "CALLXARGS",
    "SETCONTARGS_N": "SETCONTARGS",
}

HASH_VARIANT_NAME_MAP = {
    "ADDRSHIFTMOD": "ADDRSHIFT#MOD",
    "ADDRSHIFTRMOD": "ADDRSHIFTR#MOD",
    "ADDRSHIFTCMOD": "ADDRSHIFTC#MOD",
    "RSHIFTR": "RSHIFTR#",
    "RSHIFTC": "RSHIFTC#",
    "MODPOW2": "MODPOW2#",
    "MODPOW2R": "MODPOW2R#",
    "MODPOW2C": "MODPOW2C#",
    "RSHIFTMOD": "RSHIFT#MOD",
    "RSHIFTRMOD": "RSHIFTR#MOD",
    "RSHIFTCMOD": "RSHIFTC#MOD",
    "MULADDRSHIFTMOD": "MULADDRSHIFT#MOD",
    "MULADDRSHIFTRMOD": "MULADDRSHIFTR#MOD",
    "MULADDRSHIFTCMOD": "MULADDRSHIFTC#MOD",
    "MULRSHIFT": "MULRSHIFT#",
    "MULRSHIFTR": "MULRSHIFTR#",
    "MULRSHIFTC": "MULRSHIFTC#",
    "MULMODPOW2": "MULMODPOW2#",
    "MULMODPOW2R": "MULMODPOW2R#",
    "MULMODPOW2C": "MULMODPOW2C#",
    "MULRSHIFTMOD": "MULRSHIFT#MOD",
    "MULRSHIFTRMOD": "MULRSHIFTR#MOD",
    "MULRSHIFTCMOD": "MULRSHIFTC#MOD",
    "LSHIFTADDDIVMOD": "LSHIFT#ADDDIVMOD",
    "LSHIFTADDDIVMODR": "LSHIFT#ADDDIVMODR",
    "LSHIFTADDDIVMODC": "LSHIFT#ADDDIVMODC",
    "LSHIFTDIV": "LSHIFT#DIV",
    "LSHIFTDIVR": "LSHIFT#DIVR",
    "LSHIFTDIVC": "LSHIFT#DIVC",
    "LSHIFTMOD": "LSHIFT#MOD",
    "LSHIFTMODR": "LSHIFT#MODR",
    "LSHIFTMODC": "LSHIFT#MODC",
    "LSHIFTDIVMOD": "LSHIFT#DIVMOD",
    "LSHIFTDIVMODR": "LSHIFT#DIVMODR",
    "LSHIFTDIVMODC": "LSHIFT#DIVMODC",
}

CONFLICT_LEGACY_NAMES = set(HASH_VARIANT_NAME_MAP) | {
    "QADDRSHIFTMOD",
    "QADDRSHIFTRMOD",
    "QADDRSHIFTCMOD",
    "QRSHIFTR",
    "QRSHIFTC",
    "QRSHIFTMOD",
    "QRSHIFTRMOD",
    "QRSHIFTCMOD",
}

ALLOWED_LEGACY_FALLBACKS = {
    "B7A930tt": {
        "category": "arithm_quiet",
        "fift": "[tt+1] QADDRSHIFT#MOD",
        "has_description": False,
        "mnemonic": "QADDRSHIFTMOD",
        "opcode": "B7A930tt",
        "since_version": 9999,
        "tlb": "#B7A930 tt:uint8",
    },
    "B7A931tt": {
        "category": "arithm_quiet",
        "fift": "[tt+1] QADDRSHIFTR#MOD",
        "has_description": False,
        "mnemonic": "QADDRSHIFTRMOD",
        "opcode": "B7A931tt",
        "since_version": 9999,
        "tlb": "#B7A931 tt:uint8",
    },
    "B7A932tt": {
        "category": "arithm_quiet",
        "fift": "[tt+1] QADDRSHIFTC#MOD",
        "has_description": False,
        "mnemonic": "QADDRSHIFTCMOD",
        "opcode": "B7A932tt",
        "since_version": 9999,
        "tlb": "#B7A932 tt:uint8",
    },
    "B7A935tt": {
        "category": "arithm_quiet",
        "fift": "[tt+1] QRSHIFTR#",
        "has_description": False,
        "mnemonic": "QRSHIFTR",
        "opcode": "B7A935tt",
        "since_version": 9999,
        "tlb": "#B7A935 tt:uint8",
    },
    "B7A936tt": {
        "category": "arithm_quiet",
        "fift": "[tt+1] QRSHIFTC#",
        "has_description": False,
        "mnemonic": "QRSHIFTC",
        "opcode": "B7A936tt",
        "since_version": 9999,
        "tlb": "#B7A936 tt:uint8",
    },
    "B7A93Ctt": {
        "category": "arithm_quiet",
        "fift": "[tt+1] QRSHIFT#MOD",
        "has_description": False,
        "mnemonic": "QRSHIFTMOD",
        "opcode": "B7A93Ctt",
        "since_version": 0,
        "tlb": "#B7A93C tt:uint8",
    },
    "B7A93Dtt": {
        "category": "arithm_quiet",
        "fift": "[tt+1] QRSHIFTR#MOD",
        "has_description": False,
        "mnemonic": "QRSHIFTRMOD",
        "opcode": "B7A93Dtt",
        "since_version": 0,
        "tlb": "#B7A93D tt:uint8",
    },
    "B7A93Ett": {
        "category": "arithm_quiet",
        "fift": "[tt+1] QRSHIFTC#MOD",
        "has_description": False,
        "mnemonic": "QRSHIFTCMOD",
        "opcode": "B7A93Ett",
        "since_version": 9999,
        "tlb": "#B7A93E tt:uint8",
    },
    "F880": {
        "category": "app_global",
        "fift": "GETEXTRABALANCE",
        "has_description": True,
        "mnemonic": "GETEXTRABALANCE",
        "opcode": "F880",
        "since_version": 10,
        "tlb": "#F880",
    },
    "FFFz": {
        "category": "codepage",
        "fift": "[z-16] SETCP",
        "has_description": True,
        "mnemonic": "SETCP_SPECIAL",
        "opcode": "FFFz",
        "since_version": 0,
        "tlb": "#FFF z:(## 4) {1 <= z}",
    },
}

REMOTE_SUBCATEGORY_CATEGORY_MAP = {
    ("arithmetic", "div"): "arithm_div",
    ("arithmetic", "shift_logic"): "arithm_logical",
    ("arithmetic", "int_cmp"): "compare_int",
    ("arithmetic", "int_const"): "const_int",
    ("cell", "cell_serialize"): "cell_build",
    ("cell", "cell_deserialize"): "cell_parse",
    ("cell", "cell_const"): "const_data",
    ("cell", "cell_cmp"): "compare_other",
    ("continuation", "continuation_cond"): "cont_conditional",
    ("continuation", "continuation_cond_loop"): "cont_loops",
    ("continuation", "continuation_dict_jump"): "cont_dict",
    ("continuation", "continuation_change"): "cont_registers",
}

REMOTE_CATEGORY_DEFAULT_MAP = {
    "stack": "stack_basic",
    "arithmetic": "arithm_basic",
    "continuation": "cont_basic",
    "crypto": "app_crypto",
    "tuple": "tuple",
    "dictionary": "dict_special",
    "address": "app_addr",
    "basic_gas": "app_gaslimits",
    "codepage": "codepage",
    "config": "app_config",
    "globals": "app_global",
    "message": "app_misc",
    "misc": "app_misc",
    "prng": "app_rnd",
    "exception": "exceptions",
    "debug": "debug",
}

ALLOWED_HTML_TAGS = {"a", "br", "code", "em", "li", "ol", "p", "strong", "sub", "sup", "ul"}
SELF_CLOSING_HTML_TAGS = {"br"}
DROP_CONTENT_HTML_TAGS = {"embed", "iframe", "object", "script", "style", "template"}


def is_safe_href(value):
    href = (value or "").strip()
    if not href:
        return False
    parsed = urlparse(href)
    if parsed.scheme in {"http", "https"}:
        return True
    if parsed.scheme:
        return False
    return href.startswith(("/", "./", "../", "#")) or ":" not in href


class SafeHTMLRenderer(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.output = []
        self._drop_content_stack = []

    def _append_tag(self, tag, attrs=(), closing=False, self_closing=False):
        if tag not in ALLOWED_HTML_TAGS:
            return
        if closing:
            if tag not in SELF_CLOSING_HTML_TAGS:
                self.output.append(f"</{tag}>")
            return
        if tag == "a":
            safe_attrs = []
            for key, value in attrs:
                if key.lower() == "href" and is_safe_href(value):
                    safe_attrs.append(f' href="{html.escape(value, quote=True)}"')
            attr_text = "".join(safe_attrs)
        else:
            attr_text = ""
        if self_closing or tag in SELF_CLOSING_HTML_TAGS:
            self.output.append(f"<{tag}{attr_text} />")
        else:
            self.output.append(f"<{tag}{attr_text}>")

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in DROP_CONTENT_HTML_TAGS:
            self._drop_content_stack.append(tag)
            return
        if self._drop_content_stack:
            return
        self._append_tag(tag, attrs=attrs)

    def handle_endtag(self, tag):
        tag = tag.lower()
        if self._drop_content_stack:
            if tag == self._drop_content_stack[-1]:
                self._drop_content_stack.pop()
            return
        self._append_tag(tag, closing=True)

    def handle_startendtag(self, tag, attrs):
        tag = tag.lower()
        if tag in DROP_CONTENT_HTML_TAGS or self._drop_content_stack:
            return
        self._append_tag(tag, attrs=attrs, self_closing=True)

    def handle_data(self, data):
        if self._drop_content_stack:
            return
        self.output.append(html.escape(data))

    def handle_entityref(self, name):
        if self._drop_content_stack:
            return
        self.output.append(f"&{name};")

    def handle_charref(self, name):
        if self._drop_content_stack:
            return
        self.output.append(f"&#{name};")

    def get_html(self):
        return "".join(self.output)


def humanize_category(key):
    if not key:
        return "Uncategorized"
    words = [p.capitalize() for p in key.replace("_", " ").split() if p]
    return " ".join(words) or "Uncategorized"


def sanitize_code_html(text):
    def repl(match):
        content = (
            match.group(2)
            .replace("*", "&#42;")
            .replace("_", "&#95;")
            .replace("{", "&#123;")
            .replace("}", "&#125;")
        )
        return f"{match.group(1)}{content}{match.group(3)}"

    return HTML_CODE_RE.sub(repl, text)


def sanitize_html_fragment(text):
    parser = SafeHTMLRenderer()
    parser.feed(text)
    parser.close()
    return normalize_html_fragment(parser.get_html())


def normalize_html_fragment(text):
    normalized = text

    def wrap_list_item_lead(match):
        leading_ws, lead, trailing_ws, nested_list = match.groups()
        lead = lead.strip()
        if not lead:
            return match.group(0)
        return f"<li>{leading_ws}\n<p>{lead}</p>{trailing_ws}{nested_list}"

    while True:
        updated = HTML_LIST_ITEM_WITH_NESTED_LIST_RE.sub(wrap_list_item_lead, normalized)
        if updated == normalized:
            updated = updated.replace("<li><p>", "<li>\n<p>")
            updated = updated.replace("</p><ul>", "</p>\n<ul>")
            updated = updated.replace("</p><ol>", "</p>\n<ol>")
            return updated
        normalized = updated


def render_html(value):
    text = (value or "").strip()
    if not text:
        return ""
    if HTML_TAG_RE.search(text):
        return sanitize_code_html(sanitize_html_fragment(text))
    if mistletoe is None:
        raise RuntimeError(
            "mistletoe is required to render Markdown descriptions; install mistletoe==1.5.0"
        )
    return sanitize_code_html(sanitize_html_fragment(mistletoe.markdown(text).strip()))


def render_alias(alias):
    description_html = render_html(alias.get("description", ""))
    if not description_html:
        return f"<li><code>{html.escape(alias['mnemonic'])}</code></li>"
    return f"""
<li>
<p><code>{html.escape(alias['mnemonic'])}</code></p>
{description_html}
</li>
""".strip()


def render_instruction(insn, aliases):
    description_html = render_html(insn.get("doc", {}).get("description", ""))
    description_block = f"{description_html}<br />" if description_html else ""
    alias_block = ""
    if aliases:
        alias_items = "\n".join(render_alias(alias) for alias in aliases)
        alias_block = f"\n\n<p><strong>Aliases</strong>:</p>\n<ul>\n{alias_items}\n</ul>"

    return f"""
#### `{insn['doc']['opcode']}` {insn['mnemonic']}

{description_block}
**Category:** {humanize_category(insn['doc']['category'])} ({insn['doc']['category']})<br />

```fift Fift
{insn['doc']['fift']}
```
{alias_block}
""".strip()


def render_static_mdx(spec):
    return "\n\n".join(
        render_instruction(
            insn,
            [alias for alias in spec["aliases"] if alias["alias_of"] == insn["mnemonic"]],
        )
        for insn in spec["instructions"]
    )


def inject_into_mdx(mdx_path, new_block):
    with open(mdx_path, "r", encoding="utf-8") as fh:
        src = fh.read()
    start_idx = src.find(START_MARK)
    end_idx = src.find(END_MARK)
    if start_idx == -1 or end_idx == -1 or end_idx <= start_idx:
        raise RuntimeError("Static markers not found or malformed in instructions.mdx")

    before = src[: start_idx + len(START_MARK)]
    after = src[end_idx + len(END_MARK) :]
    while after.startswith(END_MARK):
        after = after[len(END_MARK) :]

    wrapped_block = f"<div hidden>\n{new_block}\n</div>"
    replacement = f"{START_MARK}\n{wrapped_block}\n{END_MARK}"
    updated = before + replacement[len(START_MARK) :] + after

    with open(mdx_path, "w", encoding="utf-8") as fh:
        fh.write(updated)


def is_url(value):
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"}


def read_text(source):
    if is_url(source):
        request = Request(source, headers={"User-Agent": "ton-docs-tvm-instruction-gen/1.0"})
        last_error = None
        for attempt in range(FETCH_RETRY_COUNT):
            try:
                with urlopen(request, timeout=FETCH_TIMEOUT_SECONDS) as response:
                    return response.read().decode("utf-8")
            except (TimeoutError, URLError, OSError) as exc:
                last_error = exc
                if attempt + 1 >= FETCH_RETRY_COUNT:
                    break
                time.sleep(FETCH_RETRY_DELAY_SECONDS)
        raise RuntimeError(f"Failed to fetch {source}: {last_error}") from last_error
    with open(source, "r", encoding="utf-8") as fh:
        return fh.read()


def resolve_asset_source(spec_input_path, asset_ref):
    if is_url(spec_input_path):
        return urljoin(spec_input_path, asset_ref)
    base_dir = os.path.dirname(os.path.abspath(spec_input_path))
    normalized_ref = asset_ref.lstrip("/")
    if not normalized_ref:
        return base_dir

    candidates = [os.path.normpath(os.path.join(base_dir, normalized_ref))]
    parent = os.path.dirname(base_dir)
    while parent and parent != os.path.dirname(parent):
        candidates.append(os.path.normpath(os.path.join(parent, normalized_ref)))
        parent = os.path.dirname(parent)

    for candidate in candidates:
        if os.path.exists(candidate):
            return candidate

    return candidates[0]


def load_input_source(spec_input_path):
    raw_text = read_text(spec_input_path)

    try:
        payload = json.loads(raw_text)
    except json.JSONDecodeError:
        payload = None

    if isinstance(payload, dict) and isinstance(payload.get("instructions"), list):
        return "legacy", payload

    bundle_text = raw_text
    if "fift_instructions" not in bundle_text or "JSON.parse(" not in bundle_text:
        match = TXTRACER_ASSET_RE.search(raw_text)
        if not match:
            raise RuntimeError("Could not locate TxTracer specification bundle")
        asset_ref = match.group(1)
        asset_source = resolve_asset_source(spec_input_path, asset_ref)
        bundle_text = read_text(asset_source)

    return "txtracer", parse_txtracer_bundle(bundle_text)


def decode_json_parse_payload(raw_value):
    decoded_text = ast.literal_eval("'" + raw_value + "'")
    return json.loads(decoded_text)


def is_txtracer_instruction_list(payload):
    if not isinstance(payload, list) or not payload:
        return False
    return all(
        isinstance(item, dict)
        and isinstance(item.get("name"), str)
        and isinstance(item.get("layout"), dict)
        and (
            isinstance(item.get("description"), dict)
            or isinstance(item.get("signature"), dict)
            or isinstance(item.get("category"), str)
        )
        for item in payload
    )


def is_txtracer_alias_list(payload):
    if not isinstance(payload, list) or not payload:
        return False
    return all(
        isinstance(item, dict)
        and isinstance(item.get("name"), str)
        and (
            "actual_name" in item
            or isinstance(item.get("description"), str)
            or isinstance(item.get("doc_fift"), str)
        )
        for item in payload
    )


def parse_txtracer_bundle(bundle_text):
    match = TXTRACER_BUNDLE_RE.search(bundle_text)
    if match:
        return {
            "instructions": decode_json_parse_payload(match.group(1)),
            "fift_instructions": decode_json_parse_payload(match.group(2)),
        }

    instructions = None
    fift_instructions = None

    for candidate in JSON_PARSE_RE.finditer(bundle_text):
        try:
            payload = decode_json_parse_payload(candidate.group(1))
        except (SyntaxError, ValueError, json.JSONDecodeError):
            continue

        if instructions is None and is_txtracer_instruction_list(payload):
            instructions = payload
        elif fift_instructions is None and is_txtracer_alias_list(payload):
            fift_instructions = payload

        if instructions is not None and fift_instructions is not None:
            break

    if instructions is None or fift_instructions is None:
        raise RuntimeError("Could not parse TxTracer TVM specification bundle")

    return {
        "instructions": instructions,
        "fift_instructions": fift_instructions,
    }


def tlb_token(tlb):
    match = re.match(r"#([0-9A-Fa-f_]+)", str(tlb or ""))
    if not match:
        return None
    token = match.group(1).lstrip("0").upper()
    return token or "0"


def same_token(legacy_insn, remote_insn):
    legacy_token = tlb_token(legacy_insn.get("bytecode", {}).get("tlb"))
    remote_token = tlb_token(remote_insn.get("layout", {}).get("tlb"))
    return bool(legacy_token and remote_token and legacy_token == remote_token)


def map_legacy_to_remote(legacy_insn, remote_by_name, remote_alias_to_actual):
    name = legacy_insn["mnemonic"]

    if name in EXACT_REMOTE_NAME_MAP:
        candidate = remote_by_name.get(EXACT_REMOTE_NAME_MAP[name])
        if candidate and same_token(legacy_insn, candidate):
            return candidate

    if name.endswith("_VAR"):
        base_name = name[:-4]
        candidate = remote_by_name.get(base_name)
        if candidate and same_token(legacy_insn, candidate):
            return candidate

    if name in HASH_VARIANT_NAME_MAP:
        direct = remote_by_name.get(name)
        if direct and same_token(legacy_insn, direct):
            return direct
        candidate = remote_by_name.get(HASH_VARIANT_NAME_MAP[name])
        if candidate and same_token(legacy_insn, candidate):
            return candidate
        return None

    if name in CONFLICT_LEGACY_NAMES:
        direct = remote_by_name.get(name)
        if direct and same_token(legacy_insn, direct):
            return direct
        return None

    direct = remote_by_name.get(name)
    if direct:
        return direct

    actual_name = remote_alias_to_actual.get(name)
    if actual_name:
        return remote_by_name.get(actual_name)

    return None


def map_remote_category(remote_insn):
    category = str(remote_insn.get("category", "") or "")
    sub_category = str(remote_insn.get("sub_category", "") or "")
    name = str(remote_insn.get("name", "") or "")

    if category == "arithmetic" and name.startswith("Q"):
        return "arithm_quiet"

    mapped = REMOTE_SUBCATEGORY_CATEGORY_MAP.get((category, sub_category))
    if mapped:
        return mapped

    default = REMOTE_CATEGORY_DEFAULT_MAP.get(category)
    if default:
        return default

    return "uncategorized"


def extract_opcode_display(remote_insn):
    token = tlb_token(remote_insn.get("layout", {}).get("tlb"))
    if token:
        return token
    prefix = str(remote_insn.get("layout", {}).get("prefix_str", "") or "").upper()
    return prefix


def normalize_gas(remote_insn):
    gas_entries = remote_insn.get("description", {}).get("gas")
    if not isinstance(gas_entries, list) or not gas_entries:
        return ""
    values = [entry.get("value") for entry in gas_entries if isinstance(entry, dict) and entry.get("value") is not None]
    if not values:
        return ""
    return values[0] if len(values) == 1 else values


def normalize_implementation(remote_insn):
    implementation = remote_insn.get("implementation")
    if not implementation:
        return []

    if isinstance(implementation, list):
        items = implementation
    else:
        items = [implementation]

    normalized = []
    for item in items:
        if not isinstance(item, dict):
            continue
        normalized.append(
            {
                "file": os.path.basename(item.get("file_path", "")) or item.get("file", ""),
                "function_name": item.get("function_name", ""),
                "line": item.get("line_number", item.get("line")),
                "path": f"https://raw.githubusercontent.com/ton-blockchain/ton/{item.get('commit_hash')}/{item.get('file_path')}"
                if item.get("commit_hash") and item.get("file_path")
                else item.get("path", ""),
            }
        )
    return normalized


def normalize_remote_to_legacy_shape(remote_insn, legacy_insn=None):
    mnemonic = legacy_insn["mnemonic"] if legacy_insn else remote_insn["name"]
    category = legacy_insn["doc"]["category"] if legacy_insn else map_remote_category(remote_insn)
    description = remote_insn.get("description", {}).get("long") or remote_insn.get("description", {}).get("short")
    if not description and legacy_insn:
        description = legacy_insn.get("doc", {}).get("description", "")
    fift = legacy_insn["doc"].get("fift", "") if legacy_insn else remote_insn["name"]
    if not fift:
        fift = remote_insn["name"]
    fift_examples = legacy_insn.get("doc", {}).get("fift_examples", []) if legacy_insn else []
    stack_doc = legacy_insn["doc"].get("stack", "") if legacy_insn else remote_insn.get("signature", {}).get("stack_string", "")
    if not stack_doc:
        stack_doc = remote_insn.get("signature", {}).get("stack_string", "")
    opcode_display = legacy_insn["doc"]["opcode"] if legacy_insn else extract_opcode_display(remote_insn)
    prefix = legacy_insn["bytecode"]["prefix"] if legacy_insn else extract_opcode_display(remote_insn)

    inputs = remote_insn.get("signature", {}).get("inputs", {})
    outputs = remote_insn.get("signature", {}).get("outputs", {})

    return {
        "bytecode": {
            "operands": remote_insn.get("layout", {}).get("args", legacy_insn.get("bytecode", {}).get("operands", []) if legacy_insn else []),
            "prefix": prefix,
            "tlb": remote_insn.get("layout", {}).get("tlb", legacy_insn.get("bytecode", {}).get("tlb", "") if legacy_insn else ""),
        },
        "control_flow": legacy_insn.get("control_flow", {"branches": [], "nobranch": True}) if legacy_insn else {"branches": [], "nobranch": True},
        "doc": {
            "category": category,
            "description": description,
            "fift": fift,
            "fift_examples": fift_examples,
            "gas": normalize_gas(remote_insn),
            "opcode": opcode_display,
            "stack": stack_doc,
        },
        "implementation": normalize_implementation(remote_insn)
        or (legacy_insn.get("implementation", []) if legacy_insn else []),
        "mnemonic": mnemonic,
        "since_version": remote_insn.get("layout", {}).get("version", 0),
        "value_flow": {
            "inputs": {
                "registers": inputs.get("registers", legacy_insn.get("value_flow", {}).get("inputs", {}).get("registers", []) if legacy_insn else []),
                "stack": inputs.get("stack", legacy_insn.get("value_flow", {}).get("inputs", {}).get("stack", []) if legacy_insn else []),
            },
            "outputs": {
                "registers": outputs.get("registers", legacy_insn.get("value_flow", {}).get("outputs", {}).get("registers", []) if legacy_insn else []),
                "stack": outputs.get("stack", legacy_insn.get("value_flow", {}).get("outputs", {}).get("stack", []) if legacy_insn else []),
            },
        },
        "__remote_name": remote_insn["name"],
    }


def build_legacy_fallback_signature(legacy_insn):
    return {
        "category": legacy_insn.get("doc", {}).get("category", ""),
        "fift": legacy_insn.get("doc", {}).get("fift", ""),
        "has_description": bool(legacy_insn.get("doc", {}).get("description")),
        "mnemonic": legacy_insn.get("mnemonic", ""),
        "opcode": legacy_insn.get("doc", {}).get("opcode", ""),
        "since_version": legacy_insn.get("since_version", 0),
        "tlb": legacy_insn.get("bytecode", {}).get("tlb", ""),
    }


def build_merged_spec(remote_spec, legacy_spec):
    remote_instructions = remote_spec["instructions"]
    remote_aliases = remote_spec["fift_instructions"]
    remote_by_name = {insn["name"]: insn for insn in remote_instructions}
    remote_alias_to_actual = {
        alias["name"]: alias["actual_name"]
        for alias in remote_aliases
        if alias.get("actual_name")
    }

    normalized_instructions = []
    remote_to_primary = {}
    used_remote_names = set()
    preserved_legacy = []

    legacy_instructions = legacy_spec.get("instructions", [])

    for index, legacy_insn in enumerate(legacy_instructions):
        remote_insn = map_legacy_to_remote(legacy_insn, remote_by_name, remote_alias_to_actual)
        if remote_insn is None:
            # Preserve the legacy entry when TxTracer does not currently expose an
            # equivalent opcode. This keeps existing docs links valid while
            # avoiding incorrect remaps for missing spec entries.
            normalized = dict(legacy_insn)
            normalized["__remote_name"] = None
            preserved_legacy.append(build_legacy_fallback_signature(legacy_insn))
        else:
            normalized = normalize_remote_to_legacy_shape(remote_insn, legacy_insn)
            remote_to_primary[remote_insn["name"]] = legacy_insn["mnemonic"]
            used_remote_names.add(remote_insn["name"])
        normalized["__sort_key"] = index
        normalized_instructions.append(normalized)

    legacy_alias_names = {alias["mnemonic"] for alias in legacy_spec.get("aliases", [])}

    for remote_index, remote_insn in enumerate(remote_instructions, start=len(legacy_instructions)):
        if remote_insn["name"] in used_remote_names or remote_insn["name"] in legacy_alias_names:
            continue
        normalized = normalize_remote_to_legacy_shape(remote_insn)
        normalized["__sort_key"] = remote_index
        normalized_instructions.append(normalized)
        remote_to_primary[remote_insn["name"]] = remote_insn["name"]
        used_remote_names.add(remote_insn["name"])

    normalized_instructions.sort(key=lambda insn: (insn.get("__sort_key", sys.maxsize), insn["mnemonic"]))

    aliases = list(legacy_spec.get("aliases", []))
    existing_alias_names = {alias["mnemonic"] for alias in aliases}
    primary_names = {insn["mnemonic"] for insn in normalized_instructions}

    for remote_insn in normalized_instructions:
        remote_name = remote_insn.get("__remote_name")
        if not remote_name or remote_name == remote_insn["mnemonic"]:
            continue
        if remote_name in primary_names or remote_name in existing_alias_names:
            continue
        aliases.append(
            {
                "alias_of": remote_insn["mnemonic"],
                "description": f"Current TxTracer name for `{remote_insn['mnemonic']}`.",
                "doc_fift": remote_name,
                "doc_stack": "",
                "mnemonic": remote_name,
                "operands": {},
            }
        )
        existing_alias_names.add(remote_name)

    for alias in remote_aliases:
        alias_name = alias.get("name")
        actual_name = alias.get("actual_name")
        if not alias_name or not actual_name:
            continue
        alias_target = remote_to_primary.get(actual_name)
        if not alias_target:
            continue
        if alias_name in primary_names or alias_name in existing_alias_names:
            continue
        aliases.append(
            {
                "alias_of": alias_target,
                "description": alias.get("description", ""),
                "doc_fift": alias_name,
                "doc_stack": "",
                "mnemonic": alias_name,
                "operands": {},
            }
        )
        existing_alias_names.add(alias_name)

    for insn in normalized_instructions:
        insn.pop("__remote_name", None)
        insn.pop("__sort_key", None)

    return (
        {
            "$schema": "./schema.json",
            "aliases": aliases,
            "instructions": normalized_instructions,
        },
        preserved_legacy,
    )


def ensure_html_fields(spec):
    for insn in spec["instructions"]:
        insn["doc"]["description"] = render_html(insn["doc"].get("description", ""))
    for alias in spec["aliases"]:
        alias["description"] = render_html(alias.get("description", ""))


def update_doc_cp0(spec, spec_output_path):
    serialized = json.loads(json.dumps(spec))
    ensure_html_fields(serialized)
    with open(spec_output_path, "w", encoding="utf-8") as fh:
        json.dump(serialized, fh, ensure_ascii=False, separators=(",", ":"))


def load_legacy_base(spec_output_path):
    if not os.path.exists(spec_output_path):
        return {"$schema": "./schema.json", "aliases": [], "instructions": []}
    with open(spec_output_path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def validate_preserved_legacy_entries(preserved_legacy):
    if not preserved_legacy:
        return

    unexpected = sorted(
        entry["opcode"] for entry in preserved_legacy if entry["opcode"] not in ALLOWED_LEGACY_FALLBACKS
    )
    if unexpected:
        raise RuntimeError(
            "Unexpected legacy entries missing from TxTracer; review required: "
            + ", ".join(unexpected)
        )

    mismatched = []
    for entry in preserved_legacy:
        expected = ALLOWED_LEGACY_FALLBACKS[entry["opcode"]]
        if entry != expected:
            mismatched.append((entry["opcode"], expected, entry))

    if mismatched:
        lines = []
        for opcode, expected, actual in mismatched:
            lines.append(
                f"{opcode}: expected {json.dumps(expected, sort_keys=True)}, "
                f"got {json.dumps(actual, sort_keys=True)}"
            )
        raise RuntimeError(
            "Legacy fallback entries changed; review required:\n" + "\n".join(lines)
        )


def generate(spec_input_path, spec_output_path, instructions_mdx_path):
    source_kind, source_payload = load_input_source(spec_input_path)
    preserved_legacy = []
    if source_kind == "legacy":
        spec = source_payload
    else:
        legacy_base = load_legacy_base(spec_output_path)
        spec, preserved_legacy = build_merged_spec(source_payload, legacy_base)

    validate_preserved_legacy_entries(preserved_legacy)

    static_block = render_static_mdx(spec)
    inject_into_mdx(instructions_mdx_path, static_block)
    update_doc_cp0(spec, spec_output_path)
    if preserved_legacy:
        names = ", ".join(f"{entry['opcode']} {entry['mnemonic']}" for entry in preserved_legacy)
        print(
            f"Preserved {len(preserved_legacy)} legacy entries not present in TxTracer: {names}",
            file=sys.stderr,
        )


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print(f"Usage: {sys.argv[0]} <spec-input-path-or-url> <cp0-output-path> <instructions-mdx-path>")
        sys.exit(1)
    generate(sys.argv[1], sys.argv[2], sys.argv[3])

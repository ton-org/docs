import json
import re
from pathlib import Path
from collections import defaultdict

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False
    print("PyYAML not installed. Run: pip install pyyaml")
    exit(1)

SPEC_PATH = 'ecosystem/api/toncenter/v3.yaml'
MDX_PATH = 'ecosystem/api/toncenter/v3/overview.mdx'
MARKER = 'API_V3_ENDPOINTS'
LINK_BASE = '/ecosystem/api/toncenter/v3'

# Tag display order
TAG_ORDER = [
    'accounts',
    'actions and traces',
    'blockchain data',
    'jettons',
    'nfts',
    'dns',
    'multisig',
    'vesting',
    'stats',
    'utils',
    'api/v2',
]

# Map tag slugs to Mintlify's actual URL slugs
TAG_SLUG_MAP = {
    'api-v2': 'legacy-v2-compatible',
}


def load_openapi_spec(filepath: Path) -> dict:
    """Load the OpenAPI YAML file."""
    with open(filepath, 'r') as f:
        return yaml.safe_load(f)


def extract_endpoints(spec: dict) -> list:
    """Extract endpoints from the OpenAPI spec."""
    endpoints = []
    seen_paths = set()
    paths = spec.get('paths', {})
    
    for path, path_item in paths.items():
        for method in ['get', 'post', 'put', 'patch', 'delete']:
            if method not in path_item:
                continue
            
            operation = path_item[method]
            tags = operation.get('tags', ['Other'])
            tag = tags[0] if tags else 'Other'
            
            # Avoid duplicates
            if path in seen_paths:
                continue
            seen_paths.add(path)
            
            endpoints.append({
                'path': path,
                'method': method.upper(),
                'tag': tag,
                'summary': operation.get('summary', ''),
                'operationId': operation.get('operationId', ''),
            })
    
    return endpoints


def generate_mintlify_link(endpoint: dict) -> str:
    """Generate Mintlify documentation link based on summary"""
    tag = endpoint['tag'].lower().replace(' ', '-').replace('_', '-').replace('/', '-')
    
    # Apply tag slug mapping for Mintlify
    tag = TAG_SLUG_MAP.get(tag, tag)
    
    summary = endpoint.get('summary', '')
    
    if summary:
        slug = summary.lower()
        slug = re.sub(r'[^a-z0-9\s-]', '', slug)  
        slug = re.sub(r'\s+', '-', slug)          
        slug = re.sub(r'-+', '-', slug)           
        slug = slug.strip('-')
        return f"{LINK_BASE}/{tag}/{slug}"
    
    operation_id = endpoint.get('operationId', '')
    if operation_id:
        clean_op_id = operation_id.replace('_get', '').replace('_post', '')
        slug = re.sub(r'([a-z])([A-Z])', r'\1-\2', clean_op_id).lower()
        return f"{LINK_BASE}/{tag}/{slug}"
    
    path_slug = endpoint['path'].split('/')[-1].lower()
    return f"{LINK_BASE}/{tag}/{path_slug}"


def generate_table(endpoints: list) -> str:
    """Generate markdown table from endpoints."""
    # Group by tag
    grouped = defaultdict(list)
    for ep in endpoints:
        grouped[ep['tag']].append(ep)
    
    def sort_key(tag):
        try:
            return TAG_ORDER.index(tag.lower())
        except ValueError:
            return len(TAG_ORDER)
    
    sorted_tags = sorted(grouped.keys(), key=sort_key)
    
    lines = [
        "| Category | Method | Description |",
        "| -------- | ------ | ----------- |",
    ]
    
    for tag in sorted_tags:
        for ep in grouped[tag]:
            method = ep['method']
            path = ep['path'].replace('/api/v3', '')
            summary = ep['summary']
            link = generate_mintlify_link(ep)
            
            # Handle tag display
            display_tag = tag
            if tag.lower() == 'api/v2':
                display_tag = 'Legacy (v2)'
            elif tag.islower():
                display_tag = tag.capitalize()
            
            method_display = f"[`{method} {path}`]({link})"
            
            lines.append(f"| **{display_tag}** | {method_display} | {summary} |")
    
    return '\n'.join(lines)


def inject_table_into_mdx(mdx_path: Path, table: str) -> bool:
    """Inject generated table into MDX file between marker comments."""
    if not mdx_path.exists():
        print(f"   MDX not found: {mdx_path}")
        return False
    
    content = mdx_path.read_text()
    
    # Pattern to match the marker block
    pattern = rf'(\{{/\* BEGIN_AUTO_GENERATED: {MARKER} \*/\}})[ \t]*\n.*?(\{{/\* END_AUTO_GENERATED: {MARKER} \*/\}})'
    
    if not re.search(pattern, content, re.DOTALL):
        print(f"      Markers not found in {mdx_path}")
        print(f"      Add these markers where you want the table:")
        print(f"      {{/* BEGIN_AUTO_GENERATED: {MARKER} */}}")
        print(f"      {{/* END_AUTO_GENERATED: {MARKER} */}}")
        return False
    
    new_content = re.sub(
        pattern,
        rf'\1\n{table}\n\2',
        content,
        flags=re.DOTALL
    )
    
    if new_content != content:
        mdx_path.write_text(new_content)
        return True
    
    return False


def find_repo_root() -> Path:
    """Find the repository root"""
    current = Path(__file__).resolve().parent
    
    for parent in [current] + list(current.parents):
        if (parent / 'mint.json').exists():
            return parent
    
    return current.parent


def main():
    repo_root = find_repo_root()
    
    spec_path = repo_root / SPEC_PATH
    mdx_path = repo_root / MDX_PATH
    
    print(f"\n Processing: {SPEC_PATH}")
    
    if not spec_path.exists():
        print(f"Spec not found: {spec_path}")
        return
    
    spec = load_openapi_spec(spec_path)
    endpoints = extract_endpoints(spec)
    
    print(f"    Found {len(endpoints)} endpoints")
    
    table = generate_table(endpoints)
    
    if inject_table_into_mdx(mdx_path, table):
        print(f"   Updated {MDX_PATH}")
    else:
        print(f"   No changes needed or markers missing")
    
    print("\n Done")


if __name__ == '__main__':
    main()

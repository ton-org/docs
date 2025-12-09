import json
import re
from pathlib import Path
from collections import defaultdict

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False

# Define which specs to process and where to inject tables
SPECS = [
    {
        'spec_path': 'ecosystem/api/toncenter/v2.json',
        'mdx_path': 'ecosystem/api/toncenter/v2/overview.mdx',
        'marker': 'API_V2_ENDPOINTS',
        'link_base': '/ecosystem/api/toncenter/v2',  
        'exclude_tags': ['rpc'],
        'include_jsonrpc': True,
    },
]

def load_openapi_spec(filepath: Path) -> dict:
    """Load the OpenAPI JSON or YAML file."""
    with open(filepath, 'r') as f:
        if filepath.suffix in ['.yaml', '.yml']:
            if not HAS_YAML:
                print(f"PyYAML not installed. Run: pip install pyyaml")
                return None
            return yaml.safe_load(f)
        return json.load(f)


def extract_endpoints(spec: dict, exclude_tags: list = None) -> list:
    """Extract endpoints from the OpenAPI spec."""
    exclude_tags = [t.lower() for t in (exclude_tags or [])]
    
    endpoints = []
    seen_paths = set()
    paths = spec.get('paths', {})
    
    for path, path_item in paths.items():
        for method in ['get', 'post', 'put', 'patch', 'delete']:
            if method not in path_item:
                continue
            
            operation = path_item[method]
            tags = operation.get('tags', ['Other'])
            tags_lower = [t.lower() for t in tags]
            
            # Skip if ALL tags are in exclude list
            if all(t in exclude_tags for t in tags_lower):
                continue
            
            # Use first non-excluded tag as category
            tag = next((t for t in tags if t.lower() not in exclude_tags), tags[0])
            
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


def generate_mintlify_link(endpoint: dict, base_path: str) -> str:
    """Generate Mintlify documentation link based on summary (slugified)."""
    tag = endpoint['tag'].lower().replace(' ', '-').replace('_', '-')
    summary = endpoint.get('summary', '')
    
    if summary:
        # Mintlify slugifies the summary for the URL
        # "Get account state and balance" -> "get-account-state-and-balance"
        slug = summary.lower()
        slug = re.sub(r'[^a-z0-9\s-]', '', slug) 
        slug = re.sub(r'\s+', '-', slug)          
        slug = re.sub(r'-+', '-', slug)         
        slug = slug.strip('-')
        return f"{base_path}/{tag}/{slug}"
    
    operation_id = endpoint.get('operationId', '')
    if operation_id:
        clean_op_id = operation_id.replace('_get', '').replace('_post', '')
        slug = re.sub(r'([a-z])([A-Z])', r'\1-\2', clean_op_id).lower()
        return f"{base_path}/{tag}/{slug}"
    
    path_slug = endpoint['path'].split('/')[-1].lower()
    return f"{base_path}/{tag}/{path_slug}"


def generate_table(endpoints: list, link_base: str) -> str:
    """Generate markdown table from endpoints."""
    # Group by tag
    grouped = defaultdict(list)
    for ep in endpoints:
        grouped[ep['tag']].append(ep)
    
    # Custom sort order
    tag_order = ['accounts', 'blocks', 'transactions', 'send', 'run method', 'utils', 'configuration', 'json-rpc']
    
    def sort_key(tag):
        try:
            return tag_order.index(tag.lower())
        except ValueError:
            return len(tag_order)
    
    sorted_tags = sorted(grouped.keys(), key=sort_key)
    
    lines = [
        "| Category | Method | Description |",
        "| -------- | ------ | ----------- |",
    ]
    
    for tag in sorted_tags:
        for ep in grouped[tag]:
            method = ep['method']
            path = ep['path'].replace('/api/v2', '').replace('/api/v3', '')
            summary = ep['summary']
            link = generate_mintlify_link(ep, link_base)
            
            display_tag = tag.capitalize() if tag.islower() else tag
            method_display = f"[`{method} {path}`]({link})"
            
            lines.append(f"| **{display_tag}** | {method_display} | {summary} |")
    
    return '\n'.join(lines)


def process_spec(config: dict, repo_root: Path) -> str:
    """Process a single OpenAPI spec and generate table."""
    spec_path = repo_root / config['spec_path']
    
    if not spec_path.exists():
        print(f"Spec not found: {spec_path}")
        return None
    
    spec = load_openapi_spec(spec_path)
    if spec is None:
        return None
        
    endpoints = extract_endpoints(spec, config.get('exclude_tags', []))
    
    # Optionally add JSON-RPC endpoint
    if config.get('include_jsonrpc'):
        paths = spec.get('paths', {})
        for rpc_path in ['/api/v2/jsonRPC', '/api/v3/jsonRPC']:
            if rpc_path in paths:
                jsonrpc = paths[rpc_path].get('post', {})
                endpoints.append({
                    'path': rpc_path,
                    'method': 'POST',
                    'tag': 'JSON-RPC',
                    'summary': jsonrpc.get('summary', 'JSON-RPC endpoint'),
                    'operationId': jsonrpc.get('operationId', 'jsonRPC_post'),
                })
    
    return generate_table(endpoints, config['link_base'])


def inject_table_into_mdx(mdx_path: Path, marker: str, table: str) -> bool:
    """
    Inject generated table into MDX file between marker comments.
    
    Markers in MDX should look like:
    {/* BEGIN_AUTO_GENERATED: API_V2_ENDPOINTS */}
    {/* END_AUTO_GENERATED: API_V2_ENDPOINTS */}
    """
    if not mdx_path.exists():
        print(f"MDX not found: {mdx_path}")
        return False
    
    content = mdx_path.read_text()
    
    # Pattern to match the marker block (handles both empty and filled markers)
    pattern = rf'(\{{/\* BEGIN_AUTO_GENERATED: {marker} \*/\}})[ \t]*\n.*?(\{{/\* END_AUTO_GENERATED: {marker} \*/\}})'
    
    if not re.search(pattern, content, re.DOTALL):
        print(f"      Markers not found in {mdx_path}")
        print(f"      Add these markers where you want the table:")
        print(f"      {{/* BEGIN_AUTO_GENERATED: {marker} */}}")
        print(f"      {{/* END_AUTO_GENERATED: {marker} */}}")
        return False
    
    # Replace content between markers 
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
    """Find the repository root (where mint.json is located)."""
    current = Path(__file__).resolve().parent
    
    for parent in [current] + list(current.parents):
        if (parent / 'mint.json').exists():
            return parent
    
    return current.parent


def main():
    repo_root = find_repo_root()
    
    for config in SPECS:
        print(f"\nProcessing: {config['spec_path']}")
        
        table = process_spec(config, repo_root)
        if not table:
            continue
        
        mdx_path = repo_root / config['mdx_path']
        marker = config['marker']
        
        if inject_table_into_mdx(mdx_path, marker, table):
            print(f"  Updated {config['mdx_path']}")
        else:
            print(f"  No changes needed or markers missing")
    
    print("\n✨ Done!")


if __name__ == '__main__':
    main()

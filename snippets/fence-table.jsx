export const FenceTable = ({children}) => {
    return <pre style={{
        'font-family': 'monospace',
        'white-space': 'pre',
        'overflow-x': 'auto',
        'font-size': '14px',
    }}>
    {children}
  </pre>;
}

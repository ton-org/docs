import type {ReactNode} from "react"

export function FenceTable({children}: {children?: ReactNode}) {
  return (
    <pre className="font-mono whitespace-pre overflow-x-auto text-sm leading-6 my-4 p-3 rounded-lg border border-fd-border bg-fd-card">
      {children}
    </pre>
  )
}

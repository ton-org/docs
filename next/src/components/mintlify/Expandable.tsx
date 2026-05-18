import type {ReactNode} from "react"

export function Expandable({
  title,
  defaultOpen,
  children,
}: {
  title?: string
  defaultOpen?: boolean
  children?: ReactNode
}) {
  return (
    <details
      open={defaultOpen}
      className="my-3 rounded-lg border border-fd-border bg-fd-card text-sm"
    >
      <summary className="cursor-pointer select-none px-3 py-2 font-medium text-fd-foreground">
        {title ?? "Details"}
      </summary>
      <div className="border-t border-fd-border px-3 py-2 text-fd-muted-foreground">{children}</div>
    </details>
  )
}

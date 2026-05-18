import type {ReactNode} from "react"

export function Banner({children}: {children?: ReactNode}) {
  return (
    <aside className="my-6 rounded-2xl border border-fd-primary/30 bg-fd-primary/5 px-6 py-4 text-sm text-fd-foreground">
      {children}
    </aside>
  )
}

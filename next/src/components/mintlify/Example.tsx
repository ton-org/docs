import type {ReactNode} from "react"

export function RequestExample({children}: {children?: ReactNode}) {
  return (
    <section className="my-4 rounded-xl border border-fd-border bg-fd-card p-3">
      <header className="mb-2 text-xs font-semibold uppercase tracking-wide text-fd-muted-foreground">
        Request example
      </header>
      <div className="[&_pre]:my-0">{children}</div>
    </section>
  )
}

export function ResponseExample({children}: {children?: ReactNode}) {
  return (
    <section className="my-4 rounded-xl border border-fd-border bg-fd-card p-3">
      <header className="mb-2 text-xs font-semibold uppercase tracking-wide text-fd-muted-foreground">
        Response example
      </header>
      <div className="[&_pre]:my-0">{children}</div>
    </section>
  )
}

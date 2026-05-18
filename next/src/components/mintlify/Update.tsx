import type {ReactNode} from "react"

export function Update({
  label,
  description,
  tags = [],
  children,
}: {
  label?: ReactNode
  description?: ReactNode
  tags?: string[]
  children?: ReactNode
}) {
  return (
    <section className="my-6 border-l-2 border-fd-primary/40 pl-4">
      {(label || tags.length > 0) && (
        <header className="mb-2 flex flex-wrap items-baseline gap-2">
          {label && <h3 className="m-0 text-base font-semibold">{label}</h3>}
          {tags.length > 0 &&
            tags.map(tag => (
              <span
                key={tag}
                className="rounded-md bg-fd-primary/10 px-2 py-0.5 text-xs font-medium text-fd-primary"
              >
                {tag}
              </span>
            ))}
        </header>
      )}
      {description && (
        <p className="m-0 text-fd-muted-foreground">{description}</p>
      )}
      <div className="mt-2">{children}</div>
    </section>
  )
}

import type {ReactNode} from "react"

export function Frame({
  caption,
  children,
}: {
  caption?: ReactNode
  children?: ReactNode
}) {
  return (
    <figure className="my-6 overflow-hidden rounded-2xl border border-fd-border bg-fd-card p-2">
      <div className="overflow-hidden rounded-xl">{children}</div>
      {caption && (
        <figcaption className="px-2 pt-2 pb-1 text-center text-sm text-fd-muted-foreground">
          {caption}
        </figcaption>
      )}
    </figure>
  )
}

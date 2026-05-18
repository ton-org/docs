import type {ReactNode} from "react"

interface FieldProps {
  name: string
  type?: string
  required?: boolean
  default?: string | number | boolean
  placeholder?: string
  deprecated?: boolean
  hidden?: boolean
  children?: ReactNode
}

function FieldRow({name, type, required, default: defaultValue, deprecated, hidden, children}: FieldProps) {
  if (hidden) return null

  return (
    <div className="not-prose group/api-field my-4 rounded-xl border border-fd-border bg-fd-card p-4 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <code className="rounded-md bg-fd-muted px-1.5 py-0.5 text-fd-foreground font-mono text-[0.92em]">
          {name}
        </code>
        {type && (
          <span className="text-fd-muted-foreground font-mono text-xs">{type}</span>
        )}
        {required && (
          <span className="rounded-md bg-fd-primary/10 px-1.5 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide text-fd-primary">
            required
          </span>
        )}
        {deprecated && (
          <span className="rounded-md bg-fd-destructive/10 px-1.5 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide text-fd-destructive">
            deprecated
          </span>
        )}
        {defaultValue !== undefined && (
          <span className="text-fd-muted-foreground text-xs">
            default: <code className="font-mono">{String(defaultValue)}</code>
          </span>
        )}
      </div>
      {children && (
        <div className="mt-2 text-fd-muted-foreground [&_p]:m-0 [&_p+p]:mt-2">{children}</div>
      )}
    </div>
  )
}

export function ResponseField(props: FieldProps) {
  return <FieldRow {...props} />
}

export function ParamField(
  props: FieldProps & {query?: string; path?: string; body?: string; header?: string},
) {
  return <FieldRow {...props} />
}

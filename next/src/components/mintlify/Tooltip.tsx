import type {ReactNode} from "react"

/**
 * Lightweight Mintlify-compatible tooltip shim using native `title` attribute.
 * For richer interactions we can swap in a `@radix-ui/react-tooltip` impl later.
 */
export function Tooltip({tip, children}: {tip?: string; children?: ReactNode}) {
  return (
    <span title={tip} className="underline decoration-dotted decoration-fd-muted-foreground">
      {children}
    </span>
  )
}

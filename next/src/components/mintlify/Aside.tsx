import type {ReactNode} from "react"
import {Callout, type CalloutType} from "@/components/Callout"

/**
 * Mintlify `Aside` shim that delegates to the Acton-style `Callout`.
 *
 * Maintains the original prop surface so MDX files don't need to be rewritten:
 *   - `type`: 'note' | 'tip' | 'caution' | 'danger'
 *   - `title`: optional bolded title
 *   - `icon`: ignored (Callout chooses its own icon by type)
 *   - `iconType`: ignored
 */
export type AsideType = "note" | "tip" | "caution" | "danger"

const TYPE_MAP: Record<AsideType, CalloutType> = {
  note: "info",
  tip: "idea",
  caution: "warn",
  danger: "error",
}

export function Aside({
  type = "note",
  title,
  children,
}: {
  type?: AsideType
  title?: ReactNode
  icon?: string
  iconType?: string
  children?: ReactNode
}) {
  const calloutType = TYPE_MAP[type] ?? "info"
  return (
    <Callout type={calloutType} title={title}>
      {children}
    </Callout>
  )
}

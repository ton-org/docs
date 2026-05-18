import type {ReactNode} from "react"
import {
  Accordions as FumaAccordions,
  Accordion as FumaAccordion,
} from "fumadocs-ui/components/accordion"

/**
 * Mintlify's `<Accordion>` works both standalone (single self-collapsing
 * panel) and nested inside `<AccordionGroup>`. Fumadocs's `Accordion`
 * requires an `Accordions` parent. To avoid SSR/client-context plumbing,
 * standalone uses always wrap themselves — the outer `Accordions` is
 * unobtrusive and the behavior matches.
 */
export function Accordion({
  title,
  defaultOpen,
  children,
}: {
  title?: ReactNode
  description?: string
  icon?: string
  iconType?: string
  defaultOpen?: boolean
  children?: ReactNode
}) {
  const titleString = (title as string) ?? ""
  return (
    <FumaAccordions
      type="single"
      collapsible
      defaultValue={defaultOpen ? titleString : undefined}
    >
      <FumaAccordion title={titleString} value={titleString}>
        {children}
      </FumaAccordion>
    </FumaAccordions>
  )
}

export function AccordionGroup({children}: {children?: ReactNode}) {
  return <FumaAccordions type="multiple">{children}</FumaAccordions>
}

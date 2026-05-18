import type {ReactNode} from "react"
import {
  Tabs as FumaTabs,
  Tab as FumaTab,
  type TabsProps as FumaTabsProps,
} from "fumadocs-ui/components/tabs"
import {Children, isValidElement} from "react"

interface MintlifyTabProps {
  title?: string
  language?: string
  children?: ReactNode
}

interface MintlifyTabsProps extends Omit<FumaTabsProps, "items"> {
  children?: ReactNode
  groupId?: string
}

function collectTabItems(children: ReactNode): string[] {
  const items: string[] = []
  Children.forEach(children, child => {
    if (!isValidElement<MintlifyTabProps>(child)) return
    const props = child.props
    const label = props.title ?? props.language ?? ""
    if (label) items.push(label)
  })
  return items
}

export function Tabs({children, groupId, ...rest}: MintlifyTabsProps) {
  const items = collectTabItems(children)
  return (
    <FumaTabs items={items} groupId={groupId} {...rest}>
      {children}
    </FumaTabs>
  )
}

export function Tab({title, language, children}: MintlifyTabProps) {
  const value = title ?? language ?? ""
  return <FumaTab value={value}>{children}</FumaTab>
}

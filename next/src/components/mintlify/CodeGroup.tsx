import type {ReactNode} from "react"
import {Children, isValidElement} from "react"
import {
  Tabs as FumaTabs,
  Tab as FumaTab,
} from "fumadocs-ui/components/tabs"

/**
 * Mintlify's `<CodeGroup>` wraps a set of fenced code blocks; each child code
 * block's `filename` / `title` attribute is used as the tab label.
 */
export function CodeGroup({children}: {children?: ReactNode}) {
  const tabs = Children.toArray(children).filter(isValidElement) as Array<
    React.ReactElement<{
      title?: string
      filename?: string
      "data-language"?: string
    }>
  >

  const items = tabs.map((child, idx) => {
    const props = (child.props ?? {}) as {
      title?: string
      filename?: string
      "data-language"?: string
    }
    return (
      props.title ?? props.filename ?? props["data-language"] ?? `Snippet ${idx + 1}`
    )
  })

  return (
    <FumaTabs items={items} groupId="codegroup">
      {tabs.map((child, idx) => (
        <FumaTab key={idx} value={items[idx]}>
          {child}
        </FumaTab>
      ))}
    </FumaTabs>
  )
}

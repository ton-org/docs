import type {ReactNode} from "react"
import {Callout} from "@/components/Callout"

export function Note({children, title}: {children?: ReactNode; title?: ReactNode}) {
  return (
    <Callout type="info" title={title}>
      {children}
    </Callout>
  )
}

export function Warning({children, title}: {children?: ReactNode; title?: ReactNode}) {
  return (
    <Callout type="warn" title={title}>
      {children}
    </Callout>
  )
}

export function Info({children, title}: {children?: ReactNode; title?: ReactNode}) {
  return (
    <Callout type="info" title={title}>
      {children}
    </Callout>
  )
}

export function Tip({children, title}: {children?: ReactNode; title?: ReactNode}) {
  return (
    <Callout type="idea" title={title}>
      {children}
    </Callout>
  )
}

export function Check({children, title}: {children?: ReactNode; title?: ReactNode}) {
  return (
    <Callout type="success" title={title}>
      {children}
    </Callout>
  )
}

export function Danger({children, title}: {children?: ReactNode; title?: ReactNode}) {
  return (
    <Callout type="error" title={title}>
      {children}
    </Callout>
  )
}

export function Caution({children, title}: {children?: ReactNode; title?: ReactNode}) {
  return (
    <Callout type="warn" title={title}>
      {children}
    </Callout>
  )
}

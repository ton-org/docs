import type {ReactNode} from "react"
import {Steps as FumaSteps, Step as FumaStep} from "fumadocs-ui/components/steps"

export function Steps({children}: {children?: ReactNode}) {
  return <FumaSteps>{children}</FumaSteps>
}

export function Step({
  title,
  children,
}: {
  title?: ReactNode
  titleSize?: string
  stepNumber?: number
  children?: ReactNode
}) {
  return (
    <FumaStep>
      {title && <h3 className="step-title">{title}</h3>}
      {children}
    </FumaStep>
  )
}

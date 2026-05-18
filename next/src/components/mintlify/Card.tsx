import type {ReactNode} from "react"
import {Card as FumaCard, Cards as FumaCards} from "fumadocs-ui/components/card"
import {Icon as MintlifyIcon} from "./Icon"
import {cn} from "@/lib/cn"

interface CardProps {
  title?: ReactNode
  icon?: string | ReactNode
  iconType?: string
  href?: string
  cta?: string
  arrow?: boolean
  color?: string
  horizontal?: boolean
  children?: ReactNode
}

function resolveIcon(icon?: string | ReactNode, iconType?: string) {
  if (icon === undefined || icon === null) return undefined
  if (typeof icon === "string") {
    return <MintlifyIcon icon={icon} iconType={iconType} size={16} />
  }
  return icon
}

export function Card({title, icon, iconType, href, children}: CardProps) {
  return (
    <FumaCard title={title as string} href={href} icon={resolveIcon(icon, iconType)}>
      {children}
    </FumaCard>
  )
}

export function CardGroup({
  cols = 2,
  children,
}: {
  cols?: number
  children?: ReactNode
}) {
  return (
    <FumaCards
      className={cn(
        cols === 1 && "sm:grid-cols-1",
        cols === 2 && "sm:grid-cols-2",
        cols === 3 && "sm:grid-cols-3",
        cols === 4 && "sm:grid-cols-4",
      )}
    >
      {children}
    </FumaCards>
  )
}

/**
 * Mintlify `<Columns>` is essentially `<CardGroup cols>` — alias for clarity.
 */
export function Columns({
  cols = 2,
  children,
}: {
  cols?: number
  children?: ReactNode
}) {
  return <CardGroup cols={cols}>{children}</CardGroup>
}

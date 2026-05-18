import type {ReactNode} from "react"
import {cn} from "@/lib/cn"

type BadgeVariant = "info" | "success" | "warning" | "error" | "neutral"

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  info: "bg-fd-primary/10 text-fd-primary border-fd-primary/20",
  success: "bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  error: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20",
  neutral: "bg-fd-muted text-fd-muted-foreground border-fd-border",
}

export function Badge({
  variant = "info",
  children,
  className,
}: {
  variant?: BadgeVariant | string
  children?: ReactNode
  className?: string
}) {
  const v = (VARIANT_CLASSES[variant as BadgeVariant] ? variant : "info") as BadgeVariant
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium align-baseline",
        VARIANT_CLASSES[v],
        className,
      )}
    >
      {children}
    </span>
  )
}

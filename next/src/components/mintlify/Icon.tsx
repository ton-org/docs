import {icons, type LucideIcon} from "lucide-react"
import {cn} from "@/lib/cn"

/**
 * Mintlify `<Icon>` shim.
 *
 * The Mintlify default icon set is FontAwesome (lowercase, kebab-case names).
 * Our new docs use Lucide. We attempt to resolve:
 *   1. Exact PascalCase match in `lucide-react/icons`.
 *   2. Kebab-case → PascalCase translation (e.g. `circle-arrow-up` → `CircleArrowUp`).
 *   3. Fallback: rendered as a small filled square so the page still renders.
 */
function kebabToPascal(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9-]/g, "")
    .split(/[-_/]/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")
}

export function Icon({
  icon,
  size = 16,
  color,
  iconType: _iconType,
  className,
}: {
  icon: string
  iconType?: string
  size?: number | string
  color?: string
  className?: string
}) {
  const pascal = kebabToPascal(icon)
  const Lucide = (icons as Record<string, LucideIcon | undefined>)[pascal]

  const numericSize = typeof size === "number" ? size : Number.parseFloat(size) || 16

  if (Lucide) {
    return (
      <Lucide
        width={numericSize}
        height={numericSize}
        color={color}
        className={cn("inline-block align-middle", className)}
        aria-hidden
      />
    )
  }

  return (
    <span
      className={cn("inline-block align-middle rounded-sm bg-fd-muted", className)}
      style={{width: numericSize, height: numericSize, backgroundColor: color}}
      aria-label={icon}
      role="img"
    />
  )
}

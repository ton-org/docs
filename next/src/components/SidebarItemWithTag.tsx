"use client"
import {cva} from "class-variance-authority"
import {usePathname} from "fumadocs-core/framework"
import type {Folder, Item} from "fumadocs-core/page-tree"
import {
  SidebarFolder,
  SidebarFolderContent,
  SidebarFolderLink,
  SidebarFolderTrigger,
  SidebarItem as BaseSidebarItem,
  useFolder,
  useFolderDepth,
} from "fumadocs-ui/components/sidebar/base"
import {useTreePath} from "fumadocs-ui/contexts/tree"
import {ArrowUpRight} from "lucide-react"
import type {ReactNode} from "react"
import {cn} from "@/lib/cn"

/**
 * Custom Sidebar.Item / Sidebar.Folder overrides that mirror the default
 * Fumadocs page-tree renderer (`node_modules/fumadocs-ui/dist/components/
 * sidebar/page-tree.js`) and add a trailing `<TagBadge>` when a node carries
 * the `$tag` field that `source.ts`'s transformer stamps onto it from
 * `nav-overlays.json`.
 *
 * IMPORTANT: `fumadocs-ui/components/sidebar/base` exports *unstyled* primitives
 * — bare `<Link>` wrappers with `data-active`. The actual look (color, padding,
 * hover, active highlight, depth indent) is layered on top inside the private
 * `fumadocs-ui/dist/layouts/docs/slots/sidebar.js`. When we plug a custom
 * `Item`/`Folder` into `DocsLayout`'s `sidebar.components`, the renderer skips
 * the layout's styled wrappers, so we have to re-apply the same `itemVariants`
 * + depth-based padding here to keep parity. Source for the rules:
 * `node_modules/fumadocs-ui/dist/layouts/docs/slots/sidebar.js` (`itemVariants`,
 * `getItemOffset`, the styled `SidebarItem`/`SidebarFolderTrigger`/
 * `SidebarFolderLink` wrappers).
 */

type TaggedItem = Item & {$tag?: string}
type TaggedFolder = Folder & {$tag?: string}

const itemVariants = cva(
  "relative flex flex-row items-center gap-2 rounded-lg p-2 text-start text-fd-muted-foreground wrap-anywhere [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        link: "transition-colors hover:bg-fd-accent/50 hover:text-fd-accent-foreground/80 hover:transition-none data-[active=true]:bg-fd-primary/10 data-[active=true]:text-fd-primary data-[active=true]:hover:transition-colors",
        button:
          "transition-colors hover:bg-fd-accent/50 hover:text-fd-accent-foreground/80 hover:transition-none",
      },
      highlight: {
        true: "data-[active=true]:before:content-[''] data-[active=true]:before:bg-fd-primary data-[active=true]:before:absolute data-[active=true]:before:w-px data-[active=true]:before:inset-y-2.5 data-[active=true]:before:inset-s-2.5",
      },
    },
  },
)

function getItemOffset(depth: number): string {
  return `calc(${2 + 3 * depth} * var(--spacing))`
}

function normalize(urlOrPath: string): string {
  if (urlOrPath.length > 1 && urlOrPath.endsWith("/")) return urlOrPath.slice(0, -1)
  return urlOrPath
}

function isActive(href: string, pathname: string, nested = false): boolean {
  href = normalize(href)
  pathname = normalize(pathname)
  return href === pathname || (nested && pathname.startsWith(`${href}/`))
}

function TagBadge({tag, className}: {tag?: string; className?: string}) {
  if (!tag) return null
  return (
    <span
      className={cn(
        "ms-auto rounded bg-fd-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fd-primary",
        className,
      )}
    >
      {tag}
    </span>
  )
}

/**
 * Trailing arrow that signals an external link. Fumadocs' default
 * `SidebarItem` only falls back to the leading `ExternalLink` icon when no
 * explicit icon is set, which means external links migrated from Mintlify
 * (which often shipped a real icon in their MDX frontmatter) had no visual
 * "this leaves the docs" cue. Stamping a small ↗ at the end of the row keeps
 * that signal regardless of whether the entry carries its own icon.
 */
function ExternalArrow() {
  return (
    <ArrowUpRight
      aria-hidden
      className="ms-auto size-3.5 shrink-0 text-fd-muted-foreground"
    />
  )
}

export function SidebarItemWithTag({item}: {item: Item}) {
  const pathname = usePathname()
  const depth = useFolderDepth()
  const tagged = item as TaggedItem
  return (
    <BaseSidebarItem
      href={item.url}
      external={item.external}
      active={isActive(item.url, pathname)}
      icon={item.icon}
      className={itemVariants({variant: "link", highlight: depth >= 1})}
      style={{paddingInlineStart: getItemOffset(depth)}}
    >
      {item.name}
      <TagBadge tag={tagged.$tag} />
      {item.external && !tagged.$tag ? <ExternalArrow /> : null}
    </BaseSidebarItem>
  )
}

/**
 * Folder-trigger / folder-link wrappers re-apply the depth-based styling that
 * `docs/slots/sidebar.js`'s `SidebarFolderTrigger` / `SidebarFolderLink`
 * normally inject. `useFolder` only resolves *inside* `<SidebarFolder>`, so we
 * split the trigger out into its own component that runs after the provider
 * has been established.
 */
function FolderTriggerInner({item, tagged}: {item: Folder; tagged: TaggedFolder}) {
  const folder = useFolder()
  const depth = folder?.depth ?? 1
  const collapsible = folder?.collapsible ?? true
  return (
    <SidebarFolderTrigger
      className={cn(itemVariants({variant: collapsible ? "button" : null}), "w-full")}
      style={{paddingInlineStart: getItemOffset(depth - 1)}}
    >
      {item.icon}
      {item.name}
      <TagBadge tag={tagged.$tag} />
    </SidebarFolderTrigger>
  )
}

/**
 * Non-collapsible "section" trigger: a folder rendered as a separator-styled
 * header so its children stay visibly nested under it. Mirrors the styling of
 * Fumadocs' built-in `SidebarSeparator` (`docs/slots/sidebar.js` line 186).
 * Used for sub-groups marked `mode: "section"` in `navigation.config.json`
 * (e.g. AppKit's "Installation"), where the orphan sibling page re-parented
 * by `source.ts` sits as the first row beneath the header.
 */
function FolderSectionTriggerInner({
  item,
  tagged,
}: {
  item: Folder
  tagged: TaggedFolder
}) {
  const folder = useFolder()
  const depth = folder?.depth ?? 1
  return (
    <SidebarFolderTrigger
      className={cn(
        "inline-flex items-center gap-2 mb-1 px-2 mt-6 empty:mb-0 text-xs uppercase tracking-wide text-fd-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0",
        depth === 1 && "first:mt-0",
      )}
      style={{paddingInlineStart: getItemOffset(depth - 1)}}
    >
      {item.icon}
      {item.name}
      <TagBadge tag={tagged.$tag} />
    </SidebarFolderTrigger>
  )
}

function FolderLinkInner({
  item,
  tagged,
  pathname,
}: {
  item: Folder
  tagged: TaggedFolder
  pathname: string
}) {
  const depth = useFolderDepth()
  if (!item.index) return null
  return (
    <SidebarFolderLink
      href={item.index.url}
      active={isActive(item.index.url, pathname)}
      external={item.index.external}
      className={cn(itemVariants({variant: "link", highlight: depth > 1}), "w-full")}
      style={{paddingInlineStart: getItemOffset(depth - 1)}}
    >
      {item.icon}
      {item.name}
      <TagBadge tag={tagged.$tag} />
    </SidebarFolderLink>
  )
}

function FolderContentInner({
  children,
  suppressGuide,
}: {
  children: ReactNode
  suppressGuide?: boolean
}) {
  const depth = useFolderDepth()
  return (
    <SidebarFolderContent
      className={cn(
        "relative",
        !suppressGuide &&
          depth === 1 &&
          "before:content-[''] before:absolute before:w-px before:inset-y-1 before:bg-fd-border before:inset-s-2.5",
      )}
    >
      <div className="flex flex-col gap-0.5 pt-0.5">{children}</div>
    </SidebarFolderContent>
  )
}

export function SidebarFolderWithTag({item, children}: {item: Folder; children: ReactNode}) {
  const pathname = usePathname()
  const path = useTreePath()
  const tagged = item as TaggedFolder
  const isSection = item.collapsible === false
  return (
    <SidebarFolder
      collapsible={item.collapsible}
      active={path.includes(item)}
      defaultOpen={item.defaultOpen}
    >
      {item.index ? (
        <FolderLinkInner item={item} tagged={tagged} pathname={pathname} />
      ) : isSection ? (
        <FolderSectionTriggerInner item={item} tagged={tagged} />
      ) : (
        <FolderTriggerInner item={item} tagged={tagged} />
      )}
      <FolderContentInner suppressGuide={isSection}>{children}</FolderContentInner>
    </SidebarFolder>
  )
}

import type {BaseLayoutProps, LayoutTab, LinkItemType} from "fumadocs-ui/layouts/shared"
import {ArrowUpRight, icons} from "lucide-react"
import {readFileSync} from "node:fs"
import path from "node:path"
import {createElement, type ComponentType, type SVGProps} from "react"
import {ThemeLogo} from "@/components/ThemeLogo"
import type {GroupRef, InternalTab, NavConfig, NavEntry} from "@/lib/nav-types"
import {
  getEffectiveTabs,
  isExternalTab,
  isGroup,
  isLink,
  isPage,
} from "@/lib/nav-types"

export const logo = <ThemeLogo />

/**
 * Read `navigation.config.json` synchronously. Called per request rather
 * than cached at module scope so the dev server picks up edits made via
 * the nav editor immediately (a module-level cache would otherwise
 * outlive `navbarLinks → tabs[]` migrations and surface stale items in
 * the header strip). The file is tiny — re-reading is negligible.
 *
 * Fumadocs' built-in `getLayoutTabs(tree)` ignores the page-tree's Root
 * (it copies `children` but strips the Root's own `root: true` flag, see
 * `loader-*.js`'s `root()` builder), so the "Documentation" tab would
 * never surface in the in-sidebar dropdown or the `tabMode="top"` strip.
 * We build the tabs list ourselves from `navigation.config.json` and pass
 * it explicitly via `<DocsLayout tabs={...}>`.
 */
function readNavConfig(): NavConfig {
  const configPath = path.join(process.cwd(), "navigation.config.json")
  try {
    const raw = readFileSync(configPath, "utf8")
    return JSON.parse(raw) as NavConfig
  } catch {
    return {version: 1, tabs: []}
  }
}

function toPascalCase(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")
}

function resolveLucideIcon(name: string | undefined) {
  if (!name) return undefined
  const Comp = (icons as Record<string, ComponentType<SVGProps<SVGSVGElement>>>)[
    toPascalCase(name)
  ]
  if (!Comp) return undefined
  return createElement(Comp)
}

/**
 * Walk a tab's `pages` depth-first and yield every concrete page URL.
 * Used to (a) pick a sensible jump-to URL for the tab and (b) populate
 * `LayoutTab.urls` so Fumadocs can resolve the active tab by pathname
 * even though we're not binding to a `$folder`. External links and groups
 * are walked transparently — groups append their slug to the prefix; links
 * are skipped (a tab click should land on an internal page).
 */
function collectPageUrls(entries: NavEntry[], prefix: string[]): string[] {
  const out: string[] = []
  for (const entry of entries) {
    if (isLink(entry)) continue
    if (isGroup(entry)) {
      const next = (entry as GroupRef).slug ? [...prefix, (entry as GroupRef).slug as string] : prefix
      out.push(...collectPageUrls((entry as GroupRef).pages ?? [], next))
      continue
    }
    if (isPage(entry)) {
      if (entry.slug === "") {
        const joined = prefix.join("/")
        out.push(joined ? `/${joined}` : "/")
        continue
      }
      const leaf = entry.slug ?? entry.id.split("/").pop() ?? entry.id
      out.push(`/${[...prefix, leaf].join("/")}`)
    }
  }
  return out
}

function tabHref(tab: InternalTab): string {
  const prefix = tab.slug ? [tab.slug] : []
  const [first] = collectPageUrls(tab.pages ?? [], prefix)
  if (first) return first
  return tab.slug ? `/${tab.slug}` : "/"
}

/**
 * Build the explicit `LayoutTab[]` Fumadocs renders in `<DocsLayout tabs={...}>`.
 *
 * Internal tabs: each tab's `urls` set drives `isLayoutTabActive`'s exact-match
 * check, so deep links like `/appkit/get-started/installation/react-app` still
 * highlight the AppKit tab.
 *
 * External tabs: linked out, never active. The title is wrapped with an
 * `ArrowUpRight` glyph so users can tell at a glance the click leaves the
 * docs. `fumadocs-core/link` auto-detects absolute URLs and renders
 * `<a target="_blank">`.
 */
export function buildLayoutTabs(): LayoutTab[] {
  return getEffectiveTabs(readNavConfig()).map<LayoutTab>(tab => {
    if (isExternalTab(tab)) {
      return {
        url: tab.url,
        title: (
          <span className="inline-flex items-center gap-1.5">
            {tab.title}
            <ArrowUpRight size={14} className="text-fd-muted-foreground/70" />
          </span>
        ),
        icon: resolveLucideIcon(tab.icon),
        urls: new Set(),
      }
    }
    const prefix = tab.slug ? [tab.slug] : []
    const urls = new Set<string>(collectPageUrls(tab.pages ?? [], prefix))
    urls.add(tabHref(tab))
    return {
      url: tabHref(tab),
      title: tab.title,
      icon: resolveLucideIcon(tab.icon),
      urls,
    }
  })
}

/**
 * Header links sourced from the same effective tab list. The home page uses
 * `<HomeLayout>` which doesn't render the docs tab strip; this projection
 * keeps it in lockstep with what docs pages show.
 *
 * Internal tabs jump to their first concrete page (matching the docs strip);
 * external tabs keep their absolute URL with `external: true` so Fumadocs
 * opens them in a new window.
 */
function buildLinks(): LinkItemType[] {
  return getEffectiveTabs(readNavConfig()).map<LinkItemType>(tab => {
    if (isExternalTab(tab)) {
      return {
        type: "main",
        text: tab.title,
        url: tab.url,
        external: true,
        icon: resolveLucideIcon(tab.icon),
      }
    }
    return {
      type: "main",
      text: tab.title,
      url: tabHref(tab),
      icon: resolveLucideIcon(tab.icon),
    }
  })
}

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          {logo}
          <span className="text-lg font-semibold tracking-tight">Docs</span>
        </>
      ),
    },
    links: buildLinks(),
  }
}

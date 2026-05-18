import {source} from "@/lib/source"
import {DocsLayout} from "fumadocs-ui/layouts/docs"
import {baseOptions, buildLayoutTabs} from "@/lib/layout.shared"
import {SidebarItemWithTag, SidebarFolderWithTag} from "@/components/SidebarItemWithTag"
import type {ReactNode} from "react"

export default function Layout({children}: {children: ReactNode}) {
  return (
    <DocsLayout
      tree={source.pageTree}
      githubUrl="https://github.com/ton-org/docs"
      // Render every tab from `navigation.config.json` as a `SidebarTabsDropdown`
      // (picker at the top of the left sidebar) instead of the horizontal strip
      // above the article. We pass `tabs` explicitly because Fumadocs' auto
      // `getLayoutTabs(tree)` ignores the page-tree Root's own `root: true`
      // (the "Documentation" tab), so the auto path would only ever surface AppKit.
      tabMode="auto"
      tabs={buildLayoutTabs()}
      sidebar={{
        className: "ton-docs-sidebar",
        // Render a tag pill next to pages / external links / folder-backed
        // groups whose `$tag` was stamped by `source.ts`'s page-tree
        // transformer from `nav-overlays.json`. Fumadocs' default meta.json
        // syntax cannot carry tags on links or folders, so we layer them on
        // here.
        components: {
          Item: SidebarItemWithTag,
          Folder: SidebarFolderWithTag,
        },
      }}
      {...baseOptions()}
      // `baseOptions().links` projects every tab as a `LinkItemType` for
      // the home page navbar. Docs pages already surface the same items
      // via the tab strip, so blank `links` here keeps the docs sidebar
      // header from duplicating them.
      links={[]}
    >
      {children}
    </DocsLayout>
  )
}

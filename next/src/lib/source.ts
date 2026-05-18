import { docs } from "collections/server"
import { findPath, type Folder, type Item } from "fumadocs-core/page-tree"
import { loader } from "fumadocs-core/source"
import { icons } from "lucide-react"
import { readFileSync } from "node:fs"
import path from "node:path"
import { createElement, type ComponentType, type SVGProps } from "react"
import { type InferPageType } from "fumadocs-core/source"

/**
 * Frontmatter / meta.json icon names ship in kebab-case (`book-open`,
 * `lightbulb`, `rocket`, …) but `lucide-react`'s `icons` map exports
 * PascalCase keys (`BookOpen`, `Lightbulb`, `Rocket`). Without this
 * transform, every lookup misses and no sidebar icon ever renders.
 */
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
 * Sidecar tags emitted by `scripts/apply-nav.mjs`. Fumadocs' `meta.json` link
 * and folder entries have no slot for a tag, and pages may carry config-only
 * tags (not echoed into MDX frontmatter), so we layer them onto the page tree
 * here. Keys:
 *
 *   - `tagByItemUrl`: canonical URL of each tagged page or external link.
 *     Pages use `/${slug}` (matching what fumadocs assigns to `Item.url`),
 *     links use the verbatim outbound URL.
 *   - `tagByFolderPath`: directory path passed to `PageTreeTransformer.folder`.
 *     Equivalent to the same `dir` key apply-nav uses for `meta.json`
 *     (e.g. `ecosystem`, `ecosystem/api`).
 */
interface NavOverlays {
  tagByItemUrl?: Record<string, string>
  tagByFolderPath?: Record<string, string>
}

function loadNavOverlays(): NavOverlays {
  const file = path.resolve(process.cwd(), "nav-overlays.json")
  try {
    const raw = readFileSync(file, "utf8")
    const parsed = JSON.parse(raw) as NavOverlays
    return {
      tagByItemUrl: parsed.tagByItemUrl ?? {},
      tagByFolderPath: parsed.tagByFolderPath ?? {},
    }
  } catch {
    return { tagByItemUrl: {}, tagByFolderPath: {} }
  }
}

const navOverlays = loadNavOverlays()

/** Item / Folder node with the extra `$tag` we stash on them in the transformer. */
export type TaggedItem = Item & { $tag?: string }
export type TaggedFolder = Folder & { $tag?: string }

export const source = loader({
  baseUrl: "/",
  source: docs.toFumadocsSource(),
  icon: resolveLucideIcon,
  // `meta.json` cannot carry a `tag` on link or folder entries, and pages may
  // have config-only tags (not echoed into MDX frontmatter), so apply-nav
  // sidecars them in `nav-overlays.json`. Here we stamp them onto the matching
  // page-tree nodes as `$tag`, picked up by the custom `SidebarItemWithTag` /
  // `SidebarFolderWithTag` renderers wired through `DocsLayout.sidebar.components`.
  //
  // The same `folder` hook also re-parents Mintlify-style "intro" sibling
  // pages (e.g. `appkit/get-started.mdx` next to `appkit/get-started/`).
  // Fumadocs would otherwise drop these into `root.fallback` and the sidebar
  // would never show them: a bare meta ref resolves to the folder (loader
  // line 434) and the `...folder` extract only inlines `[node.index, ...]`
  // (loader line 423), neither of which picks up the sibling file. By
  // inserting the orphan as `folder.children[0]` from the transformer, both
  // group modes Just Work — `flatten` extracts it into the parent depth
  // right after the section separator, `section`/`folder` keep it nested as
  // the first row under the folder header.
  pageTree: {
    transformers: [
      {
        file(node, file) {
          const tag = navOverlays.tagByItemUrl?.[node.url]
          if (tag) (node as TaggedItem).$tag = tag

          if (file) {
              try {
                const content = this.storage.read(file);
                if ((content?.data as { sidebarTitle?: string })?.sidebarTitle) {
                  node.name = (content?.data as { sidebarTitle?: string })?.sidebarTitle;
                }
              } catch (error) {
                console.error('Error reading file', error);
              }
          }

          return node
        },
        folder(node, folderPath) {
          const tag = navOverlays.tagByFolderPath?.[folderPath]
          if (tag) (node as TaggedFolder).$tag = tag

          // resolveFlattenPath returns the input unchanged when no file is
          // registered at <folderPath>.<format>, so unequal => orphan exists.
          const orphanFilePath = this.builder.resolveFlattenPath(folderPath, "page")
          if (orphanFilePath !== folderPath) {
            const orphan = this.builder.file(orphanFilePath)
            // includes() guards against re-running on an already-handled
            // node (cached folder builds short-circuit upstream, but the
            // explicit check keeps the transformation idempotent).
            if (orphan && !node.children.includes(orphan)) {
              node.children.unshift(orphan)
            }
          }
          return node
        },
      },
    ],
  },
})

export const llmSource = loader({
  baseUrl: "/llms.mdx",
  url: slugs => `/llms.mdx/${slugs.join("/")}.md`,
  source: docs.toFumadocsSource(),
})

export async function getSource() {
  return source
}

export async function getLlmSource() {
  return llmSource
}

type SourcePage = InferPageType<typeof source>
type LlmSourcePage = InferPageType<typeof llmSource>

function isVisibleSourcePage(page: SourcePage) {
  return (
    findPath(
      source.getPageTree(page.locale).children,
      node => node.type === "page" && node.url === page.url,
    ) !== null
  )
}

function isVisibleLlmSourcePage(page: LlmSourcePage) {
  return (
    findPath(
      llmSource.getPageTree(page.locale).children,
      node => node.type === "page" && node.url === page.url,
    ) !== null
  )
}

export function getVisiblePages(language?: string) {
  return source.getPages(language).filter(isVisibleSourcePage)
}

export function getVisibleLlmPages(language?: string) {
  return llmSource.getPages(language).filter(isVisibleLlmSourcePage)
}

export function generateVisibleParams() {
  return getVisiblePages().map(page => ({
    slug: page.slugs,
  }))
}

const generateVisibleSourceParams: typeof source.generateParams = (slug, lang) => {
  const slugName = slug ?? "slug"
  const langName = lang ?? "lang"

  return getVisiblePages().map(page => ({
    [slugName]: page.slugs,
    ...(page.locale ? { [langName]: page.locale } : {}),
  })) as ReturnType<typeof source.generateParams>
}

const generateVisibleLlmParams: typeof llmSource.generateParams = (slug, lang) => {
  const slugName = slug ?? "slug"
  const langName = lang ?? "lang"

  return getVisibleLlmPages().map(page => ({
    [slugName]: page.slugs,
    ...(page.locale ? { [langName]: page.locale } : {}),
  })) as ReturnType<typeof llmSource.generateParams>
}

export const visibleSource: typeof source = {
  ...source,
  getPages: getVisiblePages,
  getLanguages: () =>
    source.getLanguages().map(entry => ({
      ...entry,
      pages: getVisiblePages(entry.language),
    })),
  generateParams: generateVisibleSourceParams,
}

export const visibleLlmSource: typeof llmSource = {
  ...llmSource,
  getPages: getVisibleLlmPages,
  getLanguages: () =>
    llmSource.getLanguages().map(entry => ({
      ...entry,
      pages: getVisibleLlmPages(entry.language),
    })),
  generateParams: generateVisibleLlmParams,
}

export function getPageImage(page: InferPageType<typeof source>) {
  const segments = [...page.slugs, "image.png"]

  return {
    segments,
    url: `/og/docs/${segments.join("/")}`,
  }
}

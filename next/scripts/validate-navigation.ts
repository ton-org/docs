/**
 * Validates that every `.mdx` page under `content/docs/**` is reachable from
 * the navigation tree built by the per-directory `meta.json` files.
 *
 * This is a Node-native rewrite of Acton's bun-based validator; it scans the
 * filesystem directly so it works without the bundler-only `.source/server.ts`
 * MDX imports.
 */
import fs from "node:fs"
import path from "node:path"

interface MetaFile {
  pages?: string[]
}

const CONTENT_ROOT = path.posix.join("content", "docs")

interface NavCheckError {
  metaPath: string
  pagePath: string
  expectedEntry: string
}

function main() {
  const allPages = collectMdxFiles(CONTENT_ROOT).map(file =>
    path.posix.relative(CONTENT_ROOT, file),
  )

  const errors: NavCheckError[] = []
  for (const pagePath of allPages) {
    if (isExcludedFromNavigation(pagePath)) continue
    if (isInNavigation(pagePath)) continue

    const metaPath = path.posix.join(
      CONTENT_ROOT,
      path.posix.dirname(pagePath),
      "meta.json",
    )
    const entry = path.posix.basename(pagePath, ".mdx")
    errors.push({metaPath, pagePath, expectedEntry: entry})
  }

  if (errors.length === 0) {
    console.log(`navigation OK: ${allPages.length} pages all reachable`)
    return
  }

  const grouped = new Map<string, NavCheckError[]>()
  for (const err of errors) {
    if (!grouped.has(err.metaPath)) grouped.set(err.metaPath, [])
    grouped.get(err.metaPath)!.push(err)
  }
  for (const [metaPath, group] of grouped) {
    console.error(`\nMissing entries in ${metaPath}:`)
    for (const err of group) {
      console.error(
        `  - "${err.expectedEntry}" (page: content/docs/${err.pagePath})`,
      )
    }
  }
  console.error(`\nnavigation FAILED: ${errors.length} pages not listed`)
  process.exit(1)
}

function collectMdxFiles(root: string): string[] {
  const result: string[] = []
  if (!fs.existsSync(root)) return result
  for (const entry of fs.readdirSync(root, {withFileTypes: true})) {
    const full = path.posix.join(root, entry.name)
    if (entry.isDirectory()) {
      result.push(...collectMdxFiles(full))
    } else if (entry.isFile() && entry.name.endsWith(".mdx")) {
      result.push(full)
    }
  }
  return result
}

const metaCache = new Map<string, MetaFile | null>()

function readMeta(dir: string): MetaFile | null {
  const metaPath = path.posix.join(CONTENT_ROOT, dir, "meta.json")
  if (metaCache.has(metaPath)) return metaCache.get(metaPath) ?? null
  if (!fs.existsSync(metaPath)) {
    metaCache.set(metaPath, null)
    return null
  }
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as MetaFile
  metaCache.set(metaPath, meta)
  return meta
}

function isInNavigation(pagePath: string): boolean {
  // Walk up the directory tree; a page is in nav iff every ancestor `meta.json`
  // (where one exists) lists the next segment in its `pages` array, OR the
  // ancestor has no `meta.json` (Fumadocs auto-includes).
  const segments = pagePath.split("/")
  const fileSegmentBase = path.posix.basename(pagePath, ".mdx")
  // segments excluding the file
  const dirSegments = segments.slice(0, -1)

  // Each level checks its own directory's meta.json for the next segment.
  const levelSegments: string[] = []
  for (let i = 0; i < dirSegments.length; i++) {
    const meta = readMeta(levelSegments.join("/"))
    const nextSegment = dirSegments[i]
    if (meta?.pages && !pagesIncludes(meta.pages, nextSegment)) {
      return false
    }
    levelSegments.push(nextSegment)
  }

  const leafMeta = readMeta(levelSegments.join("/"))
  if (leafMeta?.pages && !pagesIncludes(leafMeta.pages, fileSegmentBase)) {
    return false
  }
  return true
}

function pagesIncludes(pages: string[], entry: string): boolean {
  return pages.some(item => {
    if (item.startsWith("!")) return false
    if (item === entry) return true
    // Separator / group syntax like "---Title---" never matches a real entry.
    if (item.startsWith("---")) return false
    // Extract prefix: `...name` inlines a folder's children into the parent's
    // list, so it still counts as listing the folder for nav-reachability.
    if (item.startsWith("...") && item.slice(3) === entry) return true
    // Link syntax `[Name](url)` (and `external:[Name](url)`) never points at a
    // real on-disk page; ignore.
    if (item.startsWith("[") || item.startsWith("external:")) return false
    return false
  })
}

function isExcludedFromNavigation(pagePath: string): boolean {
  const segments = pagePath.split("/")
  const pageWithoutExt = pagePath.replace(/\.mdx$/, "")
  const levelSegments: string[] = []
  for (let i = 0; i < segments.length; i++) {
    const meta = readMeta(levelSegments.join("/"))
    if (
      meta?.pages?.some(item => {
        if (!item.startsWith("!")) return false
        const excluded = item.slice(1)
        const relative = segments.slice(i).join("/").replace(/\.mdx$/, "")
        const first = relative.split("/", 1)[0]
        return (
          excluded === first ||
          excluded === relative ||
          path.posix.join(levelSegments.join("/"), excluded) === pageWithoutExt
        )
      })
    ) {
      return true
    }
    if (i < segments.length - 1) levelSegments.push(segments[i])
  }
  return false
}

main()

/**
 * Shared runtime for `migrate-content.mjs`, `apply-nav.mjs`, and the web nav editor.
 *
 * Encodes the navigation config schema:
 *   - tabs[]: ordered top-level entries
 *   - tab/group `slug` is the folder name on disk (empty string = root)
 *   - pages reference .mdx files by their immutable `id` (= original upstream slug)
 *   - link entries are sidebar-only outbound URLs
 *
 * The id-to-current-slug resolver is the bridge between the editor's logical tree
 * and the on-disk filesystem layout.
 *
 * @typedef {{id: string, slug?: string, title?: string, icon?: string, tag?: string, openapi?: OpenApiRef}} PageRef
 * @typedef {"flatten" | "section" | "folder"} GroupMode
 * @typedef {{group: string, slug?: string, icon?: string, tag?: string, expanded?: boolean, flatten?: boolean, mode?: GroupMode, openapi?: OpenApiRef, pages: NavEntry[]}} Group
 * @typedef {Group} GroupRef
 * @typedef {{type: "link", name: string, url: string, icon?: string, tag?: string}} LinkRef
 * @typedef {PageRef | Group | LinkRef} NavEntry
 * @typedef {{source: string, directory?: string}} OpenApiRef
 * @typedef {{id: string, slug: string, title: string, icon?: string, tag?: string, defaultOpen?: boolean, pages: NavEntry[]}} InternalTab
 * @typedef {{id: string, title: string, url: string, external: true, icon?: string, tag?: string}} ExternalTab
 * @typedef {InternalTab | ExternalTab} Tab
 * @typedef {{version: 1, tabs: Tab[], navbarLinks?: LinkRef[]}} NavConfig
 */
import { stableStringify } from "../src/lib/stable-stringify"
import {existsSync, promises as fs} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const NEXT_ROOT = path.resolve(__dirname, "..")

// Adaptive root resolution: pre-cutover, the upstream Mintlify tree lives in
// `<NEXT_ROOT>/..` and exposes `docs.json` + sibling `.mdx` files. Post-cutover
// the entire `next/` folder is promoted to repo root and upstream is gone — in
// that layout REPO_ROOT collapses onto NEXT_ROOT and the legacy inputs are
// absent. Every reader downstream branches on HAS_LEGACY_DOCS instead of
// re-deriving the layout.
const NEXT_ROOT_PARENT = path.resolve(NEXT_ROOT, "..")
const LEGACY_DOCS_JSON_PATH = path.join(NEXT_ROOT_PARENT, "docs.json")
export const HAS_LEGACY_DOCS = existsSync(LEGACY_DOCS_JSON_PATH)
export const REPO_ROOT = HAS_LEGACY_DOCS ? NEXT_ROOT_PARENT : NEXT_ROOT
export const CONTENT_ROOT = path.join(NEXT_ROOT, "content", "docs")
export const NAV_CONFIG_PATH = path.join(NEXT_ROOT, "navigation.config.json")
export const DOCS_JSON_PATH = LEGACY_DOCS_JSON_PATH
export const REDIRECTS_PATH = path.join(NEXT_ROOT, "redirects.mjs")
export const NAV_BACKUP_DIR = path.join(NEXT_ROOT, ".nav-editor-backups")
// Sidecar that ships tags fumadocs' meta.json can't represent. Lives outside
// content/docs/ on purpose — fumadocs-mdx auto-discovers every `**/*.{json,
// yaml}` under the docs root, so dropping a stray .json there would feed it
// to the meta loader.
export const NAV_OVERLAYS_PATH = path.join(NEXT_ROOT, "nav-overlays.json")

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/** @param {unknown} entry @returns {entry is LinkRef} */
export function isLink(entry) {
  return (
    typeof entry === "object" &&
    entry !== null &&
    /** @type {{type?: unknown}} */ (entry).type === "link"
  )
}

/** @param {unknown} entry @returns {entry is Group} */
export function isGroup(entry) {
  return (
    typeof entry === "object" &&
    entry !== null &&
    "group" in /** @type {object} */ (entry) &&
    !isLink(entry)
  )
}

/** @param {unknown} entry @returns {entry is PageRef} */
export function isPage(entry) {
  return (
    typeof entry === "object" &&
    entry !== null &&
    "id" in /** @type {object} */ (entry) &&
    !isLink(entry) &&
    !isGroup(entry)
  )
}

/** @param {Tab} tab @returns {tab is ExternalTab} */
export function isExternalTab(tab) {
  return /** @type {ExternalTab} */ (tab).external === true
}

/** @param {Tab} tab @returns {tab is InternalTab} */
export function isInternalTab(tab) {
  return !isExternalTab(tab)
}

// ---------------------------------------------------------------------------
// Config IO
// ---------------------------------------------------------------------------

/**
 * Read the navigation config from disk; returns null if it doesn't exist.
 * @returns {Promise<NavConfig | null>}
 */
export async function readConfig() {
  try {
    const raw = await fs.readFile(NAV_CONFIG_PATH, "utf8")
    return /** @type {NavConfig} */ (JSON.parse(raw))
  } catch (err) {
    const code = /** @type {NodeJS.ErrnoException} */ (err).code
    if (code === "ENOENT") return null
    throw err
  }
}

/**
 * Write the navigation config with stable formatting.
 * @param {NavConfig} config
 */
export async function writeConfig(config) {
  await fs.mkdir(path.dirname(NAV_CONFIG_PATH), {recursive: true})
  await fs.writeFile(NAV_CONFIG_PATH, stableStringify(config), "utf8")
}

// ---------------------------------------------------------------------------
// Frontmatter helpers
// ---------------------------------------------------------------------------

/**
 * @param {string} source
 * @returns {{id: string | undefined, frontmatter: string, body: string, hasFrontmatter: boolean}}
 */
export function parseFrontmatter(source) {
  const fmMatch = source.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!fmMatch) {
    return {id: undefined, frontmatter: "", body: source, hasFrontmatter: false}
  }
  const fm = fmMatch[1]
  const idMatch = fm.match(/^id:\s*(?:"([^"]+)"|'([^']+)'|(\S+))\s*$/m)
  const id = idMatch?.[1] ?? idMatch?.[2] ?? idMatch?.[3]
  return {
    id,
    frontmatter: fm,
    body: source.slice(fmMatch[0].length),
    hasFrontmatter: true,
  }
}

/**
 * Insert or preserve an `id` field at the top of the frontmatter. Existing
 * `id` values are never overwritten — this is the immutability guarantee.
 * @param {string} source
 * @param {string} id
 * @returns {string}
 */
export function stampId(source, id) {
  const parsed = parseFrontmatter(source)
  if (parsed.id) return source
  const idLine = `id: ${encodeYaml(id)}`
  if (!parsed.hasFrontmatter) {
    return `---\n${idLine}\n---\n\n${source}`
  }
  return source.replace(/^---\n/, `---\n${idLine}\n`)
}

function encodeYaml(value) {
  if (/^[A-Za-z0-9_\-/.]+$/.test(value)) return value
  return JSON.stringify(value)
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Read a top-level scalar field from frontmatter. Values may be unquoted,
 * single-quoted, or double-quoted. Returns undefined when the field is
 * missing or the frontmatter block is absent.
 * @param {string} source
 * @param {string} key
 * @returns {string | undefined}
 */
export function getFrontmatterField(source, key) {
  const parsed = parseFrontmatter(source)
  if (!parsed.hasFrontmatter) return undefined
  const re = new RegExp(
    `^${escapeRegex(key)}:\\s*(?:"((?:\\\\.|[^"\\\\])*)"|'((?:\\\\.|[^'\\\\])*)'|(.*))\\s*$`,
    "m",
  )
  const m = parsed.frontmatter.match(re)
  if (!m) return undefined
  if (m[1] !== undefined) {
    try {
      return JSON.parse(`"${m[1]}"`)
    } catch {
      return m[1]
    }
  }
  if (m[2] !== undefined) return m[2]
  return (m[3] ?? "").trim()
}

/**
 * Insert, update, or remove a single top-level scalar field in the frontmatter.
 * - `value === undefined` removes the line.
 * - Setting to the same value returns `source` unchanged (idempotent).
 * - Creates a frontmatter block when none exists (only if value is provided).
 * Preserves the rest of the frontmatter and body verbatim.
 * @param {string} source
 * @param {string} key
 * @param {string | undefined} value
 * @returns {string}
 */
export function setFrontmatterField(source, key, value) {
  const parsed = parseFrontmatter(source)
  const lineRe = new RegExp(`^${escapeRegex(key)}:.*$`, "m")

  if (!parsed.hasFrontmatter) {
    if (value === undefined) return source
    return `---\n${key}: ${encodeYaml(value)}\n---\n\n${source}`
  }

  const fm = parsed.frontmatter
  const has = lineRe.test(fm)

  if (value === undefined) {
    if (!has) return source
    const stripped = fm.replace(new RegExp(`^${escapeRegex(key)}:.*\\n?`, "m"), "")
    const trimmed = stripped.replace(/\n+$/, "")
    if (trimmed === "") {
      // Removed the only frontmatter field — drop the block entirely.
      return parsed.body.replace(/^\n+/, "")
    }
    return `---\n${trimmed}\n---\n${parsed.body}`
  }

  const newLine = `${key}: ${encodeYaml(value)}`
  const nextFm = has ? fm.replace(lineRe, newLine) : `${fm}\n${newLine}`
  if (nextFm === fm) return source
  return `---\n${nextFm}\n---\n${parsed.body}`
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/**
 * Resolve the current canonical URL slug for a given page id, given the config.
 * Returns undefined if the id isn't referenced anywhere.
 * @param {string} targetId
 * @param {NavConfig} config
 * @returns {string | undefined}
 */
export function resolveCurrentSlug(targetId, config) {
  for (const tab of config.tabs ?? []) {
    if (!isInternalTab(tab)) continue
    const prefix = tab.slug ? [tab.slug] : []
    const found = walkAndFind(tab.pages ?? [], targetId, prefix)
    if (found !== undefined) return found
  }
  return undefined
}

/**
 * @param {NavEntry[]} pages
 * @param {string} targetId
 * @param {string[]} prefix
 * @returns {string | undefined}
 */
function walkAndFind(pages, targetId, prefix) {
  for (const entry of pages) {
    if (isLink(entry)) continue
    if (isGroup(entry)) {
      const next = entry.slug ? [...prefix, entry.slug] : prefix
      const found = walkAndFind(entry.pages ?? [], targetId, next)
      if (found !== undefined) return found
    } else if (isPage(entry)) {
      if (entry.id === targetId) {
        // slug: "" marks the page as the index of its enclosing folder.
        if (entry.slug === "") return prefix.join("/")
        const leaf = entry.slug ?? entry.id.split("/").pop() ?? entry.id
        return [...prefix, leaf].join("/")
      }
    }
  }
  return undefined
}

/**
 * Walk every page in the config, calling visitor for each leaf.
 * @param {NavConfig} config
 * @param {(page: PageRef, slug: string, parent: Group | Tab, slugParts: string[]) => void} visitor
 */
export function walkPages(config, visitor) {
  for (const tab of config.tabs ?? []) {
    if (!isInternalTab(tab)) continue
    const prefix = tab.slug ? [tab.slug] : []
    walkInner(tab.pages ?? [], prefix, tab, visitor)
  }
}

/**
 * @param {NavEntry[]} pages
 * @param {string[]} prefix
 * @param {Group | Tab} parent
 * @param {(page: PageRef, slug: string, parent: Group | Tab, slugParts: string[]) => void} visitor
 */
function walkInner(pages, prefix, parent, visitor) {
  for (const entry of pages) {
    if (isLink(entry)) continue
    if (isGroup(entry)) {
      const next = entry.slug ? [...prefix, entry.slug] : prefix
      walkInner(entry.pages ?? [], next, entry, visitor)
    } else if (isPage(entry)) {
      if (entry.slug === "") {
        visitor(entry, prefix.join("/"), parent, prefix)
        continue
      }
      const leaf = entry.slug ?? entry.id.split("/").pop() ?? entry.id
      const parts = [...prefix, leaf]
      visitor(entry, parts.join("/"), parent, parts)
    }
  }
}

/**
 * Collect every page id referenced anywhere in the config (no duplicates).
 * @param {NavConfig} config
 * @returns {Set<string>}
 */
export function collectReferencedIds(config) {
  const ids = new Set()
  walkPages(config, page => ids.add(page.id))
  return ids
}

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

/**
 * Recursively list every .mdx file under content/docs/ as a slug (POSIX path,
 * relative to content/docs/, sans .mdx).
 * @returns {Promise<string[]>}
 */
export async function listMdxSlugs() {
  /** @type {string[]} */
  const out = []
  await walkContent(CONTENT_ROOT, "", out)
  return out.sort()
}

async function walkContent(root, rel, out) {
  let entries
  try {
    entries = await fs.readdir(path.join(root, rel), {withFileTypes: true})
  } catch {
    return
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue
    const childRel = rel ? path.posix.join(rel, entry.name) : entry.name
    if (entry.isDirectory()) {
      await walkContent(root, childRel, out)
    } else if (entry.isFile() && entry.name.endsWith(".mdx")) {
      out.push(childRel.replace(/\.mdx$/, ""))
    }
  }
}

/**
 * Build a map of `id` -> current disk slug by scanning every .mdx under
 * content/docs/ and reading its frontmatter `id`. Pages without an `id`
 * are recorded with their current slug as the id (caller can decide whether
 * to stamp them).
 * @returns {Promise<{idToSlug: Map<string, string>, unstamped: string[], duplicates: Array<{id: string, slugs: string[]}>}>}
 */
export async function buildIdIndex() {
  /** @type {Map<string, string>} */
  const idToSlug = new Map()
  /** @type {Map<string, string[]>} */
  const dupes = new Map()
  /** @type {string[]} */
  const unstamped = []

  const slugs = await listMdxSlugs()
  for (const slug of slugs) {
    const file = path.join(CONTENT_ROOT, `${slug}.mdx`)
    const raw = await fs.readFile(file, "utf8")
    const {id} = parseFrontmatter(raw)
    const effectiveId = id ?? slug
    if (!id) unstamped.push(slug)

    if (idToSlug.has(effectiveId)) {
      const prev = idToSlug.get(effectiveId)
      if (!dupes.has(effectiveId)) dupes.set(effectiveId, [/** @type {string} */ (prev)])
      dupes.get(effectiveId).push(slug)
    } else {
      idToSlug.set(effectiveId, slug)
    }
  }
  return {
    idToSlug,
    unstamped: unstamped.sort(),
    duplicates: [...dupes.entries()]
      .map(([id, slugs]) => ({id, slugs: slugs.sort()}))
      .sort((a, b) => a.id.localeCompare(b.id)),
  }
}

// ---------------------------------------------------------------------------
// Seeding (first-run conversion from docs.json + filesystem)
// ---------------------------------------------------------------------------

/**
 * Attach every .mdx id that the converted docs.json structure doesn't already
 * reference, by appending it to the deepest folder-backed group whose URL
 * prefix matches the id's path. Used during first-run seed to absorb
 * OpenAPI-generated pages and any new .mdx files added post-Mintlify.
 *
 * @param {NavConfig} config
 * @param {Iterable<string>} allIds
 */
export function attachOrphansToConfig(config, allIds) {
  const referenced = collectReferencedIds(config)
  /** @type {string[]} */
  const orphans = []
  for (const id of allIds) {
    if (!referenced.has(id)) orphans.push(id)
  }
  orphans.sort()

  const firstInternal = (config.tabs ?? []).find(isInternalTab)
  for (const id of orphans) {
    const target = findBestParent(config, id)
    if (!target) {
      firstInternal?.pages.push(makePageEntry(id, firstInternal.slug ?? ""))
      continue
    }
    target.parent.pages.push(makePageEntry(id, target.slugPath))
  }
}

/**
 * Find the deepest folder-backed tab/group whose URL prefix is a prefix of `id`.
 * @param {NavConfig} config
 * @param {string} id
 * @returns {{parent: Tab | Group, slugPath: string} | null}
 */
function findBestParent(config, id) {
  /** @type {{parent: InternalTab | Group, slugPath: string} | null} */
  let best = null

  for (const tab of config.tabs) {
    if (!isInternalTab(tab)) continue
    const tabPath = tab.slug
    if (matches(id, tabPath)) {
      if (!best || tabPath.length > best.slugPath.length) {
        best = {parent: tab, slugPath: tabPath}
      }
    }
    search(tab.pages, tabPath)
  }

  /**
   * @param {NavEntry[]} entries
   * @param {string} currentPath
   */
  function search(entries, currentPath) {
    for (const entry of entries) {
      if (isGroup(entry)) {
        const next = entry.slug ? joinPath(currentPath, entry.slug) : currentPath
        if (entry.slug && matches(id, next)) {
          if (!best || next.length > best.slugPath.length) {
            best = {parent: entry, slugPath: next}
          }
        }
        search(entry.pages ?? [], next)
      }
    }
  }

  return best
}

function joinPath(parent, child) {
  if (!parent) return child
  if (!child) return parent
  return `${parent}/${child}`
}

function matches(id, slugPath) {
  if (slugPath === "") return true
  return id === slugPath || id.startsWith(slugPath + "/")
}

/**
 * Build a navigation config from the legacy `docs.json` tabs verbatim. The
 * conversion preserves today's canonical URLs exactly (== each page's id).
 *
 * Rules:
 *   - Each docs.json tab becomes a `Tab` with the longest common prefix of
 *     its pages as its slug.
 *   - Each `{group, pages}` becomes a folder-backed `Group` iff every nested
 *     page shares the same first-segment beyond the parent slug. Otherwise it
 *     stays as a sidebar-only group, and pages inside it carry explicit slug
 *     overrides for any path beyond the parent slug.
 *   - Each leaf becomes a `{id}` entry (no slug override) when its natural
 *     leaf segment matches the relative path inside the parent slug, or
 *     `{id, slug: <relative>}` otherwise.
 *
 * The seed never produces duplicate canonical URLs.
 *
 * @param {{navigation?: {tabs?: any[]}}} docsJson
 * @returns {NavConfig}
 */
export function seedConfigFromDocsJson(docsJson) {
  const navTabs = Array.isArray(docsJson?.navigation?.tabs) ? docsJson.navigation.tabs : []
  /** @type {Tab[]} */
  const tabs = []
  for (const tab of navTabs) {
    const pages = Array.isArray(tab.pages) ? tab.pages : []
    const tabSlug = computeCommonPrefix(collectAllSlugs(pages)) ?? ""
    /** @type {Tab} */
    const out = {
      id: makeTabId(tab.tab ?? tab.group ?? "documentation"),
      slug: tabSlug,
      title: tab.tab ?? tab.group ?? "Documentation",
      pages: convertPages(pages, tabSlug),
    }
    if (tab.icon) out.icon = tab.icon
    tabs.push(out)
  }
  return {version: 1, tabs}
}

function makeTabId(name) {
  return (
    String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "tab"
  )
}

/**
 * @param {any[]} pages
 * @param {string} parentSlug  URL prefix of the deepest folder-backed ancestor
 * @returns {NavEntry[]}
 */
function convertPages(pages, parentSlug) {
  /** @type {NavEntry[]} */
  const out = []
  for (const entry of pages) {
    if (typeof entry === "string") {
      out.push(makePageEntry(entry, parentSlug))
      continue
    }
    if (entry && typeof entry === "object" && "group" in entry) {
      const childPages = Array.isArray(entry.pages) ? entry.pages : []
      const folderSlug = computeFolderBackedSlug(childPages, entry.openapi?.directory, parentSlug)

      /** @type {Group} */
      const grp = {group: entry.group, pages: []}
      if (entry.icon) grp.icon = entry.icon
      if (entry.tag) grp.tag = entry.tag
      if (entry.expanded) grp.expanded = entry.expanded
      if (entry.openapi) {
        const oa = /** @type {OpenApiRef} */ ({source: entry.openapi.source})
        if (entry.openapi.directory) oa.directory = entry.openapi.directory
        grp.openapi = oa
      }

      if (folderSlug) {
        grp.slug = folderSlug
        const nextSlug = parentSlug ? `${parentSlug}/${folderSlug}` : folderSlug
        grp.pages = convertPages(childPages, nextSlug)
      } else {
        // Sidebar-only group: child pages keep the same parent slug, but get
        // explicit slug overrides if they live in deeper folders.
        grp.pages = convertPages(childPages, parentSlug)
      }
      out.push(grp)
      continue
    }
  }
  return out
}

/**
 * Produce a `PageRef` entry for a docs.json string slug. Sets `slug` when:
 *   - the page IS the folder index (`id === parentSlug`) → `slug: ""`
 *   - the page lives in a deeper subfolder than its parent (multi-segment) →
 *     `slug: <relative path>`
 * @param {string} id
 * @param {string} parentSlug
 * @returns {PageRef}
 */
function makePageEntry(id, parentSlug) {
  /** @type {PageRef} */
  const out = {id}
  if (id === parentSlug) {
    out.slug = ""
    return out
  }
  const naturalLeaf = id.split("/").pop() ?? id
  let relative
  if (parentSlug === "") {
    relative = id
  } else if (id.startsWith(parentSlug + "/")) {
    relative = id.slice(parentSlug.length + 1)
  } else {
    relative = id
  }
  if (relative && relative !== naturalLeaf) {
    out.slug = relative
  }
  return out
}

/**
 * If every child page lives under `<parentSlug>/<segment>/...` for the same
 * single `<segment>`, return that segment. Otherwise return undefined (group
 * becomes sidebar-only).
 *
 * @param {any[]} childEntries
 * @param {string | undefined} openapiDirectory
 * @param {string} parentSlug
 */
function computeFolderBackedSlug(childEntries, openapiDirectory, parentSlug) {
  /** @type {string[]} */
  const leaves = collectAllSlugs(childEntries)
  if (openapiDirectory) leaves.push(`${openapiDirectory}/_placeholder`)
  if (leaves.length === 0) return undefined

  /** @type {string[]} */
  const insideSegments = []
  for (const leaf of leaves) {
    if (parentSlug === "") {
      insideSegments.push(leaf.split("/")[0])
      continue
    }
    if (leaf === parentSlug) return undefined
    if (!leaf.startsWith(parentSlug + "/")) return undefined
    const inside = leaf.slice(parentSlug.length + 1)
    const firstSeg = inside.split("/")[0]
    if (!firstSeg) return undefined
    insideSegments.push(firstSeg)
  }
  const uniq = new Set(insideSegments)
  if (uniq.size !== 1) return undefined
  return insideSegments[0]
}

/**
 * Collect every string-slug nested under `entries`.
 * @param {any[]} entries
 * @returns {string[]}
 */
function collectAllSlugs(entries) {
  /** @type {string[]} */
  const out = []
  function recurse(node) {
    if (typeof node === "string") {
      out.push(node)
      return
    }
    if (node && typeof node === "object" && Array.isArray(node.pages)) {
      for (const child of node.pages) recurse(child)
    }
  }
  for (const entry of entries) recurse(entry)
  return out
}

/**
 * Longest common path prefix shared by every slug in `slugs`. Returns "" when
 * there's no shared prefix (e.g. mixed top-level paths).
 * @param {string[]} slugs
 */
function computeCommonPrefix(slugs) {
  if (slugs.length === 0) return undefined
  if (slugs.length === 1) {
    const parts = slugs[0].split("/")
    return parts.slice(0, -1).join("/")
  }
  const parts = slugs.map(s => s.split("/"))
  const minLen = Math.min(...parts.map(p => p.length - 1))
  /** @type {string[]} */
  const prefix = []
  for (let i = 0; i < minLen; i++) {
    const segment = parts[0][i]
    if (parts.every(p => p[i] === segment)) prefix.push(segment)
    else break
  }
  return prefix.join("/")
}

// ---------------------------------------------------------------------------
// Redirects helpers
// ---------------------------------------------------------------------------

/**
 * @typedef {{source: string, destination: string, permanent?: boolean}} Redirect
 */

/**
 * Load the current redirects.mjs file as a plain array. Returns [] if missing.
 * @returns {Promise<Redirect[]>}
 */
export async function readRedirects() {
  try {
    const mod = await import(`${REDIRECTS_PATH}?t=${Date.now()}`)
    return Array.isArray(mod.redirects) ? mod.redirects : []
  } catch (err) {
    const code = /** @type {NodeJS.ErrnoException} */ (err).code
    if (code === "ERR_MODULE_NOT_FOUND" || code === "ENOENT") return []
    throw err
  }
}

/**
 * Normalise a redirect path. Relative paths (e.g. `foo/bar`) get a leading `/`
 * so Next.js accepts them; absolute URLs (`https://…`, `mailto:…`, `tel:…`)
 * and protocol-relative paths (`//host/path`) pass through untouched.
 * @param {string} value
 * @returns {string}
 */
function normalizeRedirectPath(value) {
  if (typeof value !== "string" || !value) return value
  if (/^(?:https?:|mailto:|tel:|\/\/)/i.test(value)) return value
  return value.startsWith("/") ? value : `/${value}`
}

/**
 * Write redirects.mjs with stable formatting. Source / destination paths are
 * normalised (leading `/` on relative entries), entries are deduped by source,
 * and self-redirects (source === destination after normalisation) are dropped.
 * @param {Redirect[]} entries
 * @param {{header?: string}} [opts]
 */
export async function writeRedirects(entries, opts = {}) {
  const map = new Map()
  for (const r of entries) {
    if (!r?.source || !r?.destination) continue
    const source = normalizeRedirectPath(r.source)
    const destination = normalizeRedirectPath(r.destination)
    if (!source || !destination) continue
    if (source === destination) continue
    map.set(source, {
      source,
      destination,
      permanent: r.permanent ?? true,
    })
  }
  const sorted = [...map.values()].sort((a, b) => a.source.localeCompare(b.source))
  const header =
    opts.header ??
    "/**\n * Auto-generated redirects. Sourced from `docs.json` (initial migration)\n * and editor-driven file moves (`scripts/apply-nav.mjs`).\n *\n * @type {Array<{source: string, destination: string, permanent?: boolean}>}\n */\n"
  const body = `${header}export const redirects = ${stableStringify(sorted).trimEnd()}\n`
  await fs.writeFile(REDIRECTS_PATH, body, "utf8")
}

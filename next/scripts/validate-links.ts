/**
 * SEO-continuity auditor for the migrated docs site. Replaces the old
 * `validate-links-internal.ts` and folds in redirect coverage, chain/loop
 * detection, frontmatter parity, and sitemap/canonical wiring checks. Every
 * mutation is gated behind a dedicated `--*` flag; the default run is
 * read-only and exits non-zero on any regression.
 *
 * Layout-aware: pre-cutover (this file lives at `next/scripts/`, upstream
 * `docs.json` + `.mdx` exist at the repo root) and post-cutover (the `next/`
 * folder has been promoted to the repo root, upstream is gone) both work via
 * `HAS_LEGACY_DOCS` in `nav-config.mjs`. No imports from `migrate-content.mjs`
 * — that file disappears on cutover and must not be a hard dependency.
 *
 * See `audit_legacy_redirects_and_links_*.plan.md` for the full pass design.
 */
import fs from "node:fs"
import {existsSync, promises as fsp} from "node:fs"
import path from "node:path"
import {pathToFileURL} from "node:url"

import {
  CONTENT_ROOT,
  DOCS_JSON_PATH,
  HAS_LEGACY_DOCS,
  NEXT_ROOT,
  REPO_ROOT,
  parseFrontmatter,
  readConfig,
  readRedirects,
  resolveCurrentSlug,
  writeRedirects,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore — JSDoc module, allowJs covers it.
} from "./nav-config.mjs"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Redirect {
  source: string
  destination: string
  permanent?: boolean
}

interface LinkErr {
  file: string
  line: number
  link: string
  reason: string
}

interface RedirectIssue {
  legacyUrl: string
  reason: string
  proposedDestination?: string
}

interface ChainReport {
  source: string
  path: string[]
  finalDestination: string
}

interface LoopReport {
  source: string
  cycle: string[]
}

interface PermissivenessReport {
  source: string
  destination: string
}

interface StaleLinkReport {
  file: string
  line: number
  href: string
  finalHref: string
  /**
   * Why we believe `finalHref` is the right replacement:
   *   - `chain`: redirect chain terminated cleanly at a real page.
   *   - `fuzzy`: chain ended at a non-page (or looped); we found the page by
   *     basename + path-suffix matching (unambiguous).
   *   - `broken`: link had no redirect entry at all, but a single page with
   *     the same basename + best path-suffix exists.
   */
  origin: "chain" | "fuzzy" | "broken"
}

interface FrontmatterDiff {
  id: string
  field: "title" | "description"
  upstream: string | undefined
  current: string | undefined
}

interface SitemapIssue {
  kind: "missing-page" | "extra-url" | "canonical-broken" | "robots-blocks"
  detail: string
}

interface OrphanAssetReport {
  /** The `/...` URL the asset would be served at. */
  url: string
  /** Where on disk the asset lives, for grepping convenience. */
  rel: string
}

interface PageRecord {
  /** Absolute path on disk. */
  abs: string
  /** Path relative to NEXT_ROOT (for stable error messages). */
  rel: string
  /** Canonical URL slug (leading `/`, no trailing `/`). */
  slug: string
  /** Lowercase heading IDs derived from `# Heading` lines. */
  headings: Set<string>
  /** Raw file contents (we re-use the read between passes). */
  source: string
  /** Parsed `id` field from frontmatter, or undefined. */
  id: string | undefined
}

interface RunFlags {
  // Audit scopes (all default on)
  checkLinks: boolean
  checkRedirects: boolean
  checkChains: boolean
  checkInternalStale: boolean
  checkFrontmatter: boolean
  checkSitemap: boolean
  checkAssets: boolean
  checkAnchors: boolean
  // Mutators
  fix: boolean
  flattenChains: boolean
  fixInternal: boolean
  enforcePermanent: boolean
  fixFrontmatter: boolean
  repairRedirects: boolean
  // Misc
  baseline: number
  verbose: boolean
}

interface Indices {
  flags: RunFlags
  pages: PageRecord[]
  pageBySlug: Map<string, PageRecord>
  /** Every URL the new site serves (page slugs union redirect sources). */
  knownUrls: Set<string>
  /** Just the page slugs (no redirect sources). */
  pageSlugs: Set<string>
  /** All assets under `<NEXT_ROOT>/public/...` mapped to `/...` URLs. */
  assetUrls: Set<string>
  /** Map of redirect source → entry, normalized. */
  redirectMap: Map<string, Redirect>
  /** Legacy URLs we expect to keep resolving (upstream + docs.json + redirects). */
  legacyUrls: Set<string>
  /** id → current slug (with leading `/`). */
  idToCurrentSlug: Map<string, string>
  /** Upstream .mdx ids (pre-cutover only) mapped to {title, description}. */
  upstreamFrontmatter: Map<string, FrontmatterFields>
  /** New-side .mdx mapping (same id space). */
  newFrontmatter: Map<string, FrontmatterFields>
  /** docs.json redirects (pre-cutover; empty post-cutover). */
  docsJsonRedirects: Redirect[]
}

interface FrontmatterFields {
  title?: string
  description?: string
}

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseFlags(argv: string[]): RunFlags {
  const has = (flag: string) => argv.includes(flag)
  const intArg = (flag: string, fallback: number): number => {
    const idx = argv.indexOf(flag)
    if (idx < 0 || idx === argv.length - 1) return fallback
    const v = Number.parseInt(argv[idx + 1], 10)
    return Number.isFinite(v) ? v : fallback
  }

  // If the user passes any --check-* flag, only those run; otherwise all on.
  const anyCheckFlag =
    has("--check-links") ||
    has("--check-redirects") ||
    has("--check-chains") ||
    has("--check-internal-stale") ||
    has("--check-frontmatter") ||
    has("--check-sitemap") ||
    has("--check-assets")

  const all = !anyCheckFlag
  return {
    checkLinks: all || has("--check-links"),
    checkRedirects: all || has("--check-redirects"),
    checkChains: all || has("--check-chains"),
    checkInternalStale: all || has("--check-internal-stale"),
    checkFrontmatter: all || has("--check-frontmatter"),
    checkSitemap: all || has("--check-sitemap"),
    checkAssets: all || has("--check-assets"),
    checkAnchors: has("--check-anchors"),
    fix: has("--fix"),
    flattenChains: has("--flatten-chains"),
    fixInternal: has("--fix-internal"),
    enforcePermanent: has("--enforce-permanent"),
    fixFrontmatter: has("--fix-frontmatter"),
    repairRedirects: has("--repair-redirects"),
    baseline: intArg("--baseline", Number.parseInt(process.env.LINKS_BASELINE ?? "345", 10)),
    verbose: has("--verbose"),
  }
}

function printHelp(): void {
  console.log(`validate-links — SEO-continuity auditor for the docs site.

Usage:
  tsx ./scripts/validate-links.ts [options]

Audit scopes (narrow the run; default is all):
  --check-links            MDX links + assets inside content/docs/
  --check-redirects        Legacy URL coverage via redirects.mjs
  --check-chains           Chain detection + permanent:true (loops always hard-error)
  --check-internal-stale   MDX internal links that target a redirect source
  --check-frontmatter      title + description parity vs upstream .mdx
  --check-sitemap          sitemap.ts / canonical / robots wiring
  --check-assets           Flag files in public/ that nothing references
  --check-anchors          opt-in #fragment verification (false-positive prone)

Mutations (each touches one surface; default is none):
  --fix                    Additively append missing redirects
  --flatten-chains         Rewrite A->B->C in redirects.mjs as A->C
  --fix-internal           Rewrite MDX links that go through a redirect or
                           point at a non-existent page. Uses basename +
                           longest-common-suffix matching to find the right
                           page when the redirect's destination is broken.
  --enforce-permanent      Upgrade any permanent:false entries to true
  --fix-frontmatter        Strip auto-injected title/description fields when
                           upstream had them absent or empty (restores Pass E
                           parity without touching human edits)
  --repair-redirects       Rewrite the destination of redirects whose chain
                           lands on a non-page or loops. Picks the real page
                           by matching the source's basename + path suffix
                           against pages on disk. Skips ambiguous matches.

Other:
  --baseline N             Allow N broken internal links (LINKS_BASELINE compat, default 313)
  --verbose
  --help                   Show this message`)
}

// ---------------------------------------------------------------------------
// Filesystem walkers
// ---------------------------------------------------------------------------

function walkFiles(root: string, predicate: (rel: string) => boolean): string[] {
  const result: string[] = []
  if (!existsSync(root)) return result
  const stack: string[] = [""]
  while (stack.length > 0) {
    const rel = stack.pop()!
    const abs = path.join(root, rel)
    let entries
    try {
      entries = fs.readdirSync(abs, {withFileTypes: true})
    } catch {
      continue
    }
    for (const ent of entries) {
      if (ent.name.startsWith(".")) continue
      if (ent.name === "node_modules") continue
      const childRel = rel ? path.posix.join(rel, ent.name) : ent.name
      if (ent.isDirectory()) {
        stack.push(childRel)
      } else if (ent.isFile()) {
        if (predicate(childRel)) result.push(childRel)
      }
    }
  }
  return result.sort()
}

/**
 * Discover every upstream `.mdx` at the repo root (pre-cutover only). Inlined
 * here to avoid coupling to `migrate-content.mjs`, which disappears on
 * cutover. Mirrors the same exclusion rules.
 */
function discoverUpstreamMdx(): string[] {
  if (!HAS_LEGACY_DOCS) return []
  return walkFiles(REPO_ROOT, rel => {
    if (!rel.endsWith(".mdx")) return false
    if (rel.startsWith("next/")) return false
    if (rel.startsWith(".vale/")) return false
    if (rel.startsWith("node_modules/")) return false
    return true
  })
}

// ---------------------------------------------------------------------------
// Slug / URL helpers
// ---------------------------------------------------------------------------

function filePathToSlug(filePathAbsOrRel: string, contentRoot: string): string {
  const rel = path.posix.relative(
    contentRoot.replace(/\\/g, "/"),
    filePathAbsOrRel.replace(/\\/g, "/"),
  )
  const noExt = rel.replace(/\.mdx$/, "").replace(/\.md$/, "")
  const parts = noExt.split("/")
  const last = parts[parts.length - 1]
  if (last === "index") {
    const prefix = parts.slice(0, -1).join("/")
    return prefix === "" ? "/" : `/${prefix}`
  }
  return `/${parts.join("/")}`
}

function normalizeSlug(href: string): string {
  if (!href.startsWith("/")) return href
  const stripped = href.replace(/\/$/, "")
  return stripped === "" ? "/" : stripped
}

function splitHrefAnchor(href: string): {path: string; anchor: string | null} {
  // Strip the query string before splitting — query params never resolve to
  // a different page on disk (e.g. `?playground=open`).
  const qIdx = href.indexOf("?")
  const stripped = qIdx >= 0 ? href.slice(0, qIdx) : href
  const idx = stripped.indexOf("#")
  if (idx < 0) return {path: stripped, anchor: null}
  return {path: stripped.slice(0, idx), anchor: stripped.slice(idx + 1)}
}

// ---------------------------------------------------------------------------
// Frontmatter helpers
// ---------------------------------------------------------------------------

interface ParsedFm {
  id: string | undefined
  frontmatter: string
  body: string
  hasFrontmatter: boolean
}

function parseFm(source: string): ParsedFm {
  return parseFrontmatter(source) as ParsedFm
}

function parseScalarField(fm: string, key: string): string | undefined {
  // Mirrors `getFrontmatterField` from nav-config.mjs but works on the raw fm
  // string we already have in hand, so we don't re-read the file.
  const lineRe = new RegExp(`^${escapeRegex(key)}\\s*:\\s*(.*)$`, "m")
  const match = lineRe.exec(fm)
  if (!match) return undefined
  let raw = match[1].trim()
  if (raw === "" || raw === "~" || raw === "null") return undefined
  if (raw.startsWith('"') && raw.endsWith('"')) {
    return JSON.parse(raw)
  }
  if (raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1).replace(/''/g, "'")
  }
  // Strip trailing inline comments.
  const hashIdx = raw.indexOf(" #")
  if (hashIdx >= 0) raw = raw.slice(0, hashIdx).trim()
  return raw
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function extractFrontmatterFields(source: string): FrontmatterFields {
  const parsed = parseFm(source)
  if (!parsed.hasFrontmatter) return {}
  return {
    title: parseScalarField(parsed.frontmatter, "title"),
    description: parseScalarField(parsed.frontmatter, "description"),
  }
}

// ---------------------------------------------------------------------------
// Link extraction (shared by Pass A + D)
// ---------------------------------------------------------------------------

interface ExtractedLink {
  href: string
  line: number
  kind: "markdown" | "href" | "src"
  /** Raw matched substring (for `--fix-internal` byte-perfect replacement). */
  rawMatch: string
}

const MD_LINK_RE = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
const HREF_RE = /\bhref\s*=\s*["']([^"']+)["']/g
const SRC_RE = /\bsrc\s*=\s*["']([^"']+)["']/g

function extractLinks(content: string): ExtractedLink[] {
  const out: ExtractedLink[] = []
  const lines = content.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const [re, kind] of [
      [MD_LINK_RE, "markdown" as const],
      [HREF_RE, "href" as const],
      [SRC_RE, "src" as const],
    ] as const) {
      re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(line)) !== null) {
        if (looksLikePlaceholder(m[1])) continue
        out.push({href: m[1], line: i + 1, kind, rawMatch: m[0]})
      }
    }
  }
  return out
}

/**
 * Skip "links" that are clearly placeholders or non-URL syntax that the
 * extractors falsely matched:
 *
 *  - `<TOKEN>` / `<CAMEL_CASE>` style placeholders used in style guides.
 *  - TeX math: backslash commands like `\texttt{…}` or `\frac`.
 *  - Embedded LaTeX with `$`, `_`, `^`, or `{}` outside an anchor (rare in
 *    real URLs and a strong signal of a math expression).
 *  - Punctuation-only tokens like `(?` produced by markdown stripped of
 *    surrounding context.
 */
function looksLikePlaceholder(href: string): boolean {
  if (!href) return true
  if (/^[\s.,;:]+$/.test(href)) return true
  if (/<[A-Z][A-Z0-9_]*>/.test(href)) return true
  if (/\\[a-zA-Z]+\{/.test(href)) return true
  if (/[\\${}^]/.test(href)) return true
  return false
}

function extractHeadings(content: string): Set<string> {
  const out = new Set<string>()
  for (const line of content.split("\n")) {
    const m = /^#{1,6}\s+(.+?)\s*$/.exec(line)
    if (m) out.add(slugify(m[1]))
  }
  return out
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
}

// ---------------------------------------------------------------------------
// Redirect chain helpers
// ---------------------------------------------------------------------------

const CHAIN_HOP_LIMIT = 16

interface ChainResolution {
  /** Final destination after walking the chain. */
  destination: string
  /** Every node visited, starting with the original source. */
  path: string[]
  /** True when a cycle was detected. */
  isLoop: boolean
  /** True when the chain bottomed out at a non-redirect target. */
  resolved: boolean
}

function resolveRedirectChain(start: string, redirectMap: Map<string, Redirect>): ChainResolution {
  const path: string[] = [start]
  const seen = new Set<string>([start])
  let cursor = start
  for (let i = 0; i < CHAIN_HOP_LIMIT; i++) {
    const entry = redirectMap.get(cursor)
    if (!entry) {
      return {destination: cursor, path, isLoop: false, resolved: true}
    }
    const next = entry.destination
    if (seen.has(next)) {
      path.push(next)
      return {destination: next, path, isLoop: true, resolved: false}
    }
    path.push(next)
    seen.add(next)
    cursor = next
  }
  return {destination: cursor, path, isLoop: false, resolved: false}
}

function isExternalUrl(value: string): boolean {
  return /^(?:https?:|mailto:|tel:|\/\/)/i.test(value)
}

// ---------------------------------------------------------------------------
// Fuzzy page resolver (basename + longest-common-suffix matching)
// ---------------------------------------------------------------------------

/**
 * Cache: basename → page slugs that end with `/${basename}`. Built lazily
 * the first time `findRealTarget` is called for a given pageSlugs set.
 */
const basenameIndexCache = new WeakMap<Set<string>, Map<string, string[]>>()

function getBasenameIndex(pageSlugs: Set<string>): Map<string, string[]> {
  const cached = basenameIndexCache.get(pageSlugs)
  if (cached) return cached
  const idx = new Map<string, string[]>()
  for (const slug of pageSlugs) {
    const parts = slug.split("/").filter(Boolean)
    const basename = parts[parts.length - 1] ?? ""
    if (!basename) continue
    const list = idx.get(basename)
    if (list) list.push(slug)
    else idx.set(basename, [slug])
  }
  basenameIndexCache.set(pageSlugs, idx)
  return idx
}

interface FuzzyMatch {
  slug: string
  /** Number of trailing path segments shared with the broken path. */
  suffix: number
  /** True when a single page tied for the best suffix score (high-confidence). */
  unique: boolean
}

/**
 * Given a path that does not resolve to a real page, try to find the page that
 * is most likely the intended target by matching trailing path segments.
 *
 * Algorithm:
 *   1. Take the basename (final segment) of `brokenPath`.
 *   2. Collect every page slug that ends with `/${basename}`.
 *   3. Among those, score each by the count of trailing path segments that
 *      match between the candidate and `brokenPath`.
 *   4. Return the candidate with the highest score. Mark `unique: false` when
 *      multiple candidates tie at the top score — callers can choose to
 *      accept (aggressive) or skip (conservative) ambiguous matches.
 *
 * Returns undefined when no candidate shares even the basename.
 */
function findRealTarget(brokenPath: string, pageSlugs: Set<string>): FuzzyMatch | undefined {
  const normalised = normalizeSlug(brokenPath)
  if (pageSlugs.has(normalised)) return {slug: normalised, suffix: Infinity, unique: true}

  const parts = normalised.split("/").filter(Boolean)
  const basename = parts[parts.length - 1]
  if (!basename) return undefined

  const candidates = getBasenameIndex(pageSlugs).get(basename) ?? []
  if (candidates.length === 0) return undefined
  if (candidates.length === 1) return {slug: candidates[0], suffix: 1, unique: true}

  let bestScore = 0
  let bestSlugs: string[] = []
  for (const cand of candidates) {
    const candParts = cand.split("/").filter(Boolean)
    let score = 0
    let i = parts.length - 1
    let j = candParts.length - 1
    while (i >= 0 && j >= 0 && parts[i] === candParts[j]) {
      score++
      i--
      j--
    }
    if (score > bestScore) {
      bestScore = score
      bestSlugs = [cand]
    } else if (score === bestScore) {
      bestSlugs.push(cand)
    }
  }
  if (bestSlugs.length === 0) return undefined
  return {slug: bestSlugs[0], suffix: bestScore, unique: bestSlugs.length === 1}
}

// ---------------------------------------------------------------------------
// Index builders
// ---------------------------------------------------------------------------

async function buildPageIndex(): Promise<{
  pages: PageRecord[]
  pageBySlug: Map<string, PageRecord>
  pageSlugs: Set<string>
}> {
  const pages: PageRecord[] = []
  const pageBySlug = new Map<string, PageRecord>()
  const pageSlugs = new Set<string>()
  const rels = walkFiles(CONTENT_ROOT, rel => rel.endsWith(".mdx"))
  for (const rel of rels) {
    const abs = path.join(CONTENT_ROOT, rel)
    const source = fs.readFileSync(abs, "utf8")
    const slug = filePathToSlug(rel, "")
    const parsed = parseFm(source)
    const record: PageRecord = {
      abs,
      rel: path.posix.join("content/docs", rel),
      slug,
      headings: extractHeadings(source),
      source,
      id: parsed.id,
    }
    pages.push(record)
    pageBySlug.set(slug, record)
    pageSlugs.add(slug)
  }
  return {pages, pageBySlug, pageSlugs}
}

function buildAssetIndex(): Set<string> {
  const publicRoot = path.join(NEXT_ROOT, "public")
  const out = new Set<string>()
  const rels = walkFiles(publicRoot, () => true)
  for (const rel of rels) {
    out.add("/" + rel.split(path.sep).join("/"))
  }
  return out
}

async function buildRedirectMap(): Promise<Map<string, Redirect>> {
  const redirects = (await readRedirects()) as Redirect[]
  const map = new Map<string, Redirect>()
  for (const r of redirects) {
    if (!r?.source) continue
    map.set(r.source, r)
  }
  return map
}

async function loadDocsJsonRedirects(): Promise<Redirect[]> {
  if (!HAS_LEGACY_DOCS) return []
  if (!existsSync(DOCS_JSON_PATH)) return []
  try {
    const raw = await fsp.readFile(DOCS_JSON_PATH, "utf8")
    const parsed = JSON.parse(raw)
    const list = Array.isArray(parsed?.redirects) ? (parsed.redirects as Redirect[]) : []
    return list.filter(r => r && typeof r.source === "string" && typeof r.destination === "string")
  } catch {
    return []
  }
}

function deriveLegacyUrls(
  redirectMap: Map<string, Redirect>,
  docsJsonRedirects: Redirect[],
  upstreamMdxRel: string[],
): Set<string> {
  const out = new Set<string>()
  for (const source of redirectMap.keys()) {
    out.add(normalizeSlug(source))
  }
  for (const r of docsJsonRedirects) {
    out.add(normalizeSlug(r.source))
  }
  for (const rel of upstreamMdxRel) {
    const noExt = rel.replace(/\.mdx$/, "")
    if (noExt === "index") {
      out.add("/")
      continue
    }
    const parts = noExt.split("/")
    if (parts[parts.length - 1] === "index") {
      out.add("/" + parts.slice(0, -1).join("/"))
    } else {
      out.add("/" + parts.join("/"))
    }
  }
  return out
}

async function buildIdToCurrentSlug(): Promise<Map<string, string>> {
  const config = (await readConfig()) as Parameters<typeof resolveCurrentSlug>[1] | null
  const out = new Map<string, string>()
  if (!config) return out
  // Walk every page in the config and resolve its slug.
  const stack: unknown[] = [...((config?.tabs as unknown[]) ?? [])]
  while (stack.length > 0) {
    const node = stack.pop() as Record<string, unknown> & {
      pages?: unknown[]
      id?: string
      slug?: string
      url?: string
      type?: string
      external?: boolean
    }
    if (!node || typeof node !== "object") continue
    if (node.external === true) continue
    if (node.type === "link") continue
    if (Array.isArray(node.pages)) stack.push(...node.pages)
    if (typeof node.id === "string") {
      const resolved = resolveCurrentSlug(node.id, config)
      if (typeof resolved === "string") {
        const slug = normalizeSlug("/" + resolved)
        out.set(node.id, slug)
      }
    }
  }
  return out
}

function buildUpstreamFrontmatter(rels: string[]): Map<string, FrontmatterFields> {
  const out = new Map<string, FrontmatterFields>()
  for (const rel of rels) {
    const abs = path.join(REPO_ROOT, rel)
    let source: string
    try {
      source = fs.readFileSync(abs, "utf8")
    } catch {
      continue
    }
    const id = rel.replace(/\.mdx$/, "")
    out.set(id, extractFrontmatterFields(source))
  }
  return out
}

function buildNewFrontmatter(pages: PageRecord[]): Map<string, FrontmatterFields> {
  const out = new Map<string, FrontmatterFields>()
  for (const p of pages) {
    if (!p.id) continue
    out.set(p.id, extractFrontmatterFields(p.source))
  }
  return out
}

// ---------------------------------------------------------------------------
// Pass entry points (filled in by later todos)
// ---------------------------------------------------------------------------

/**
 * Pass A — validate every link and asset reference inside `content/docs/`.
 *
 * Validation rules:
 *   - Absolute URLs (http, https, mailto, tel, protocol-relative) → skipped;
 *     `validate-links-external.ts` owns those.
 *   - Anchor-only (`#foo`) → skipped unless `--check-anchors`.
 *   - Asset paths (resolved path collides with a file under `public/`) → must
 *     exist verbatim. This is the dedicated guard for `/resources/*` images
 *     and assets.
 *   - Internal page paths (`/foo[#bar]`) → must resolve via `pageSlugs` or via
 *     a `redirectMap` chain that terminates at a real page (or an external
 *     URL). When `--check-anchors` is set, the anchor portion is matched
 *     against the destination page's parsed `# Heading` set.
 */
function runPassA(idx: Indices): {errors: LinkErr[]} {
  const errors: LinkErr[] = []
  const {flags, pages, pageBySlug, pageSlugs, assetUrls, redirectMap} = idx

  for (const page of pages) {
    for (const link of extractLinks(page.source)) {
      const err = validateLink(link, page, pageBySlug, pageSlugs, assetUrls, redirectMap, flags)
      if (err) errors.push({file: page.rel, line: link.line, link: link.href, reason: err})
    }
  }
  return {errors}
}

function validateLink(
  link: ExtractedLink,
  page: PageRecord,
  pageBySlug: Map<string, PageRecord>,
  pageSlugs: Set<string>,
  assetUrls: Set<string>,
  redirectMap: Map<string, Redirect>,
  flags: RunFlags,
): string | null {
  const raw = link.href.trim()
  if (!raw) return null
  if (isExternalUrl(raw)) return null
  if (raw.startsWith("?")) return null
  if (raw.startsWith("#")) {
    if (!flags.checkAnchors) return null
    return page.headings.has(raw.slice(1)) ? null : `anchor "${raw}" not found in page`
  }

  const {path: targetPath, anchor} = splitHrefAnchor(raw)
  if (!targetPath) return null

  // Resolve to an absolute /-rooted path.
  let resolved: string
  if (targetPath.startsWith("/")) {
    resolved = normalizeSlug(targetPath)
  } else {
    const ownDir = path.posix.dirname(page.slug)
    resolved = normalizeSlug(path.posix.normalize(path.posix.join(ownDir, targetPath)))
  }

  // Asset paths win over page paths: anything under `public/` or matching a
  // file extension other than .mdx is treated as an asset.
  if (looksLikeAsset(resolved)) {
    return assetUrls.has(resolved) ? null : `asset "${resolved}" not found in public/`
  }

  // Walk the redirect chain (if any). The link is OK as long as the chain
  // bottoms out at an existing page or external URL.
  if (pageSlugs.has(resolved)) {
    if (anchor && flags.checkAnchors) {
      const dest = pageBySlug.get(resolved)
      if (dest && !dest.headings.has(anchor)) {
        return `anchor "#${anchor}" not found in ${resolved}`
      }
    }
    return null
  }

  if (redirectMap.has(resolved)) {
    const chain = resolveRedirectChain(resolved, redirectMap)
    if (chain.isLoop) return `redirect loop starting at "${resolved}"`
    const final = chain.destination
    if (isExternalUrl(final)) return null
    if (pageSlugs.has(final)) {
      if (anchor && flags.checkAnchors) {
        const dest = pageBySlug.get(final)
        if (dest && !dest.headings.has(anchor)) {
          return `anchor "#${anchor}" not found in ${final}`
        }
      }
      return null
    }
    return `redirect from "${resolved}" lands on "${final}" which is not a page`
  }

  return `page "${resolved}" not found`
}

function looksLikeAsset(resolved: string): boolean {
  // Anything matching `/<file>.<ext>` where <ext> is not an MDX/HTML page
  // extension is treated as an asset. Common cases: png, jpg, svg, mp4, mov,
  // pdf, txt, ico, webp, gif, json. We keep the list permissive — assetUrls
  // is the actual authority.
  const m = /\.([a-z0-9]+)$/i.exec(resolved)
  if (!m) return false
  const ext = m[1].toLowerCase()
  return ext !== "mdx" && ext !== "md" && ext !== "html"
}

/**
 * Pass B — verify every legacy URL still resolves.
 *
 * For each URL in `legacyUrls`:
 *   1. If it's currently a live page slug → OK (no redirect needed).
 *   2. Else if it's a redirect source whose chain bottoms out at a page or an
 *      external URL → OK.
 *   3. Else propose a replacement:
 *      a. If the URL is `/<id>` and the id resolves to a current slug via
 *         `idToCurrentSlug`, propose `source: /<id> → destination: /<slug>`.
 *      b. If the URL appears as a `source` in `docs.json.redirects` and its
 *         declared destination is a real page or an external URL, propose the
 *         declared destination verbatim.
 *      c. Otherwise the legacy URL is unresolvable — record an issue without a
 *         proposed fix.
 */
function runPassB(idx: Indices): {
  okCount: number
  issues: RedirectIssue[]
  proposed: Redirect[]
} {
  const {legacyUrls, pageSlugs, redirectMap, idToCurrentSlug, docsJsonRedirects} = idx

  const docsJsonByNormSource = new Map<string, Redirect>()
  for (const r of docsJsonRedirects) {
    docsJsonByNormSource.set(normalizeSlug(r.source), r)
  }

  const proposed: Redirect[] = []
  const proposedSeen = new Set<string>()
  const issues: RedirectIssue[] = []
  let okCount = 0

  const addProposal = (entry: Redirect) => {
    const source = normalizeSlug(entry.source)
    const destination = entry.destination.startsWith("/")
      ? normalizeSlug(entry.destination)
      : entry.destination
    if (source === destination) return
    if (proposedSeen.has(source)) return
    if (redirectMap.has(source)) return
    proposedSeen.add(source)
    proposed.push({source, destination, permanent: true})
  }

  for (const legacyUrlRaw of legacyUrls) {
    const legacyUrl = normalizeSlug(legacyUrlRaw)
    if (pageSlugs.has(legacyUrl)) {
      okCount++
      continue
    }

    const existing = redirectMap.get(legacyUrl)
    if (existing) {
      const chain = resolveRedirectChain(legacyUrl, redirectMap)
      if (chain.isLoop) {
        issues.push({legacyUrl, reason: `redirect loop (${chain.path.join(" -> ")})`})
        continue
      }
      const final = chain.destination
      if (isExternalUrl(final) || pageSlugs.has(final)) {
        okCount++
        continue
      }
      issues.push({
        legacyUrl,
        reason: `chain lands on "${final}" which is not a page`,
        proposedDestination: proposeFromId(final, idToCurrentSlug, pageSlugs),
      })
      continue
    }

    // Not currently in redirects.mjs → try to propose one.
    const idCandidate = legacyUrl.replace(/^\//, "")
    const fromId = proposeFromId(idCandidate, idToCurrentSlug, pageSlugs)
    if (fromId) {
      addProposal({source: legacyUrl, destination: fromId, permanent: true})
      continue
    }

    const docsJsonEntry = docsJsonByNormSource.get(legacyUrl)
    if (docsJsonEntry) {
      const dest = docsJsonEntry.destination
      const normDest = dest.startsWith("/") ? normalizeSlug(dest) : dest
      if (isExternalUrl(normDest) || pageSlugs.has(normDest)) {
        addProposal({source: legacyUrl, destination: normDest, permanent: true})
        continue
      }
      // The docs.json destination is itself a legacy URL. Follow it through
      // proposed/existing redirects one step.
      const followed = redirectMap.get(normDest)
      if (followed) {
        const followedChain = resolveRedirectChain(normDest, redirectMap)
        if (!followedChain.isLoop && pageSlugs.has(followedChain.destination)) {
          addProposal({
            source: legacyUrl,
            destination: followedChain.destination,
            permanent: true,
          })
          continue
        }
      }
      const repropose = proposeFromId(normDest.replace(/^\//, ""), idToCurrentSlug, pageSlugs)
      if (repropose) {
        addProposal({source: legacyUrl, destination: repropose, permanent: true})
        continue
      }
      issues.push({
        legacyUrl,
        reason: `docs.json destination "${dest}" is not a live page`,
      })
      continue
    }

    issues.push({legacyUrl, reason: "no live page or redirect"})
  }

  return {okCount, issues, proposed}
}

/**
 * Given an upstream id (no leading slash) or normalized URL, look up the
 * current slug via `idToCurrentSlug`. Returns the leading-slash URL when the
 * resolved slug is a real page, otherwise undefined.
 */
function proposeFromId(
  candidate: string,
  idToCurrentSlug: Map<string, string>,
  pageSlugs: Set<string>,
): string | undefined {
  const id = candidate.startsWith("/") ? candidate.slice(1) : candidate
  if (!id) return undefined
  const slug = idToCurrentSlug.get(id)
  if (!slug) return undefined
  return pageSlugs.has(slug) ? slug : undefined
}

/**
 * Pass C — chain / loop / permanence audit.
 *
 * Walks every entry in `redirectMap` and classifies it:
 *   - Loop: chain revisits a node. **Hard error.** No flag can suppress.
 *   - Multi-hop chain: A -> B -> C. Flagged as SEO debt; `--flatten-chains`
 *     can rewrite it to A -> <final> via the mutator.
 *   - `permanent: false`: leaks link equity (307 vs 308). **Hard error.**
 *     `--enforce-permanent` upgrades it.
 *
 * In addition to literal chains, this pass treats a "dead-end" (chain
 * terminating on a non-page, non-external URL) as a chain whose proposed
 * single-hop replacement is resolved through `idToCurrentSlug`. That way
 * `--flatten-chains` can fix old redirects pointing at intermediate slugs
 * that have since moved further.
 */
function runPassC(idx: Indices): {
  chains: ChainReport[]
  loops: LoopReport[]
  nonPermanent: PermissivenessReport[]
} {
  const chains: ChainReport[] = []
  const loops: LoopReport[] = []
  const nonPermanent: PermissivenessReport[] = []
  const {redirectMap, pageSlugs, idToCurrentSlug} = idx

  for (const [source, entry] of redirectMap) {
    if (entry.permanent === false) {
      nonPermanent.push({source: entry.source, destination: entry.destination})
    }

    const chain = resolveRedirectChain(source, redirectMap)
    if (chain.isLoop) {
      loops.push({source, cycle: chain.path})
      continue
    }

    const finalDest = chain.destination
    const liveTerminus =
      isExternalUrl(finalDest) || pageSlugs.has(finalDest) ? finalDest : undefined

    // True multi-hop chain (A -> B -> C): chain.path.length > 2.
    const isMultiHop = chain.path.length > 2

    if (isMultiHop && liveTerminus) {
      chains.push({source, path: chain.path, finalDestination: liveTerminus})
      continue
    }

    if (!liveTerminus) {
      // Dead-end: try the source first (the redirect source is usually the
      // upstream id format), then fall back to the final destination. Either
      // path lets `--flatten-chains` swap the bad destination for the real
      // current slug.
      const proposal =
        proposeFromId(source.replace(/^\//, ""), idToCurrentSlug, pageSlugs) ??
        proposeFromId(finalDest.replace(/^\//, ""), idToCurrentSlug, pageSlugs)
      if (proposal && proposal !== source) {
        chains.push({source, path: chain.path, finalDestination: proposal})
      }
      // Dead-ends without a proposal are surfaced by Pass B, not here.
    }
  }
  return {chains, loops, nonPermanent}
}

/**
 * Pass D — stale and broken internal links.
 *
 * Walks every MDX link inside `content/docs/` and emits a replacement when one
 * can be derived. Three cases (`origin`):
 *
 *   - `chain` — link resolves to a redirect source; the chain terminates at a
 *     real page or an external URL. Replace with the chain's final
 *     destination so internal navigation skips the 308 hop.
 *   - `fuzzy` — link resolves to a redirect source, but the chain ends at a
 *     non-page or loops. Find the real page via basename + path-suffix
 *     matching and rewrite directly. This is the case the user complained
 *     about: previously the pass would silently skip these.
 *   - `broken` — link has no redirect entry at all and the page does not
 *     exist. We still attempt basename matching so MDX links rotted by
 *     out-of-band moves can be repaired in one pass.
 *
 * Anchor preservation: `/old/path#frag` → `<resolved>#frag`. Ambiguous fuzzy
 * matches (multiple candidates tied for best suffix score) are skipped so we
 * never silently rewrite to the wrong page.
 */
function runPassD(idx: Indices): {stale: StaleLinkReport[]} {
  const stale: StaleLinkReport[] = []
  const {pages, pageSlugs, redirectMap} = idx
  for (const page of pages) {
    for (const link of extractLinks(page.source)) {
      const raw = link.href.trim()
      if (!raw || isExternalUrl(raw) || raw.startsWith("#") || raw.startsWith("?")) continue
      const {path: targetPath, anchor} = splitHrefAnchor(raw)
      if (!targetPath) continue
      let resolved: string
      if (targetPath.startsWith("/")) {
        resolved = normalizeSlug(targetPath)
      } else {
        const ownDir = path.posix.dirname(page.slug)
        resolved = normalizeSlug(path.posix.normalize(path.posix.join(ownDir, targetPath)))
      }
      if (looksLikeAsset(resolved)) continue
      if (pageSlugs.has(resolved)) continue // already pointing at a real page

      let finalHref: string | undefined
      let origin: StaleLinkReport["origin"] | undefined

      if (redirectMap.has(resolved)) {
        // Case A/B: link goes through a redirect.
        const chain = resolveRedirectChain(resolved, redirectMap)
        const final = chain.destination
        if (!chain.isLoop && (isExternalUrl(final) || pageSlugs.has(final)) && final !== resolved) {
          // Case A — chain ended cleanly.
          finalHref = anchor ? `${final}#${anchor}` : final
          origin = "chain"
        } else {
          // Case B — chain looped or ended on a non-page. Try fuzzy matching
          // against the original link target (most semantically meaningful
          // path the author wrote).
          const match = findRealTarget(resolved, pageSlugs)
          if (match && match.unique && match.slug !== resolved) {
            finalHref = anchor ? `${match.slug}#${anchor}` : match.slug
            origin = "fuzzy"
          }
        }
      } else {
        // Case C: no redirect at all. The link is broken in MDX directly.
        const match = findRealTarget(resolved, pageSlugs)
        if (match && match.unique && match.slug !== resolved) {
          finalHref = anchor ? `${match.slug}#${anchor}` : match.slug
          origin = "broken"
        }
      }

      if (!finalHref || !origin) continue
      stale.push({file: page.rel, line: link.line, href: raw, finalHref, origin})
    }
  }
  return {stale}
}

/**
 * Pass R — redirect repair.
 *
 * For every redirect whose destination does not currently resolve (chain
 * terminates at a non-page, or the chain loops), try to find the page the
 * author originally intended by basename + longest-common-suffix matching on
 * the redirect **source** (which represents the legacy URL — typically the
 * closest hint to the real destination path).
 *
 * Returns one entry per redirect that we know how to fix and the set of
 * source paths we could not resolve so the caller can surface them.
 */
interface RedirectRepair {
  source: string
  oldDestination: string
  newDestination: string
  reason: "loop" | "dead-end"
  suffix: number
}

interface UnrepairableRedirect {
  source: string
  destination: string
  reason: string
}

function runPassR(idx: Indices): {
  repairs: RedirectRepair[]
  drops: string[]
  unresolvable: UnrepairableRedirect[]
} {
  const {redirectMap, pageSlugs} = idx
  const repairs: RedirectRepair[] = []
  const drops: string[] = []
  const unresolvable: UnrepairableRedirect[] = []

  for (const [source, entry] of redirectMap) {
    // Source is itself a real page — this redirect should not exist at all.
    // It either steals traffic from the page (when chain ends elsewhere) or
    // creates a `A → B → A` loop when B redirects back. Mark for deletion.
    if (pageSlugs.has(source)) {
      drops.push(source)
      continue
    }

    const chain = resolveRedirectChain(source, redirectMap)

    let reason: RedirectRepair["reason"] | undefined
    if (chain.isLoop) {
      reason = "loop"
    } else {
      const final = chain.destination
      if (!isExternalUrl(final) && !pageSlugs.has(final)) {
        reason = "dead-end"
      }
    }
    if (!reason) continue // chain resolves correctly, nothing to repair

    const match = findRealTarget(source, pageSlugs)
    if (!match || !match.unique) {
      unresolvable.push({
        source,
        destination: entry.destination,
        reason:
          match === undefined
            ? "no page with matching basename"
            : `ambiguous basename match (suffix=${match.suffix})`,
      })
      continue
    }
    repairs.push({
      source,
      oldDestination: entry.destination,
      newDestination: match.slug,
      reason,
      suffix: match.suffix === Infinity ? -1 : match.suffix,
    })
  }
  return {repairs, drops, unresolvable}
}

/**
 * Pass E — frontmatter parity (pre-cutover only).
 *
 * For every id present in both `upstreamFrontmatter` and `newFrontmatter`,
 * diff `title` and `description`. Mismatches are SEO-relevant (Google treats
 * the page title and meta description as primary ranking signals; rewriting
 * either resets the snippet match). We surface them so a human can decide
 * whether each rewrite is intentional. There is no `--fix` for this pass —
 * the new MDX is the source of truth after cutover.
 *
 * When `!HAS_LEGACY_DOCS` (post-cutover) the pass is skipped with an explicit
 * log line and is never counted as a regression.
 */
function runPassE(idx: Indices): {diffs: FrontmatterDiff[]; skipped: boolean} {
  if (!HAS_LEGACY_DOCS) return {diffs: [], skipped: true}
  const {upstreamFrontmatter, newFrontmatter} = idx
  const diffs: FrontmatterDiff[] = []
  for (const [id, upstream] of upstreamFrontmatter) {
    const current = newFrontmatter.get(id)
    if (!current) continue // page no longer exists in the new tree
    if ((upstream.title ?? "") !== (current.title ?? "")) {
      diffs.push({id, field: "title", upstream: upstream.title, current: current.title})
    }
    if ((upstream.description ?? "") !== (current.description ?? "")) {
      diffs.push({
        id,
        field: "description",
        upstream: upstream.description,
        current: current.description,
      })
    }
  }
  return {diffs, skipped: false}
}

/**
 * Pass F — sitemap, canonical, and robots wiring.
 *
 * Three static-source assertions (no fumadocs-mdx import; the script must
 * work without `npm run generated-source` having been run):
 *   1. `src/app/sitemap.ts` enumerates docs URLs via `getVisiblePages()` —
 *      this means the sitemap will, by construction, match `pageSlugs`.
 *      If that wiring is broken (no `getVisiblePages`, or the file is gone),
 *      we surface it.
 *   2. `src/app/(docs)/[...slug]/page.tsx` sets `alternates.canonical: page.url`
 *      inside `generateMetadata`. Without it, every doc page would emit a
 *      sitewide canonical or no canonical at all → duplicate-content risk.
 *   3. `src/app/robots.ts` does not Disallow `/` or any docs-prefix.
 */
function runPassF(_idx: Indices): {issues: SitemapIssue[]} {
  const issues: SitemapIssue[] = []
  const srcRoot = path.join(NEXT_ROOT, "src", "app")

  const sitemapPath = path.join(srcRoot, "sitemap.ts")
  if (!existsSync(sitemapPath)) {
    issues.push({kind: "missing-page", detail: `src/app/sitemap.ts is missing`})
  } else {
    const body = fs.readFileSync(sitemapPath, "utf8")
    if (!/getVisiblePages\s*\(/.test(body)) {
      issues.push({
        kind: "missing-page",
        detail: `src/app/sitemap.ts no longer calls getVisiblePages()`,
      })
    }
  }

  const docsPagePath = path.join(srcRoot, "(docs)", "[...slug]", "page.tsx")
  if (!existsSync(docsPagePath)) {
    issues.push({
      kind: "canonical-broken",
      detail: `src/app/(docs)/[...slug]/page.tsx is missing`,
    })
  } else {
    const body = fs.readFileSync(docsPagePath, "utf8")
    // We tolerate whitespace and quoting variation, but the alternates block
    // must include canonical bound to page.url.
    const hasGenerateMetadata = /export\s+async\s+function\s+generateMetadata\b/.test(body)
    const hasCanonical = /alternates\s*:\s*\{[^}]*canonical\s*:\s*page\.url/s.test(body)
    if (!hasGenerateMetadata) {
      issues.push({
        kind: "canonical-broken",
        detail: `generateMetadata() not exported from (docs)/[...slug]/page.tsx`,
      })
    } else if (!hasCanonical) {
      issues.push({
        kind: "canonical-broken",
        detail: `alternates.canonical = page.url is missing in (docs)/[...slug]/page.tsx`,
      })
    }
  }

  const robotsPath = path.join(srcRoot, "robots.ts")
  if (!existsSync(robotsPath)) {
    issues.push({kind: "robots-blocks", detail: `src/app/robots.ts is missing`})
  } else {
    const body = fs.readFileSync(robotsPath, "utf8")
    // Block-everything pattern: `disallow: "/"` or `Disallow: /` (either case)
    // without an explicit `allow` would prevent indexing. We accept the
    // common "allow: /" shape and only fail on the catch-all disallow.
    if (/disallow\s*:\s*["']\s*\/\s*["']/i.test(body) && !/allow\s*:\s*["']\s*\//i.test(body)) {
      issues.push({
        kind: "robots-blocks",
        detail: `src/app/robots.ts disallows "/" without an explicit allow rule`,
      })
    }
  }

  return {issues}
}

/**
 * Pass G — orphan asset detector.
 *
 * Every file under `next/public/` is shipped by `next build` and serves at a
 * deterministic URL. If nothing references that URL — neither MDX content,
 * nor `redirects.mjs` destinations, nor `src/app/**` metadata — the file is
 * dead weight: it costs build time, deploy bandwidth, and SEO crawl budget
 * (Google will happily crawl orphans found via sitemap/img-src hints).
 *
 * Detection strategy:
 *
 *   1. Start with `assetUrls` (every file under public/, leading-slash URL).
 *   2. Drop infra files (favicons, robots, sitemap, og-image-*, logo-*) that
 *      are referenced from outside our scan surface — browsers and CDNs
 *      request them automatically.
 *   3. Compute the set of referenced URLs from:
 *        - Every `<href>` / `<src>` / `[text](url)` in any MDX under `content/docs/`
 *        - Every redirect destination in `redirects.mjs`
 *        - Every TypeScript string literal under `next/src/app/**` (covers
 *          metadata icons, `metadataBase`-relative refs, opengraph image
 *          paths, robots/sitemap output, etc.)
 *   4. Anything in `assetUrls` not in the referenced set is an orphan.
 *
 * The `src/app/**` scan is a substring match, not an AST walk: anything that
 * looks like the URL appearing inside the source is treated as a reference.
 * False positives there are preferable to false orphans.
 */
function runPassG(idx: Indices): {orphans: OrphanAssetReport[]} {
  const {pages, assetUrls, redirectMap} = idx

  const referenced = new Set<string>()

  // MDX references: re-extract every link we already scanned in Pass A/D so
  // that this pass works even when --check-links is disabled.
  for (const page of pages) {
    for (const link of extractLinks(page.source)) {
      const raw = link.href.trim()
      if (!raw) continue
      if (isExternalUrl(raw)) continue
      // Strip query/anchor; we care about the path.
      const qIdx = raw.indexOf("?")
      const noQuery = qIdx >= 0 ? raw.slice(0, qIdx) : raw
      const hIdx = noQuery.indexOf("#")
      const justPath = hIdx >= 0 ? noQuery.slice(0, hIdx) : noQuery
      if (justPath.startsWith("/")) referenced.add(justPath)
    }
  }

  // Redirect destinations: even if no MDX links them, a 301 hop still keeps
  // the asset reachable for legacy traffic.
  for (const entry of redirectMap.values()) {
    if (entry.destination.startsWith("/")) referenced.add(entry.destination)
  }

  // src/app/** substring scan. We treat any source file in `next/src/app/`
  // (including `metadataBase`, `metadata: {icons: ...}`, OG image refs, etc.)
  // as a possible referencer. The check is naive on purpose — false matches
  // on this side cost nothing; false orphans would silently break assets.
  const srcAppRoot = path.join(NEXT_ROOT, "src", "app")
  const appFiles = existsSync(srcAppRoot)
    ? walkFiles(srcAppRoot, rel => rel.endsWith(".ts") || rel.endsWith(".tsx"))
    : []
  const appSources = appFiles.map(rel => fs.readFileSync(path.join(srcAppRoot, rel), "utf8"))
  for (const url of assetUrls) {
    if (referenced.has(url)) continue
    if (appSources.some(src => src.includes(url))) referenced.add(url)
  }

  // Allowlist: assets that browsers/CDNs/SEO tools fetch directly by name
  // even when no source code references them.
  const isInfra = (url: string): boolean => {
    if (url === "/favicon.ico" || url === "/robots.txt" || url === "/sitemap.xml") return true
    if (url.startsWith("/favicon")) return true
    if (url.startsWith("/apple-touch-icon")) return true
    if (url.startsWith("/og-image")) return true
    if (url.startsWith("/logo-")) return true
    if (url.startsWith("/.well-known/")) return true
    return false
  }

  const orphans: OrphanAssetReport[] = []
  for (const url of assetUrls) {
    if (referenced.has(url)) continue
    if (isInfra(url)) continue
    // `rel` is the on-disk path under `next/public/`.
    orphans.push({url, rel: path.posix.join("public", url.replace(/^\//, ""))})
  }
  orphans.sort((a, b) => a.url.localeCompare(b.url))
  return {orphans}
}

// ---------------------------------------------------------------------------
// Top-level orchestration
// ---------------------------------------------------------------------------

function layoutBanner(): void {
  if (HAS_LEGACY_DOCS) {
    console.log("layout: pre-cutover (upstream docs.json + .mdx available)")
  } else {
    console.log("layout: post-cutover (next/ is the root; auditing redirects.mjs only)")
  }
}

async function buildIndices(flags: RunFlags): Promise<Indices> {
  const t0 = Date.now()
  const upstreamMdx = discoverUpstreamMdx()
  const {pages, pageBySlug, pageSlugs} = await buildPageIndex()
  const assetUrls = buildAssetIndex()
  const redirectMap = await buildRedirectMap()
  const docsJsonRedirects = await loadDocsJsonRedirects()
  const legacyUrls = deriveLegacyUrls(redirectMap, docsJsonRedirects, upstreamMdx)
  const idToCurrentSlug = await buildIdToCurrentSlug()
  const upstreamFrontmatter = HAS_LEGACY_DOCS
    ? buildUpstreamFrontmatter(upstreamMdx)
    : new Map<string, FrontmatterFields>()
  const newFrontmatter = buildNewFrontmatter(pages)

  const knownUrls = new Set<string>(pageSlugs)
  for (const source of redirectMap.keys()) {
    knownUrls.add(normalizeSlug(source))
  }

  if (flags.verbose) {
    console.log(
      `  indices built in ${Date.now() - t0}ms ` +
        `(${pages.length} pages, ${assetUrls.size} assets, ${redirectMap.size} redirects, ` +
        `${legacyUrls.size} legacy URLs, ${idToCurrentSlug.size} ids)`,
    )
  }

  return {
    flags,
    pages,
    pageBySlug,
    knownUrls,
    pageSlugs,
    assetUrls,
    redirectMap,
    legacyUrls,
    idToCurrentSlug,
    upstreamFrontmatter,
    newFrontmatter,
    docsJsonRedirects,
  }
}

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp()
    process.exit(0)
  }

  const flags = parseFlags(process.argv.slice(2))
  layoutBanner()
  const idx = await buildIndices(flags)

  let hardError = false
  let regressionCount = 0

  // Pass results we may need to consume in the mutator phase.
  let passBProposed: Redirect[] = []
  let passCChains: ChainReport[] = []
  let passCNonPermanent: PermissivenessReport[] = []
  let passDStale: StaleLinkReport[] = []
  let passEDiffs: FrontmatterDiff[] = []

  if (flags.checkLinks) {
    const {errors} = runPassA(idx)
    if (errors.length > flags.baseline) {
      regressionCount += errors.length - flags.baseline
      for (const e of errors) console.error(`${e.file}:${e.line}  ${e.link}  →  ${e.reason}`)
      console.error(`  links: ${errors.length} broken (baseline ${flags.baseline})`)
    } else {
      console.log(`  links: OK (${errors.length} below baseline ${flags.baseline})`)
    }
  }

  if (flags.checkRedirects) {
    const {okCount, issues, proposed} = runPassB(idx)
    passBProposed = proposed
    // Don't double-count issues that overlap with chain-flatten targets.
    if (issues.length > 0 && !flags.fix) regressionCount += issues.length
    if (flags.verbose && issues.length > 0) {
      for (const i of issues.slice(0, 25)) {
        console.warn(`    ${i.legacyUrl}: ${i.reason}`)
      }
      if (issues.length > 25) console.warn(`    ... and ${issues.length - 25} more`)
    }
    if (flags.verbose && proposed.length > 0) {
      for (const p of proposed.slice(0, 10)) {
        console.log(`    propose: ${p.source} -> ${p.destination}`)
      }
      if (proposed.length > 10) console.log(`    ... and ${proposed.length - 10} more proposals`)
    }
    console.log(
      `  redirects: ${okCount} OK, ${issues.length} issue(s), ${proposed.length} proposable`,
    )
  }

  if (flags.checkChains) {
    const {chains, loops, nonPermanent} = runPassC(idx)
    passCChains = chains
    passCNonPermanent = nonPermanent
    if (loops.length > 0) hardError = true
    if (nonPermanent.length > 0 && !flags.enforcePermanent) hardError = true
    if (chains.length > 0 && !flags.flattenChains) regressionCount += chains.length
    for (const l of loops) {
      console.error(`  LOOP: ${l.cycle.join(" -> ")}`)
    }
    for (const np of nonPermanent) {
      console.error(`  permanent:false ${np.source} -> ${np.destination}`)
    }
    if (flags.verbose && chains.length > 0) {
      for (const c of chains.slice(0, 10)) {
        console.log(`    chain: ${c.path.join(" -> ")}   ⇒   ${c.source} -> ${c.finalDestination}`)
      }
      if (chains.length > 10) console.log(`    ... and ${chains.length - 10} more chains`)
    }
    console.log(
      `  chains: ${chains.length} multi-hop, ${loops.length} loop(s) (HARD), ` +
        `${nonPermanent.length} permanent:false (HARD)`,
    )
  }

  // Pass R runs whenever --repair-redirects is set, regardless of which
  // check scopes are active — it operates only on redirects.mjs and is the
  // most useful starting point for users staring down a wall of "lands on
  // X which is not a page" errors.
  let passRRepairs: RedirectRepair[] = []
  let passRDrops: string[] = []
  let passRUnresolvable: UnrepairableRedirect[] = []
  if (flags.repairRedirects) {
    const {repairs, drops, unresolvable} = runPassR(idx)
    passRRepairs = repairs
    passRDrops = drops
    passRUnresolvable = unresolvable
    if (flags.verbose) {
      for (const r of repairs.slice(0, 25)) {
        console.log(
          `    ↻ ${r.source}: ${r.oldDestination} -> ${r.newDestination}  (${r.reason})`,
        )
      }
      if (repairs.length > 25) console.log(`    ... and ${repairs.length - 25} more`)
      for (const d of drops.slice(0, 10)) {
        console.log(`    🗑 ${d}  (source is already a real page)`)
      }
      if (drops.length > 10) console.log(`    ... and ${drops.length - 10} more drops`)
      for (const u of unresolvable.slice(0, 10)) {
        console.warn(`    ✗ ${u.source}: ${u.destination} (${u.reason})`)
      }
      if (unresolvable.length > 10) {
        console.warn(`    ... and ${unresolvable.length - 10} more`)
      }
    }
    console.log(
      `  repairs: ${repairs.length} fixable, ${drops.length} to drop, ${unresolvable.length} unresolved`,
    )
  }

  if (flags.checkInternalStale) {
    const {stale} = runPassD(idx)
    passDStale = stale
    if (stale.length > 0 && !flags.fixInternal) regressionCount += stale.length
    if (flags.verbose && stale.length > 0) {
      const byOrigin = {chain: 0, fuzzy: 0, broken: 0}
      for (const s of stale) byOrigin[s.origin]++
      for (const s of stale.slice(0, 10)) {
        console.log(`    [${s.origin}] ${s.file}:${s.line}  ${s.href}  →  ${s.finalHref}`)
      }
      if (stale.length > 10) console.log(`    ... and ${stale.length - 10} more`)
      console.log(
        `    breakdown: ${byOrigin.chain} chain, ${byOrigin.fuzzy} fuzzy, ${byOrigin.broken} broken`,
      )
    }
    console.log(`  stale-internal: ${stale.length} link(s) need rewriting`)
  }

  if (flags.checkFrontmatter) {
    const {diffs, skipped} = runPassE(idx)
    passEDiffs = diffs
    if (skipped) {
      console.log("  frontmatter: skipped (no upstream to diff against)")
    } else {
      if (diffs.length > 0 && !flags.fixFrontmatter) regressionCount += diffs.length
      if (flags.verbose && diffs.length > 0) {
        for (const d of diffs.slice(0, 10)) {
          const u = JSON.stringify(d.upstream ?? null)
          const c = JSON.stringify(d.current ?? null)
          console.log(`    ${d.id}.${d.field}: ${u}  →  ${c}`)
        }
        if (diffs.length > 10) console.log(`    ... and ${diffs.length - 10} more`)
      }
      console.log(`  frontmatter: ${diffs.length} mismatch(es)`)
    }
  }

  if (flags.checkSitemap) {
    const {issues} = runPassF(idx)
    if (issues.length > 0) regressionCount += issues.length
    for (const i of issues) {
      console.error(`  ${i.kind}: ${i.detail}`)
    }
    console.log(`  sitemap+canonical: ${issues.length} issue(s)`)
  }

  if (flags.checkAssets) {
    const {orphans} = runPassG(idx)
    if (orphans.length > 0) regressionCount += orphans.length
    if (flags.verbose && orphans.length > 0) {
      for (const o of orphans.slice(0, 25)) {
        console.warn(`    orphan asset: ${o.url}  (${o.rel})`)
      }
      if (orphans.length > 25) console.warn(`    ... and ${orphans.length - 25} more`)
    }
    console.log(`  assets: ${idx.assetUrls.size} indexed, ${orphans.length} orphan(s)`)
  }

  // -------------------------------------------------------------------------
  // Mutator phase. Each flag touches one surface only.
  // -------------------------------------------------------------------------
  if (flags.fix || flags.flattenChains || flags.enforcePermanent) {
    await applyRedirectMutations(idx, {
      additive: flags.fix ? passBProposed : [],
      flatten: flags.flattenChains ? passCChains : [],
      enforcePermanent: flags.enforcePermanent ? passCNonPermanent : [],
      verbose: flags.verbose,
    })
  }
  if (flags.repairRedirects && (passRRepairs.length > 0 || passRDrops.length > 0)) {
    await applyRedirectRepairs(idx, passRRepairs, passRDrops, flags.verbose)
  }
  if (flags.fixInternal && passDStale.length > 0) {
    await applyStaleLinkRewrites(passDStale, flags.verbose)
  }
  if (flags.fixFrontmatter && passEDiffs.length > 0) {
    await applyFrontmatterRestores(idx, passEDiffs, flags.verbose)
  }
  // Silence "unused" warnings on unresolvables — they are surfaced to stdout
  // for human review but not currently fed into further mutators.
  void passRUnresolvable

  if (hardError) {
    console.error("\nFAIL (hard SEO regression: loops or permanent:false)")
    process.exit(1)
  }
  if (regressionCount > 0) {
    console.error(`\nFAIL (${regressionCount} regression(s))`)
    process.exit(1)
  }
  console.log("\nOK")
}

// ---------------------------------------------------------------------------
// Mutators
// ---------------------------------------------------------------------------

/**
 * Write redirect-side mutations through `writeRedirects` (which normalizes,
 * dedupes, and sorts). Three independent operations may be folded in:
 *
 *  - `additive`: legacy URLs that have no current entry. Spread *before*
 *    existing entries so on duplicate `source` the existing row wins — the
 *    additive contract is "append, never modify".
 *  - `flatten`: rewrite each chain head's destination to its computed final
 *    target. Spread *after* existing so on duplicate `source` (which is the
 *    whole point) the new destination wins. This is the only mutator that
 *    intentionally rewrites an existing entry.
 *  - `enforcePermanent`: re-emit specific entries with permanent: true.
 *    Spread last so the upgraded permanent flag wins.
 */
async function applyRedirectMutations(
  idx: Indices,
  ops: {
    additive: Redirect[]
    flatten: ChainReport[]
    enforcePermanent: PermissivenessReport[]
    verbose: boolean
  },
): Promise<void> {
  const {additive, flatten, enforcePermanent, verbose} = ops
  if (additive.length === 0 && flatten.length === 0 && enforcePermanent.length === 0) {
    return
  }

  const existing = Array.from(idx.redirectMap.values())
  const flattenRows: Redirect[] = flatten.map(c => ({
    source: c.source,
    destination: c.finalDestination,
    permanent: idx.redirectMap.get(c.source)?.permanent ?? true,
  }))
  const upgradedRows: Redirect[] = enforcePermanent.map(np => {
    const cur = idx.redirectMap.get(np.source)
    return {
      source: np.source,
      destination: cur?.destination ?? np.destination,
      permanent: true,
    }
  })

  // Order: additive first (yields to existing on conflicts) → existing →
  // flatten (overrides existing on conflicts) → upgraded permanent (last
  // wins). Self-redirects and bad entries are dropped by writeRedirects.
  const merged: Redirect[] = [...additive, ...existing, ...flattenRows, ...upgradedRows]
  await writeRedirects(merged)

  console.log(
    `  wrote redirects.mjs: +${additive.length} additive, ` +
      `${flatten.length} flattened, ${enforcePermanent.length} permanence upgrades`,
  )
  if (verbose) {
    for (const a of additive.slice(0, 5)) console.log(`    + ${a.source} -> ${a.destination}`)
    for (const f of flatten.slice(0, 5)) console.log(`    ~ ${f.source} -> ${f.finalDestination}`)
    for (const u of upgradedRows.slice(0, 5)) console.log(`    ⇧ ${u.source} (permanent:true)`)
  }
}

/**
 * Apply repaired destinations to `redirects.mjs`. Only the `destination`
 * field of an existing entry is rewritten — `source` and `permanent` are
 * preserved. Existing `writeRedirects` semantics (dedupe + sort) still apply.
 */
async function applyRedirectRepairs(
  idx: Indices,
  repairs: RedirectRepair[],
  drops: string[],
  verbose: boolean,
): Promise<void> {
  if (repairs.length === 0 && drops.length === 0) return
  const repairMap = new Map(repairs.map(r => [r.source, r]))
  const dropSet = new Set(drops)
  const existing = Array.from(idx.redirectMap.values())
  const next: Redirect[] = existing
    .filter(r => !dropSet.has(r.source))
    .map(r => {
      const repair = repairMap.get(r.source)
      if (!repair) return r
      return {source: r.source, destination: repair.newDestination, permanent: r.permanent ?? true}
    })
  await writeRedirects(next)
  console.log(
    `  redirects.mjs: ${repairs.length} repaired, ${drops.length} dropped (source already a real page)`,
  )
  if (verbose) {
    for (const r of repairs.slice(0, 10)) {
      console.log(`    ↻ ${r.source}: ${r.oldDestination} -> ${r.newDestination}  (${r.reason})`)
    }
    if (repairs.length > 10) console.log(`    ... and ${repairs.length - 10} more repairs`)
    for (const d of drops.slice(0, 5)) {
      console.log(`    🗑 ${d}  (source is already a real page)`)
    }
    if (drops.length > 5) console.log(`    ... and ${drops.length - 5} more drops`)
  }
}

/**
 * Rewrite MDX in-place to replace each stale link with its final
 * destination. We use the captured `rawMatch` shape only as a guard — the
 * actual byte replacement is a literal swap of the `href` value, performed
 * line-by-line to be conservative. Anchors are preserved by Pass D's
 * `finalHref` computation.
 */
async function applyStaleLinkRewrites(stale: StaleLinkReport[], verbose: boolean): Promise<void> {
  const byFile = new Map<string, StaleLinkReport[]>()
  for (const s of stale) {
    const arr = byFile.get(s.file) ?? []
    arr.push(s)
    byFile.set(s.file, arr)
  }
  let touchedFiles = 0
  let rewrittenLinks = 0
  for (const [file, entries] of byFile) {
    const abs = path.join(NEXT_ROOT, file)
    const original = await fsp.readFile(abs, "utf8")
    const lines = original.split("\n")
    let dirty = false
    // Group by 1-indexed line for a single pass per line.
    const byLine = new Map<number, StaleLinkReport[]>()
    for (const e of entries) {
      const arr = byLine.get(e.line) ?? []
      arr.push(e)
      byLine.set(e.line, arr)
    }
    for (const [line, ents] of byLine) {
      const idxInArr = line - 1
      let next = lines[idxInArr]
      for (const e of ents) {
        const replaced = replaceLinkOnLine(next, e.href, e.finalHref)
        if (replaced !== next) {
          next = replaced
          rewrittenLinks++
          dirty = true
        }
      }
      lines[idxInArr] = next
    }
    if (dirty) {
      await fsp.writeFile(abs, lines.join("\n"), "utf8")
      touchedFiles++
      if (verbose) console.log(`    rewrote ${file}`)
    }
  }
  console.log(`  fixed internal links: ${rewrittenLinks} rewrites across ${touchedFiles} file(s)`)
}

/**
 * Restore upstream frontmatter parity by stripping `title` / `description`
 * fields the migration auto-injected onto pages that had none upstream. We
 * only act when:
 *
 *  - Upstream had the field absent or empty string.
 *  - The current value looks auto-injected, i.e. equals the slug-as-string
 *    (which is what `patchFrontmatter` writes) or an empty quoted string.
 *
 * This is conservative on purpose: any human-edited title or description is
 * left untouched. The two values combined cover the OpenAPI auto-title
 * regression that Pass E surfaces, without modifying intentional metadata.
 */
async function applyFrontmatterRestores(
  idx: Indices,
  diffs: FrontmatterDiff[],
  verbose: boolean,
): Promise<void> {
  const {pages, pageBySlug, idToCurrentSlug} = idx
  // Build a one-shot id → PageRecord index by scanning frontmatter. This
  // catches orphaned pages whose `id` exists on disk but isn't referenced
  // by the nav config (and is therefore absent from `idToCurrentSlug`).
  const pageById = new Map<string, PageRecord>()
  for (const p of pages) {
    const m = p.source.match(/^---\n([\s\S]*?)\n---/)
    if (!m) continue
    const idLine = m[1].match(/^id:\s*(.+)$/m)
    if (idLine) pageById.set(idLine[1].trim().replace(/^["']|["']$/g, ""), p)
  }
  // Group diffs by id.
  const byId = new Map<string, FrontmatterDiff[]>()
  for (const d of diffs) {
    const arr = byId.get(d.id) ?? []
    arr.push(d)
    byId.set(d.id, arr)
  }
  let touched = 0
  for (const [id, ds] of byId) {
    const page =
      pageById.get(id) ??
      (idToCurrentSlug.get(id) ? pageBySlug.get(idToCurrentSlug.get(id)!) : undefined)
    if (!page) continue
    const original = await fsp.readFile(page.abs, "utf8")
    const fmMatch = original.match(/^---\n([\s\S]*?)\n---/)
    if (!fmMatch) continue
    let fm = fmMatch[1]
    const slugAsId = page.rel
      .replace(/^content\/docs\//, "")
      .replace(/\.mdx$/, "")
      .replace(/\/index$/, "")
    let mutated = false
    for (const d of ds) {
      const upstreamEmpty = !d.upstream || d.upstream === ""
      if (!upstreamEmpty) continue
      // Match the field's full line, capture the value.
      const re = new RegExp(`^${d.field}:\\s*"([^"]*)"\\s*$`, "m")
      const m = fm.match(re)
      if (!m) continue
      const value = m[1]
      const isAutoTitle = d.field === "title" && value === slugAsId
      const isAutoEmpty = d.field === "description" && value === ""
      if (isAutoTitle || isAutoEmpty) {
        fm = fm.replace(re, "").replace(/\n{2,}/g, "\n")
        mutated = true
      }
    }
    if (mutated) {
      const next = original.replace(
        /^---\n[\s\S]*?\n---/,
        `---\n${fm.trim()}\n---`,
      )
      if (next !== original) {
        await fsp.writeFile(page.abs, next, "utf8")
        touched++
        if (verbose) console.log(`    restored frontmatter: ${page.rel}`)
      }
    }
  }
  console.log(`  fixed frontmatter: ${touched} file(s) restored to upstream parity`)
}

/**
 * Replace exactly one occurrence of a link on a line. Matches the link in
 * the three textual shapes we extract: markdown link target, href="…", and
 * src="…". The replacement preserves the surrounding bracketed/quoted form.
 */
function replaceLinkOnLine(line: string, from: string, to: string): string {
  const fromEsc = escapeRegex(from)
  // Markdown link: ](from) or ](from "title")
  const md = new RegExp(`\\]\\(${fromEsc}(?=[)\\s])`)
  if (md.test(line)) return line.replace(md, `](${to}`)
  // Attribute forms
  const dq = new RegExp(`(href|src)\\s*=\\s*"${fromEsc}"`)
  if (dq.test(line)) return line.replace(dq, (_m, attr: string) => `${attr}="${to}"`)
  const sq = new RegExp(`(href|src)\\s*=\\s*'${fromEsc}'`)
  if (sq.test(line)) return line.replace(sq, (_m, attr: string) => `${attr}='${to}'`)
  return line
}

// `pathToFileURL` was used in the legacy validator; not yet consumed in this
// rewrite, but kept around so a future runtime sitemap import can drop in
// without re-introducing the dependency. Silence the unused warning.
void pathToFileURL

void main().catch(err => {
  console.error(err)
  process.exit(1)
})

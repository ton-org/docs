#!/usr/bin/env node
/**
 * Mintlify -> Fumadocs content migration.
 *
 * What it does:
 *   1. Walks every `.mdx` / `.md` file at the repo root (excluding `next/`).
 *   2. Computes each file's immutable `id` (= its upstream path minus `.mdx`)
 *      and stamps it into the frontmatter if not already present.
 *   3. Looks up the page's current canonical slug in `navigation.config.json`
 *      (via `resolveCurrentSlug`). Falls back to `id == slug` when the config
 *      doesn't reference the id (first run / new upstream pages).
 *   4. Normalises frontmatter, removes legacy `import { ... } from "/snippets/..."`
 *      lines, translates `:::admonition` blocks to JSX `<Aside>` components.
 *   5. Writes the file to `next/content/docs/<currentSlug>.mdx`.
 *   6. Mirrors referenced asset folders (`resources/{images,logo,pdfs,tvm,videos}/`)
 *      from the repo root into `next/public/resources/` so Next.js can serve
 *      `/resources/...` URLs statically. Deterministic: each destination
 *      subfolder is wiped and re-copied on every run.
 *   7. Seeds `next/redirects.mjs` from the legacy `redirects` block in docs.json
 *      (idempotent, deduplicated, sorted).
 *
 * meta.json files are no longer this script's responsibility — they are owned
 * by `scripts/apply-nav.mjs`, the sole writer of the navigation layout.
 */
import {promises as fs} from "node:fs"
import path from "node:path"
import {
  CONTENT_ROOT,
  DOCS_JSON_PATH,
  NEXT_ROOT,
  REPO_ROOT,
  getFrontmatterField,
  isGroup,
  isLink,
  isPage,
  parseFrontmatter,
  readConfig,
  readRedirects,
  resolveCurrentSlug,
  stampId,
  writeConfig,
  writeRedirects,
} from "./nav-config.mjs"

/**
 * Subfolders under `<repo>/resources/` that are referenced from MDX (via
 * `/resources/<sub>/...` paths). These are mirrored into
 * `<repo>/next/public/resources/<sub>/` so Next.js can serve them statically.
 *
 * Tooling-only subfolders such as `dictionaries/` and `grammars/` are
 * intentionally excluded.
 */
const PUBLIC_ASSET_SUBDIRS = ["images", "logo", "pdfs", "tvm", "videos"]

const ROOT_FILES = new Set([
  "index", // becomes the Next.js landing route, not a docs page
])

const VERBOSE = process.argv.includes("--verbose")
const DRY_RUN = process.argv.includes("--dry-run")

function log(...args) {
  if (VERBOSE) console.log(...args)
}

async function readJson(file) {
  const raw = await fs.readFile(file, "utf8")
  return JSON.parse(raw)
}

async function writeFile(file, contents) {
  if (DRY_RUN) {
    log("[dry-run] write", path.relative(REPO_ROOT, file))
    return
  }
  await fs.mkdir(path.dirname(file), {recursive: true})
  await fs.writeFile(file, contents, "utf8")
}

async function removeFile(file) {
  if (DRY_RUN) {
    log("[dry-run] remove", path.relative(REPO_ROOT, file))
    return
  }
  try {
    await fs.unlink(file)
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code !== "ENOENT") throw err
  }
}

function stripSnippetImports(source) {
  return source
    .replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']\/snippets\/[^"']+["'];?\s*$/gm, "")
    .replace(/^\s*import\s*\{[^}]*\}\s*from\s*["'][^"']*\/snippets\/[^"']+["'];?\s*$/gm, "")
    .replace(/^(\s*\n){3,}/gm, "\n\n")
}

/**
 * Translate `:::kind ...:::` admonition blocks into JSX `<Aside>` components so
 * the docs no longer need remark-directive (which mis-parsed inline colon pairs
 * like `14:30 UTC`).
 */
function translateAdmonitions(source) {
  return source.replace(
    /^:::(note|tip|caution|danger|info|warning|warn)([^\n]*)\n([\s\S]*?)^:::\s*$/gm,
    (_match, kind, header, body) => {
      const trimmed = header.trim()
      const titleAttr = trimmed ? ` title="${trimmed.replace(/"/g, "&quot;")}"` : ""
      const type =
        kind === "note" || kind === "info"
          ? "note"
          : kind === "tip"
            ? "tip"
            : kind === "caution" || kind === "warning" || kind === "warn"
              ? "caution"
              : "danger"
      return `<Aside type="${type}"${titleAttr}>\n\n${body.trimEnd()}\n\n</Aside>`
    },
  )
}

/**
 * Patch frontmatter:
 *   - Drop legacy `mode: "custom"` (those pages are rebuilt as native routes).
 *   - Rename quoted `"og:image"` / `"twitter:image"` keys to YAML-friendly forms.
 *   - Ensure every page has a `title` and `description`.
 */
function patchFrontmatter(source, slug) {
  const fmMatch = source.match(/^---\n([\s\S]*?)\n---/)
  if (!fmMatch) return source

  let fm = fmMatch[1]

  fm = fm.replace(/^mode:\s*["']custom["']\s*$/m, "")
  fm = fm.replace(/^"og:image":/m, "ogImage:")
  fm = fm.replace(/^"twitter:image":/m, "twitterImage:")

  if (!/^description:/m.test(fm) && !/^title:/m.test(fm)) {
    fm = `title: "${slug}"\n${fm}`
  }
  if (!/^description:/m.test(fm)) {
    fm += '\ndescription: ""'
  }

  return source.replace(/^---\n[\s\S]*?\n---/, `---\n${fm.trim()}\n---`)
}

async function discoverMdxFiles(root, dir = "") {
  /** @type {string[]} */
  const out = []
  let entries
  try {
    entries = await fs.readdir(path.join(root, dir), {withFileTypes: true})
  } catch {
    return out
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  for (const e of entries) {
    if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "next") continue
    const rel = path.posix.join(dir, e.name)
    if (e.isDirectory()) {
      out.push(...(await discoverMdxFiles(root, rel)))
    } else if (e.name.endsWith(".mdx")) {
      out.push(rel)
    }
  }
  return out
}

/**
 * Mintlify pages with a `url:` frontmatter pointing somewhere outside the docs
 * are sidebar shortcuts to external content, not routable pages. Anything with
 * a scheme (`https:`, `mailto:`, `tel:`, ...) or that starts with `//` is
 * external; relative paths like `/some/page` stay as regular pages.
 *
 * @param {string} value
 * @returns {boolean}
 */
function isExternalUrl(value) {
  if (typeof value !== "string" || !value) return false
  return /^(?:[a-z][a-z0-9+.\-]*:|\/\/)/i.test(value) && !value.startsWith("/")
}

/**
 * @typedef {{kind: "page", id: string, currentSlug: string, sourceRel: string, destAbs: string}} MigratedPage
 * @typedef {{kind: "external", id: string, sourceRel: string, title: string, url: string, icon: string | undefined}} MigratedExternal
 * @typedef {MigratedPage | MigratedExternal} MigratedFile
 *
 * @param {string} repoRel  Path relative to REPO_ROOT (e.g. `ecosystem/appkit/overview.mdx`).
 * @param {import("./nav-config.mjs").NavConfig | null} navConfig
 * @returns {Promise<MigratedFile | null>}
 */
async function migrateFile(repoRel, navConfig) {
  const id = repoRel.replace(/\.mdx$/, "")
  if (ROOT_FILES.has(id)) {
    log("skip root", repoRel, "(rebuilt as app/page.tsx)")
    return null
  }

  const upstreamAbs = path.join(REPO_ROOT, repoRel)
  const raw = await fs.readFile(upstreamAbs, "utf8")

  // 1. Compute the canonical disk slug from the config (fallback: id == slug).
  const resolvedSlug = navConfig ? resolveCurrentSlug(id, navConfig) : undefined
  const currentSlug = resolvedSlug ?? id

  // 1b. Short-circuit external-link pages. Mintlify treats a frontmatter `url:`
  //     pointing to an external URL as a sidebar shortcut, so we never want
  //     these as routable Fumadocs pages. Remove any stale on-disk copy and
  //     report the entry so the caller can rewrite the nav config.
  const rawUrl = getFrontmatterField(raw, "url")
  if (rawUrl && isExternalUrl(rawUrl)) {
    const title = getFrontmatterField(raw, "title") ?? id
    const icon = getFrontmatterField(raw, "icon") || undefined
    const candidates = new Set([
      path.join(CONTENT_ROOT, `${currentSlug}.mdx`),
      path.join(CONTENT_ROOT, `${id}.mdx`),
    ])
    for (const candidate of candidates) {
      if (await pathExists(candidate)) {
        const existing = await fs.readFile(candidate, "utf8")
        const existingId = parseFrontmatter(existing).id ?? id
        if (existingId === id) await removeFile(candidate)
      }
    }
    return {kind: "external", id, sourceRel: repoRel, title, url: rawUrl, icon}
  }

  // 2. Stamp id into the frontmatter (no-op if already present), then apply
  //    legacy transforms.
  const stamped = stampId(raw, id)
  const transformed = patchFrontmatter(
    translateAdmonitions(stripSnippetImports(stamped)),
    currentSlug,
  )

  const destAbs = path.join(CONTENT_ROOT, `${currentSlug}.mdx`)
  await writeFile(destAbs, transformed)

  // 3. If the config has moved this id away from its default location, remove
  //    any stale copy that still lives at the upstream path inside content/docs.
  if (resolvedSlug && resolvedSlug !== id) {
    const stale = path.join(CONTENT_ROOT, `${id}.mdx`)
    if (stale !== destAbs) {
      const exists = await pathExists(stale)
      if (exists) {
        const staleContent = await fs.readFile(stale, "utf8")
        const staleId = parseFrontmatter(staleContent).id
        if (staleId === id) await removeFile(stale)
      }
    }
  }

  return {kind: "page", id, currentSlug, sourceRel: repoRel, destAbs}
}

async function pathExists(p) {
  try {
    await fs.stat(p)
    return true
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === "ENOENT") return false
    throw err
  }
}

/**
 * Stamp every existing file under content/docs/ that's missing an id. This is
 * a separate pass so even pages that don't have an upstream counterpart (added
 * directly in the Fumadocs tree, or moved by the editor) get an id.
 */
async function backfillIds() {
  /** @type {string[]} */
  const stamped = []
  await walk(CONTENT_ROOT, "")

  async function walk(root, rel) {
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
        await walk(root, childRel)
      } else if (entry.isFile() && entry.name.endsWith(".mdx")) {
        const abs = path.join(root, childRel)
        const raw = await fs.readFile(abs, "utf8")
        const {id} = parseFrontmatter(raw)
        if (!id) {
          const newId = childRel.replace(/\.mdx$/, "")
          const next = stampId(raw, newId)
          if (next !== raw) {
            await writeFile(abs, next)
            stamped.push(newId)
          }
        }
      }
    }
  }
  return stamped
}

/**
 * Mirror referenced asset folders from `<repo>/resources/<sub>/` into
 * `<repo>/next/public/resources/<sub>/`. The mirror is deterministic and
 * idempotent: each destination subfolder is wiped, then re-copied byte-for-byte
 * from upstream. Upstream removals therefore propagate, and re-running the
 * migration always yields the same tree.
 *
 * Only `PUBLIC_ASSET_SUBDIRS` are mirrored; anything else already under
 * `next/public/` (favicon, og/, logo-*.svg, ...) is left untouched.
 */
async function mirrorPublicAssets() {
  const publicResources = path.join(NEXT_ROOT, "public", "resources")
  let copied = 0
  let skipped = 0
  for (const sub of PUBLIC_ASSET_SUBDIRS) {
    const src = path.join(REPO_ROOT, "resources", sub)
    const dest = path.join(publicResources, sub)
    if (!(await pathExists(src))) {
      skipped++
      log(`  skip resources/${sub} (no upstream)`)
      continue
    }
    if (DRY_RUN) {
      log(`[dry-run] mirror resources/${sub} -> next/public/resources/${sub}`)
      copied++
      continue
    }
    await fs.rm(dest, {recursive: true, force: true})
    await fs.mkdir(dest, {recursive: true})
    await fs.cp(src, dest, {recursive: true})
    copied++
  }
  console.log(
    `  assets: ${copied} folder(s) mirrored to next/public/resources/` +
      (skipped ? ` (${skipped} skipped)` : ""),
  )
}

/**
 * @param {{redirects?: Array<{source: string, destination: string, permanent?: boolean}>}} docsJson
 */
async function seedRedirects(docsJson) {
  const fromDocsJson = (docsJson.redirects ?? []).map(r => ({
    source: r.source,
    destination: r.destination,
    permanent: r.permanent ?? true,
  }))

  // Preserve any editor-appended entries already in redirects.mjs.
  const existing = await readRedirects()
  const merged = [...fromDocsJson, ...existing]
  await writeRedirects(merged)
  console.log(
    `  redirects: ${fromDocsJson.length} from docs.json + ${existing.length} editor-added (deduped)`,
  )
}

async function main() {
  console.log(
    `Migrating Mintlify content from ${REPO_ROOT} -> ${path.relative(REPO_ROOT, CONTENT_ROOT)}`,
  )
  if (DRY_RUN) console.log("(dry-run - no files will be written)")

  const docs = await readJson(DOCS_JSON_PATH)
  const navConfig = await readConfig()
  if (navConfig) {
    console.log(`  using navigation.config.json (${navConfig.tabs?.length ?? 0} tabs)`)
  } else {
    console.log("  navigation.config.json not present; routing by id == slug")
  }

  const allMdx = await discoverMdxFiles(REPO_ROOT)
  console.log(`  discovered: ${allMdx.length} .mdx files`)

  let migrated = 0
  let moved = 0
  /** @type {Map<string, MigratedExternal>} */
  const externals = new Map()
  for (const rel of allMdx) {
    if (rel.startsWith("next/")) {
      log("skip", rel)
      continue
    }
    const result = await migrateFile(rel, navConfig)
    if (!result) continue
    if (result.kind === "external") {
      externals.set(result.id, result)
      continue
    }
    migrated++
    if (result.currentSlug !== result.id) moved++
  }
  console.log(`  migrated: ${migrated} pages (${moved} routed via config)`)
  if (externals.size > 0) {
    console.log(`  external: ${externals.size} page(s) with url: frontmatter (not written to content/docs)`)
  }

  const backfilled = await backfillIds()
  if (backfilled.length > 0) {
    console.log(`  stamped id into ${backfilled.length} existing files lacking one`)
  }

  if (navConfig && externals.size > 0) {
    await rewriteExternalPagesAsLinks(navConfig, externals)
  }

  await mirrorPublicAssets()
  await seedRedirects(docs)
}

/**
 * Walk `navigation.config.json` and replace any `PageRef` whose id is in
 * `externals` with a `LinkRef` (preserving icon, tag, and array position).
 * Persists via `writeConfig` only if the tree actually changed.
 *
 * @param {import("./nav-config.mjs").NavConfig} config
 * @param {Map<string, MigratedExternal>} externals
 */
async function rewriteExternalPagesAsLinks(config, externals) {
  let converted = 0

  /** @param {import("./nav-config.mjs").NavEntry[]} entries */
  function walk(entries) {
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      if (isGroup(entry)) {
        walk(entry.pages ?? [])
        continue
      }
      if (isLink(entry)) continue
      if (!isPage(entry)) continue
      const ext = externals.get(entry.id)
      if (!ext) continue
      /** @type {import("./nav-config.mjs").LinkRef} */
      const link = {
        type: "link",
        name: entry.title ?? ext.title,
        url: ext.url,
      }
      const icon = entry.icon ?? ext.icon
      if (icon !== undefined) link.icon = icon
      if (entry.tag !== undefined) link.tag = entry.tag
      entries[i] = link
      converted++
    }
  }

  for (const tab of config.tabs ?? []) walk(tab.pages ?? [])

  if (converted === 0) return
  if (DRY_RUN) {
    log(`[dry-run] would convert ${converted} PageRef -> LinkRef in navigation.config.json`)
    return
  }
  await writeConfig(config)
  console.log(`  rewrote ${converted} page entr${converted === 1 ? "y" : "ies"} as external link(s) in navigation.config.json`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

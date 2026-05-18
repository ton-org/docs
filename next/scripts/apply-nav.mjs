#!/usr/bin/env node
/**
 * Apply `navigation.config.json` to the on-disk Fumadocs layout.
 *
 * Phases per run:
 *   1. Load `navigation.config.json`. Seed from `docs.json` + filesystem on first run.
 *   2. Build an id index by reading every .mdx frontmatter under content/docs/.
 *   3. Validate the config: referenced ids exist, no duplicate canonical URLs,
 *      tabs/groups have valid slugs.
 *   4. Plan filesystem moves: for each config page, compare its canonical URL
 *      to the current on-disk slug. Collect `{id, from, to}` deltas.
 *   5. Apply moves (`fs.rename`), prune empty directories afterwards.
 *   6. Emit one `meta.json` per directory, ordered by config; tabs get `root: true`.
 *   7. Append `{source, destination, permanent: true}` entries to `redirects.mjs`
 *      for each move (deduped).
 *   8. Cross-check: any on-disk id not referenced in the config is logged.
 *      Non-zero exit unless `--allow-orphans` is passed.
 *
 * Flags:
 *   --dry-run         print the plan, write nothing
 *   --allow-orphans   exit 0 even when orphans are present
 *   --no-redirects    skip writing redirects (used by tests)
 *   --verbose         extra logging
 */
import {promises as fs} from "node:fs"
import path from "node:path"
import {
  CONTENT_ROOT,
  DOCS_JSON_PATH,
  NAV_BACKUP_DIR,
  NAV_OVERLAYS_PATH,
  REPO_ROOT,
  attachOrphansToConfig,
  buildIdIndex,
  collectReferencedIds,
  getFrontmatterField,
  isExternalTab,
  isGroup,
  isInternalTab,
  isLink,
  isPage,
  parseFrontmatter,
  readConfig,
  readRedirects,
  resolveCurrentSlug,
  seedConfigFromDocsJson,
  setFrontmatterField,
  stampId,
  walkPages,
  writeConfig,
  writeRedirects,
} from "./nav-config.mjs"
import {stableStringify} from "../src/lib/stable-stringify"

const DRY_RUN = process.argv.includes("--dry-run")
const ALLOW_ORPHANS = process.argv.includes("--allow-orphans")
const NO_REDIRECTS = process.argv.includes("--no-redirects")
const VERBOSE = process.argv.includes("--verbose")

const log = (...args) => VERBOSE && console.log(...args)

async function main() {
  console.log(`apply-nav: ${path.relative(REPO_ROOT, CONTENT_ROOT)}`)
  if (DRY_RUN) console.log("(dry-run - no files will be written)")

  // -------------------------------------------------------------------------
  // 1. Load (or seed) config. Seeding is deferred until after we've built the
  //    id index so we can attach orphan .mdx files (OpenAPI-generated pages,
  //    new files added post-Mintlify) to the deepest matching folder-backed
  //    group automatically.
  // -------------------------------------------------------------------------
  let config = await readConfig()
  const isFirstRun = !config

  // -------------------------------------------------------------------------
  // 2. Build id index from content/docs/**/*.mdx frontmatter.
  // -------------------------------------------------------------------------
  await ensureIdsStamped()
  const {idToSlug, unstamped, duplicates} = await buildIdIndex()
  if (!DRY_RUN && unstamped.length > 0) {
    console.warn(`  warning: ${unstamped.length} file(s) still missing an id after backfill`)
  }
  if (duplicates.length > 0) {
    console.error("  duplicate ids detected:")
    for (const {id, slugs} of duplicates) {
      console.error(`    ${id}: ${slugs.join(", ")}`)
    }
    process.exit(1)
  }

  if (isFirstRun) {
    console.log("  no navigation.config.json found; seeding from docs.json + filesystem...")
    const docs = await readJson(DOCS_JSON_PATH)
    config = seedConfigFromDocsJson(docs)
    attachOrphansToConfig(config, idToSlug.keys())
    if (!DRY_RUN) await writeConfig(config)
    console.log(`  seeded ${config.tabs.length} tab(s) (${idToSlug.size} pages)`)
  } else {
    console.log(`  loaded ${config.tabs.length} tab(s)`)
  }

  // -------------------------------------------------------------------------
  // 3. Validate config.
  // -------------------------------------------------------------------------
  const validationErrors = validateConfig(config, idToSlug)
  if (validationErrors.length > 0) {
    console.error("  config validation failed:")
    for (const err of validationErrors) console.error(`    ${err}`)
    process.exit(1)
  }

  // -------------------------------------------------------------------------
  // 4. Plan filesystem moves.
  // -------------------------------------------------------------------------
  const moves = planMoves(config, idToSlug)
  if (moves.length > 0) {
    console.log(`  ${moves.length} move(s) planned:`)
    for (const m of moves) console.log(`    ${m.from} -> ${m.to}`)
  }
  if (DRY_RUN) {
    console.log("\n(dry-run finished without writing)")
    return
  }

  // -------------------------------------------------------------------------
  // 5. Apply moves.
  // -------------------------------------------------------------------------
  const movedIds = new Set()
  for (const move of moves) {
    await applyMove(move)
    movedIds.add(move.id)
  }
  await pruneEmptyDirs(CONTENT_ROOT)

  // -------------------------------------------------------------------------
  // 5b. Patch per-page frontmatter overrides (title, icon) from the config.
  //
  //   The editor stores `page.title` / `page.icon` as overrides. We layer
  //   them onto the .mdx frontmatter so the rendered sidebar, page H1, and
  //   breadcrumb all reflect the user's edits. Idempotent — files unchanged
  //   when overrides already match the on-disk value.
  //
  //   The editor uses `page.icon === ""` as an explicit-clear sentinel:
  //   the user clicked "No icon" on a page whose MDX carried an `icon:`
  //   line. We strip the line from the .mdx so the rendered sidebar drops
  //   the icon too. Pages without an override (no `page.icon` key at all)
  //   stay untouched — only the user's explicit edits flow through.
  // -------------------------------------------------------------------------
  await patchPageFrontmatter(config)

  // -------------------------------------------------------------------------
  // 6. Emit meta.json.
  // -------------------------------------------------------------------------
  await emitMetaTree(config)

  // -------------------------------------------------------------------------
  // 7. Append redirects.
  // -------------------------------------------------------------------------
  if (!NO_REDIRECTS && moves.length > 0) {
    const existing = await readRedirects()
    const next = [
      ...existing,
      ...moves.map(m => ({
        source: `/${m.from}`,
        destination: `/${m.to}`,
        permanent: true,
      })),
    ]
    await writeRedirects(next)
    console.log(`  appended ${moves.length} redirect(s); total entries: ${dedupCount(next)}`)
  }

  // -------------------------------------------------------------------------
  // 8. Cross-check orphans.
  // -------------------------------------------------------------------------
  const referenced = collectReferencedIds(config)
  const orphans = []
  for (const id of idToSlug.keys()) {
    if (!referenced.has(id)) orphans.push(id)
  }
  if (orphans.length > 0) {
    console.warn(`  ${orphans.length} orphaned id(s) on disk (not referenced in config):`)
    for (const id of orphans.slice(0, 20)) console.warn(`    ${id}`)
    if (orphans.length > 20) console.warn(`    ... and ${orphans.length - 20} more`)
    if (!ALLOW_ORPHANS) {
      console.error("  pass --allow-orphans to ignore.")
      process.exit(1)
    }
  }

  console.log("apply-nav: done")
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function readJson(file) {
  const raw = await fs.readFile(file, "utf8")
  return JSON.parse(raw)
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

function dedupCount(arr) {
  return new Set(arr.map(r => r.source)).size
}

/**
 * Validate the config. Returns a list of human-readable error strings.
 * @param {import("./nav-config.mjs").NavConfig} config
 * @param {Map<string, string>} idToSlug
 * @returns {string[]}
 */
function validateConfig(config, idToSlug) {
  /** @type {string[]} */
  const errors = []

  if (!Array.isArray(config.tabs)) {
    errors.push("config.tabs must be an array")
    return errors
  }

  const seenTabIds = new Set()
  const seenCanonicalSlugs = new Map()
  const seenIds = new Map()

  for (const tab of config.tabs) {
    if (!tab.id || typeof tab.id !== "string") errors.push(`tab has no id: ${JSON.stringify(tab.title)}`)
    if (typeof tab.title !== "string" || !tab.title.trim()) errors.push(`tab "${tab.id}" has no title`)
    if (seenTabIds.has(tab.id)) errors.push(`duplicate tab id: ${tab.id}`)
    seenTabIds.add(tab.id)
    if (isExternalTab(tab)) {
      // External tabs are pure outbound URLs — no slug / pages to validate.
      if (typeof tab.url !== "string" || !tab.url.trim()) {
        errors.push(`external tab "${tab.id}" has no url`)
      }
      continue
    }
    if (typeof tab.slug !== "string") errors.push(`tab "${tab.id}" missing slug (use "" for root)`)
    validateEntries(tab.pages ?? [], errors, [tab.slug].filter(Boolean), `tab "${tab.id}"`)
  }

  walkPages(config, (page, slug) => {
    if (seenCanonicalSlugs.has(slug)) {
      const other = seenCanonicalSlugs.get(slug)
      errors.push(`duplicate canonical URL "/${slug}" for ids "${other}" and "${page.id}"`)
    } else {
      seenCanonicalSlugs.set(slug, page.id)
    }
    if (seenIds.has(page.id)) {
      const other = seenIds.get(page.id)
      errors.push(`id "${page.id}" appears twice in config (at "/${other}" and "/${slug}")`)
    } else {
      seenIds.set(page.id, slug)
    }
    if (!idToSlug.has(page.id)) {
      errors.push(`id "${page.id}" referenced in config but no .mdx on disk`)
    }
  })

  return errors
}

function validateEntries(entries, errors, slugStack, context) {
  if (!Array.isArray(entries)) {
    errors.push(`${context} has non-array pages`)
    return
  }
  for (const entry of entries) {
    if (isLink(entry)) {
      if (!entry.name || !entry.url) errors.push(`${context} link missing name or url`)
      continue
    }
    if (isGroup(entry)) {
      if (typeof entry.group !== "string" || !entry.group.trim()) {
        errors.push(`${context} group entry missing "group" title`)
      }
      const next = entry.slug ? [...slugStack, entry.slug] : slugStack
      validateEntries(entry.pages ?? [], errors, next, `${context} > "${entry.group}"`)
      continue
    }
    if (isPage(entry)) {
      if (!entry.id || typeof entry.id !== "string") {
        errors.push(`${context} page entry missing id`)
      }
      continue
    }
    errors.push(`${context} has unrecognised entry: ${JSON.stringify(entry).slice(0, 80)}`)
  }
}

/**
 * Plan filesystem moves: every page whose canonical URL differs from its
 * current disk slug. Results are sorted (parents before children) so renames
 * apply without colliding.
 * @param {import("./nav-config.mjs").NavConfig} config
 * @param {Map<string, string>} idToSlug
 */
function planMoves(config, idToSlug) {
  /** @type {Array<{id: string, from: string, to: string}>} */
  const moves = []
  walkPages(config, (page, canonical) => {
    const current = idToSlug.get(page.id)
    if (current && current !== canonical) {
      moves.push({id: page.id, from: current, to: canonical})
    }
  })
  moves.sort((a, b) => a.from.localeCompare(b.from))
  return moves
}

/**
 * @param {{id: string, from: string, to: string}} move
 */
async function applyMove(move) {
  const src = path.join(CONTENT_ROOT, `${move.from}.mdx`)
  const dst = path.join(CONTENT_ROOT, `${move.to}.mdx`)
  if (src === dst) return
  await fs.mkdir(path.dirname(dst), {recursive: true})
  if (await pathExists(dst)) {
    // Destination already occupied: read its id; if it matches the move id,
    // we just delete the source (target is already correct). Otherwise refuse.
    const existingRaw = await fs.readFile(dst, "utf8")
    const existingId = parseFrontmatter(existingRaw).id
    if (existingId === move.id) {
      await fs.unlink(src)
      log(`  reconciled duplicate at ${move.to}.mdx (kept destination)`)
      return
    }
    throw new Error(
      `cannot move ${move.from} -> ${move.to}: destination already exists with id "${existingId}"`,
    )
  }
  await fs.rename(src, dst)
  log(`  moved ${move.from}.mdx -> ${move.to}.mdx`)
}

/**
 * Walk every page in the config; for any page that carries a `title` or `icon`
 * override, reconcile the corresponding .mdx frontmatter. No-ops when the file
 * already agrees with the override (cheap re-runs).
 *
 * Override semantics:
 *   - `undefined` / missing key → no override (frontmatter untouched).
 *   - non-empty string         → write this value into frontmatter.
 *   - empty string `""`        → editor's explicit-clear sentinel; remove the
 *                                frontmatter line entirely.
 *
 * @param {import("./nav-config.mjs").NavConfig} config
 */
async function patchPageFrontmatter(config) {
  /** @type {Array<{slug: string, titleOp: {value: string | undefined} | null, iconOp: {value: string | undefined} | null}>} */
  const toPatch = []
  walkPages(config, (page, slug) => {
    const titleOp = overrideOp(page.title)
    const iconOp = overrideOp(page.icon)
    if (!titleOp && !iconOp) return
    toPatch.push({slug, titleOp, iconOp})
  })

  let touched = 0
  let cleared = 0
  for (const {slug, titleOp, iconOp} of toPatch) {
    const file = path.join(CONTENT_ROOT, `${slug}.mdx`)
    let raw
    try {
      raw = await fs.readFile(file, "utf8")
    } catch (err) {
      if (/** @type {NodeJS.ErrnoException} */ (err).code === "ENOENT") {
        log(`  skip frontmatter patch: ${slug}.mdx missing`)
        continue
      }
      throw err
    }

    let next = raw
    if (titleOp && getFrontmatterField(next, "title") !== titleOp.value) {
      next = setFrontmatterField(next, "title", titleOp.value)
    }
    if (iconOp && getFrontmatterField(next, "icon") !== iconOp.value) {
      next = setFrontmatterField(next, "icon", iconOp.value)
      if (iconOp.value === undefined) cleared++
    }
    if (next !== raw) {
      if (!DRY_RUN) await fs.writeFile(file, next, "utf8")
      touched++
    }
  }

  if (touched > 0) {
    const tail = cleared > 0 ? ` (${cleared} icon clear${cleared === 1 ? "" : "s"})` : ""
    console.log(`  patched frontmatter on ${touched} page(s)${tail}`)
  }
}

/**
 * Translate a config override into a write op for `patchPageFrontmatter`.
 *   - `undefined` / non-string  → null (skip the field)
 *   - non-empty string         → {value: trimmed}  (set the field)
 *   - empty / whitespace string → {value: undefined} (remove the field)
 *
 * The empty-string sentinel is the editor's "user explicitly cleared this"
 * marker. Apply-nav honours it by stripping the frontmatter line so the
 * rendered sidebar drops the icon, then the config keeps the `""` value
 * so subsequent `migrate-content && apply-nav` runs re-clear any icon
 * upstream tries to re-introduce.
 *
 * @param {unknown} raw
 * @returns {{value: string | undefined} | null}
 */
function overrideOp(raw) {
  if (typeof raw !== "string") return null
  const trimmed = raw.trim()
  if (trimmed === "") return {value: undefined}
  return {value: trimmed}
}

/**
 * Walk the tree bottom-up; remove any directory that's empty.
 */
async function pruneEmptyDirs(root) {
  await walk(root)
  async function walk(dir) {
    let entries
    try {
      entries = await fs.readdir(dir, {withFileTypes: true})
    } catch {
      return false
    }
    for (const entry of entries) {
      if (entry.isDirectory()) await walk(path.join(dir, entry.name))
    }
    // Re-read; some children may have been removed.
    const after = await fs.readdir(dir).catch(() => /** @type {string[]} */ ([]))
    if (after.length === 0 && dir !== root) {
      await fs.rmdir(dir).catch(() => {})
      return true
    }
    return false
  }
}

// ---------------------------------------------------------------------------
// Meta tree emission
// ---------------------------------------------------------------------------

/**
 * Resolve how a folder-backed group should render in the sidebar.
 *
 * Three modes:
 *   - `flatten` — emit `---Title---` + `...slug` in the parent's meta so
 *     Fumadocs inlines the folder's children as siblings of the parent at
 *     the same depth. Default for top-level-in-tab groups.
 *   - `section` — emit the folder reference and mark the folder's own meta
 *     with `collapsible: false`. The `SidebarFolderWithTag` wrapper renders
 *     such folders with separator-styled, non-clickable triggers, keeping
 *     children visibly nested. Default for sub-groups whose `pages` list
 *     includes a `slug: ""` "intro" page (so the sibling orphan re-parented
 *     by `source.ts` gets a visible header).
 *   - `folder` — emit just the folder reference. Default for sub-groups
 *     without an intro page.
 *
 * Per-group overrides:
 *   - `GroupRef.mode` (preferred, fine-grained).
 *   - `GroupRef.flatten` (legacy boolean: `true` → flatten, `false` → folder).
 *
 * @param {import("./nav-config.mjs").GroupRef} entry
 * @param {{isTopLevelInTab: boolean}} ctx
 * @returns {"flatten" | "section" | "folder"}
 */
function resolveGroupMode(entry, ctx) {
  if (entry.mode === "flatten" || entry.mode === "section" || entry.mode === "folder") {
    return entry.mode
  }
  if (entry.flatten === true) return "flatten"
  if (entry.flatten === false) return "folder"
  if (ctx.isTopLevelInTab) return "flatten"
  const hasIntroPage = (entry.pages ?? []).some(
    (child) => isPage(child) && child.slug === "",
  )
  return hasIntroPage ? "section" : "folder"
}

/**
 * @typedef {{title?: string, icon?: string, defaultOpen?: boolean, collapsible?: boolean, root?: boolean, order: string[]}} DirMeta
 *
 * @param {import("./nav-config.mjs").NavConfig} config
 */
async function emitMetaTree(config) {
  /** @type {Map<string, DirMeta>} */
  const dirs = new Map()
  /**
   * `meta.json` itself cannot carry a `tag` on links, folder nodes, or pages
   * whose tag lives only in `navigation.config.json` (not in their MDX
   * frontmatter). We side-car the editor-stored tags here so `source.ts` can
   * decorate the page tree at load time.
   *
   * Keys:
   *   - `tagByItemUrl`: canonical Fumadocs URL of pages (e.g. `/start-here`)
   *      and verbatim URL of external links (e.g. `https://old-docs.ton.org/`).
   *   - `tagByFolderPath`: the folder path Fumadocs passes to
   *      `PageTreeTransformer.folder`, identical to the directory key we use
   *      when emitting `meta.json` (e.g. `ecosystem`, `ecosystem/api`).
   *
   * @type {{tagByItemUrl: Record<string, string>, tagByFolderPath: Record<string, string>}}
   */
  const overlays = {tagByItemUrl: {}, tagByFolderPath: {}}

  function ensureDir(dir) {
    if (!dirs.has(dir)) dirs.set(dir, {order: []})
    return /** @type {DirMeta} */ (dirs.get(dir))
  }

  function setDirMeta(dir, defaults) {
    const d = ensureDir(dir)
    for (const [k, v] of Object.entries(defaults)) {
      if (v !== undefined && /** @type {Record<string, unknown>} */ (d)[k] === undefined) {
        /** @type {Record<string, unknown>} */ (d)[k] = v
      }
    }
  }

  function addEntry(dir, segment) {
    const d = ensureDir(dir)
    if (!d.order.includes(segment)) d.order.push(segment)
  }

  /**
   * Ensure each intermediate directory between `currentFolderDir` and `pageDir`
   * appears in its parent's order list (once). Used so multi-segment page
   * slugs still produce a navigable chain of meta.json files.
   * @param {string} currentFolderDir
   * @param {string} pageDir
   */
  function backfillIntermediateFolders(currentFolderDir, pageDir) {
    if (pageDir === currentFolderDir) return
    if (!pageDir.startsWith(currentFolderDir === "" ? "" : currentFolderDir + "/") && currentFolderDir !== "") {
      return
    }
    const rel = currentFolderDir === "" ? pageDir : pageDir.slice(currentFolderDir.length + 1)
    const segs = rel.split("/")
    let chain = currentFolderDir
    for (const seg of segs) {
      addEntry(chain, seg)
      chain = chain ? `${chain}/${seg}` : seg
    }
  }

  /**
   * @param {import("./nav-config.mjs").NavEntry[]} entries
   * @param {string} currentFolderDir
   * @param {{isTopLevelInTab: boolean}} ctx - top-level = direct child of a tab.
   *   Folder-backed groups whose effective `flatten` flag is true emit
   *   `---Title---` + `...slug` into the parent's pages list instead of just
   *   `slug`, so Fumadocs renders the folder as a section heading with its
   *   children inlined as siblings. The folder's own meta.json is still
   *   written for inner ordering. `flatten` defaults to `true` at top level
   *   and `false` below; an explicit `entry.flatten` overrides the default.
   */
  function walkEntries(entries, currentFolderDir, ctx) {
    for (const entry of entries) {
      if (isLink(entry)) {
        // Fumadocs link syntax: `[external:][[icon]][Name](url)`. The literal
        // `external:` prefix is what flips `node.external = true` (and triggers
        // the trailing-arrow ExternalLink icon in fumadocs-ui's SidebarItem);
        // URL inspection alone won't do it. Always emit the prefix for URLs
        // that have a scheme or start with `//`, so editor-authored external
        // links (and migrate-converted Mintlify `url:` pages) render with the
        // correct affordance.
        const isExternal =
          /^(?:[a-z][a-z0-9+.\-]*:|\/\/)/i.test(entry.url) && !entry.url.startsWith("/")
        const prefix = isExternal ? "external:" : ""
        const iconPart = entry.icon ? `[${entry.icon}]` : ""
        addEntry(currentFolderDir, `${prefix}${iconPart}[${entry.name}](${entry.url})`)
        if (entry.tag) overlays.tagByItemUrl[entry.url] = entry.tag
        continue
      }
      if (isGroup(entry)) {
        if (entry.slug) {
          const groupDir = currentFolderDir ? `${currentFolderDir}/${entry.slug}` : entry.slug
          const mode = resolveGroupMode(entry, ctx)
          if (mode === "flatten") {
            // Folder-backed group rendered as a section heading: emit a
            // separator + extract-prefix pair in the parent so Fumadocs
            // inlines the folder's children as siblings at the parent
            // depth. The folder's own meta.json is still written for inner
            // ordering. Icon is encoded into the separator via Fumadocs'
            // `---[icon]Title---` syntax (loader-CeIUqWDI.js:275) so the
            // top-level section header in the sidebar carries its icon
            // even though it's rendered as a non-clickable separator.
            const sepIcon = entry.icon ? `[${entry.icon}]` : ""
            addEntry(currentFolderDir, `---${sepIcon}${entry.group}---`)
            addEntry(currentFolderDir, `...${entry.slug}`)
          } else {
            // `folder` (regular collapsible) and `section`
            // (non-collapsible, separator-styled header rendered via the
            // custom Sidebar.Folder wrapper in `SidebarItemWithTag.tsx`)
            // both keep the folder as a node in the parent meta. Children
            // therefore stay nested under the folder, getting Fumadocs'
            // depth-based indent for free.
            addEntry(currentFolderDir, entry.slug)
          }
          setDirMeta(groupDir, {
            title: entry.group,
            icon: entry.icon,
            defaultOpen: entry.expanded,
            // `section` mode flips `node.collapsible = false` so the
            // SidebarFolderWithTag wrapper recognises it and styles the
            // trigger like Fumadocs' SidebarSeparator.
            collapsible: mode === "section" ? false : undefined,
          })
          if (entry.tag) overlays.tagByFolderPath[groupDir] = entry.tag
          walkEntries(entry.pages ?? [], groupDir, {isTopLevelInTab: false})
        } else {
          // Sidebar-only group: emits a `---Title---` separator and keeps the
          // same currentFolderDir for its children. Icon embedded via the
          // `---[icon]Title---` separator syntax.
          const sepIcon = entry.icon ? `[${entry.icon}]` : ""
          addEntry(currentFolderDir, `---${sepIcon}${entry.group}---`)
          walkEntries(entry.pages ?? [], currentFolderDir, ctx)
        }
        continue
      }
      if (isPage(entry)) {
        // `slug: ""` marks a Mintlify-style "intro" page whose URL collides
        // with its enclosing group's URL (e.g. `ecosystem/appkit/get-started`
        // sitting inside the Get Started group). The file stays at
        // `<currentFolderDir>.mdx` (sibling of the `<currentFolderDir>/`
        // folder) so its canonical URL `/${currentFolderDir}` stays stable.
        // We deliberately do NOT add it to the parent's `pages` order —
        // Fumadocs would otherwise emit the file as a top-level orphan and
        // also push it via the meta entry, double-rendering it. Instead, the
        // `PageTreeTransformer.root` in `next/src/lib/source.ts` re-parents
        // the orphan into its matching folder node as `children[0]`.
        if (entry.slug === "") {
          if (entry.tag) overlays.tagByItemUrl[`/${currentFolderDir}`] = entry.tag
          continue
        }
        // Page slug may be a multi-segment override; the actual file lives at
        // (currentFolderDir + slug).mdx.
        const slug = entry.slug ?? entry.id.split("/").pop() ?? entry.id
        const canonical = currentFolderDir ? `${currentFolderDir}/${slug}` : slug
        if (entry.tag) overlays.tagByItemUrl[`/${canonical}`] = entry.tag
        const parts = canonical.split("/")
        const leaf = parts[parts.length - 1]
        const pageDir = parts.slice(0, -1).join("/")
        if (pageDir === currentFolderDir) {
          addEntry(currentFolderDir, leaf)
        } else {
          backfillIntermediateFolders(currentFolderDir, pageDir)
          addEntry(pageDir, leaf)
        }
      }
    }
  }

  // Always ensure the root exists so we can put a top-level meta.json there.
  ensureDir("")

  for (const tab of config.tabs) {
    // External tabs are header-strip-only — they have no `pages[]` and no
    // folder on disk. Skip them entirely so the filesystem stays clean.
    if (!isInternalTab(tab)) continue
    // Folder-backed tabs (non-empty slug) appear as a folder reference in the
    // root meta.json. The root-mounted tab (slug "") is the root itself, so
    // there's nothing to append to "" — its directory IS "".
    // if (tab.slug) addEntry("", tab.slug)
    // Every tab — including the empty-slug root-mounted one — gets
    // `root: true` so Fumadocs treats it as a sidebar tab. With this in place,
    // visiting any non-folder-backed page activates the root tab and the full
    // section list shows up under the search bar.
    setDirMeta(tab.slug, {
      title: tab.title,
      icon: tab.icon,
      defaultOpen: tab.defaultOpen,
      root: true,
    })
    walkEntries(tab.pages ?? [], tab.slug, {isTopLevelInTab: true})
  }

  // Append filesystem-discovered children that the config doesn't reference,
  // alphabetically, so Fumadocs still shows them.
  // await appendUnlistedChildren(dirs)

  const ordered = [...dirs.keys()].sort()
  for (const dir of ordered) {
    const info = dirs.get(dir)
    if (!info) continue
    if (info.order.length === 0 && !info.title && !info.icon && !info.root) continue

    /** @type {Record<string, unknown>} */
    const meta = {}
    if (info.title) meta.title = info.title
    if (info.icon) meta.icon = info.icon
    if (info.defaultOpen) meta.defaultOpen = info.defaultOpen
    if (info.collapsible === false) meta.collapsible = false
    if (info.root) meta.root = info.root
    meta.pages = info.order

    const file = path.join(CONTENT_ROOT, dir, "meta.json")
    await fs.mkdir(path.dirname(file), {recursive: true})
    await fs.writeFile(file, stableStringify(meta), "utf8")
  }

  // Remove any meta.json files in directories the config no longer mentions.
  await pruneStaleMetaJson(dirs)

  // Emit the tag sidecar. `meta.json`'s link/folder syntax has no slot for a
  // tag and pages may have config-only tags (not echoed into MDX frontmatter),
  // so we centralise tag metadata here for `source.ts` to layer back on at
  // load time. Always written so consumers can rely on the file existing.
  await fs.mkdir(path.dirname(NAV_OVERLAYS_PATH), {recursive: true})
  await fs.writeFile(NAV_OVERLAYS_PATH, stableStringify(overlays), "utf8")
}

/**
 * For every directory referenced in `dirs`, append (alphabetically) any child
 * .mdx files / subfolders that aren't already listed in its `order`.
 * @param {Map<string, {order: string[]}>} dirs
 */
async function appendUnlistedChildren(dirs) {
  for (const [dir, info] of dirs) {
    const abs = path.join(CONTENT_ROOT, dir)
    let entries
    try {
      entries = await fs.readdir(abs, {withFileTypes: true})
    } catch {
      continue
    }
    /** @type {string[]} */
    const extras = []
    for (const entry of entries) {
      if (entry.name === "meta.json" || entry.name.startsWith(".")) continue
      const name = entry.isFile() && entry.name.endsWith(".mdx") ? entry.name.replace(/\.mdx$/, "") : entry.isDirectory() ? entry.name : null
      if (!name) continue
      // `...name` (extract prefix) and `!name` (exclude) cover the same folder
      // as a bare `name` entry, so treat them as already-listed.
      if (info.order.includes(name)) continue
      if (info.order.includes(`...${name}`)) continue
      if (info.order.includes(`!${name}`)) continue
      extras.push(name)
    }
    extras.sort()
    for (const name of extras) info.order.push(name)
  }
}

/**
 * Delete meta.json files in directories that exist on disk but aren't in
 * `dirs` (e.g. dangling after a folder rename).
 * @param {Map<string, unknown>} dirs
 */
async function pruneStaleMetaJson(dirs) {
  /** @type {Promise<void>[]} */
  const tasks = []
  await walk(CONTENT_ROOT, "")

  async function walk(root, rel) {
    let entries
    try {
      entries = await fs.readdir(path.join(root, rel), {withFileTypes: true})
    } catch {
      return
    }
    for (const entry of entries) {
      const childRel = rel ? path.posix.join(rel, entry.name) : entry.name
      if (entry.isDirectory()) {
        await walk(root, childRel)
      } else if (entry.name === "meta.json") {
        if (!dirs.has(rel)) tasks.push(fs.unlink(path.join(root, childRel)).catch(() => {}))
      }
    }
  }
  await Promise.all(tasks)
}

// ---------------------------------------------------------------------------
// Backfill ids in any .mdx that lacks one (defensive — migrate-content already
// stamps them, but the editor can create .mdx files too).
// ---------------------------------------------------------------------------

async function ensureIdsStamped() {
  let stampedCount = 0
  await walk(CONTENT_ROOT, "")
  if (stampedCount > 0) console.log(`  stamped id into ${stampedCount} file(s)`)

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
            if (!DRY_RUN) await fs.writeFile(abs, next, "utf8")
            stampedCount++
          }
        }
      }
    }
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

// Keep the unused-import linter quiet for backup-dir constant (used by the editor).
void NAV_BACKUP_DIR

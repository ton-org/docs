/**
 * Validates external HTTP links in `content/docs/**` MDX files.
 *
 * Uses HEAD/GET against each unique external URL with a short timeout.
 * Designed to run as a Node script (no bundler dependency on `.source`),
 * mirroring Acton's checks against tonkeeper/tonviewer/etc.
 */
import fs from "node:fs"
import path from "node:path"

const CONTENT_ROOT = path.posix.join("content", "docs")
const TIMEOUT_MS = 15_000
const CONCURRENCY = 8

function whitelist(_url: string): boolean {
  return false
}

function toRedirectMode(url: URL): RequestRedirect {
  if (/^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/latest/.test(url.href)) return "follow"
  return "manual"
}

async function main() {
  const files = collectMdxFiles(CONTENT_ROOT)
  const links = new Map<string, {file: string; line: number}[]>()
  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf8")
    for (const link of extractExternalLinks(content)) {
      if (whitelist(link.href)) continue
      const list = links.get(link.href) ?? []
      list.push({file: filePath, line: link.line})
      links.set(link.href, list)
    }
  }

  const entries = [...links.entries()]
  const errors: {url: string; refs: {file: string; line: number}[]; reason: string}[] = []

  let cursor = 0
  await Promise.all(
    Array.from({length: CONCURRENCY}, async () => {
      while (cursor < entries.length) {
        const idx = cursor++
        const [url, refs] = entries[idx]
        const reason = await checkExternalUrl(url)
        if (reason) errors.push({url, refs, reason})
      }
    }),
  )

  if (errors.length === 0) {
    console.log(`external links OK: checked ${entries.length} URLs across ${files.length} pages`)
    return
  }
  for (const err of errors) {
    console.error(`${err.url}  →  ${err.reason}`)
    for (const ref of err.refs.slice(0, 5)) {
      console.error(`  at ${ref.file}:${ref.line}`)
    }
    if (err.refs.length > 5) console.error(`  (+${err.refs.length - 5} more)`)
  }
  console.error(`\nexternal links FAILED: ${errors.length} broken URLs`)
  process.exit(1)
}

function collectMdxFiles(root: string): string[] {
  const result: string[] = []
  if (!fs.existsSync(root)) return result
  for (const entry of fs.readdirSync(root, {withFileTypes: true})) {
    const full = path.posix.join(root, entry.name)
    if (entry.isDirectory()) result.push(...collectMdxFiles(full))
    else if (entry.isFile() && entry.name.endsWith(".mdx")) result.push(full)
  }
  return result
}

function extractExternalLinks(content: string): {href: string; line: number}[] {
  const result: {href: string; line: number}[] = []
  const lines = content.split("\n")
  const mdLink = /\[[^\]]*\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/g
  const jsxHref = /\b(?:href|src)\s*=\s*["'](https?:\/\/[^"']+)["']/g
  for (let i = 0; i < lines.length; i++) {
    for (const re of [mdLink, jsxHref]) {
      re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(lines[i])) !== null) {
        result.push({href: m[1], line: i + 1})
      }
    }
  }
  return result
}

async function checkExternalUrl(href: string): Promise<string | null> {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return "invalid URL"
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: toRedirectMode(url),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    await response.body?.cancel()
    const status = response.status
    if (status === 200) return null
    if (status >= 300 && status < 400) return `redirected to '${response.headers.get("location")}'`
    if (status === 404) return `not found (404)`
    if (status >= 400 && status < 500) return `client error ${status}`
    return `unexpected status ${status}`
  } catch (error: unknown) {
    return error instanceof Error ? error.message : String(error)
  }
}

void main()

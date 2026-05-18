#!/usr/bin/env node
import {access, mkdir, writeFile} from "node:fs/promises"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"

import {redirects} from "../redirects.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, "..", "out")

function template(destination) {
  const safe = JSON.stringify(destination)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Redirecting to ${destination}</title>
<link rel="canonical" href="${destination}">
<meta http-equiv="refresh" content="0; url=${destination}">
<meta name="robots" content="noindex">
<script>location.replace(${safe} + window.location.search + window.location.hash);</script>
</head>
<body>
<p>Redirecting to <a href="${destination}">${destination}</a>.</p>
</body>
</html>
`
}

async function exists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

let written = 0
let skippedWildcard = 0
let skippedExisting = 0

for (const r of redirects) {
  if (r.source.includes(":") || r.source.includes("*")) {
    skippedWildcard++
    continue
  }
  const clean = r.source.replace(/^\/+/, "").replace(/\/+$/, "")
  const target = clean
    ? join(outDir, clean, "index.html")
    : join(outDir, "index.html")

  if (await exists(target)) {
    skippedExisting++
    continue
  }

  await mkdir(dirname(target), {recursive: true})
  await writeFile(target, template(r.destination), "utf8")
  written++
}

console.log(
  `generate-redirect-pages: wrote ${written}, skipped ${skippedWildcard} wildcard, ${skippedExisting} already-built`,
)

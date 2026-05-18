import {createOpenAPI} from "fumadocs-openapi/server"
import {createAPIPage} from "fumadocs-openapi/ui"
import path from "node:path"

/**
 * Server-side OpenAPI bundle that exposes the toncenter v2, v3, and
 * smc-index specs to the docs site. Schemas are referenced by stable IDs so
 * that frontmatter can point at them via `openapi: <method> <path>`
 * (resolved by `<APIPage>` below).
 */
export const openapiServer = createOpenAPI({
  input: () => ({
    "toncenter-v2": path.join(process.cwd(), "openapi", "v2.json"),
    "toncenter-v3": path.join(process.cwd(), "openapi", "v3.yaml"),
    "toncenter-smc-index": path.join(process.cwd(), "openapi", "smc-index.json"),
  }),
})

/**
 * Renders an operation page given the frontmatter `openapi` string
 * (e.g. `"get /api/v3/accountStates"`). The schema is auto-detected per
 * operation: paths starting with `/api/v3/` resolve against `toncenter-v3`,
 * everything else falls back to `toncenter-v2`.
 */
export const APIPage = createAPIPage(openapiServer)

const SMC_INDEX_ROUTES = new Set([
  "/lifecheck",
  "/getNominator",
  "/getNominatorBookings",
  "/getNominatorEarnings",
  "/getPool",
  "/getPoolBookings",
])

export function detectSchemaId(openapi: string | undefined): string | undefined {
  if (!openapi) return undefined
  const parts = openapi.trim().split(/\s+/)
  if (parts.length < 2) return undefined
  const route = parts[1]
  if (route.startsWith("/api/v3/")) return "toncenter-v3"
  if (route.startsWith("/api/v2/")) return "toncenter-v2"
  if (SMC_INDEX_ROUTES.has(route)) return "toncenter-smc-index"
  return "toncenter-v2"
}

export function parseOperation(openapi: string): {method: string; path: string} | undefined {
  const parts = openapi.trim().split(/\s+/)
  if (parts.length < 2) return undefined
  return {method: parts[0].toLowerCase(), path: parts[1]}
}

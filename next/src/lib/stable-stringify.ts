const KEY_PRIORITY = [
    "version",
    "type",
    "id",
    "slug",
    "title",
    "group",
    "name",
    "icon",
    "tag",
    "expanded",
    "flatten",
    "external",
    "defaultOpen",
    "root",
    "openapi",
    "url",
    "source",
    "destination",
    "permanent",
    "directory",
    "pages",
    "tabs",
    "navbarLinks",
  ]
  

export function keyOrder(a: string, b: string) {
    const ia = KEY_PRIORITY.indexOf(a)
    const ib = KEY_PRIORITY.indexOf(b)
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return a < b ? -1 : a > b ? 1 : 0
  }

/**
 * Deterministic JSON serializer. Object keys are ordered by `KEY_PRIORITY` then
 * lexicographic; output ends with a trailing newline.
 * @param {unknown} value
 * @returns {string}
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function stableStringify(value: any) {
    return (
      JSON.stringify(
        value,
        (_key, val) => {
          if (val && typeof val === "object" && !Array.isArray(val)) {
            const sorted: Record<string, unknown> = {}
            const obj: Record<string, unknown> = val
            for (const k of Object.keys(obj).sort(keyOrder)) sorted[k] = obj[k]
            return sorted
          }
          return val
        },
        2,
      ) + "\n"
    )
  }
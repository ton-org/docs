/**
 * Mintlify
 * @typedef {import('../node_modules/@mintlify/validation').DocsConfig} DocsConfig
 */

/**
 * Docusaurus
 * @typedef {import('./docusaurus-sidebars-types.d.ts').SidebarsConfig} Sidebars
 * @typedef {import('./docusaurus-sidebars-types.d.ts').SidebarItemDoc} ItemDoc
 * @typedef {import('./docusaurus-sidebars-types.d.ts').SidebarItemLink} ItemLink
 * @typedef {import('./docusaurus-sidebars-types.d.ts').SidebarItemCategoryBase} ItemCat
 */

/** @param src {string} */
export function ansiRed(src) {
  return `\x1b[31m${src}\x1b[0m`;
}

/** @param src {string} */
export function ansiBoldRed(src) {
  return `\x1b[1;31m${src}\x1b[0m`;
}

/** @param src {string} */
export function ansiGreen(src) {
  return `\x1b[32m${src}\x1b[0m`;
}

/** @param src {string} */
export function ansiBoldGreen(src) {
  return `\x1b[1;32m${src}\x1b[0m`;
}

/** @param src {string} */
export function ansiBold(src) {
  return `\x1b[1m${src}\x1b[0m`;
}

/**
 * Forms a string with the following contents:
 *
 * ```
 * brief:
 * - list[0]
 * - list[1]
 * - ...
 * - list[n - 1]
 *
 * Error: msg
 * ```
 *
 * @param brief {string} Brief description of list items
 * @param list {string[]} List of inline error messages
 * @param msg {string} Complete description of the error message
 */
export function composeErrorList(brief, list, msg) {
  return [
    brief,
    '- ' + list.join('\n- '),
    `\n${ansiRed('Error:')} ${msg}`,
  ].join('\n');
}

/**
 * Get navigation links from the docs.json configuration.
 * Notice that each link is prefixed by a single slash /
 * regardless if it was present originally.
 *
 * @param config {DocsConfig}
 * @returns {string[]}
 */
export function getNavLinks(config) {
  /** @type {string[]} */
  const links = [];
  /** @param page {any} */
  const processPage = (page) => {
    switch (typeof page) {
      case "string": {
        links.push("/" + page.replace(/^\/+/, ""));
        break;
      }
      case "object": {
        if (page?.pages) {
          page["pages"].forEach(processPage);
        }
        break;
      }
      default:
        break;
    }
  };
  // @ts-ignore
  config.navigation?.pages.forEach(processPage);
  return links;
}

/**
 * Get navigation links from the docs.json configuration as a Set.
 * Notice that each link is prefixed by a single slash /
 * regardless if it was present originally.
 *
 * @param config {DocsConfig}
 * @returns {ReadonlySet<string>}
 */
export function getNavLinksSet(config) {
  return Object.freeze(new Set(getNavLinks(config)));
}

/**
 * Get redirect objects from the docs.json configuration.
 *
 * @typedef {{
 *   source: string;
 *   destination: string;
 *   permanent?: boolean | undefined
 * }} Redirect
 * @param config {DocsConfig}
 * @returns {Redirect[]}
 */
export function getRedirects(config) {
  if (!config.redirects) {
    return [];
  }
  return config.redirects;
}

/**
 * Get redirect objects from the docs.json configuration as a Set.
 *
 * @param config {DocsConfig}
 * @returns {ReadonlySet<Redirect>}
 */
export function getRedirectsSet(config) {
  return Object.freeze(new Set(getRedirects(config)));
}

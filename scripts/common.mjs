// Node.js
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Remark
import { remark } from 'remark';
import { visitParents } from 'unist-util-visit-parents';

/**
 * Mintlify
 * @typedef {import('../node_modules/@mintlify/validation').DocsConfig} DocsConfig
 */

/**
 * Docusaurus
 * @typedef {import('./docusaurus-sidebars-types.d.ts').SidebarsConfig} Sidebars
 * @typedef {import('./docusaurus-sidebars-types.d.ts').SidebarItemConfig} SidebarItem
 * @typedef {import('./docusaurus-sidebars-types.d.ts').SidebarItemDoc} ItemDoc
 * @typedef {import('./docusaurus-sidebars-types.d.ts').SidebarItemLink} ItemLink
 * @typedef {import('./docusaurus-sidebars-types.d.ts').SidebarItemCategoryBase} ItemCat
 */

/**
 * Custom
 * @typedef {{ok: true} | {ok: false; error: string}} CheckResult
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
export function ansiYellow(src) {
  return `\x1b[33m${src}\x1b[0m`;
}

/** @param src {string} */
export function ansiBoldYellow(src) {
  return `\x1b[1;33m${src}\x1b[0m`;
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
  return [ansiRed(brief), '- ' + list.join('\n- '), `\n${ansiRed('Error:')} ${msg}`].join('\n');
}

/** @param msg {string} */
export function composeError(msg) {
  return `${ansiRed('Error:')} ${msg}`;
}

/**
 * Forms a string with the following contents:
 *
 * ```
 * Warning: msg
 * - list[0]
 * - list[1]
 * - ...
 * - list[n - 1]
 * ```
 *
 * @param msg {string} Complete description of the warning message
 * @param list {string[]} List of inline warning messages
 */
export function composeWarningList(msg, list) {
  return [`${ansiYellow('Warning:')} ${msg}`, '- ' + list.join('\n- ')].join('\n');
}

/** @param msg {string} */
export function composeWarning(msg) {
  return `${ansiYellow('Warning:')} ${msg}`;
}

/** @param msg {string} */
export function composeSuccess(msg) {
  return `${ansiGreen('Success:')} ${msg}`;
}

/** @param src {string} */
export function prefixWithSlash(src) {
  return '/' + src.replace(/^\/+/, '');
}

/**
 * Creates the Remark parser with same settings as in `remarkConfig` inside `package.json`.
 */
export async function initMdxParser() {
  const remarkConfig = (await import(join('..', '.remarkrc.mjs'))).default;
  return remark().use(remarkConfig);
}

/**
 * Checks whether the .mdx page has (uses) a `<Stub>` React component
 * by parsing the contents of the `filepath` with the MDX `parser`
 * and exploring the resulting tree.
 *
 * @param parser {*} initialized Remark parser with MDX support enabled
 * @param filepath {string} relative path to the MDX file
 * @returns {boolean}
 */
export function hasStub(parser, filepath) {
  if (!filepath.endsWith('mdx')) {
    return false;
  }
  const file = readFileSync(filepath, { encoding: 'utf8' });
  const parsed = parser.parse(file);
  let res = false;
  visitParents(parsed, 'mdxJsxFlowElement', (node) => {
    if (node.name === 'Stub') {
      res = true;
    }
  });
  return res;
}

/**
 * Recursively finds files with a target extension `ext` starting from a given directory `dir`.
 * Ignores common and extension-specific irrelevant files — see the code for details.
 *
 * @param [ext='mdx'] {string} extension of the file without a leading dot; defaults to mdx
 * @param [dir='.'] {string} directory to start with, defaults to `.` (present directory, assuming the root of the repo)
 * @returns {string[]} file paths relative to `dir` or an empty array if there is none, `dir` does not exist or `ext` is empty
 */
export function findUnignoredFiles(ext = 'mdx', dir = '.') {
  if (ext === '' || !existsSync(dir) || !statSync(dir).isDirectory()) {
    return [];
  }

  /**
   * `dir`-relative paths to common ignores.
   * @type {{ files: string[]; dirs: string[] }}
   */
  const commonIgnoreMap = Object.freeze({
    files: ['LICENSE-code', 'LICENSE-docs', 'package-lock.json'].map((it) => join(dir, it)),
    dirs: ['.git', '.github', '.idea', '.vscode', '__MACOSX', 'node_modules', '__pycache__', 'stats'].map((it) =>
      join(dir, it),
    ),
  });

  /**
   * `dir`-relative paths to extension-specific ignores.
   * @type {{[k: string]: { files: string[]; dirs: string[] }}}
   */
  const extIgnoreMap = Object.freeze({
    mdx: {
      files: ['index.mdx', 'contribute/style-guide-extended.mdx'].map((it) => join(dir, it)),
      dirs: [
        // Snippets and page parts
        'snippets',
        'scripts',
        'resources',
        // Pages covered in OpenAPI specs rather than in docs.json
        'ecosystem/api/toncenter/v2',
        'ecosystem/api/toncenter/v3',
        'ecosystem/api/toncenter/smc-index',
      ].map((it) => join(dir, it)),
    },
  });

  /** @type string[] */
  let results = [];

  /** @param subDir {string} */
  const recurse = (subDir) => {
    // Collects files and dirs one level deep, excluding common ignore targets
    const intermediates = readdirSync(subDir, { withFileTypes: true, encoding: 'utf8', recursive: false }).filter(
      (it) => {
        const relPath = join(it.parentPath, it.name);
        if (it.isFile()) {
          return commonIgnoreMap.files.includes(relPath) === false;
        }
        if (it.isDirectory()) {
          return commonIgnoreMap.dirs.includes(relPath) === false;
        }
        // Otherwise
        return false;
      },
    );
    // Processes collected items and filters out extension-specific ignore targets,
    // recursively descending in directories and pushing files into `results` array
    // if they match the target `ext` and are not ignored.
    intermediates.forEach((it) => {
      const relPath = join(it.parentPath, it.name);
      if (it.isFile() && relPath.toLowerCase().endsWith(ext)) {
        // Ignore extension-specific targets
        if (extIgnoreMap.hasOwnProperty(ext) && extIgnoreMap[ext].files.includes(relPath)) {
          return;
        }
        results.push(relPath);
        return;
      }
      if (it.isDirectory()) {
        // Ignore extension-specific targets
        if (extIgnoreMap.hasOwnProperty(ext) && extIgnoreMap[ext].dirs.includes(relPath)) {
          return;
        }
        recurse(relPath);
        return;
      }
      // Otherwise
      return;
    });
  };
  recurse(dir);
  return results;
}

/**
 * Get docs.json contents as an object.
 *
 * @returns {Readonly<DocsConfig>}
 */
export function getConfig() {
  return Object.freeze(JSON.parse(readFileSync('./docs.json', 'utf8')));
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
      case 'string': {
        links.push(prefixWithSlash(page));
        break;
      }
      case 'object': {
        if (page?.pages) {
          page['pages'].forEach(processPage);
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

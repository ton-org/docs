/*─────────────────────────────────────────────────────────────────────────────╗
│                                  IMPORTANT:                                  │
│  Run this script from the root of the docs, not from the scripts directory!  │
╞══════════════════════════════════════════════════════════════════════════════╡
│  The script can check:                                                       │
│  1. Uniqueness of redirect sources                                           │
│  2. Existence of redirect destination files                                  │
│  3. Redirects against the previous TON Documentation URLs                    │
│  4. Redirects against the upstream docs.json structure                       │
│                                                                              │
│  By default, it checks all, but to only check either specify `unique`,       │
│  `exist`, `previous` or `upstream` as a command-line argument, respectively. │
│                                                                              │
│  For example, this command will run the 1st check only:                      │
│  $ node scripts/check-redirects.mjs previous                                 │
╚─────────────────────────────────────────────────────────────────────────────*/

// Node.js
import { existsSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

// Common utils
import {
  ansiYellow,
  composeSuccess,
  composeWarning,
  composeError,
  composeErrorList,
  prefixWithSlash,
  getConfig,
  getNavLinksSet,
  getRedirects,
} from './common.mjs';

/**
 * Types
 * @typedef {import('./common.mjs').DocsConfig} DocsConfig
 * @typedef {import('./common.mjs').Sidebars} Sidebars
 * @typedef {import('./common.mjs').SidebarItem} SidebarItem
 * @typedef {import('./common.mjs').CheckResult} CheckResult
 */

/**
 * Check that all sources in the redirects array are unique,
 * don't point to themselves, and don't override the existing structure paths
 *
 * @param config {Readonly<DocsConfig>} Local docs.json configuration
 * @return {CheckResult}
 */
const checkUnique = (config) => {
  const redirects = getRedirects(config);
  const redirectSources = redirects.map((it) => it.source);
  const duplicates = redirectSources.filter((source, index) => redirectSources.indexOf(source) !== index);
  /** @type string[] */
  const errors = [];
  if (duplicates.length !== 0) {
    errors.push(
      composeErrorList(
        'Found duplicate sources in the redirects array:',
        duplicates,
        'Redirect sources in docs.json must be unique!',
      ),
    );
  }
  /** @param src {string} */
  const fmt = (src) => prefixWithSlash(src).replace(/#.*$/, '').replace(/\?.*$/, '');
  const loops = redirects.filter((it) => fmt(it.source) == fmt(it.destination)).map((it) => it.source);
  if (loops.length !== 0) {
    errors.push(
      composeErrorList(
        'Found sources that lead to themselves, i.e., circular references:',
        loops,
        'Redirect sources in docs.json must not self-reference in destinations!',
      ),
    );
  }
  const navLinks = getNavLinksSet(config);
  const navOverrides = redirectSources.filter((it) => navLinks.has(fmt(it)));
  if (navOverrides.length !== 0) {
    errors.push(
      composeErrorList(
        'Found sources that override pages in the docs.json structure:',
        navOverrides,
        'Redirect sources in docs.json must not replace existing paths!',
      ),
    );
  }
  // If there are any errors
  if (errors.length !== 0) {
    return {
      ok: false,
      error: errors.join('\n...and '),
    };
  }
  // Otherwise
  return { ok: true };
};

/**
 * Check that all destinations in the redirects array point to existing files
 *
 * @param config {Readonly<DocsConfig>} Local docs.json configuration
 * @return {CheckResult}
 */
const checkExist = (config) => {
  // All redirects
  const redirects = getRedirects(config);

  // Tracking found special destinations
  const specialDestinationsExist = {
    todos: false,
    issues: false,
    olderDocs: false,
    otherGithubLinks: false,
    wikiLinks: false,
    otherExternalLinks: false,
  };

  /**
   * @param path {string}
   * @returns boolean
   */
  const pathIsSpecial = (path) => {
    // Links
    if (path.startsWith('http')) {
      if (path.includes('github.com/ton-org/docs/issues')) {
        specialDestinationsExist.issues = true;
      } else if (path.includes('github.com/')) {
        specialDestinationsExist.otherGithubLinks = true;
      } else if (path.includes('en.wikipedia.org/')) {
        specialDestinationsExist.wikiLinks = true;
      } else if (path.includes('old-docs.ton.org/')) {
        specialDestinationsExist.olderDocs = true;
      } else {
        specialDestinationsExist.otherExternalLinks = true;
      }
      return true;
    }
    // TODOs
    if (path.startsWith('TODO')) {
      specialDestinationsExist.todos = true;
      return true;
    }
    // Otherwise
    return false;
  };

  /**
   * @param path {string}
   * @returns {{ files: 'one'; path: string } | { files: 'many'; paths: string[] } | { files: 'none' }}
   */
  const pathFindFiles = (path) => {
    const cleanedPath = path.replace(/^\/+/, '').replace(/#.*$/, '').replace(/\?.*$/, '');
    const existingFiles = [
      cleanedPath === '' ? `index.mdx` : `${cleanedPath}/index.mdx`,
      `${cleanedPath}.mdx`,
      `${cleanedPath}`,
    ].filter((it) => existsSync(it) && statSync(it).isFile());

    if (existingFiles.length === 0) {
      return { files: 'none' };
    }
    if (existingFiles.length === 1) {
      return { files: 'one', path: existingFiles[0] };
    }
    return { files: 'many', paths: existingFiles };
  };

  /**
   * Recursively look for the destination up to N times deep.
   * After that, the search function should forcibly terminate
   * and produce an error with a complete trace.
   *
   * This is tied to the limitations of the documentation framework.
   * DO NOT INCREASE without prior testing. Or ever.
   */
  const maxRecursionLevelPerRedirect = 3;

  /**
   * @param path {string}
   * @param attemptsLeft {number}
   * @param trace {string[]}
   * @returns {{ ok: boolean; trace: string[] }}
   */
  const pathFindWithTrace = (path, attemptsLeft, trace) => {
    if (attemptsLeft > 3) {
      return {
        ok: false,
        trace: trace.concat(`Cannot have redirects more than 3 levels deep, received: ${attemptsLeft}`),
      };
    }
    if (attemptsLeft <= 0) {
      return { ok: false, trace: trace.concat(`Recursed too deep already, skipping: ${path}`) };
    }
    if (pathIsSpecial(path)) {
      return { ok: true, trace: trace.concat(`The destination is special, skipping: ${path}`) };
    }
    const foundFiles = pathFindFiles(path);
    if (foundFiles.files === 'one') {
      return { ok: true, trace: trace.concat(`Found a file under the destination: ${path} → ${foundFiles.path}`) };
    }
    if (foundFiles.files === 'many') {
      return {
        ok: false,
        trace: trace.concat(
          `Multiple files found under the same destination: ${path} → ${foundFiles.paths.join(', ')}`,
        ),
      };
    }
    // None, need to look in redirect sources or bail.
    const redirectSource = redirects.find((it) => it.source === path.replace(/#.*$/, ''));
    if (!redirectSource) {
      return {
        ok: false,
        trace: trace.concat(`No file nor a deeper redirect found for this destination: ${path}`),
      };
    }
    // Otherwise, perform a next iteration with the new destination path.
    return pathFindWithTrace(redirectSource.destination, attemptsLeft - 1, trace.concat(path));
  };

  // Main part
  const uniqDests = [...new Set(redirects.map((it) => it.destination))];
  const processedDests = uniqDests.map((it) => pathFindWithTrace(it, maxRecursionLevelPerRedirect, []));
  const invalidatedTraces = processedDests
    .filter((it) => {
      if (process.env.DEBUG && process.env.DEBUG === 'true') {
        console.log(it);
      }
      // Trace must be non-zero
      return !it.ok && it.trace.length !== 0;
    })
    .map((it) => it.trace);
  if (specialDestinationsExist.issues) {
    console.log(composeWarning('Found GitHub docs repo issue destinations!'));
  }
  if (specialDestinationsExist.todos) {
    console.log(composeWarning('Found TODO-prefixed destinations!'));
  }
  if (specialDestinationsExist.olderDocs) {
    console.log(composeWarning('Found destinations that point to old-docs.ton.org!'));
  }
  // NOTE: this and other special destinations are not currently needed, but their checks must be required in the future.
  // if (specialDestinationsExist.otherExternalLinks) {
  //   console.log(composeWarning('Found third-party URLs outside of GitHub or English Wikipedia!'));
  // }
  if (invalidatedTraces.length !== 0) {
    return {
      ok: false,
      error: composeErrorList(
        'Unreachable or nonexistent redirect destinations found:',
        invalidatedTraces.map((it) => {
          if (it.length === 1) {
            return it.join('');
          }
          return it.slice(0, -1).join('\n  → ') + '\n  → ' + it.slice(-1).join('');
        }),
        'Some redirect destinations in docs.json do not exist or are unreachable!',
      ),
    };
  }
  // Otherwise
  return { ok: true };
};

/**
 * Check redirects against the previous TON Documentation URLs.
 * Ensures that old routes point to new files or even anchors.
 *
 * @param td {string} Temporary directory path
 * @param config {Readonly<DocsConfig>} Parsed docs.json configuration
 * @return {Promise<CheckResult>}
 */
const checkPrevious = async (td, config) => {
  // 1. Clone previous TON Docs in a temporary directory
  //    in order to obtain the sidebars.js module
  const tonDocsPath = join(td, 'ton-docs');
  const cloneRes = spawnSync('git', ['clone', '--depth=1', 'https://github.com/ton-community/ton-docs', tonDocsPath], {
    encoding: 'utf8',
    timeout: 1_000 * 60 * 10,
  });
  if (cloneRes.status != 0) {
    return {
      ok: false,
      error: `${cloneRes.error ?? cloneRes.stdout}`,
    };
  }

  // 2. Process sidebars.js and extract all URLs
  const sidebarsPath = join(tonDocsPath, 'sidebars.js');
  if (!existsSync(sidebarsPath)) {
    return {
      ok: false,
      error: composeError(`sidebars.js was not found in ${tonDocsPath}`),
    };
  }
  /** @type Readonly<Sidebars> */
  const sidebarsModule = Object.freeze((await import(sidebarsPath)).default);
  const sidebarsKeys = Object.keys(sidebarsModule);
  /** @type string[] */
  const prevLinks = [];
  sidebarsKeys.forEach((key) => {
    const sidebar = sidebarsModule[key];
    /** @param sb {SidebarItem} */
    const processItem = (sb) => {
      if (typeof sb === 'string') {
        prevLinks.push(prefixWithSlash(sb));
        return;
      }
      switch (sb.type) {
        case 'doc':
        case 'ref':
          prevLinks.push(prefixWithSlash(sb.id));
          break;
        case 'link':
          if (sb.href.startsWith('/') || !sb.href.startsWith('http')) {
            prevLinks.push(prefixWithSlash(sb.href));
          }
          break;
        case 'category':
          if (sb.link) {
            if (sb.link.type === 'doc') {
              prevLinks.push(prefixWithSlash(sb.link.id));
            } else if (sb.link.type === 'generated-index' && sb.link.slug) {
              prevLinks.push(prefixWithSlash(sb.link.slug));
            }
          }
          sb.items.forEach(processItem);
          break;
        case 'autogenerated':
        case 'html':
        default:
          break;
      }
    };
    sidebar.forEach(processItem);
  });

  // 3. Process docs.json and compare its structure and redirects to old links
  const currLinks = getNavLinksSet(config);
  const prevOnlyLinks = prevLinks.filter((it) => !currLinks.has(it));
  if (prevOnlyLinks.length === 0) {
    return { ok: true };
  }

  const redirectSources = getRedirects(config).map((it) => it.source);
  const missingSources = prevOnlyLinks.filter(
    (it) =>
      [it, it.replace(/\/index$/, ''), it.replace(/\/README$/, '')].some((variant) =>
        redirectSources.includes(variant),
      ) === false,
  );
  if (missingSources.length !== 0) {
    return {
      ok: false,
      error: composeErrorList(
        'Missing pages or redirects for the following URLs:',
        missingSources,
        'Some URLS in the previous TON Documentation do not have corresponding pages or redirect sources in the local docs.json!',
      ),
    };
  }

  // Otherwise
  return { ok: true };
};

/**
 * Check redirects against the upstream docs.json structure.
 * Ensures that changes made to docs.json in the PR
 * provide necessary redirects in case local links
 * deviated from the links on the main branch.
 *
 * @param localConfig {Readonly<DocsConfig>} Local docs.json configuration
 * @return {Promise<CheckResult>}
 */
const checkUpstream = async (localConfig) => {
  const response = await fetch('https://raw.githubusercontent.com/ton-org/docs/refs/heads/main/docs.json');

  /** @type {DocsConfig} */
  const upstreamConfig = Object.freeze(await response.json());
  const upstreamNavLinks = getNavLinksSet(upstreamConfig);
  const localNavLinks = getNavLinksSet(localConfig);

  const upstreamOnlyLinks = [...upstreamNavLinks].filter((it) => !localNavLinks.has(it));
  if (upstreamOnlyLinks.length === 0) {
    return { ok: true };
  }

  const redirectSources = getRedirects(localConfig).map((it) => it.source);
  const missingSources = upstreamOnlyLinks.filter(
    (it) => !redirectSources.includes(it) && !redirectSources.includes(it.replace(/\/index$/, '')),
  );
  if (missingSources.length !== 0) {
    return {
      ok: false,
      error: composeErrorList(
        'Missing pages or redirects for the following upstream URLs:',
        missingSources,
        `Local docs.json does not have corresponding pages or redirect sources for some URLs in the upstream docs.json!\n${ansiYellow('Possible fix:')} merge the main branch into the current one to keep docs.json up to date, or add new redirects to account for removed or renamed pages.`,
      ),
    };
  }

  // Otherwise
  return { ok: true };
};

const main = async () => {
  const config = getConfig();
  console.log(); // intentional break

  // Creating the temporary directory
  const td = mkdtempSync(join(tmpdir(), 'td'));

  // Running either one check or all checks
  const rawArgs = process.argv.slice(2);
  const argUnique = rawArgs.includes('unique'); // all sources are unique
  const argExist = rawArgs.includes('exist'); // all destinations exist
  const argPrevious = rawArgs.includes('previous'); // sources cover previous TON Docs
  const argUpstream = rawArgs.includes('upstream'); // sources cover upstream docs.json structure
  const args = [argUnique, argExist, argPrevious, argUpstream];
  const shouldRunAll = args.every((it) => it) || args.every((it) => !it);
  let errored = false;

  /**
   * @param res {CheckResult}
   * @param rawSuccessMsg {string}
   */
  const handleCheckResult = (res, rawSuccessMsg) => {
    if (!res.ok) {
      errored = true;
      console.log(res.error);
    } else {
      console.log(composeSuccess(rawSuccessMsg));
    }
    if (shouldRunAll) {
      console.log(); // intentional break
    }
  };

  if (shouldRunAll || argUnique) {
    console.log('🏁 Checking the uniqueness of redirect sources in docs.json...');
    handleCheckResult(checkUnique(config), 'All sources are unique.');
  }

  if (shouldRunAll || argExist) {
    console.log('🏁 Checking the existence of redirect destinations in docs.json...');
    handleCheckResult(checkExist(config), 'All destinations exist.');
  }

  if (shouldRunAll || argPrevious) {
    console.log('🏁 Checking redirects against the previous TON Documentation...');
    handleCheckResult(await checkPrevious(td, config), 'Full coverage.');
  }

  if (shouldRunAll || argUpstream) {
    console.log('🏁 Checking redirects against the upstream docs.json structure...');
    handleCheckResult(await checkUpstream(config), 'Full coverage.');
  }

  // Removing the temporary directory
  rmSync(td, { recursive: true });

  // In case of errors, exit with code 1
  if (errored) {
    process.exit(1);
  }
};

await main();

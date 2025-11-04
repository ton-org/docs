/*─────────────────────────────────────────────────────────────────────────────╗
│                                  IMPORTANT:                                  │
│  Run this script from the root of the docs, not from the scripts directory!  │
╞══════════════════════════════════════════════════════════════════════════════╡
│  The script can check:                                                       │
│  1. Redirects against the previous TON Documentation URLs                    │
│  2. Redirects against the upstream docs.json structure                       │
│                                                                              │
│  By default, it checks both, but to only check either specify                │
│  `previous` or `upstream` as a command-line argument, respectively.          │
│                                                                              │
│  For example, this command will run the 1st check only:                      │
│  $ node scripts/check-redirects.mjs previous                                 │
╚─────────────────────────────────────────────────────────────────────────────*/

// Node.js
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

// Common utils
import {
  composeSuccess,
  composeWarning,
  composeError,
  composeErrorList,
  prefixWithSlash,
  getNavLinksSet,
  getRedirects,
} from './common.mjs';

/**
 * Types
 * @typedef {import('./common.mjs').DocsConfig} DocsConfig
 * @typedef {import('./common.mjs').Sidebars} Sidebars
 * @typedef {import('./common.mjs').SidebarItem} SidebarItem
 * @typedef {{ok: true} | {ok: false; error: string}} CheckResult
 */

/**
 * Check that all sources in the redirects array are unique
 *
 * @param config {Readonly<DocsConfig>} Local docs.json configuration
 * @return {CheckResult}
 */
const checkUnique = (config) => {
  console.log('Checking the uniqueness of redirect sources in docs.json...');
  const redirectSources = getRedirects(config).map((it) => it.source);
  const duplicates = redirectSources.filter((source, index) => redirectSources.indexOf(source) !== index);
  if (duplicates.length !== 0) {
    return {
      ok: false,
      error: composeErrorList(
        'Found duplicate sources in the redirects array:',
        duplicates,
        'Redirect sources in docs.json must be unique!',
      ),
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
  console.log('Checking the existence of redirect destinations in docs.json...');
  const uniqDestinations = [...new Set(getRedirects(config).map((it) => it.destination))];
  let todoDestsExist = false;
  const missingDests = uniqDestinations.filter((it) => {
    if (it.startsWith('http')) {
      return false;
    }
    if (it.startsWith('TODO')) {
      todoDestsExist = true;
      return false;
    }
    const rel = it.replace(/^\/+/, '').replace(/#.*$/, '').replace(/\?.*$/, '');
    return [rel === '' ? `index.mdx` : `${rel}/index.mdx`, `${rel}.mdx`, `${rel}`].some(existsSync) === false;
  });
  if (todoDestsExist) {
    console.log(composeWarning('TODO-prefixed destinations found!'));
  }
  if (missingDests.length !== 0) {
    return {
      ok: false,
      error: composeErrorList(
        'Nonexistent destinations found:',
        missingDests,
        'Some redirect destinations in docs.json do not exist!',
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
  console.log('Checking redirects against the previous TON Documentation...');

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
  console.log('Checking redirects against the upstream docs.json structure...');
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
        'Missing pages or redirects for the following URLs:',
        missingSources,
        'Some URLs in the upstream docs.json structure do not have corresponding pages or redirect sources in the local docs.json!',
      ),
    };
  }

  // Otherwise
  return { ok: true };
};

const main = async () => {
  /** @type {Readonly<DocsConfig>} */
  const config = Object.freeze(JSON.parse(readFileSync('./docs.json', 'utf8')));
  console.log(); // intentional break

  // Creating the temporary directory
  const td = mkdtempSync(join(tmpdir(), 'td'));

  // Running either check or all
  const rawArgs = process.argv.slice(2);
  const argUnique = rawArgs.includes('unique'); // all sources are unique
  const argExist = rawArgs.includes('exist'); // all destinations exist
  const argPrevious = rawArgs.includes('previous'); // sources cover previous TON Docs
  const argUpstream = rawArgs.includes('upstream'); // sources cover upstream docs.json structure
  const args = [argUnique, argExist, argPrevious, argUpstream];

  const shouldRunAll = args.every((it) => it) || args.every((it) => !it);
  const shouldRunUnique = shouldRunAll || argUnique;
  const shouldRunExist = shouldRunAll || argExist;
  const shouldRunPrevious = shouldRunAll || argPrevious;
  const shouldRunUpstream = shouldRunAll || argUpstream;

  /** @type string[] */
  const errors = [];

  if (shouldRunUnique) {
    const res = checkUnique(config);
    if (!res.ok) {
      errors.push(res.error);
    } else {
      console.log(composeSuccess('All sources are unique.'));
    }
  }

  if (shouldRunExist) {
    const res = checkExist(config);
    if (!res.ok) {
      errors.push(res.error);
    } else {
      console.log(composeSuccess('All destinations exist.'));
    }
  }

  if (shouldRunPrevious) {
    const res = await checkPrevious(td, config);
    if (!res.ok) {
      errors.push(res.error);
    } else {
      console.log(composeSuccess('Full coverage.'));
    }
  }

  if (shouldRunUpstream) {
    const res = await checkUpstream(config);
    if (!res.ok) {
      errors.push(res.error);
    } else {
      console.log(composeSuccess('Full coverage.'));
    }
  }

  // Removing the temporary directory
  rmSync(td, { recursive: true });

  // Displaying the errors
  if (errors.length !== 0) {
    console.error(errors.join('\n\n'));
    process.exit(1);
  }
};

await main();

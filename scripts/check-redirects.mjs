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
import { ansiGreen, ansiRed, composeErrorList, getNavLinksSet, getRedirects } from './common.mjs';

/**
 * Types
 * @typedef {import('./common.mjs').DocsConfig} DocsConfig
 * @typedef {import('./common.mjs').Sidebars} Sidebars
 * @typedef {import('./common.mjs').ItemDoc} ItemDoc
 * @typedef {import('./common.mjs').ItemLink} ItemLink
 * @typedef {import('./common.mjs').ItemCat} ItemCat
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
  const sources = getRedirects(config).map((it) => it.source);
  const duplicates = sources.filter((source, index) => sources.indexOf(source) !== index);
  if (duplicates.length !== 0) {
    return {
      ok: false,
      error: composeErrorList(
        'Found duplicate sources in the redirects array:',
        duplicates,
        'redirect sources in docs.json must be unique!'
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
  const missingDests = uniqDestinations.filter((it) => {
    const rel = it.replace(/^\/+/, '');
    return [`${rel}.mdx`, `${rel}.pdf`].some(existsSync) === false;
    // return !existsSync(rel + '.mdx') && !existsSync(rel + '.pdf');
  });
  if (missingDests.length !== 0) {
    console.error(composeErrorList(
      'Nonexistent destinations found:',
      missingDests,
      'some redirect destinations in docs.json do not exist!'
    ));
    process.exit(1);
  }
  // Otherwise
  return { ok: true };
};

/**
 * Check redirects against the previous TON Documentation URLs
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
  const cloneRes = spawnSync(`git clone --depth=1 https://github.com/ton-community/ton-docs ${tonDocsPath}`, {
    encoding: 'utf8',
    timeout: 1_000 * 60 * 10,
  });
  if (cloneRes.status != 0) {
    return {
      ok: false,
      error: `${cloneRes.stdout}\n${cloneRes.stderr}`,
    };
  }

  // 2. Process sidebars.js and extract all URLs
  const sidebarsPath = join(tonDocsPath, 'sidebars.js');
  if (!existsSync(sidebarsPath)) {
    return {
      ok: false,
      error: `${ansiRed('Error:')} sidebars.js was not found in ${tonDocsPath}`,
    };
  }
  /** @type Sidebars */
  const sidebarsModule = (await import(sidebarsPath)).default;
  const sidebarsKeys = Object.keys(sidebarsModule);
  const prevLinks = [];
  sidebarsKeys.forEach((key) => {
    const sidebar = sidebarsModule[key];
    // TODO: process all sidebars
    // sidebar.forEach()
    // if (typeof sidebars[0] === 'string') {
    //   prevLinks.push()
    // } else {
    //   sidebars[0].type
    // }
  });

  // 3. Process docs.json and extract all URLs and redirects
  const currLinks = getNavLinksSet(config);
  const redirects = getRedirects(config);

  // 4. Compare them! TODO
  // Either to new structure
  // Or to new sources
  // And then check that the redirects exist!

  // Otherwise
  return { ok: true };
};

/**
 * Check redirects against the upstream docs.json structure
 *
 * @param td {string} Temporary directory path
 * @param localConfig {Readonly<DocsConfig>} Local docs.json configuration
 * @return {Promise<CheckResult>}
 */
const checkUpstream = async (td, localConfig) => {
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

  const redirects = getRedirects(localConfig);
  const sources = redirects.map((it) => it.source);
  const missingSources = upstreamOnlyLinks.filter((it) => !sources.includes(it));
  if (missingSources.length !== 0) {
    return {
      ok: false,
      error: composeErrorList(
        'Missing pages or redirects for the following URLs:',
        missingSources,
        'some URLs in the upstream docs.json structure do not have corresponding pages or redirect sources in the local docs.json!',
      ),
    };
  }

  const uniqDestinations = [...new Set(redirects.map((it) => it.destination))];
  const missingDests = uniqDestinations.filter((it) => !localNavLinks.has(it));
  // NOTE:
  // const missingDests = uniqDestinations.filter((it) => !localNavLinks.has(it) || !existsSync(it.replace(/^\/+/, '') + '.mdx'));
  if (missingDests.length !== 0) {
    return {
      ok: false,
      error: composeErrorList(
        'Missing destinations found:',
        missingDests,
        'some redirect destinations in the local docs.json do not correspond to local docs.json structure!',
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
  const args = process.argv.slice(2);
  const argUnique = args.includes('unique');
  const argExist = args.includes('exist');
  const argPrevious = args.includes('previous');
  const argUpstream = args.includes('upstream');

  const shouldRunAll = (
    (argUnique && argExist && argPrevious && argUpstream)
    || (!argUnique && !argExist && !argPrevious && !argUpstream)
  );
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
    }
  }
  if (shouldRunExist) {
    const res = checkExist(config);
    if (!res.ok) {
      errors.push(res.error);
    }
  }
  if (shouldRunPrevious) {
    const res = await checkPrevious(td, config);
    if (!res.ok) {
      errors.push(res.error);
    }
  }
  if (shouldRunUpstream) {
    const res = await checkUpstream(td, config);
    if (!res.ok) {
      errors.push(res.error);
    }
  }

  // Removing the temporary directory
  rmSync(td, { recursive: true });

  // Displaying the errors or the success message
  if (errors.length !== 0) {
    console.error(errors.join('\n\n'));
    process.exit(1);
  } else {
    console.log(`${ansiGreen('Success:')} all URLs and redirects are good.`);
  }
};

await main();

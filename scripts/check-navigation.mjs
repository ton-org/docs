/*─────────────────────────────────────────────────────────────────────────────╗
│                                  IMPORTANT:                                  │
│  Run this script from the root of the docs, not from the scripts directory!  │
╞══════════════════════════════════════════════════════════════════════════════╡
│  The script can check:                                                       │
│  1. Uniqueness of navigation paths                                           │
│  2. Existence of .mdx files on navigation paths                              │
│  3. Coverage of .mdx files by navigation structure in docs.json              │
│                                                                              │
│  By default, it checks all, but to only check one specify `unique`,          │
│  `exist` or `coverage` as a command-line argument, respectively.             │
│                                                                              │
│  For example, this command will run the 1st check only:                      │
│  $ node scripts/check-navigation.mjs unique                                  │
╚─────────────────────────────────────────────────────────────────────────────*/

// Node.js
import { existsSync, statSync } from 'node:fs';

// Common utils
import {
  composeSuccess,
  composeWarningList,
  composeErrorList,
  getNavLinks,
  getNavLinksSet,
  getConfig,
  findFiles,
  initMdxParser,
  hasStub,
} from './common.mjs';

/**
 * Types
 * @typedef {import('./common.mjs').DocsConfig} DocsConfig
 * @typedef {import('./common.mjs').CheckResult} CheckResult
 */

/**
 * Check that all navigation paths are unique.
 *
 * @param config {Readonly<DocsConfig>} Local docs.json configuration
 * @return {CheckResult}
 */
const checkUnique = (config) => {
  const navLinksSet = getNavLinksSet(config);
  const navLinks = getNavLinks(config);
  if (navLinks.length != navLinksSet.size) {
    return {
      ok: false,
      error: composeErrorList(
        'Found duplicate navigation paths:',
        navLinks.filter((val, idx) => navLinks.indexOf(val) !== idx && navLinks.indexOf(val, idx + 1) === -1),
        'Navigation paths in docs.json must be unique!',
      ),
    };
  }
  // Otherwise
  return { ok: true };
};

/**
 * Check that all navigation .mdx pages exist.
 *
 * @param config {Readonly<DocsConfig>} Local docs.json configuration
 * @return {CheckResult}
 */
const checkExist = (config) => {
  const uniqPages = [...getNavLinksSet(config)];
  const missingPages = uniqPages.filter((it) => {
    const rel = it.replace(/^\/+/, '').replace(/#.*$/, '') + '.mdx';
    return !(existsSync(rel) && statSync(rel).isFile());
  });
  if (missingPages.length !== 0) {
    return {
      ok: false,
      error: composeErrorList(
        'Nonexistent paths found:',
        missingPages,
        'Some navigation paths in docs.json point to nonexisting .mdx pages!',
      ),
    };
  }
  // Otherwise
  return { ok: true };
};

/**
 * Check that all existing non-API .mdx pages are covered by `config`.
 *
 * @param config {Readonly<DocsConfig>} Local docs.json configuration
 * @return {CheckResult}
 */
const checkCover = (config) => {
  const uniqPages = getNavLinksSet(config);
  const parser = initMdxParser();
  /** @type string[] */
  const stubPages = [];

  /** Non-API, non-snippet .mdx pages, excluding the root index.mdx */
  const allMdxPages = findFiles('mdx');
  const forgottenPages = allMdxPages.filter((it) => {
    // Present in the navigation
    if (uniqPages.has(it.replace(/\.mdx$/, ''))) {
      return false;
    }
    // Lost from the navigation and not a stub
    if (!hasStub(parser, it)) {
      return true;
    }
    // Lost from the navigation and is a stub,
    // which makes it be a warning, not an error
    stubPages.push(it);
    return false;
  });
  if (stubPages.length !== 0) {
    console.log(composeWarningList('Found stub pages not mentioned in docs.json navigation!', stubPages));
  }
  if (forgottenPages.length !== 0) {
    return {
      ok: false,
      error: composeErrorList(
        'Missing navigation entries for the following files:',
        forgottenPages,
        'Some non-API and non-stub .mdx pages are not present in docs.json!',
      ),
    };
  }
  // Otherwise
  return { ok: true };
};

const main = async () => {
  const config = getConfig();
  console.log(); // intentional break

  // Running either one check or all checks
  const rawArgs = process.argv.slice(2);
  const argUnique = rawArgs.includes('unique'); // all references are unique
  const argExist = rawArgs.includes('exist'); // all referenced .mdx files exist
  const argCover = rawArgs.includes('cover'); // all .mdx files are covered by docs.json
  const args = [argUnique, argCover, argExist];
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
    console.log('🏁 Checking the uniqueness of navigation paths in docs.json...');
    handleCheckResult(checkUnique(config), 'All paths are unique.');
  }

  if (shouldRunAll || argExist) {
    console.log('🏁 Checking the existence of navigation .mdx pages in docs.json...');
    handleCheckResult(checkExist(config), 'All referenced pages exist.');
  }

  if (shouldRunAll || argCover) {
    console.log('🏁 Checking the coverage of .mdx pages by docs.json...');
    handleCheckResult(checkCover(config), 'All non-API .mdx pages are present in docs.json.');
  }

  // In case of errors, exit with code 1
  if (errored) {
    process.exit(1);
  }
};

await main();

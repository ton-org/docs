import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import { createMDX } from 'fumadocs-mdx/next';
import { ghPagesUrl, gitConfig } from './src/lib/shared';

const withMDX = createMDX();
// WARN: Keep in sync with scripts/common.mjs:
const isGitHubPagesBuild =
  process.env.GITHUB_ACTIONS === 'true' || process.env.GITHUB_PAGES === 'true';
// WARN: Keep in sync with scripts/common.mjs:
const isVercelBuild = process.env.VERCEL === '1';
// WARN: Keep in sync with scripts/common.mjs:
const isCloudflarePagesBuild = process.env.CF_PAGES === '1';
// WARN: Keep in sync with scripts/common.mjs:
const isLocalBuild = !isGitHubPagesBuild && !isVercelBuild && !isCloudflarePagesBuild;
const isVercelProd = isVercelBuild && resolveBaseUrl().startsWith('https://docs.ton.org');
let gitRepoMatch: RegExpMatchArray | null = null;
try {
  const gitUrl = execSync('git config --get remote.origin.url', {
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .toString()
    .trim();
  gitRepoMatch = gitUrl.match(/(?:github\.com[:/])(.+?)\/(.+?)(?:\.git)?$/);
} catch {}

function resolveBaseUrl() {
  const publicUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (publicUrl !== undefined && publicUrl !== '') {
    return publicUrl;
  }

  if (isGitHubPagesBuild) {
    return ghPagesUrl;
  }

  if (isCloudflarePagesBuild) {
    return process.env.CF_PAGES_URL ?? 'https://docs.ton.org';
  }

  return 'http://localhost:3000';
}

function resolveBasePath() {
  if (isGitHubPagesBuild) {
    return `/${gitConfig.repo}`;
  }

  return undefined;
}

const config: NextConfig = {
  output: 'export',
  reactStrictMode: true,
  env: {
    NEXT_CONFIG: 'static',
    NEXT_BUILD_TYPE: isLocalBuild
      ? 'local'
      : isVercelBuild
        ? isVercelProd
          ? 'vercel'
          : 'vercel-dev'
        : isGitHubPagesBuild
          ? 'github'
          : isCloudflarePagesBuild
            ? 'cloudflare'
            : 'unknown',
    NEXT_PUBLIC_BASE_URL: resolveBaseUrl(),
    NEXT_PUBLIC_BASE_PATH: resolveBasePath() ?? '',
    NEXT_GIT_USER: gitRepoMatch?.at(1) ?? 'ton-blockchain',
    NEXT_GIT_REPO: gitRepoMatch?.at(2) ?? 'docs',
    NEXT_GIT_BRANCH: 'main',
  },
  basePath: resolveBasePath(),
  turbopack: {
    root: fileURLToPath(new URL('.', import.meta.url)),
  },
  images: { unoptimized: true },
  serverExternalPackages: ['typescript'],
  experimental: {
    useTypeScriptCli: true,
    ...(isLocalBuild && {
      // workerThreads: false,
      // --webpack --disable-source-maps --no-server-fast-refresh
      cpus: 3,
      webpackMemoryOptimizations: true,
      webpackBuildWorker: true,
      turbopackMemoryLimit: 6442450944, // 6 GiB
      // Despite browser console warnings, this is a great RAM usage optimization
      serverSourceMaps: false,
      preloadEntriesOnStart: false,
      memoryBasedWorkersCount: true,
    }),
    ...(isCloudflarePagesBuild && {
      serverSourceMaps: false,
    }),
  },
  ...(isLocalBuild && {
    // These source maps do not affect local builds much:
    // productionBrowserSourceMaps: false,
    // enablePrerenderSourceMaps: false,
    webpack: (config, { dev }) => {
      if (dev) {
        config.devtool = false;
      }
      return config;
    },
    typescript: {
      ignoreBuildErrors: true,
    },
  }),
};

export default withMDX(config);

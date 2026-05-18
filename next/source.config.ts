import {defineConfig, defineDocs} from "fumadocs-mdx/config"
import type {LanguageRegistration} from "shiki"
import tolkGrammarRaw from "./grammars/grammar-tolk.json"
import funcGrammarRaw from "./grammars/grammar-func.json"
import tasmGrammarRaw from "./grammars/grammar-tasm.json"
import tlbGrammarRaw from "./grammars/grammar-tlb.json"
import fiftGrammarRaw from "./grammars/grammar-fift.json"
import lastModified from "fumadocs-mdx/plugins/last-modified"
import {pageSchema} from "fumadocs-core/source/schema"
import {remarkMdxFiles, remarkMdxMermaid} from "fumadocs-core/mdx-plugins"
import remarkMath from "remark-math"
import remarkGfm from "remark-gfm"
import {z} from "zod"

/**
 * Docs page schema extends Fumadocs' built-in `pageSchema` with metadata fields
 * carried over from the previous Mintlify deployment (`description`, `icon`,
 * `sidebarTitle`, `mode`, `openapi`).
 */
export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    schema: pageSchema
      .extend({
        title: z.string().optional().default("Untitled"),
        description: z.string().optional().default(""),
        icon: z.string().optional(),
        sidebarTitle: z.string().optional(),
        mode: z.union([z.enum(["default", "wide", "custom"]), z.string()]).optional(),
        openapi: z.union([z.string(), z.record(z.string(), z.any())]).optional(),
        ogImage: z.string().optional(),
        twitterImage: z.string().optional(),
        tag: z.string().optional(),
        keywords: z.array(z.string()).optional(),
      })
      // Avoid build aborts when a single page has malformed frontmatter; the
      // page just renders with default values and we surface the issue in the
      // validate-navigation lint instead.
      .passthrough(),
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
})

const tolkGrammar: LanguageRegistration = {
  ...(tolkGrammarRaw as unknown as LanguageRegistration),
  name: "tolk",
}

const funcGrammar: LanguageRegistration = {
  ...(funcGrammarRaw as unknown as LanguageRegistration),
  name: "func",
}

const tasmGrammar: LanguageRegistration = {
  ...(tasmGrammarRaw as unknown as LanguageRegistration),
  name: "tasm",
}

const tlbGrammar: LanguageRegistration = {
  ...(tlbGrammarRaw as unknown as LanguageRegistration),
  name: "tlb",
}

const fiftGrammar: LanguageRegistration = {
  ...(fiftGrammarRaw as unknown as LanguageRegistration),
  name: "fift",
}

const builtinLangs = [
  "bash",
  "fish",
  "json",
  "powershell",
  "toml",
  "yaml",
  "typescript",
  "tsx",
  "javascript",
  "jsx",
  "rust",
  "python",
  "go",
  "java",
  "c",
  "cpp",
  "csharp",
  "ruby",
  "html",
  "css",
  "diff",
  "docker",
  "graphql",
  "kotlin",
  "lua",
  "markdown",
  "mdx",
  "sql",
  "swift",
  "mermaid",
  "scss",
  "stylus",
  "shellscript",
  "vue",
  "angular-ts",
  "haskell",
  "ocaml",
  "scheme",
] as const

const customLangs = [tolkGrammar, funcGrammar, tasmGrammar, tlbGrammar, fiftGrammar] as const

export default defineConfig({
  plugins: [lastModified()],
  mdxOptions: {
    rehypeCodeOptions: {
      lazy: true,
      fallbackLanguage: "text",
      themes: {
        light: "github-light-default",
        dark: "dark-plus",
      },
      langs: [...builtinLangs, ...customLangs],
    },
    remarkPlugins: [remarkMdxFiles, remarkGfm, remarkMath, remarkMdxMermaid],
  },
})

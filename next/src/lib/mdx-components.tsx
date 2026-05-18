import defaultMdxComponents from "fumadocs-ui/mdx"
import type {MDXComponents} from "mdx/types"
import {
  CommandOption,
  CommandOptionMeta,
  CommandOptions,
  CommandOptionTitle,
} from "@/components/CommandOptions"
import {Callout} from "@/components/Callout"
import {ImageZoom} from "@/components/image-zoom"
import {Mermaid} from "@/components/Mermaid"
import {SourceCodeLink} from "@/components/SourceCodeLink"
import * as Mintlify from "@/components/mintlify"

/**
 * Provides the runtime MDX component map.
 *
 * The map is composed of three layers, in order of override priority:
 *   1. Fumadocs UI defaults (`defaultMdxComponents`).
 *   2. Mintlify-compatibility shims so legacy MDX (`Aside`, `Card`, `Steps`,
 *      etc.) renders unchanged.
 *   3. Acton-style helpers (`Callout`, `CommandOptions`, etc.) so newly
 *      authored pages can use them with no imports.
 *   4. Per-call overrides (caller-provided `components`) — useful for
 *      `createRelativeLink(source, page)` in `[...slug]/page.tsx`.
 */
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    ...Mintlify,
    CommandOption,
    CommandOptionMeta,
    CommandOptions,
    CommandOptionTitle,
    SourceCodeLink,
    Callout,
    Mermaid,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    img: props => <ImageZoom {...(props as any)} />,
    ...components,
  }
}

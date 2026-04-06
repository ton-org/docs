import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkMdx from 'remark-mdx';
import unifiedConsistency from 'unified-consistency';
import stringWidth from 'string-width';
import { visitParents, SKIP } from 'unist-util-visit-parents';
import { generate } from 'astring';

/**
 * @import {} from 'remark-stringify'
 * @type import('unified').Preset
 */
const remarkConfig = {
  settings: {
    bullet: '-',
    emphasis: '_',
    rule: '-',
    incrementListMarker: false,
    tightDefinitions: true,
  },
  plugins: [
    remarkFrontmatter,
    remarkMath,
    [
      remarkGfm,
      {
        singleTilde: false,
        stringLength: stringWidth,
      },
    ],
    [
      remarkMdx,
      {
        printWidth: 20,
      },
    ],
    function formatJsxElements() {
      return (tree, file) => {
        // a JSX element embedded in flow (block)
        visitParents(tree, 'mdxJsxFlowElement', (node, ancestors) => {
          try {
            if (!node.attributes) { return; }
            for (const attr of node.attributes) {
              if (
                attr.type === 'mdxJsxAttribute' &&
                attr.value?.type === 'mdxJsxAttributeValueExpression' &&
                attr.value.data?.estree
              ) {
                const expr = attr.value;

                // Slighly trim single-line expressions
                if (typeof expr.value === 'string' && !expr.value.trim().includes('\n')) {
                  expr.value = expr.value.trim();
                  delete expr.data.estree;
                  continue;
                }

                // Multi-line expressions
                if (!expr.data) { continue; }
                const indent = ancestors.length === 0 ? 0 : ancestors.length;
                const formatted = generate(expr.data.estree.body[0].expression, {
                  startingIndentLevel: indent,
                });
                expr.value = formatted;
                delete expr.data.estree;
              }
            }
          } catch (_) {
            // NOTE: Let's silently do nothing — this is the default behavior anyways
          }
        });
        // a JSX element embedded in text (span, inline)
        visitParents(tree, 'mdxJsxTextElement', (node) => {
          try {
            if (!node.attributes) { return SKIP; }
            for (const attr of node.attributes) {
              if (
                attr.type === 'mdxJsxAttribute' &&
                attr.value?.type === 'mdxJsxAttributeValueExpression' &&
                attr.value.data?.estree
              ) {
                const expr = attr.value;
                if (!expr.data) { continue; }
                const formatted = generate(expr.data.estree.body[0].expression);
                expr.value = formatted;
                delete expr.data.estree;
              }
            }
            return SKIP;
          } catch (_) {
            // NOTE: Let's silently do nothing — this is the default behavior anyways
          }
        });
        // a JavaScript expression embedded in flow (block)
        visitParents(tree, 'mdxFlowExpression', (node) => {
          try {
            if (!node.data) { return SKIP; }
            const formatted = generate(node.data.estree.body[0].expression);
            node.value = formatted;
            delete node.data.estree;
            return SKIP;
          } catch (_) {
            // NOTE: Let's silently do nothing — this is the default behavior anyways
          }
        });
        // a JavaScript expression embedded in text (span, inline)
        visitParents(tree, 'mdxTextExpression', (node) => {
          try {
            if (!node.data) { return SKIP; }
            const formatted = generate(node.data.estree.body[0].expression);
            node.value = formatted;
            delete node.data.estree;
            return SKIP;
          } catch (_) {
            // NOTE: Let's silently do nothing — this is the default behavior anyways
            // console.error(
            //   `Could not format a node in the file ${file.path}: ${JSON.stringify(node)}`
            // );
          }
        });
      };
    },
    unifiedConsistency,
  ],
};

export default remarkConfig;

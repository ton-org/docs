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
          if (!node.attributes) { return; }
          try {
            for (const attr of node.attributes) {
              if (
                attr.type === 'mdxJsxAttribute' &&
                attr.value?.type === 'mdxJsxAttributeValueExpression' &&
                attr.value.data?.estree
              ) {
                const expr = attr.value;

                // Skip single-line expressions
                if (typeof expr.value === 'string' && !expr.value.includes('\n')) {
                  continue;
                }

                // Multi-line expressions
                const indent = ancestors.length === 0 ? 0 : ancestors.length;
                const formatted = generate(expr.data.estree.body[0].expression, {
                  startingIndentLevel: indent,
                });
                expr.value = formatted;
                delete expr.data.estree;
              }
            }
          } catch (_) {
            console.error(
              `Could not format a node in the file ${file.path}: ${JSON.stringify(node)}`
            );
          }
        });
        // a JSX element embedded in text (span, inline)
        visitParents(tree, 'mdxJsxTextElement', (node) => {
          if (!node.attributes) { return; }
          try {
            for (const attr of node.attributes) {
              if (
                attr.type === 'mdxJsxAttribute' &&
                attr.value?.type === 'mdxJsxAttributeValueExpression' &&
                attr.value.data?.estree
              ) {
                const expr = attr.value;
                const formatted = generate(expr.data.estree.body[0].expression);
                expr.value = formatted;
                delete expr.data.estree;
              }
            }
            return 'skip';
          } catch (_) {
            console.error(
              `Could not format a node in the file ${file.path}: ${JSON.stringify(node)}`
            );
          }
        });
        // a JavaScript expression embedded in flow (block)
        visitParents(tree, 'mdxFlowExpression', (node) => {
          if (!node.data) { return; }
          try {
            const formatted = generate(node.data.estree.body[0].expression);
            node.value = formatted;
            delete node.data.estree;
            return SKIP;
          } catch (_) {
            console.error(
              `Could not format a node in the file ${file.path}: ${JSON.stringify(node)}`
            );
          }
        });
        // a JavaScript expression embedded in text (span, inline)
        visitParents(tree, 'mdxTextExpression', (node) => {
          if (!node.data) { return; }
          try {
            const formatted = generate(node.data.estree.body[0].expression);
            node.value = formatted;
            delete node.data.estree;
            return SKIP;
          } catch (_) {
            console.error(
              `Could not format a node in the file ${file.path}: ${JSON.stringify(node)}`
            );
          }
        });
      };
    },
    unifiedConsistency,
  ],
};

export default remarkConfig;

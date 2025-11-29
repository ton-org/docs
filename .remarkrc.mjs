import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkMdx from 'remark-mdx';
import unifiedConsistency from 'unified-consistency';
import stringWidth from 'string-width';
import remarkLintNoTrailingSpaces from 'remark-lint-no-trailing-spaces';

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
    unifiedConsistency,
    remarkLintNoTrailingSpaces,
  ],
};

export default remarkConfig;

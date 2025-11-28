import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkMdx from 'remark-mdx';
import unifiedConsistency from 'unified-consistency';

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
      },
    ],
    [
      remarkMdx,
      {
        printWidth: 20,
      },
    ],
    unifiedConsistency,
  ],
};

export default remarkConfig;

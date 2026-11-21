import type { Extension } from '../api';
import mdxJsxBuild from './build';
import expressionText from './expression-text';
import mdxChunks from './chunks';
import { mdxFlow } from './flow';
import mdxFlowScope from './flow-scope';
import mdxLabel from './label';
import jsxText from './jsx-text';

/** The MDX rules without a JS parser, as one extension. */
export default function createMdx(): Extension {
  return {
    name: 'talata:mdx',
    blockRules: [mdxFlowScope, mdxFlow],
    inlineRules: [mdxChunks, mdxLabel, jsxText, expressionText],
    transforms: [mdxJsxBuild],
    // As micromark-extension-mdx-md.
    disable: { block: ['codeIndented', 'html'], inline: ['autolink', 'html'] },
  };
}

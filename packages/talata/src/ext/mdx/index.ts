import type { BlockRule } from '../../core/blocks';
import type { InlineRule } from '../../core/inline';
import type { Extension } from '../api';
import { bindJs } from './acorn';
import type { Js } from './acorn';
import mdxJsxBuild from './build';
import expressionText from './expression-text';
import mdxChunks from './chunks';
import { createEsm, createEsmHeader } from './esm';
import { mdxFlow } from './flow';
import mdxFlowScope from './flow-scope';
import mdxLabel from './label';
import jsxText from './jsx-text';

// With acorn, each rule binds it to the parse's source before it runs, so
// the scanners find it (`jsOf`).
function bindBlockRule(js: Js, rule: BlockRule): BlockRule {
  return {
    ...rule,
    start(state, line) {
      bindJs(state.source, js);
      return rule.start(state, line);
    },
  };
}

function bindInlineRule(js: Js, rule: InlineRule): InlineRule {
  return {
    ...rule,
    parse(state) {
      bindJs(state.source, js);
      return rule.parse(state);
    },
  };
}

/** The MDX rules, without a JS parser or with the acorn of `js`, as one extension. */
export default function createMdx(js?: Js): Extension {
  const blockRules: BlockRule[] = [mdxFlowScope, mdxFlow];
  const inlineRules: InlineRule[] = [mdxChunks, mdxLabel, jsxText, expressionText];
  const extension: Extension = {
    name: 'talata:mdx',
    blockRules,
    inlineRules,
    transforms: [mdxJsxBuild],
    // As micromark-extension-mdx-md.
    disable: { block: ['codeIndented', 'html'], inline: ['autolink', 'html'] },
  };
  if (js !== undefined) {
    blockRules.push(createEsm(js), createEsmHeader(js));
    extension.blockRules = [];
    for (const rule of blockRules) {
      extension.blockRules.push(bindBlockRule(js, rule));
    }
    extension.inlineRules = [];
    for (const rule of inlineRules) {
      extension.inlineRules.push(bindInlineRule(js, rule));
    }
    extension.transforms = [
      {
        ...mdxJsxBuild,
        transform(tree, state) {
          bindJs(state.source, js);
          mdxJsxBuild.transform(tree, state);
        },
      },
    ];
  }
  return extension;
}

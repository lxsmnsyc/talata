import type { InlineRule } from '../../core/inline';
import type { Extension } from '../api';
import { bindJs } from './acorn';
import type { Js } from './acorn';
import mdxJsxBuild from './build';
import expressionText from './expression-text';
import { createEsm, createEsmHeader } from './esm';
import createMdxFlow from './flow';
import mdxLabel from './label';
import jsxText from './jsx-text';

// With acorn, each inline rule and the transform bind it to the parse's
// source before they run, so the scanners find it (`jsOf`). The block rules
// bind it themselves.
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
  const inlineRules: InlineRule[] = [mdxLabel, jsxText, expressionText];
  const extension: Extension = {
    name: 'talata:mdx',
    blockRules: [createMdxFlow(js)],
    inlineRules,
    transforms: [mdxJsxBuild],
    // As micromark-extension-mdx-md.
    disable: { block: ['codeIndented', 'html'], inline: ['autolink', 'html'] },
  };
  if (js !== undefined) {
    extension.blockRules!.push(createEsm(js), createEsmHeader(js));
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

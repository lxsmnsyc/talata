# Outcome: mdx-core

## Built

Extension contract v4: an extension turns off core rules by name. Paths are under `packages/talata/`.

- `src/ext/api.ts`: `Extension.disable?: { block?: string[]; inline?: string[] }`.
- Rule names to use: block `codeIndented`, block `html`; inline `html`, inline `autolink`. For ext-mdx (the `mdx-md` list): `disable: { block: ['codeIndented', 'html'], inline: ['autolink', 'html'] }`. Reference names: `htmlFlow` is block `html`, `htmlText` is inline `html`.
- Where filtering happens: `src/core/registry.ts`, `createRegistry`, once per cached registry. `select(rules, options, disabled)` skips rules whose `name` is in the list. `RuleSet` has `disableBlock` and `disableInline`; `src/index.ts` (`registryFor`) joins the lists of all extensions into them. The lists apply to every rule, core or from any extension, in any order. Unknown names are ignored. The cache key is unchanged (the extension objects).
- Turning off `codeIndented` also lifts the 3-column limit of other constructs, as micromark does. New field `Line.indentLimit` (`src/core/line.ts`): 4, or `Infinity` when block `codeIndented` is off. `Registry.indentLimit` holds it, `BlockParser.run` creates the line with it, `createLine(text, indentLimit = 4)`. Rules compare `line.indent >= line.indentLimit` in: block quote, ATX heading, setext heading, thematic break, fenced code (open and close), block HTML, list item, list sibling, GFM table, footnote definition start. Two more places read the limit: the width taken after a list marker (`list-item.ts`, `indent <= line.indentLimit`) and the whitespace kept after each line ending inside an inline HTML tag (`inline/html.ts`, `linePrefix(state, r + 2, state.rules.indentLimit - 1)`; inline state reaches `Registry.indentLimit` through `state.rules`).
- Test: `test/mdx-core.test.ts`. 8 disable lists (each rule alone, `htmlFlow+htmlText`, `codeIndented+htmlFlow`, `codeIndented+autolink`, all four), with and without GFM, about 140 inputs (indented lines after paragraphs, in lists and quotes, `<div>`, `<a>`, `<https://x>`, fences, tables, footnotes), each equal to `mdast-util-from-markdown` with `{ disable: { null } }`. Also: no list gives the same tree, unknown names ignored, a disable list applies to another extension's rule.
- Contract: v4 section appended to `roadmaps/v2/contracts/extension.change-request.md` (status open).

## Proof

- base `ee78234`, `interleaved`: talata readmes 44 to 52 ms, fs.md 12.6 to 16.4 ms, CHANGELOG 28 to 40 ms.
- branch: readmes 36 to 46 ms, fs.md 11.8 to 13.1 ms, CHANGELOG 28 to 36 ms. Three alternating runs of each dist build; no slowdown beyond run noise (the machine drifted by about 20% between runs). Ratio against "mdast + gfm" stayed 17x to 24x on both.

## Deviations

- `src/index.ts`, `src/blocks/{blockquote,code-fenced,heading-atx,heading-setext,html,list,list-item,thematic-break}.ts`, `src/gfm/{table,footnote}.ts`, `src/inline/html.ts`: outside the owned paths. `index.ts` collects the lists; the rest replace the literal 4 with `line.indentLimit`. Each edit is one token.

## Stubs left

- None.

## Gotchas

- `src/ext/math/flow.ts` and `src/ext/directive/*` still use a literal `line.indent >= 4`. With `codeIndented` off, math and directive would keep the old limit. ext-mdx's JSX flow rule must use `line.indentLimit`.
- Paragraph continuation and lazy-line checks needed no change: they do not read the indent.
- Block and inline names overlap (`html`), so always give the list for the right kind.
- `src/ext/api.ts` tests that call `isClosingFence(line, ...)` pass a `Line` from `createLine`, which defaults `indentLimit` to 4.

## Proposed learnings

- A rule that refuses a line at 4 columns of indentation compares with `line.indentLimit`, not 4 | micromark lifts the limit when `codeIndented` is off | packages/talata/src | no

## Verification

- `pnpm --filter talata test`: 6463 passed.
- `npx tsc --noEmit -p .` in packages/talata: clean. `npx oxfmt --check`: clean. `npx oxlint`: no errors in packages/ (errors remain in `.github/scripts/smoke.mjs`, not touched).
- `pnpm fuzz --count 100000 --all --no-save` (rerun after the review fixes): 100000 compared, 0 failures.
- `pnpm --filter benchmark interleaved`: see Proof.

## Size

- Estimated S, actual S.

Landed as e28a9a9 on batch/v2.

# Outcome: ext-mdx-estree

## Built

`mdx({ acorn })` now puts acorn's program in `data.estree` on `mdxjsEsm`, `mdxFlowExpression`, `mdxTextExpression`, `mdxJsxExpressionAttribute` and `mdxJsxAttributeValueExpression` nodes, equal to `micromark-extension-mdxjs` 3.0.0 with `mdast-util-mdx` 3.0.0 (`micromark-util-events-to-acorn` 2.0.3): `start`, `end`, `loc` (with `offset`) and `range` mapped to the document across line prefixes, tabs and CRLF/CR, `comments`, the expression wrapper `Program`, and the ESM prefix declaration removed. `mdx()` without acorn makes no `data.estree`. Paths are under `packages/talata/src/`.

- `@mdx-js/mdx` 3.1.1 takes talata through `remarkPlugins`: `compile(value, { remarkPlugins: [[talata, { extensions: [mdx({ acorn })] }]] })`. `createProcessor` runs `remark-parse`, then `remark-mdx`, then the caller's plugins; each attacher sets `this.parser` in that order, so talata's wins. `remark-mdx` then only adds micromark extensions, which talata does not read. No other way is needed.
- `ext/mdx/acorn.ts`: `parseExpression` returns the program or the crash; `parseEsm` returns it in `estree`. `finish` sets `comments`, then `visit` walks the program as `estree-util-visit` 2.0.0 does with the visitor of `eventsToAcorn`: own keys in order, `data` and `position` skipped, a `ParenthesizedExpression` replaced in its parent, then `fixPosition`. The reference's quirks follow from walking the same way: nested parentheses keep the inner `ParenthesizedExpression` (`{((a))}`; `@mdx-js/mdx` then fails to compile on both sides), and a node acorn shares (`local` and `imported` of `import {a} from 'b'`, `local` and `exported` of `export {a}`) is mapped twice. `offsetOf` is `relativeToPoint` with a binary search over the stops (was a linear scan; same result). The caller's `onComment` and `onToken` (arrays or functions) get the comments and tokens of each parse that succeeds, as there. `finish` returns the call as a function, so it can run again. The spread and non-ESM errors are worked out on acorn's offsets before the walk and thrown after it, so callbacks run first, as in the reference.
- `ext/mdx/scanner.ts`: the program of the `}` that ends an expression is kept (`Scanner.estree`); `Expression.estree`, `Attribute.data`, and `expressionNode` builds flow and text expression nodes with it. `flow.ts`, `build.ts`, `expression-text.ts` use `expressionNode`; `esm.ts` adds `data` to `mdxjsEsm`.
- `Scanner.interrupts` (set by `flow.ts` when `state.paragraph` is open): in flow that interrupts a paragraph, micromark's interrupt check reads the lines before the construct is parsed, so each line ending ends after the next line's container prefixes. `feed` then adds a stop at `lineStart`. It shows only where a line ending is the last thing before a stop that has no chunk, such as the program's end in `>y\n{\n>}` (6, not 5). Error places never hit it; the targeted generator found it.
- Callbacks in interrupting flow: micromark parses flow that interrupts a paragraph twice, the interrupt check and then the construct, so `onComment` and `onToken` get each of its programs twice (`para\n{/* c */}` gives the comment twice; the copies are deep-equal). The scanner records the calls (`Scanner.replay`, passed to `parseExpression`) and `flow.ts` runs them again when the construct ends (`runReplay`), so the order is the reference's: all of the check's calls, then the construct's. When the construct fails and the lines become a paragraph, the inline parse makes the second call, as micromark's text parse does. Container directives do not parse twice (with `directive()` on, `:::x\n{a /* c */ +\nb}\n:::` matches).
- `mdx.ts`: options holding arrays are no longer cached by value, so each `mdx({ acorn, acornOptions: { onComment: [] } })` fills its own array (before, a second call with a new empty array got the first extension and its array). Docs say `data.estree` is made.
- Tests: `test/parsers.ts` no longer passes `addResult: false`, so every test, the fuzzer and both targeted generators compare `data.estree`. `test/mdx-estree.test.ts`: about 140 inputs (parentheses, comments, templates, regexes, BigInt, JSX, specifiers, quote, list, footnote, directive and table prefixes with tabs, CRLF and CR, labels, rescans), with and without GFM and with all extensions, compared with `toStrictEqual`; a places check; no estree without acorn; `onComment` and `onToken` against the reference for every input, with `['mdx']` and with all extensions (`acornCallbacks` in `test/parsers.ts`); growth of six shapes. `test/mdx-estree-targeted.test.ts`: generator (`MDX_ESTREE_TARGETED`, `MDX_ESTREE_START`) comparing trees and the callbacks (functions and arrays, `isDeepStrictEqual`), with and without directive; asserts over half the documents parse. `test/mdx-compile.test.ts`: `@mdx-js/mdx` `compileSync` with talata against the default parser, gfm off and on, over the input lists of `mdx-acorn`, `mdx-reference` and `mdx-estree` tests, the corpus, and fuzz documents (`MDX_COMPILE_COUNT`, default 300). `test/fuzz/ext-mdx.ts`: estree shapes added to expressions, attributes and ESM.
- `package.json`: `@mdx-js/mdx` ^3.1.1 as a devDependency (caret, as the other devDependencies). `dependencies` is still `@types/mdast` only.

## Deviations

- `.changeset/mdx-acorn.md` (not owned, edited at the review's request): now says `data.estree` is made with acorn and that `@mdx-js/mdx` 3.1.1 can use talata through `remarkPlugins` with `mdx({ acorn })`, and that without acorn it compiles broken JS. No new changeset.
- `test/mdx-acorn.test.ts` (not owned, edited at the review's request): its header comment no longer says the reference runs with `addResult: false`.
- `test/mdx-compile.test.ts` declares a global `JSX` namespace: `@types/mdx`, pulled in by `@mdx-js/mdx`, names it and tsc failed without it (the project has no JSX runtime types). It reads the input lists of the other MDX test files from their source (`node:vm`), so they stay in one place.

## Stubs left

- None.

## Gotchas

- `@mdx-js/mdx` throws a `TypeError` in `astring` on `{((a))}` and `export default ((a))` with either parser: the reference leaves the inner `ParenthesizedExpression`. The compile test compares these as equal throws.
- The dist of every entry but `talata/mdx` is byte-identical to the base (25df71f).

## Proposed learnings

- When porting a tree walk whose visitor mutates, walk the same keys in the same order rather than walking "correctly" | the reference's shared-node and nested-paren results only follow from the same walk | packages/talata/src/ext/mdx | yes (`mdx-estree` inputs)

## Verification

All on the final code, `NODE_ENV=production`, against base 25df71f (PR #35). Machine load from other sessions was 8 to 90.

- Fast check: `pnpm --filter talata test` 48 files, 6993 tests pass; `tsc --noEmit` clean; `oxfmt --check` clean; `oxlint`: only the smoke.mjs errors and the two known `max-depth` warnings in `src/ext/directive/`.
- `pnpm fuzz --count 1000000 --all --acorn` (seed 20261402, 8 chunks of 125,000), estree compared: 0 failures; 6 reference timeouts (load), replayed with `--timeout-ms 60000`: 0 failures. An earlier 1M run (seed 20261401, before the interrupt fix): 0 failures, 0 skipped.
- Targeted at 1,000,000 each: `MDX_ESTREE_TARGETED` (8 chunks via `MDX_ESTREE_START`) pass; `MDX_ACORN_TARGETED` (now with estree) pass. The first estree run found the interrupt class (7 chunks, all `>y\n{\n>}` shapes), fixed above.
- Compile: `test/mdx-compile.test.ts` with `MDX_COMPILE_COUNT=5000` on 8 seeds (20261501 to 20261508): 40,000 fuzz documents, gfm off and on, plus the 3 input lists and the 142 corpus files: same JS or same error each time.
- Tree compare of branch dist against base dist (scratch `hash.mjs`, `data.estree` stripped): corpus 142 files for none, mdx, all, acorn, all with acorn, gfm off and on; 200,000 fuzz documents (seed 20261601) for mdx, all, acorn, all with acorn, gfm off and on: 0 differences. Every dist file except `mdx.*` is byte-identical to the base, so output and speed without MDX cannot change.
- Growth: "stays linear" (six shapes, ratio at 4x under 8) passes. Many imported names are quadratic in acorn itself (2000 to 8000 names: acorn alone 16.0x, base 17.2x, branch 13.9x, reference 10.8x), so that shape is not in the test.
- Performance, perf-pass `bench.py`, 25 interleaved runs, best-of-15 median of 2,000 MDX fuzz documents (151 KB) with GFM, load 3.9 to 4.3, after the review fixes: `mdx()` base 19.17 ms, base copy 19.17 (0.0%), branch 19.30 (+0.6%, within noise). `mdx({ acorn })`: base 36.85 ms, branch 40.06 (+8.7%, the walk that builds `data.estree`); the reference on the same documents 262 ms, so talata stays about 6.5 times faster.
- Size (esbuild, minified, ES2020): main entry 35,461 bytes gzip on both (byte-identical dist); `talata/mdx` 21,100 to 21,920 bytes gzip (+820).

Review fixes (callbacks in interrupting flow, changeset, `mdx-acorn` header, caret range), on the amended commit:

- Fast check: suite 48 files, 6993 tests pass (`directive-growth` "root, unclosed" missed its time ratio once under load, passes alone); tsc, oxfmt clean; oxlint as above.
- `test/mdx-estree.test.ts`: every input's callbacks (functions and arrays) deep-equal to the reference, with `['mdx']` and with all extensions, including `para\n{/* c */}`, `a\n<A b={/* c */ 1} />`, `a\r\n{/*c*/ a +\r\nb}`, `- y\n{/*c*/\n  a}` and the two directive inputs.
- `MDX_ESTREE_TARGETED=1000000` (8 chunks), trees and callbacks: pass. With the replay turned off, it fails at document 30 (`x\r{/ /}`).
- `pnpm fuzz --count 300000 --all --acorn` (seed 20261701, 8 chunks): 0 failures, 0 skipped.

## Size

- Estimated M, actual M.

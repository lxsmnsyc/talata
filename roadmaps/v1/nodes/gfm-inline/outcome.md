# Outcome: gfm-inline

## Built

Branch `feat/gfm-inline`. Paths are under `packages/talata/`.

- `src/gfm/strikethrough.ts`, default export `strikethrough` (priority 50, `~`, `gfm: true`, with `resolve`). Runs of one or two tildes are delimiters, flanking as micromark-extension-gfm-strikethrough classifies them; three or more are text. A closer pairs with the nearest opener of the same size, on the delimiters alone (one opener stack per size), then the nodes are rebuilt in one pass. Each delete's inside is resolved by the later resolvers (emphasis) as its own span, by swapping `state.nodes`/`state.delimiters` for the call. Tildes left over are text.
- Resolve order, as micromark: inside links and pairs strikethrough resolves first. At the top level the order is that of the first `~` or `*`/`_` sequence of the leaf. The named export `attentionOrder` (priority 95, `*_`, always returns false) records it. When emphasis came first and a tilde pair is possible, strikethrough runs the emphasis resolver first (its mixed path), drops unpaired emphasis runs, then pairs the tildes. Otherwise emphasis keeps its linear path.
- `src/gfm/autolink-literal.ts`, default export `autolinkLiteral` (priority 90, `.:@_`, `gfm: true`): micromark-extension-gfm-autolink-literal's tokenizer, so these links have positions. It triggers on `.` (www, or an email before its `@`), `:` (http, https), `@` and `_` (an email takes `_` before emphasis), then takes back the pending plain text the link starts in. Email first, then www/protocol, as micromark's construct order. Ports `previousWww`, `previousProtocol`, `previousEmail`, `previousUnbalanced` (any `[`/`![` delimiter on the stack), domain, path and trail.
- `src/gfm/autolink-literal-transform.ts`, default export (`Transform`, `gfm: true`), registered in `src/core/transform.ts`: mdast-util-gfm-autolink-literal's `findAndReplace` pass (URL pattern, then email pattern) over text nodes outside `link` and `linkReference`, without regular expressions. Its links and the text nodes it splits have no position.
- Registration: three lines in `src/inline/index.ts`, one in `src/core/transform.ts`.
- Flags: `ready.gfm.strikethrough`, `ready.gfm.autolinkLiteral` (`test/parsers.ts`) and `supported.strikethrough`, `supported.autolinkLiteral` (`test/fuzz/features.ts`) are on. Removed from `gfmWaiting`: spec examples 602, 606, 608, 611, 612 (`test/equivalence.test.ts`, map now empty) and corpus files `readmes/114.md`, `19.md`, `38.md`, `40.md`. `readmes/10.md` and `91.md` list `table` and `autolinkLiteral`; I left those lines unchanged so gfm-tables can drop them whole.
- `test/gfm-inline.test.ts`: 37 strikethrough and 113 autolink cases compared to the reference with positions, and 16 growth tests (`workSteps` grows under 12 times for 8 times the input), each also compared to the reference at small size.

- Review round 1: the transform rebuilds children in one pass (no spread into `splice`, which overflowed the stack on 560 KB of emails), skips `replaceUrls` unless the text has `://` or `www.` in any case and `replaceEmails` unless it has `@`. Module-level references to the last leaf are dropped: `orderState` at the leaf's final resolve, the autolink memos through `releaseAutolinkMemos()` called by the transform.

## Deviations

- Contract: the reference makes most literal autolinks in the tokenizer, with positions, not only in a transform as the brief and the Positions section say. Built both. Change request: `roadmaps/v1/contracts/parser-core-v5-gfm-inline.change-request.md` (wording only; it also records the strikethrough/emphasis order).
- `strikethrough.ts` holds a second rule, `attentionOrder`, because it only serves the strikethrough resolve order.
- `packages/talata/README.md` not changed (outside owned paths). Candidates for its reference-versus-spec list: the resolve order above, positionless links from the transform, `www.` alone giving a link to `http://www`.

## Stubs left

- None.

## Gotchas

- gfm-tasks-footnotes: `- [\n  *x*` with GFM gives text `"[\n"` ending at 2:3 in the reference, 2:1 in talata (see Verification).

- A leaf where `*`/`_` comes before the first tilde, with a tilde pair possible, uses emphasis's quadratic mixed path. `*x* ` then `~a~ a* ` repeated: about 0.3 s at 50 KB here, quadratic beyond; the reference takes 13 s at 50 KB. perf-pass could fix it in `emphasis.ts`.
- The autolink rule takes back pending text with `takeBack`; at a range start it restores the line ending's end as `endRange` computed it. A rule that changes how line endings end must keep these in step.
- `previousUnbalanced` is "a delimiter with marker 91 or 33 is on the stack". gfm-tasks-footnotes: footnote calls that push bracket delimiters keep autolinks off after them, as open label starts do in micromark.
- The transform walks every text node of a GFM document; nodes without `.` are skipped with one `includes`. The tokenizer and the transform accept different previous characters, so both are needed.
- micromark's own quadratic cases (`www._` repeated, long trails, repeated candidates in one text node) are linear here through memos keyed on the leaf; the reference takes 5 s on 20 KB of `www._`.

## Proposed learnings

- Check where a GFM mdast node is made (tokenizer handler or transform) before choosing how to build it | autolink literals come from both, with and without positions | packages/talata/src/gfm | yes (reference comparison)
- micromark runs `resolveAll` constructs in the order their first token appeared, and extension `insideSpan` constructs before the defaults | decides strikethrough versus emphasis | packages/talata/src/gfm | yes (reference comparison)

## Verification

- After merging main (gfm-tables, ca0b33d): `npx vitest run` in `packages/talata` (corpus present): 17 files passed, 4760 tests passed, 12 skipped. The corpus files `readmes/10.md` and `91.md` (table and autolinks) now pass; I removed their `gfmWaiting` lines in the merge. Before the merge: 16 files, 4610 passed, 37 skipped.
- `npx tsc --noEmit -p packages/talata`: no errors. `npx oxlint`: no findings. `npx oxfmt` applied to the new files.
- Fuzz with GFM, before the merge: seed 11 20,000, seed 4242 50,000, seed 777 `--no-corpus` 50,000: 0 failures. Final run seed 2027, 100,000 documents: 99,938 compared, 1 failure, `- [\r  *x*`. After the merge, seed 31337 50,000: 1 failure, `* [\n  <t>`. Both are a `[` alone on the first line of a list item: with GFM the reference's text before the next line ends after the item's indent (2:3), talata ends it at 2:1. Without GFM they match. This looks like micromark's task list check reading the line ending as the check's whitespace and so reaching the next line, which belongs to gfm-tasks-footnotes; no strikethrough or autolink is involved (`- [\n  *x*` fails the same way). Not saved as fixtures: `fuzz.test.ts` would fail on them with every feature on.
- Scratch fuzzer of short documents from GFM-inline atoms (emphasis, tildes, brackets, URLs, emails, escapes, entities, tabs, astral characters), about 170,000 documents: no difference except tables.

- Review round 1, after merging main: `npx vitest run`: 17 files passed, 4762 tests passed, 12 skipped. tsc, oxlint and oxfmt clean. Fuzz seed 5150, 20,000 documents: 1 failure, the known task-list case `* [\r  *f*`.

## Size

- Estimated M, actual M. Literal autolinks took longer: two mechanisms instead of one.

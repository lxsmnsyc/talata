# Log: gfm-tasks-footnotes

## 2026-10-28

- Branch `feat/gfm-tasks-footnotes`. Read micromark-extension-gfm-footnote, micromark-extension-gfm-task-list-item, mdast-util-gfm-*, micromark `document.js`, `micromark-util-subtokenize` and mdast-util-from-markdown `prepareList`.
- Footnote definitions: block rule (priority 150, `[`), container implementing `TrackedContainer` and `closedAt`; end rule copied from list items. Calls: inline rule at 450; `![^a]` handled in `link.ts` when an image bracket fails.
- Definitions refused `[^` under GFM (blocks-leaf). The reference makes `[^]:;` and `[^big note]: x` definitions, so the refusal is gone; the footnote block rule takes valid lines first.
- Footnote indent is a token: it stops the subtokenize walk back (so it counts as `quoteLine`) and also stops `prepareList`'s walk, which skips quote prefixes. List items in a footnote closed on an indented line end at the closing event (`footnoteIndentAt`). Same for the last item when the list's end line has an indent (`indentEnd`).
- `prepareList` counts blank lines inside footnote definitions for the item's spread (only lists and quotes hide them): `footnoteBlankLine`.
- micromark quirk: a definition directly inside another continues with no indent of its own, since the indent check reads the last token (`[^a]: [^b]: <div>\n    c`).
- Task check: tab value works only when the tab is one column wide (virtual spaces). Setext headings take no check. The check runs on the first content of the flow after the marker, which can be a lazy paragraph outside the item; for list-item parents this works through `taskListStart`; root and quote parents get `checked` in the reference, which talata cannot set (change request).
- Fuzz (main, GFM, 50k each): seeds 101, 202, 303, 404. Fixed failures saved as 7 fixtures. Only gfm-inline's literal autolink text splits remain.
- Scratch fuzzer (container pieces plus footnotes and tasks, not committed): 170k documents, 0 failures apart from the lazy-root task case.
- Merged main (gfm-tables, ca0b33d). Conflicts in `blocks/index.ts`, `corpus.test.ts`, `features.ts` resolved by keeping both. The tables worker's `-\n[x]\n-|-` is the lazy-root case.

## Review round 1

- Should-fix: module-level `indentState` (footnote.ts) and `pendingState`/`pendingItem` (task-list.ts) kept the last parse alive. Both are now `WeakMap`s keyed by `BlockState`. `taskState` in task-list.ts is cleared by the same leaf's final resolve, so it only holds an object during that leaf's inline parse.
- No test for retention: a `WeakMap` entry cannot be observed without a heap measurement or a test-only hook, so I skipped it.
- Nit: list items call `footnoteIndentAt` only with GFM on.

## Merge of gfm-inline (main 12efa70)

- Conflicts in `src/inline/index.ts`, `test/parsers.ts`, `test/fuzz/features.ts` and `test/corpus.test.ts`; kept both sides. Every GFM flag is on, and `gfmWaiting` in the corpus test is empty.
- Interaction bug, mine: strikethrough resolves the inside of its pairs by calling the later resolvers with bottom 0 on a swapped node list, so the task resolve trimmed the delete's content (`- [X] ~_~`). The task resolve now acts only on the leaf's own node list.
- `![\n^a]`: the call string now starts on the next line, as in the reference (fuzz seed 5150, saved as a fixture). This was a known gap before.
- Fast check twice: 18 files, 4922 passed, 2 expected fails. GFM fuzz, 30k documents each, seeds 5150 (1 failure, the `![\n^a]` one, fixed) and 6161 (0 failures, 30,000 compared, none skipped).

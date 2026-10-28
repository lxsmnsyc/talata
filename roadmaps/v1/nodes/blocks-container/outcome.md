# Outcome: blocks-container

## Built

All paths are under `packages/talata/`.

- `src/blocks/blockquote.ts`: default export `blockquote` (priority 100, triggers `>`). It also has named exports that lists share: `TrackedContainer` (`quoteLine`, `openChild`, `closeEnd`, `interruptLine`), `isTracked`, `parentQuoteLine`, `closeAtNewContainer`, `linkChild`, `interrupts`, `isFlow` and `lastChildEnd`.
- `src/blocks/list.ts`: default export class `OpenList` (block name `list`). Also `readMarker` (bullet or 1 to 9 digits plus `.` or `)`), `isThematicBreak`, and the `Marker` and `ItemState` types. The list's `continue` follows micromark's list continuation exactly: it matches a blank line, a line indented to the current item's size, or a sibling item with the same marker that is not a thematic break. Otherwise it returns false. `canContain` accepts only `listItem`.
- `src/blocks/list-item.ts`: default export `listItem` (priority 700, triggers `*+-0123456789`). It opens the list with `openContainer` unless `state.container` is a list with the same marker. Item content size is counted in columns from the position before the marker's indent. 1 to 4 columns of whitespace after the marker are consumed; 5 or more consume one column (split tab). An item that starts blank gets marker width + 1. micromark's "at most one blank line at the start" rule (`furtherBlankLines`) is in the item.
- `src/blocks/index.ts`: registers `blockquote` and `listItem`.
- `test/blocks-container.test.ts`: the Block quotes, List items and Lists spec examples, compared to the reference with positions through `firstDiff`. It also runs examples 57, 60 and 61 and 55 position and `spread` cases that came from reading micromark and from fuzzing.

How positions and `spread` match the reference (from micromark `document.js`, `micromark-util-subtokenize` and `mdast-util-from-markdown`'s `prepareList`):

- A list or block quote ends at the start of the first line ending after its last token. Block quote prefixes count as tokens, list indentation does not. So a list inside a quote that continued over a blank `>` line ends after that `>`. Each container records `quoteLine`, the last line on which a quote prefix at or above it matched.
- When a new container (quote or new list) closes open containers on a line where a quote prefix matched, they end at the current position, after the matched prefixes (`> - a\n> > b`: the list ends at 2:3). `closeAtNewContainer` sets `closeEnd` along the `openChild` chain. A sibling item or a lazy close ends them at the previous line.
- A list item ends at the end of its first line or its last child, whichever is later. Quote prefixes do not extend it.
- `listItem.spread`: two direct children with a gap of 2 or more lines (start line minus end line). `list.spread`: the same gap between consecutive items, or between the last item and the end of the list. This covers `> - a\n>\n>\n> b` (spread) and `> - - a\n>\n>   b` (outer item not spread).
- micromark restricts list starts (empty item, ordered not `1`) only when every container matched and a paragraph is open, and keeps that for the rest of the line (`a\n- - ` gives an item holding a paragraph `-`). `interrupts()` and `interruptLine` do this. A lazy paragraph does not restrict them: `> a\n2. b` is a list starting at 2.
- The nested-quote end-of-file rule from the contract now asks that a quote prefix at or above matched the line (`parentQuoteLine`). The old test (`line.start` past the line start) also fired after list indentation alone, and `- - > \n ` then came out wrong.

## Deviations

- New test file `test/blocks-container.test.ts`, outside the owned paths. It is a new file, so it cannot conflict.
- I did not edit `test/core-sections.test.ts`. Its `waiting` map still lists 57, 60 and 61 as waiting on lists. They pass now and run in `test/blocks-container.test.ts`. I left them because blocks-leaf removes 59 from the line next to 57, and the two edits would conflict. The orchestrator can delete the three lines after both merges.
- `roadmaps/v1/contracts/parser-core.change-request.md` replaces core-skeleton's accepted v1 to v2 request, which stays in git history. That is the path the instructions gave.

## Stubs left

- None in the owned files. Spec examples in the three sections that need indented code, fenced code, setext headings, HTML or definitions are listed in the `waiting` map in `test/blocks-container.test.ts` with the node that unlocks each (28 examples, all blocks-leaf). blocks-leaf should delete its numbers there.
- The test-only `testQuote` and `testItem` in `test/core.test.ts` still exist. Real rules now register first at the same priorities, so they take `>` and `+`. The core tests still pass.

## Gotchas

- Change request (open): after indented code, micromark also restricts list starts (`    a\n2. b` is code then a paragraph). `BlockState` cannot see an unmatched code tip, so talata starts a list there. See `contracts/parser-core.change-request.md`.
- Containers that are not `TrackedContainer` (GFM footnote definitions later) break the `quoteLine` and `openChild` chains. A footnote definition inside a quote, holding a list, may then get end positions off by the quote prefix. gfm-tasks-footnotes should implement `TrackedContainer` on its container, or check these cases.
- Leaves inside items need their end at the line end, trailing whitespace included (as paragraphs and headings do). Item and list ends come from the last child's end.
- `list.spread` and `listItem.spread` come from child positions only, so a leaf that spans blank lines (fenced code, HTML kinds 1 to 5) must report its real end line. Blank lines inside it then do not count, as in the reference.
- `readMarker` returns one reused object. Copy what you need before calling it again.

## Proposed learnings

- Derive container end positions from micromark's exit placement (`document.js`) and the subtokenize walk-back, not from the spec | the walk stops at block quote prefixes but list items skip them, and no reading of the spec predicts that | packages/talata/src/blocks | yes (fuzz against the reference)
- A fuzzer built from container pieces (`- `, `1. `, `> `, tabs, blank lines), skipping documents whose reference tree has unsupported node types, finds the position edge cases quickly | 240k documents ran in under 2 minutes; the first run found 383 failures, all fixed | packages/talata/test | yes

## Verification

- `pnpm --filter talata test`: 7 files passed, 2 skipped; 255 tests passed, 1988 skipped (readiness-gated suites).
- `npx tsc --noEmit -p packages/talata`: no errors.
- `npx oxlint`: no findings. `npx oxfmt --check packages/talata/src/blocks packages/talata/test/blocks-container.test.ts`: clean.
- Spec: 71 of the 99 examples in Block quotes, List items and Lists match the reference with positions. The other 28 need blocks-leaf constructs.
- Scratch fuzz (not committed): 178,004 documents (seed 7) and 64,342 more with a wider piece set (seed 11), compared with the reference wherever its tree had only paragraph, heading, thematic break, list, list item, block quote, text and break. No differences.

## Size

- Estimated L, actual L.

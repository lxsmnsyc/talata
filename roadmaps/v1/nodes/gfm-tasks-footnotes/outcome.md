# Outcome: gfm-tasks-footnotes

## Built

Paths are under `packages/talata/`.

- `src/gfm/footnote.ts`:
  - default export `footnoteDefinition`: GFM block rule, priority 150, trigger `[`, can interrupt paragraphs. `OpenFootnoteDefinition` implements `TrackedContainer` and `closedAt`, and uses the list item end rule. Later lines need exactly 4 columns of indent; blank lines continue without consuming. It fills `state.footnotes` with `normalizeIdentifier(label)`.
  - `footnoteCall`: GFM inline rule, priority 450, trigger `[`. `[^a]` resolves only against `footnotes`.
  - `imageFootnoteCall`: called from `src/inline/link.ts` when `]` closes an image bracket that formed nothing. `![^a]` becomes text `!` and a call.
  - `footnoteIndentAt` and `footnoteBlankLine`: list item helpers for the reference's `prepareList` rules.
- `src/gfm/task-list.ts`:
  - default export `taskListCheck`: GFM inline rule, priority 400, trigger `[`, with a `resolve` that drops the first character of the head text and moves the paragraph start, as mdast-util-gfm-task-list-item does.
  - `taskListStart`: GFM block rule, priority 900, trigger `[`. It never starts a block. It records where the flow after an empty marker line has its first content.
  - `taskCandidates`, `flowAfterMarker`, `TaskTarget`: used by `src/blocks/list-item.ts`.
- Flags on: `ready.gfm.taskList`, `ready.gfm.footnote` (`test/parsers.ts`), `footnote` and `taskList` (`test/fuzz/features.ts`). `readmes/87.md` and `readmes/93.md` no longer wait in `test/corpus.test.ts`.
- Tests: `test/gfm-tasks-footnotes.test.ts` has 124 cases and 2 `it.fails` cases for the known difference. There are 7 new fixtures in `test/fuzz/fixtures/`.

## Deviations

- `src/blocks/definition.ts`: removed the GFM refusal of `[^`. The reference makes `[^]:;` and `[^big note]: x` link definitions. Valid footnote lines never reach the prefix rule, because the block rule takes them first.
- `src/blocks/list-item.ts`, which is a shared file, now has these additions:
  - task targets;
  - the footnote item end rule: an item closed on a line where a footnote indent matched ends at the closing event;
  - `indentEnd` for the last item;
  - spread from blank lines inside footnote definitions.
- From gfm-inline: `- [\n  *x*`. A check whose value is a line ending reads the next line, so that line ending ends after the next line's prefix. Fixed with `reach` in `task-list.ts`.
- Footnote definitions set `quoteLine` on lines where their indent matched. The indent is a token that stops micromark's walk back, as a quote prefix does.
- Change request: `contracts/parser-core-v5-gfm-tasks-footnotes.change-request.md`.

## Stubs left

- None.

## Remaining differences

- In `-\n[ ] a` and `> -\n> [ ] a`, the reference sets `checked: false` on the root or block quote and drops `[ ]`. The same happens in `-\n[x]\n-|-`, from gfm-tables. Talata leaves the text alone. Fixing this needs a transform or a hook on block quote nodes; see the change request. Paragraphs whose parent is a list item work (`- -\n  [ ] a`).
- `![\n^a]`: the label starts on a later line. The reference reads it as a call; talata does not. No fuzz run found this.

## Gotchas

- When the marker line has nothing after the marker, the "first content" can lie outside the item, on a lazy line.
- Per-document state in `src/gfm/` lives in `WeakMap`s keyed by `BlockState` or `Source`, so a finished parse is not kept alive (review round 1).
- A tab check value only works when the tab is one column wide.
- A footnote definition directly inside another one continues with no indent of its own: micromark checks the last token (`followsIndent`).
- mdast-util-from-markdown's `prepareList` skips quote prefixes but stops at footnote indents. It counts blank lines inside footnote definitions toward an item's spread.
- From gfm-inline: its autolink rule treats any open `[` delimiter as a bracket. Footnote calls push no delimiter.

## Proposed learnings

- For container ends, check both walk backs: micromark subtokenize (stops at every prefix token) and mdast `prepareList` (skips quote prefixes only) | footnote indents differ between them | packages/talata/src/blocks | yes (reference comparison)
- Fuzz new containers with a scratch generator of nested prefixes | the main generator puts only text in footnote definitions | packages/talata/test/fuzz | no

## Verification

- `npx vitest run` in packages/talata after merging main (ca0b33d): 17 files passed, 4712 tests passed, 2 expected fails, 24 skipped.
- `npx tsc --noEmit -p .`, `npx oxlint` and `npx oxfmt --check src test` passed.
- Fuzz with GFM, 50k documents for each of seeds 101, 202, 303 and 404: the only failures left are gfm-inline's literal autolink text splits.
- Final run, seed 2027, 100,000 documents, GFM: 97,855 compared, 2,145 skipped (autolinkLiteral, strikethrough), 62 failures, all literal autolink text splits for gfm-inline (`[a@b.c`, `<\+@b.e`). This run started before the `- [\n  *x*` fix, which is covered by tests.

## Size

- Estimated M, actual L. The reference's walk back and task flow quirks took most of the time.

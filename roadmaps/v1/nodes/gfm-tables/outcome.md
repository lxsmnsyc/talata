# Outcome: gfm-tables

## Built

Paths are under `packages/talata/`.

- `src/gfm/table.ts`: default export `table`, a block rule (priority 750, triggers `|:-`, `gfm: true`, open block name `table`, `interruptible`). It starts on the delimiter row, checks the open paragraph's last line as the header, and takes it with `splitParagraph(1)`. Body rows are every later non-blank line no block start claims. Output is `table` (with `align`), `tableRow` and `tableCell`, positions as mdast-util-gfm-table gives them:
  - rows span from the first non-blank character to the line end, trailing whitespace included;
  - a cell starts at its pipe (the first at the row start), ends at the next cell's pipe or the row end; a trailing pipe belongs to the last cell; `|` and `| |` give one empty cell;
  - cell content runs from the first data run to the end of the last and is parsed as inline content on its own;
  - `\|` stays inside a cell; in code spans inside a table it becomes `|` (`\\` stays), as mdast-util-gfm-table's `exitCodeText` does.
- Registered in `src/blocks/index.ts` (one import and one list line).
- Reference quirks matched (found by fuzzing, from micromark's source):
  - A header line with 4 or more columns of indentation after its container prefixes is not a header.
  - A kind 7 HTML start line as header becomes HTML that takes the delimiter row (`a\n<n>\n|-`): micromark's table check passes, then the header line is parsed again with no paragraph.
  - The first line after a table closed by a lazy line cannot be a header (`>r\n>-|\na||\n-|-`).
  - A container that starts on the delimiter line wins (`a|b\n- | -` is a paragraph and a list).
- `ready.gfm.table` is on (`test/parsers.ts`), and `table` is on in `test/fuzz/features.ts`.
- `test/corpus.test.ts`: the 15 files that waited only on `table` are gone from `gfmWaiting`. The three that also wait on other features (`readmes/10.md`, `readmes/91.md`, `readmes/93.md`) keep their lines unchanged, so they run once gfm-inline or gfm-tasks-footnotes turn their flags on. `test/equivalence.test.ts` had no table entries and is unchanged.
- `test/gfm-tables.test.ts`: 117 inputs compared with the reference, with and without GFM (rows, cells, alignment, escapes, code spans, HTML headers, definitions, quotes, lists, tabs, lazy lines), and a check that a table appears only with GFM.
- `test/fuzz/fixtures/`: 7 minimized fuzz failures, all fixed.

## Deviations

- None from the contract. The rule reads `BlockState.unmatched` and `closeKeepsLineEnding` in `close` to detect a lazy close; both are in parser-core v4.
- It imports the registered HTML rule (`src/blocks/html.ts`) and calls its `start` on a header line object it builds. No change to `html.ts`.
- `paragraph.ts` is not changed: the header's indentation comes from `paragraphIndents`.
- `packages/talata/README.md` is not changed (outside the owned paths). Candidates for its list of reference-versus-spec cases: the kind 7 HTML header, the header after a lazy table close, and one-column tables with no pipe (`a\n:-` is a table in the reference).

## Stubs left

- None.

## Gotchas

- The table keeps per-document state in a `WeakMap` keyed by `Source` (lazy-close end) and reuses module-level scratch values (`cells`, the header line object). Parsing is synchronous, so this is safe.
- Cells whose code spans may hold `\|` pass a `PipeCell` adapter to `state.inline`; its `children` setter unescapes and writes to the real cell. A change in `parse.ts` that stops assigning `node.children` would break this.
- gfm-inline: literal autolinks in cells are produced by the transform over the whole tree, so nothing table-specific is needed.
- gfm-tasks-footnotes: a footnote definition starting on a body row line ends the table (it is a container). Not tested here because footnotes are not built.

## Proposed learnings

- After a flow construct's interrupt check passes, micromark parses the line again with no paragraph, so a construct that cannot interrupt can win there | kind 7 HTML beats the table header | packages/talata/src | yes (reference comparison)
- micromark keeps one flow tokenizer across lazy lines, so a construct after a lazily closed block still sees that block's events | the table body-row check refuses a header on that line | packages/talata/src | yes (fuzz with container prefixes)

## Verification

- `pnpm --filter talata test`: 16 files passed; 4572 tests passed, 36 skipped (other GFM features). The corpus is present; every file that waited only on tables passes with GFM.
- `npx tsc --noEmit -p packages/talata`: no errors. `npx oxlint`: no findings. `npx oxfmt --check packages/talata/src packages/talata/test`: clean.
- `pnpm --filter talata fuzz --no-save`, GFM on: seed 101 20k (found the 7 fixed failures), seed 202 50k, seed 303 50k, final seed 2027 100k (97,867 compared, 41 failures). Every failure after the fixes is outside tables: literal autolink text splits (`[www.`, `<\+@b.e`, `[http://x.`) for gfm-inline, and `- [\r  *o*` (GFM-only text end position after `[` in a list item; no table syntax, the table rule does not run).
- A scratch table fuzzer (random table pieces under mixed quote, list and tab prefixes): 170k documents, about 23k with tables, 0 differences.
- Pathological inputs, timed by hand (not in tests): one row of 200k pipes, 20k header candidates, 50k rows and 10k HTML headers all parse in linear time.

## Size

- Estimated M, actual M.

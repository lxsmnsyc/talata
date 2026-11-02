# Outcome: fix-directive-nesting

## Built

- `packages/talata/src/ext/directive/container.ts`:
  - `continuesAfter`: a directive around whose closing fence is the next line ends the walk with "continues". Cause of `> :::b\n> + :::c\n>   >\n> \n> :::` (inner quote `end.line` 3 instead of 4): the item around `c` does not continue on `:::`, so `c` read that line as lazy and ended its content before the blank line, without the blank-line ends of `closeEnds`. `b` closes on that line before its content reads it, so `c`'s content ends with that content document. With a quote between the two directives the old lazy reading stays (`> :::b\n> > :::c\n> > >\n> >\n> :::`): micromark marks the next line lazy at the end of a content document when a quote does not continue at EOF; items and footnote definitions continue there.
  - `continuesAfter`: before a final line ending, only a quote around makes the content end as before a lazy line; a footnote indent alone does not (`[^1]: :::b\n    > >\n    >\n`).
  - `continuesAfter`: a container that starts on the next line outside a directive around, with a quote between that directive and this one, ends this content as before a lazy line (`1. :::b\n   > :::c\n   > + >\n   >\n+ c\n`).
  - `continuesAfter`: a footnote definition with no indent of its own continues right after the indent of the one around, at any depth (`[^1]: [^1]: [^1]: :::b\n            - a\n\n    c\n`). The lookahead only passed that on after a definition that consumed columns.
  - `closeEnds`: one "still open" check at the top of the loop (`state.getDepth(child) < 0` stops the walk). The raise of an item's end for its quote now runs on the quote's own turn, after that check, so the second `getDepth` guard is gone.
  - `closeEnds`: reads the prefixes of the blocks inside on a copy of the line, by column, with `continuesNext` (quotes, lists, footnote definitions, split tabs). A line blank only inside a quote that continues is blank for the blocks in it (`> :::b\n> >+ >\n> >\n> >c\n`, and with tabs `> :::b\n> -\t>1) >\n> \t>\n>c`). The first version read spaces only and gave up on a tab.
  - `closeEnds`: `afterIndent` comes from `footnoteIndentAt` (`src/gfm/footnote.ts`): any footnote definition around that took its indent on the line, not only a parent one, also when the line is blank at the directive's level (`[^1]: 1. :::b\n       1. \n       c`).
  - `closeEnds`: the blank-line `closedAt` of an item runs only when the line is blank at the directive's level (not only inside a quote that continues), and not when a container starts on the next line with no quote open inside (`keepsEnding`). Then the content keeps its final line ending and the item ends after its last child (`[^1]: > :::b\n    > * :::c\n    > \n> lazy`, GFM; review of 61682e5). In a footnote definition the core ends the item at `closedAt`'s offset, even before its last child.
- `packages/talata/src/ext/directive/spread.ts`:
  - `hasBlankAfterQuote` (was `hasBlankAfterLineStart`). Cause of `> :::b\n> + [^1]: >\n> \n>  ` (item `spread` false instead of true): the rule looked only at the item's direct children. The reference does not count footnote definitions as containers for an item's blank lines, so the rule now looks into them too. It counts a quote that ends at a line start when the next child starts on a later line, or, with no next child, when the item or definition ends on a later line.
  - `holdsSpreadDirective` looks through nested footnote definitions (`+ [^1]: [^1]: :::b\n          \n      `).
  - `hasBlank`: in a footnote definition, open fenced code or a directive that ends at a line start holds the blank lines after it (`[^1]: - :::b\n      [^1]: ```\n\n      c`).
- `packages/talata/test/fix-directive-nesting-inputs.ts` (default export `generateInputs(seed, depth, perShape)`): every shape of 1 to `depth` containers (quote, list item, footnote definition, directive) with at least one directive. Per input it picks list markers `+ `, `* `, `- ` with 1 to 4 spaces, `1. `, `1) `, `+` with 4 spaces, `-\t`, item indents with tabs; quote markers `> `, `>`, `>\t`, `>`; footnote indents of spaces or tabs; directives `:::`, `::::`, indented 1 or 2 spaces; content of text, quotes, lists, leaf and text directives, a table, fenced code; 1 to 3 last lines at a random depth (blank, bare marker, spaces, tab, text, `:::`, `::::`, `>`, list item, table row, fence, lazy line); CRLF in 15% and a final line ending in 30%.
- `packages/talata/test/fix-directive-nesting-run.ts`: large runs, `cd packages/talata && node test/fix-directive-nesting-run.ts --seed N [--depth 5] [--per-shape 30]`. Prints each difference, and apart the inputs that also differ without the extension.
- `packages/talata/test/fix-directive-nesting.test.ts`: 80 inputs with GFM off and on (both inputs from the brief, both from the review of 61682e5, their variants, one or more per class the generator found), and `generateInputs(1, 5, 6)`: 1,001 shapes, 6,006 inputs, 4 parts per GFM mode. 169 tests, about 2 s.
- `.changeset/fix-directive-nesting.md` (patch).

## Deviations

- More fixes than the two in the brief, all in `src/ext/directive/`: the generators found more classes (listed above). All of them fail on main too.
- Two test files besides the test: the input generator and the run script, both under `packages/talata/test/` as the brief allows for a script. The test imports the generator.
- `container.ts` imports `footnoteIndentAt` from `src/gfm/footnote.ts`, a core export that the contract does not list. Added as point 5 to `roadmaps/v2/contracts/extension-directive.change-request.md` (accepted, deferred to core-hooks-3).
- No generated input failed without the directive extension, so none are listed as core bugs. The test and the script check for them.
- Each 1,000,000-document fuzz ran as 4 parallel chunks of 250,000 with the same seed and `--start` 0, 250000, 500000, 750000, with `--no-save`.

## Stubs left

- None.

## Gotchas

- `closeEnds` reads the prefixes of the blocks inside through `continuesNext` on a copy of the line. A change to the continuation rules of quotes, lists or footnote definitions in core must be copied there (change request point 3).
- A container directive's content ends with the content of a directive around it: the closing fence of the outer one on the next line is not a lazy line for the inner one.
- In a GFM footnote definition, the core ends a list item at the offset its last `closedAt` gave, even before its last child. Call `closedAt` only on the line where the item really closes.

## Proposed learnings

- Enumerate container shapes (all sequences up to 5 deep) and vary markers, tabs and line endings per input, instead of sampling depth and kind at random | the random generator found 2 to 13 of these on main, the enumeration 33, the review's dimensions two more classes | packages/talata/test | yes
- The reference does not count footnote definitions as containers for list item blank lines; look through them in every spread rule | four spread classes came from this | packages/talata/src/ext | yes (generator)

## Verification

- Generator, in the test (`generateInputs(1, 5, 6)`, 6,006 inputs): 0 differences with and without GFM. The first generator (4 shapes deep, 6,131 inputs) found 33 on main.
- Generator script, `node test/fix-directive-nesting-run.ts --seed N --per-shape K` (depth 5): seeds 1 to 6 at 30 per shape (30,029 to 30,030 inputs each) and seeds 7 to 10 at 150 per shape (150,138 to 150,141 each): 0 differences, 0 inputs that also differ without the extension.
- Fuzz 1, on 61682e5: `cd packages/talata && pnpm fuzz --count 250000 --seed 20261401 --start <0|250000|500000|750000> --all --no-save`. 1,000,000 documents, 999,994 compared, 6 skipped (the reference timed out), 0 failures.
- Fuzz 2, after the review fixes: the same with seed 20261402. 1,000,000 documents, 1,000,000 compared, 0 failures (about 735 s per chunk).
- `test/directive*.test.ts`, `test/fix-directive-quote-end.test.ts` and `test/fix-directive-nesting.test.ts`: pass.
- Fast check `pnpm --filter talata test && (cd packages/talata && npx tsc --noEmit -p .) && npx oxlint && npx oxfmt --check`, with `benchmark/corpus` present: 32 files, 6,444 tests passed, tsc clean. oxlint shows only the two known `max-depth` warnings (`syntax.ts`, `entities.ts`) and, without `dist/`, the known `.github/scripts/smoke.mjs` errors. oxfmt clean. Twice, a full run during a fuzz (load 12 or more) had a timing failure in `test/frontmatter.test.ts` ("open fences without a closing fence stay linear"). It passes alone and in the reruns.

## Size

- Estimated S, actual M. The generators and the review found more classes after the two in the brief.

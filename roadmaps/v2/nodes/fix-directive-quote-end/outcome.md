# Outcome: fix-directive-quote-end

## Built

- `packages/talata/src/ext/directive/container.ts`:
  - `closeEnds`: the raise of a list item's `indentEnd` to the end of a blank line now needs the quote in the item to be open (`state.getDepth(inner) >= 0`). Cause of `>:::b\n>+ >\n>\n>  `: `openChild` stays linked after a block closes, so on the last line the item's end moved again to a quote that had closed on the blank line before.
  - `continue`: a directive whose line was already the empty last line of the content (`isEmptyLastLine` before its own `endContent`) ends after the line ending before that line. Cause of `>:::9\n>>>:::a{}\n>>>\n`: that rule held only when no line ending followed in the text, so a directive in quotes inside an outer directive, whose content ended through `endContent`, kept the line end.
- `packages/talata/src/ext/directive/spread.ts`: `hasBlankAfterLineStart`. A list item is spread when a block quote child ends at a line start and another child follows on a later line (other children that end so, such as lists and code, do not count). The quote in the item ends at the start of the blank line, so the core's line-gap rule did not see the blank line. The fuzz replay of start 900612 shrinks to this input once the end is fixed (`>:::b\n>+ >\n>\n>   c`); it fails on main too.
- `packages/talata/src/ext/directive/labels.ts`: `parseLabel` ends the text before an empty last label line at the line start unless the line keeps split-tab columns (`hasSplitTab` on the label's `indents`). It used to skip that whenever a tab came before the closing bracket, so a whole tab taken by a footnote definition's indent kept the text end after it (`[^1]::x[[[`]]\n\t]`, fuzz seed 20261302, start 360344; fails on main too).
- `packages/talata/test/fix-directive-quote-end.test.ts`: 66 inputs, each with GFM off and on (132 tests), compared to the reference with `firstDiff`. Both fuzz inputs, other nesting depths, lists inside the quote (`+`, `-`, `1.`, nested lists), blank and last lines, trailing spaces and a final line ending, nested directives, the spread cousins, the label inputs, and the inputs that caught the first, too broad spread rule.
- `.changeset/fix-directive-quote-end.md` (patch).

## Deviations

- Two more fixes than the brief named, both in the owned path: `spread.ts` (found by the verify replay once the end was fixed) and `labels.ts` (found by the first fuzz run, also on main).
- The 1,000,000-document fuzz runs were split into 4 parallel chunks of 250,000 with the same seed and `--start` 0, 250000, 500000, 750000, so they cover the same documents as one run.
- Commit subject shortened to `fix-directive-quote-end: Fix directive end positions in block quotes`: the requested one is 78 characters, and the plain-writing hook blocks subjects over 72.
- No contract change, no change request.

## Stubs left

- None.

## Gotchas

- `openChild` of a tracked container still points at a child after that child closed. Check `state.getDepth(child) >= 0` before reading a closed child as open.

## Proposed learnings

- A tracked container's `openChild` is not cleared when the child closes | stale quote moved a list item's end | packages/talata/src/ext | yes (fuzz)

## Verification

- `verify` (both replays of seed 20261301): 0 failures.
- Fast check `pnpm --filter talata test && (cd packages/talata && npx tsc --noEmit -p .) && npx oxlint && npx oxfmt --check`: 30 files passed (1 skipped), 5004 tests. oxlint shows only the two known `max-depth` warnings (`syntax.ts`, `entities.ts`) and, without `dist/`, the known `.github/scripts/smoke.mjs` errors.
- Fuzz 1, `--seed 20261302 --count 1000000 --all`: 18 failures. 17 came from the first `spread.ts` rule (now limited to quotes); 1 was the label bug (fixed). All 18 inputs or their kin are in the test.
- Fuzz 2, `--seed 20261303 --count 1000000 --all`: 1,000,000 compared, 0 failures (about 355 s per chunk).
- `test/directive*.test.ts` pass.

## Size

- Estimated S, actual S.

## Landed

Direct commit f5ea091 on main (2026-11-02), after one fresh review (clean). The review found two older cousins that also fail before this fix: a quote in a footnote definition in an item (`> :::b\n> + [^1]: >\n> \n>  `, spread) and a quote in a directive in an item in a quoted directive (`> :::b\n> + :::c\n>   >\n> \n> :::`, end line).

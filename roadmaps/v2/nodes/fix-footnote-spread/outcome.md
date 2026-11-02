# Outcome: fix-footnote-spread

## Built

- `packages/talata/src/blocks/list-item.ts`, `OpenListItem.close`: a list item whose last line carries the GFM footnote indent is spread when that line is 2 or more lines after its last child (or its first line). This matches `mdast-util-from-markdown`, whose `prepareList` stops its walk back at the footnote indent token, so a blank line earlier in the item counts. Before, only an item closed by a later line was handled.
- `packages/talata/test/fix-footnote-spread.test.ts`: the fuzz input and 21 cousins (other bullets, deeper quotes, a list directly in the footnote, trailing text, the same shapes outside a footnote), compared with positions against the reference, with and without GFM.
- `.changeset/fix-footnote-spread.md`: patch.

## Deviations

- None.

## Stubs left

- None.

## Gotchas

- Footnote handling in list items depends on `indentEnd` and `nextLineStart`; both mirror where the reference's walk back stops. Any new case there should be checked against `prepareList` in `mdast-util-from-markdown`.
- `npx oxlint` at the repo root reports 20 errors in `.github/scripts/smoke.mjs` on main. They are not from this node.

## Proposed learnings

- None.

## Verification

- `cd packages/talata && pnpm fuzz --seed 20261105 --start 312807 --count 1 --all --no-save`: failed before the fix, 0 failures after.
- Fast check: `pnpm --filter talata test` (4850 passed), `tsc --noEmit`, `oxfmt --check` pass. `oxlint` clean on changed files.
- Fuzz: `pnpm fuzz --count 1000000 --seed 20261201 --all`: 1000000 compared, 0 failures.
- Full check: fast check, then benchmark corpus, interleaved and size all exited 0. The output was tailed, so the talata rows of interleaved were not read; the change touches only a footnote-only branch in `close`, outside the per-line hot path.

## Size

- Estimated S, actual S.

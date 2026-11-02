# Outcome: release-0.3

## Built

- `.changeset/ext-directive.md`: minor for `talata`, announces `talata/directive`.
- `packages/talata/README.md`: Directives section (usage, unified plugin, the `remark-directive` replacement, link to `docs/migration.md#directives`, note on look-ahead line ends), a `talata/directive` row in the extensions table, updated speed and size tables, the "not supported" bullet.
- `README.md`: speedup range now 22 to 24 times.
- Not done: the directive guide in `docs/migration.md`. PR #25 owns it and it had not merged when this branch was cut.

## Deviations

- Acceptance 1 is not met: the 1,000,000 run found 2 differences (below). The brief forbids changes to `src/ext/directive/`, so they are not fixed here.
- The speed table now uses the 174-file README corpus that `pnpm --filter benchmark corpus` fetches today. The old table said 139 files.

## Stubs left

- Directive paragraph in `docs/migration.md` (PR #25).

## Gotchas

- Fuzz `--seed 20261301 --count 1000000 --all` (GFM, frontmatter, math, directive): 1000000 compared, 2 failures, 1045 s.
  - `">:::b\n>+ >\n>\n>  "`: `position.end.line` of a node in the list item: reference 3, talata 4.
  - `">:::9\n>>>:::a{}\n>>>\n"`: `position.end.column` of a node in the directive: reference 1, talata 4.
  - Both are container directives in block quotes, the class the ext-directive outcome warned about. Replay: `--seed 20261301 --start 900612` and `--start 295834`.
- The machine was loaded (8 to 25) during interleaved and fuzz.

## Proposed learnings

- None.

## Verification

- Fast check: 30 files, 6456 tests pass; tsc clean; oxlint 0 errors (2 existing `max-depth` warnings in `src/ext/directive`); oxfmt check clean.
- Full check: corpus, interleaved and size ran and exited 0.
- Size (`pnpm --filter benchmark size`): main entry 94044 bytes minified, 33203 gzip. Node: talata 94.0 KB / 33.2 KB gzip, reference 118.2 KB / 35.9 KB. Browser reference 82.5 KB / 23.8 KB. `talata/frontmatter` 1291, `talata/math` 12766, `talata/directive` 19078 bytes gzip.
- Speed (interleaved, median of 15, load 8 to 25): talata vs mdast + gfm is 23.95x (READMEs), 21.97x (`fs.md`), 23.24x (`CHANGELOG_V22`). The 4x gate holds.

## Size

- Estimated S, actual S.

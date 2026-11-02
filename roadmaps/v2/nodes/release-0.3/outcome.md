# Outcome: release-0.3

## Built

- `.changeset/ext-directive.md`: minor for `talata`, announces `talata/directive`.
- `packages/talata/README.md`: Directives section (usage, unified plugin, the `remark-directive` replacement, link to `docs/migration.md#directives`, note on look-ahead line ends), a `talata/directive` row in the extensions table, updated speed and size tables, the "not supported" bullet.
- `README.md`: speedup range now 22 to 24 times.
- The directive guide in `docs/migration.md` is in main (PR #25). The README links to it.

## Deviations

- The first pass failed acceptance 1 (seed 20261301, 2 differences). They were fixed in main by fix-directive-quote-end and fix-directive-nesting. This pass merged main and reran everything.
- The speed table uses the 174-file README corpus that `pnpm --filter benchmark corpus` fetched. The old table said 139 files.

## Stubs left

- None.

## Gotchas

- First pass numbers (speedups 24.0x, 22.0x, 23.2x) were taken at load 8 to 25 and are superseded. They were inflated because the reference slows more under load.

## Proposed learnings

- None.

## Verification

- Fast check on the merged branch: 32 files, 6759 tests pass; tsc clean; oxlint 0 errors (2 existing `max-depth` warnings); oxfmt clean.
- Fuzz, seed 20261401, 4 chunks of 250,000 (`--start` 0, 250000, 500000, 750000, `--all`: GFM, frontmatter, math, directive): 1,000,000 compared, 0 failures.
- Full check: fast check, corpus, interleaved and size all exit 0.
- Size: main entry 94046 bytes minified, 33184 gzip. Node talata 94.0 KB / 33.2 KB gzip, reference 118.2 KB / 35.9 KB. Gzip bytes per subpath: `talata/frontmatter` 1291, `talata/math` 12766, `talata/directive` 19426.
- Speed (interleaved, median of 15, load under 6): talata vs mdast + gfm is 17.39x (READMEs), 18.30x (`fs.md`), 21.15x (`CHANGELOG_V22`). The 4x gate holds.

## Size

- Estimated S, actual S.

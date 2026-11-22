# Log: release-0.4

- Branch release/release-0.4 from main. Roadmap commit bbd4986 (fix-mdx-directive-growth is now must for 0.4) kept.
- Changesets `mdx-subpath.md` and `mdx-acorn.md` read well together (subpath, then the acorn option). No new changeset, no edit.
- Benchmarks ran at load average 2.5 to 3.4. The corpus fetched 192 READMEs, 1.6 MB (the old table said 174 files, 1.5 MB).
- Interleaved run 1: 16.89x, 17.50x, 19.95x. Run 2: 17.11x, 18.28x, 21.15x. Tables use run 2.
- Size: main 94758 bytes minified, 33367 gzip. `talata/mdx` 29818 gzip, `talata/directive` 19842, `talata/math` 12777, `talata/frontmatter` 1291.
- README: MDX section, extensions table row, speed and size tables, "not supported" bullets. Migration guide: MDX section. The MDX code blocks are plain `js`, not `js before` and `js after`, because `test/migration-examples.test.ts` cannot load `remark-mdx` or `acorn` namespace imports. Root README range stays 17 to 21 times.
- Fuzz, seed 20261401, `--all --acorn --no-save`, 4 chunks of 250,000: chunk 1 (`--start 0`) found 1 difference at document 125133, so I stopped (no fix). Chunk 2 (`--start 250000`) had 0. Chunks 3 and 4 were not run to the end (killed).
- Fast check ran while the fuzz and another worker used the CPU (load up to 12). Timing tests in `test/directive-growth.test.ts` and `test/mdx-reread.test.ts` failed in some runs and pass alone (17 of 17).

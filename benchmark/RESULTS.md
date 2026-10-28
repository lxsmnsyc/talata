# Results

Apple M2, 8 GB, Node from the repo toolchain. Command: `pnpm --filter benchmark interleaved` (15 rounds, median), on a fresh `pnpm --filter talata build`. "Load" is the 1-minute load average at the start of the run. Another worker shared the machine, so loads sit between 2 and 3.

## Speed against "mdast + gfm"

| Run                                    | Load    | READMEs          | node fs.md       | CHANGELOG_V22    |
| -------------------------------------- | ------- | ---------------- | ---------------- | ---------------- |
| Before perf-pass (GOAL.md, 2026-10-28) | about 2 | 16.4x (33.5 ms)  | 18.7x (10.0 ms)  | 21.1x (24.8 ms)  |
| After, run 1                           | 2.38    | 15.96x (42.2 ms) | 16.02x (13.3 ms) | 19.35x (29.0 ms) |
| After, run 2                           | 3.01    | 19.77x           | 19.70x           | 22.35x           |
| After, run 3                           | 2.74    | 18.91x (33.6 ms) | 19.63x (10.0 ms) | 22.89x (25.3 ms) |

The target is 4x. Run 1 was slower because of machine noise, not a code difference: the code changed only in `failBracket` between "before" and "after", and typical documents do not reach it.

## Failed brackets under many delimiters

Input `'[*a '.repeat(n/8) + ' a*]'.repeat(n/8)`, `fromMarkdown(s, { gfm: true })`, one cold call each.

| Size   | Before (splice)                                            | After (inert marker) |
| ------ | ---------------------------------------------------------- | -------------------- |
| 50 KB  | 41 ms                                                      | 15.5 ms              |
| 100 KB | 660 ms                                                     | 16.9 ms              |
| 200 KB | not measured                                               | 24.1 ms              |
| 400 KB | 423 ms on the way to 1.6 s at 800 KB (stale build, splice) | 61.4 ms              |
| 800 KB | 1617 ms                                                    | 120.1 ms             |

Doubling the size now doubles the time. The 50 KB and 100 KB "before" numbers are from the brief; the 400 KB and 800 KB "before" numbers were measured on the splice code.

## Tried and not kept

- Literal autolink transform skipped entirely (upper bound): steady-state talata alone, 60 rounds, load about 3: READMEs 19.6 to 17.5 ms, node fs.md 4.75 to 4.07 ms, CHANGELOG_V22 18.5 to 16.1 ms. That is the cost of the walk plus the real link work. A flag set by the inline rule only helps documents with no `www.`, `://` or `@`, and entities (`&commat;`, `&colon;`) can make those characters from source that has none, so the flag also has to fire on `&`. Every corpus document would still run the transform, so no gain on the benchmark. Not kept.
- Table cell inline state: a 167 KB table-heavy document parses in 5.1 to 7.9 ms (median 6.4 to 7.9 ms, load about 3), already about 30 MB/s, with noise as large as the possible gain. Not tried further.

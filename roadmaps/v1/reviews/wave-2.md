# Wave 2 report (2026-10-28)

Nodes: blocks-container (L), blocks-leaf (L), inline-core (L), unified-plugin (S), differential-fuzz (M). All merged into main. The user merged unified-plugin, differential-fuzz and inline-core after `can-merge` sent them to the maintainer, and pre-approved blocks-container and blocks-leaf.

## Results

- Every CommonMark spec section now has a block or inline rule. On main: 2006 tests pass; the readiness flags are still off, so spec-green turns them on.
- blocks-container: block quotes and lists; 107k fuzzed documents and 109 hand cases matched the reference on the constructs it covers.
- blocks-leaf: setext, indented and fenced code, HTML blocks, definitions. Three rounds: fenced code line endings, a quadratic definition indent lookup, and a definitions-only paragraph before `-`.
- inline-core: every CommonMark inline. Four rounds: quadratic brackets and emphasis, a wrong tree from the new linear emphasis path (`_**a****b*_`), flaky timing tests replaced by work counts, line endings inside containers.
- unified-plugin: `talata/unified`, with a CJS fix and option forwarding tests.
- differential-fuzz: `pnpm --filter talata fuzz`. Its worker's git calls were refused by the rtk hook, so the user committed its rounds.

## Contract

parser-core v3 (additive): `BlockState.tip`, `BlockState.closeKeepsLineEnding`, and an `indents` argument to `inline()`. spec-green implements `tip` and `indents`; `closeKeepsLineEnding` shipped with blocks-leaf.

## Routed to later nodes

- spec-green: the cross-node differences in its brief (list item end after leaves, `> > ```` at end of file, kind 7 HTML on lazy lines, lists after indented code, hard breaks in containers, CR line endings, trailing whitespace lines), the `indents` field, and the fuzzer flags.
- perf-pass: the failed-bracket splice, test hooks in the bundle, one array copy per container.
- bundle-size: the named entity table (11.3 KB gzip).

## Process notes

- Reviews found real bugs in every L node; plan for two or three rounds on L nodes.
- Timing assertions flake on this shared machine (load average often 15 to 40). Use work counts, not time.
- A reviewer's own fuzzer had a broken random generator; reviews now use xorshift.
- The orchestrator told workers to write change requests to the accepted v2 file; one overwrote it. Change requests now go to per-node files.
- Fast check: vitest default timeout raised to 30 s, large corpus files left out of the reference-only sanity suite.

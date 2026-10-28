---
id: harness
title: Test harness: corpus, GFM spec and a reference CLI
status: active
priority: must
type: feature
outline: false
milestone: m1-commonmark
target:
from:
size: M
spike: false
verify:
exclusive: []
fulfilled_by:
gate: false
added:
owns:
  - packages/talata/test/**
  - benchmark/scripts/**
shared: []
reserves: []
provides: []
depends_on: []
---

# Test harness: corpus, GFM spec and a reference CLI

## Goal

Extend the tests so they cover more than the CommonMark spec: GFM spec examples, every file of the benchmark corpus, and a small script that prints the first difference between talata's tree and the reference tree for one input. Add talata to the benchmark pipelines, skipped while it throws.

## Context

Today `test/spec.test.ts` and `test/equivalence.test.ts` use only the CommonMark examples, and both talata suites are skipped through `READY` in `test/parsers.ts`. The GFM spec examples come from the cmark-gfm repository's `test/spec.txt` (extensions section); vendor the examples as a JSON fixture with their source URL and license note. Corpus tests skip when `benchmark/corpus` has not been downloaded.

## Acceptance

- [ ] `test/gfm.test.ts` and `test/corpus.test.ts` exist, run against the reference parser as a sanity check, and run against talata when the matching readiness flag is on.
- [ ] `test/parsers.ts` replaces `READY` with per-feature flags: `ready.commonmark`, `ready.corpus`, and `ready.gfm.{table, strikethrough, autolinkLiteral, taskList, footnote}`. Each suite or example group runs only when its flag is on, so a GFM node can turn on its own rows without the rest.
- [ ] `node test/diff.ts <file>` (or a `pnpm` script) prints the path and both values of the first differing node.
- [ ] Benchmark scripts include talata and skip it while `fromMarkdown` throws.
- [ ] Fast check passes: `pnpm --filter talata test && (cd packages/talata && npx tsc --noEmit -p .) && npx oxlint`

## Sizing

M: test code only, several files.

---
id: unified-plugin
title: Unified plugin for remark
status: active
priority: must
type: feature
outline: false
milestone: m3-release
target:
from:
size: S
spike: false
verify:
exclusive: []
fulfilled_by:
gate: false
added:
owns:
  - packages/talata/src/unified.ts
  - packages/talata/tsdown.config.ts
  - packages/talata/test/unified.test.ts
shared:
  - packages/talata/package.json
reserves: []
provides: []
depends_on:
  - on: core-skeleton
    kind: contract
    via: parser-core
---

# Unified plugin for remark

## Goal

Export a unified plugin (`talata/unified`) that sets the parser so `unified().use(talata, { gfm: true }).use(remarkRehype)...` works in place of `remark-parse` plus `remark-gfm`.

## Context

Add a second tsdown entry and an `exports["./unified"]` field. `unified`, `remark-parse` and `remark-rehype` are dev dependencies; `unified` is an optional peer dependency, since `GOAL.md` allows no runtime dependencies. The HTML comparison test covers what the parser supports when it merges, and grows with spec-green.

remark-parse sets `this.parser`. Document that micromark extensions do not apply.

## Acceptance

- [ ] A test runs a unified pipeline with talata and remark-rehype and compares the HTML with the remark-parse pipeline.
- [ ] Fast check passes: `pnpm --filter talata test && (cd packages/talata && npx tsc --noEmit -p .) && npx oxlint`

## Sizing

S: one small file and a test.

---
id: ext-api
title: Extension interface and subpath scaffolding
status: todo
priority: must
type: contract
outline: false
milestone: m1-extension-api
target:
from:
size: M
spike: false
verify:
exclusive: []
fulfilled_by:
gate: true
added: 2026-10-28
owns:
  - packages/talata/src/ext/api.ts
  - packages/talata/src/frontmatter.ts
  - packages/talata/src/math.ts
  - packages/talata/src/directive.ts
  - packages/talata/test/ext-api*.test.ts
  - roadmaps/v2/contracts/extension.md
shared:
  - packages/talata/src/index.ts
  - packages/talata/src/unified.ts
  - packages/talata/src/core/**
  - packages/talata/package.json
  - packages/talata/tsdown.config.ts
  - packages/talata/test/fuzz/**
  - packages/talata/test/parsers.ts
  - benchmark/size/**
  - pnpm-lock.yaml
reserves: []
provides: [extension]
depends_on: []
---

# Extension interface and subpath scaffolding

## Goal

Let `fromMarkdown` and the unified plugin take extensions, and set up the three subpaths so the extension nodes can work in parallel without touching shared files.

## Context

Today GFM rules sit in the main rule set with a `gfm: true` flag (`src/core/registry.ts`), so they are always bundled. Extensions must instead live in their own modules and reach the parser only when passed in, so the main entry does not grow.

Build:

- `Options.extensions?: Extension[]` on `fromMarkdown` and on the `talata/unified` plugin. An `Extension` adds block rules, paragraph prefix rules, inline rules and transforms, using the existing rule types and priorities. Write the exact shape into `roadmaps/v2/contracts/extension.md` and freeze it (version 1).
- Registries are built once per distinct set of extensions and cached, so repeated calls with the same extension objects cost nothing. Extension factories called with the same options should return objects that hit the cache, or the cache must key on something stable; decide and document which.
- Subpath entries `src/frontmatter.ts`, `src/math.ts` and `src/directive.ts`, each exporting a factory with the reference's option type, returning an empty extension for now. Add them to `tsdown.config.ts` and to `exports` (`./frontmatter`, `./math`, `./directive`, same import/require/default shape as `.`).
- Test plumbing: a way for tests and the fuzzer to build the reference with matching micromark and mdast extensions, and a per-extension fuzz hook file (`test/fuzz/ext-<name>.ts`) that each extension node fills in. Add the six reference packages from GOAL.md as dev dependencies.
- `benchmark/size`: report the main entry and each subpath entry separately.

Nothing under `src/ext/` may be imported from `src/index.ts`. Add a test that bundles the main entry and fails if extension code is in it.

## Acceptance

- [ ] `roadmaps/v2/contracts/extension.md` is written with `status: frozen`.
- [ ] `fromMarkdown(value, { extensions: [] })` and the plugin with `extensions` give the same trees as without, and the existing tests pass.
- [ ] The three subpaths build, import from ESM and CJS, and type-check.
- [ ] The main entry stays within 0.2 KB gzip of 0.1.1 (`pnpm --filter benchmark size`).
- [ ] Fast check passes.

## Sizing

M: one interface, registry caching and scaffolding, with no parsing rules.

---
id: docs-migration
title: Migration guide to talata
status: active
priority: must
type: docs
outline: false
milestone: m4-directive
target:
from:
size: M
spike: false
verify:
exclusive: []
fulfilled_by:
gate: false
added: 2026-11-02
owns:
  - docs/migration.md
  - packages/talata/test/migration-examples.test.ts
shared:
  - packages/talata/README.md
reserves: []
provides: []
depends_on: []
---

# Migration guide to talata

## Goal

A guide, `docs/migration.md`, for moving an existing project to talata. A reader who uses the unified stack can switch in a few minutes and knows what does not carry over. Link it from `packages/talata/README.md` with one line.

## Context

Cover these starting points, each with a before and after code example:

- `mdast-util-from-markdown`, alone and with `micromark-extension-gfm` and `mdast-util-gfm`, to `fromMarkdown(value, { gfm })`.
- The same with `micromark-extension-frontmatter` / `mdast-util-frontmatter` and `micromark-extension-math` / `mdast-util-math`, to `extensions: [frontmatter(...), math(...)]`. Options carry over unchanged (see `roadmaps/v2/contracts/extension.md`).
- `unified().use(remarkParse).use(remarkGfm)`, with `remark-frontmatter` and `remark-math`, to `talata/unified`. Keep the rest of the pipeline (`remark-rehype`, `remark-stringify`) as it is.

Then a section on what does not carry over, taken from the code and `roadmaps/v1/GOAL.md` and `roadmaps/v2/GOAL.md` rather than guessed: micromark extensions and `mdastExtensions` cannot plug in, which `fromMarkdown` options of the reference talata does not take (for example `encoding` and Buffer input; check each), no HTML output (use `remark-rehype`), and any known differences from the reference. Add a short "check your output" note: how to compare trees on the user's own files.

Directive is not on `main` yet. Leave a placeholder line for it; release-0.3 fills it in. Keep the README change to one link line, because release-0.3 also edits the README.

Every code example in the guide must run. `test/migration-examples.test.ts` runs each before/after pair and checks the trees are equal.

## Acceptance

- [ ] `docs/migration.md` covers the three starting points and the "does not carry over" section, and `packages/talata/README.md` links it.
- [ ] `test/migration-examples.test.ts` checks every before/after example in the guide and passes.
- [ ] The guide follows the plain-writing skill.
- [ ] Fast check passes.

## Sizing

M: one guide, about a dozen examples, and a test that keeps them true.

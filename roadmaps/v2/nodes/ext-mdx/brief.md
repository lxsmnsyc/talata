---
id: ext-mdx
title: MDX extension without a JS parser
status: active
priority: must
type: feature
outline: false
milestone: m5-mdx
target:
from:
size: L
spike: false
verify:
exclusive: []
fulfilled_by:
gate: false
added: 2026-10-28
owns:
  - packages/talata/src/ext/mdx/**
  - packages/talata/src/mdx.ts
  - packages/talata/test/mdx*.test.ts
  - packages/talata/test/fuzz/ext-mdx.ts
  - packages/talata/test/fuzz/ext.ts
  - packages/talata/test/parsers.ts
  - packages/talata/test/ext-api.test.ts
  - packages/talata/test/ext-api-bundle.test.ts
  - packages/talata/package.json
  - packages/talata/tsdown.config.ts
  - benchmark/size/size.mjs
  - pnpm-lock.yaml
shared: []
reserves: []
provides: []
depends_on:
  - on: mdx-core
    kind: hard
    why: needs extension contract v4 to turn off autolink, indented code and HTML
---

# MDX extension without a JS parser

## Goal

`talata/mdx`: `mdx()` gives the tree of `mdast-util-from-markdown` with `micromark-extension-mdx` 2.1.0 and `mdast-util-mdx` 3.0.0, positions included, with and without GFM and the other extensions. This covers JSX elements (flow and text), expressions (flow and text), and attribute and spread expressions. It does not use a JS parser: braces are counted, as the reference does without acorn. No ESM and no `data.estree`; ext-mdx-acorn adds those.

## Context

How the reference works, and what decides the shape here:

- A JSX flow tag is not a container. Each line holding only tags (and expressions) is one flow construct, `concrete`, so lazy lines do not continue into it. `mdast-util-mdx-jsx` nests the blocks between an open and a close tag while it builds the tree, and throws on tags that do not match, such as `Unexpected closing tag` or `Expected a closing tag for <x> before the end of paragraph`. A transform over the finished tree (`Extension.transforms`) fits this better than a block rule that holds children. Positions run from the start of the open tag to the end of the close tag.
- `micromark-extension-mdx-md` turns off autolinks, indented code and HTML: use contract v4 from mdx-core.
- Expressions without acorn count `{` and `}` and end at the `}` that brings the count back to zero (`micromark-factory-mdx-expression`, `inside`). Flow expressions may continue over lines; `allowLazy` decides lazy lines.
- The reference throws a `VFileMessage` on bad syntax. Throw an `Error` whose message is the reference's `reason` followed by the place, the way the tests compare it. Read every message in `micromark-extension-mdx-jsx` and `mdast-util-mdx-jsx` and cover each one.

Read `roadmaps/v2/nodes/ext-directive/outcome.md` for how a subpath, its fuzz hook, the bundle test and the size script are wired. Follow the project rules in `roadmaps/v2/CLAUDE.md`: no regular expressions in hot paths, one rule per file. Add `micromark-extension-mdx` and `mdast-util-mdx` as devDependencies only.

Test inputs: the reference packages' own tests (inputs copied with the license note), the benchmark corpus with the extension on, cases with JSX in lists, quotes, footnotes and directives, and the fuzz hook. The fuzz generator must produce mostly valid MDX, and a case where both throw counts as a match only when the messages match.

## Acceptance

- [ ] Every reference test input and every corpus file gives the reference's tree, or the same error message and place, with and without GFM.
- [ ] `cd packages/talata && pnpm fuzz --count 1000000 --seed <any> --all` (GFM, frontmatter, math, directive and mdx on) finds no difference.
- [ ] The main entry holds no MDX code (`test/ext-api-bundle.test.ts`). Report the gzip size of the main entry and of `talata/mdx`.
- [ ] The unified plugin takes `mdx()` in `extensions`.
- [ ] Full check passes.

## Sizing

L: two inline rules, a flow rule, an expression scanner, tree building with tag matching, error messages, and a fuzz hook.

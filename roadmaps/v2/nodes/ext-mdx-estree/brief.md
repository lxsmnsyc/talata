---
id: ext-mdx-estree
title: MDX estree output
status: done
priority: must
type: feature
outline: false
milestone: m5-mdx
target:
from:
size: M
spent: 500000
spike: false
verify:
exclusive: []
fulfilled_by:
gate: false
added: 2026-11-09
refined: 2026-11-23
owns:
  - packages/talata/src/ext/mdx/**
  - packages/talata/src/mdx.ts
  - packages/talata/test/mdx-estree*.test.ts
  - packages/talata/test/mdx-compile*.test.ts
  - packages/talata/test/parsers.ts
  - packages/talata/test/fuzz/**
  - packages/talata/package.json
  - pnpm-lock.yaml
shared: []
reserves: []
provides: []
depends_on:
  - on: ext-mdx-acorn
    kind: hard
    why: adds data.estree to the nodes it parses with acorn
  - on: mdx-layers-flow
    kind: hard
    why: maps acorn positions through the rewritten MDX flow
---

# MDX estree output

## Goal

With `mdx({ acorn })`, put `data.estree` on `mdxFlowExpression`, `mdxTextExpression`, `mdxjsEsm`, attribute expression and attribute value expression nodes, as `micromark-extension-mdxjs` 3.0.0 with `mdast-util-mdx` 3.0.0 does. The tree then equals the reference with nothing removed. `@mdx-js/mdx` 3.1.1 can then compile MDX with talata as its parser.

## Context

- The reference builds each program in `micromark-util-events-to-acorn` 2.0.3: it parses the expression or ESM text with acorn, then fixes every node's `start`, `end`, `loc` and `range` back to document places across line prefixes (quote markers, list indents, tabs), and adds `comments`. Read that package and `micromark-extension-mdx-expression` / `micromark-extension-mdxjs-esm` / `mdast-util-mdx-expression` / `mdast-util-mdx-jsx` for exactly which node gets which program, and the shape for empty and spread expressions.
- `ext-mdx-acorn` already calls acorn at the same points and maps error places back through prefixes (see its outcome). Keep acorn's result instead of discarding it, and reuse the place mapping.
- Without acorn, nothing changes: no `data.estree`, as the reference.
- `@mdx-js/mdx` builds `unified().use(remarkParse).use(remarkMdx)`; check first whether a plugin passed in `remarkPlugins` (`talata/unified` with `extensions: [mdx({ acorn })]`) replaces the parser. If it cannot, record why in the outcome and find the smallest supported way (for example `compile` on a pre-parsed tree through `createProcessor` and `run`).
- Size: estree mapping adds code to `talata/mdx` only. The main entry must not change.

## Acceptance

- [ ] Tests compare trees with `data.estree` kept (remove the stripping from `test/parsers.ts` for mdx with acorn). Every reference test input and every corpus file gives the reference's tree, or the same error, with and without GFM.
- [ ] End to end: the reference's test inputs and the corpus files that are valid MDX compile with `@mdx-js/mdx` to the same JS whether parsed by the default parser or by talata.
- [ ] 1,000,000-document `--all --acorn` fuzz and the targeted generators find no difference.
- [ ] `dependencies` still only `@types/mdast`; acorn, acorn-jsx and `@mdx-js/mdx` as devDependencies.
- [ ] No input shape grows faster than in the reference (ratio at 4x size). Full check passes.

## Sizing

M: keep acorn's programs, fix positions across prefixes, comments, attach to nodes, and an end-to-end compile test.

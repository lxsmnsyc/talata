---
id: ext-mdx-acorn
title: MDX with acorn, for mdxjs parity
status: active
priority: must
type: feature
outline: false
milestone: m5-mdx
target:
from:
size: M
spike: false
verify:
exclusive: []
fulfilled_by:
gate: false
added: 2026-11-09
owns:
  - packages/talata/src/ext/mdx/**
  - packages/talata/src/mdx.ts
  - packages/talata/test/mdx-acorn*.test.ts
  - packages/talata/test/fuzz/ext-mdx.ts
  - packages/talata/package.json
  - pnpm-lock.yaml
shared: []
reserves: []
provides: []
depends_on:
  - on: ext-mdx
    kind: hard
    why: extends the same rules in src/ext/mdx
---

# MDX with acorn, for mdxjs parity

## Goal

`mdx({ acorn, acornOptions })` gives the tree of `mdast-util-from-markdown` with `micromark-extension-mdxjs` 3.0.0 and `mdast-util-mdx` 3.0.0, positions included, except `data.estree`. The caller passes acorn in, as `micromark-extension-mdx-expression` accepts it (`acorn.Parser.extend(acornJsx())`). talata gets no runtime dependency.

## Context

What acorn changes in the reference:

- Expression ends: with acorn, braces are not counted. At each `}` the reference asks acorn whether the text so far parses, and goes on to the next `}` if it does not (`micromark-factory-mdx-expression`, `mdxExpressionParse`). So `{"}"}` is one expression. Empty and spread expressions follow `allowEmpty` and `spread`.
- ESM (`micromark-extension-mdxjs-esm` 3.0.0): a flow construct at the start of a line with `import` or `export` and a space. It runs to a blank line or the end of the input, then acorn parses it. When acorn fails at the end of that text (`swallow` in `micromark-util-events-to-acorn`) and more input follows, it takes the blank line and continues. Only import and export statements are allowed. Node `mdxjsEsm` with `value`.
- Errors: `Could not parse expression with acorn`, `Could not parse import/exports with acorn` and `Unexpected ... in code: only import/exports are supported`, with acorn's place mapped back into the document.
- `acornOptions` default to `{ ecmaVersion: 2024, locations: true, sourceType: 'module' }` merged as the reference does.

Type the `acorn` option structurally (`parse`, `parseExpressionAt`), as `micromark-util-events-to-acorn` does, so talata's types do not import acorn. Add `acorn`, `acorn-jsx` and `micromark-extension-mdxjs` as devDependencies only.

Tests compare against the reference with `data.estree` removed from both trees. `mdx()` without acorn must keep the behavior of ext-mdx.

## Acceptance

- [ ] Every input of the mdxjs, mdxjs-esm and mdx-expression reference tests gives the reference's tree without `data.estree`, or the same error message and place.
- [ ] `pnpm fuzz --count 1000000 --seed <any> --all` with `mdx({ acorn })` finds no difference.
- [ ] `packages/talata/package.json` `dependencies` still lists only `@types/mdast`.
- [ ] Full check passes.

## Sizing

M: an acorn call at `}` and around ESM, mapping places across line prefixes, and three error messages.

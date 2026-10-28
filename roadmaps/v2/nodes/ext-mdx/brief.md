---
id: ext-mdx
title: MDX extension
status: todo
priority: later
type: feature
outline: true
milestone: m4-mdx
target:
from:
size: XL
spike: false
verify:
exclusive: []
fulfilled_by:
gate: false
added: 2026-10-28
owns: []
shared: []
reserves: []
provides: []
depends_on:
  - on: ext-api
    kind: contract
    via: extension
---

# MDX extension

## Goal

`talata/mdx`: the same tree as `mdast-util-from-markdown` with `micromark-extension-mdxjs` and `mdast-util-mdx`. JSX, expressions and ESM need a JavaScript parser (the reference uses acorn), which is the hard part.

## Notes

Outline, parked. Subpath of `talata`, like the other extensions (user, 2026-10-28).

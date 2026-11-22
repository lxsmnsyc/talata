---
id: ext-mdx-estree
title: MDX estree output
status: todo
priority: later
type: feature
outline: true
milestone:
target:
from:
size: M
spike: false
verify:
exclusive: []
fulfilled_by:
gate: false
added: 2026-11-09
owns: []
shared: []
reserves: []
provides: []
depends_on:
  - on: ext-mdx-acorn
    kind: hard
    why: adds data.estree to the nodes it parses with acorn
---

# MDX estree output

## Goal

With acorn, put `data.estree` on expression, attribute and ESM nodes as `micromark-extension-mdxjs` does, positions fixed up across line prefixes (`micromark-util-events-to-acorn`), so the tree equals the reference with nothing removed.

## Notes

Parked (user, 2026-11-09): 0.4 ships MDX without estree. Needed by tools that read the JS from the tree, such as `@mdx-js/mdx`, not by tools that only copy `value`.

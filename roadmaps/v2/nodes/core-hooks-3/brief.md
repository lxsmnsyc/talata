---
id: core-hooks-3
title: Core hooks for container lookahead (contract v5)
status: todo
priority: later
type: refactor
outline: true
milestone:
target:
from:
size: M
spike: false
verify:
exclusive: [benchmark]
fulfilled_by:
gate: false
added: 2026-11-02
owns: []
shared: []
reserves: []
provides: []
depends_on:
  - on: ext-directive
    kind: hard
    why: builds the hooks that ext-directive's v3-to-v4 change request asks for and removes its workarounds
---

# Core hooks for container lookahead (contract v5)

## Goal

Build the next extension contract version from `roadmaps/v2/contracts/extension-directive.change-request.md` (accepted 2026-11-02): `BlockState.startsContainer(line)`, `OpenBlock.matchesNext?(state, line)` on core containers, a supported way to ask the blocks inside a container whether they continue over an empty line, `TrackedContainer.endAtLeast?(offset)`, and the narrower next-line `unmatched` override after `endContent`. Then remove the matching workarounds from `src/ext/directive/container.ts` (`isContainerStart`, `continuesNext`, the `state.container` writes, `raiseIndentEnd`, and the `unmatched` part of `directiveScope`). The tree must stay the same, and so must the 1,000,000-document fuzz result.

Not needed for MDX (checked 2026-11-09): JSX flow tags are one-line flow constructs, and `mdast-util-mdx-jsx` nests the blocks between tags while it builds the tree, so no container lookahead is involved. This node only removes the directive workarounds.

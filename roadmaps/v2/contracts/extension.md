---
name: extension
version: 0
status: draft
defined_by: ext-api
---

# Contract: extension

## Purpose

How an extension adds syntax to talata. Used by the subpaths `talata/frontmatter`, `talata/math`, `talata/directive` and later `talata/mdx`. Internal in 0.2: not documented for third parties.

## Interface

ext-api writes the exact types here and freezes them: the `Extension` shape, the `extensions` option of `fromMarkdown` and of the unified plugin, how rule priorities order extension rules against core and GFM rules, and how registries are cached per set of extensions.

## Behavior

- An empty `extensions` list gives the same tree as no option.
- Extension code reaches the bundle only through its subpath.

## Stub

`src/frontmatter.ts`, `src/math.ts` and `src/directive.ts` export factories that return empty extensions.

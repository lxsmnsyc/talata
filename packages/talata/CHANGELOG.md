# talata

## 0.2.0

### Minor Changes

- 361462c: Add frontmatter and math as subpaths. `fromMarkdown` and the unified plugin take an `extensions` option. Pass `frontmatter()` from `talata/frontmatter` or `math()` from `talata/math` to get the same tree as `mdast-util-from-markdown` with `micromark-extension-frontmatter` and `mdast-util-frontmatter`, or with `micromark-extension-math` and `mdast-util-math`.

### Patch Changes

- e927eb1: Fix GFM task list checks that span a line ending. In `- [\n ] a` the space before `]` makes it plain text, as in the reference, instead of an unchecked task.

## 0.1.1

### Patch Changes

- 4db2780: Ship one build for every runtime. The `browser` export condition and the DOM-based entity decoder are gone, so bundlers for workers, edge runtimes and server rendering no longer need special conditions. Browser bundles grow by about 10 KB gzip.

## 0.1.0

### Minor Changes

- 7004cea: First release. `fromMarkdown(value, { gfm })` returns the same mdast tree as `mdast-util-from-markdown`, with `mdast-util-gfm` when `gfm` is set, and `talata/unified` replaces `remark-parse` in a unified pipeline.

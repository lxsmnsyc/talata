# talata

## 0.1.1

### Patch Changes

- 4db2780: Ship one build for every runtime. The `browser` export condition and the DOM-based entity decoder are gone, so bundlers for workers, edge runtimes and server rendering no longer need special conditions. Browser bundles grow by about 10 KB gzip.

## 0.1.0

### Minor Changes

- 7004cea: First release. `fromMarkdown(value, { gfm })` returns the same mdast tree as `mdast-util-from-markdown`, with `mdast-util-gfm` when `gfm` is set, and `talata/unified` replaces `remark-parse` in a unified pipeline.

# Talata

Talata is a Markdown parser for JavaScript that produces the same mdast tree as `mdast-util-from-markdown`, so it works with remark plugins, while parsing several times faster.

Status: not usable yet. The repository holds the test harness, the benchmark and the roadmap. See `roadmaps/v1/`.

The name is Tagalog for "paragraph".

## Why

`remark-parse` with `remark-gfm` is 6 to 9 times slower than markdown-it on the same documents (`benchmark/BASELINE.md`). markdown-it already passes the CommonMark spec, but it produces its own tokens, so remark plugins cannot use it. Talata aims for both: remark-compatible mdast and markdown-it speed.

## Packages

- `packages/talata`: the parser.
- `benchmark`: speed comparison with micromark, mdast-util-from-markdown, markdown-it and marked.

## Development

```sh
pnpm install
pnpm --filter talata test          # spec and mdast equivalence tests
pnpm --filter benchmark corpus     # download the benchmark corpus
pnpm --filter benchmark interleaved
```

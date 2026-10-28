# talata

A fast Markdown parser written in TypeScript. It returns the same mdast tree as `mdast-util-from-markdown`, positions included, for CommonMark and GitHub Flavored Markdown. It parses about 17 to 22 times faster. It works as a drop-in parser for remark.

```js
import { fromMarkdown } from 'talata';

const tree = fromMarkdown('# Hello, *world*!', { gfm: true });
```

Usage, the unified plugin, benchmarks and differences from the reference: [`packages/talata/README.md`](packages/talata/README.md).

## Repository

- `packages/talata`: the parser, published to npm as `talata`.
- `benchmark`: speed and size comparison with `mdast-util-from-markdown`, micromark, markdown-it and marked.
- `roadmaps/v1`: the plan and the record of each piece of work.

## Development

Node 22.18 or later and pnpm 12.

```sh
pnpm install
pnpm --filter talata test           # spec, corpus and equivalence tests
pnpm --filter benchmark corpus      # download the benchmark corpus first
pnpm --filter benchmark interleaved # speed
pnpm --filter benchmark size        # bundle size
cd packages/talata && pnpm fuzz --count 100000   # differential fuzzer
```

Lint and format: `npx oxlint` and `npx oxfmt --check`.

Releases use changesets. Add one with `pnpm cs:add`. Merging the "Version Packages" pull request publishes to npm.

## License

MIT

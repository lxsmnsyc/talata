# talata

A fast Markdown parser written in TypeScript. It returns the same [mdast](https://github.com/syntax-tree/mdast) tree as [`mdast-util-from-markdown`](https://github.com/syntax-tree/mdast-util-from-markdown), positions included. It covers CommonMark and GitHub Flavored Markdown (GFM), and parses about 17 to 22 times faster.

Because the tree is the same, everything that reads mdast keeps working: remark plugins that transform the tree, `remark-rehype`, `mdast-util-to-hast`, `remark-stringify` and your own code.

The name is Tagalog for "paragraph".

## Install

```sh
npm install talata
```

Node 20 or later, and current browsers. ESM and CommonJS. The only dependency is `@types/mdast`.

## Use

```js
import { fromMarkdown } from 'talata';

const tree = fromMarkdown('# Hello, *world*!');
const gfmTree = fromMarkdown('| a | b |\n| - | - |\n| 1 | 2 |', { gfm: true });
```

`fromMarkdown(value, options?)` returns an mdast `Root`.

| Option | Type      | Default | Meaning                                                                        |
| ------ | --------- | ------- | ------------------------------------------------------------------------------ |
| `gfm`  | `boolean` | `false` | Parse GFM: tables, strikethrough, literal autolinks, task lists and footnotes. |

Without `gfm`, the tree equals `fromMarkdown(value)` from `mdast-util-from-markdown`. With `gfm: true`, it equals:

```js
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown } from 'mdast-util-gfm';

fromMarkdown(value, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
```

### With unified and remark

`talata/unified` is a unified plugin that replaces `remark-parse`, and `remark-gfm` when `gfm` is set:

```js
import { unified } from 'unified';
import { talata } from 'talata/unified';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';

const html = String(
  await unified()
    .use(talata, { gfm: true })
    .use(remarkRehype)
    .use(rehypeStringify)
    .process('Hello ~~world~~'),
);
```

The HTML is the same as with `remark-parse` and `remark-gfm`.

To serialize GFM back to Markdown with `remark-stringify`, keep `remark-gfm` in the pipeline as well. It adds the serializer rules for tables, task lists and the rest, and talata still does the parsing. Without it, `remark-stringify` throws `Cannot handle unknown node 'table'`.

### HTML

talata does not render HTML itself. Convert the tree:

```js
import { fromMarkdown } from 'talata';
import { toHast } from 'mdast-util-to-hast';
import { toHtml } from 'hast-util-to-html';

const html = toHtml(toHast(fromMarkdown(value, { gfm: true })));
```

This path is 6.5 to 7.5 times faster than `micromark` HTML output on the benchmark corpus. Its HTML follows `mdast-util-to-hast`, so it is not byte for byte the same as `micromark()` output.

## What is not supported

- **micromark syntax extensions.** talata does not run micromark, so plugins that add syntax through it do not work. Examples are `remark-frontmatter`, `remark-math`, `remark-directive` and `remark-mdx`. With the unified plugin, their syntax is parsed as plain Markdown. Tree plugins are not affected. Frontmatter, math and directives are planned as talata's own extensions.
- **The rest of the `mdast-util-from-markdown` signature.** There is no `encoding` argument, no `Buffer` input, and no `extensions` or `mdastExtensions` option. Pass a string.

## Speed

`pnpm --filter benchmark interleaved`: each round runs every parser once in random order, and the table shows the median of 15 rounds. Apple M2, Node 26.12.1, load average under 4.

| Parser                           | Output | READMEs (139 files, 1.1 MB) | node `fs.md` (310 KB) | node `CHANGELOG_V22` (867 KB) |
| -------------------------------- | ------ | --------------------------- | --------------------- | ----------------------------- |
| `mdast-util-from-markdown` + GFM | mdast  | 579.8 ms                    | 188.5 ms              | 553.5 ms                      |
| **talata**, `gfm: true`          | mdast  | **33.8 ms**                 | **10.2 ms**           | **25.7 ms**                   |
| talata speedup                   |        | **17.1x**                   | **18.6x**             | **21.6x**                     |
| `micromark` + GFM                | HTML   | 540.4 ms                    | 176.6 ms              | 518.4 ms                      |
| markdown-it                      | HTML   | 87.5 ms                     | 35.5 ms               | 96.6 ms                       |
| marked                           | HTML   | 56.3 ms                     | 17.9 ms               | 66.2 ms                       |

markdown-it and marked build HTML, not mdast, so they are there for scale only.

Parse time grows linearly with input size, including on inputs that are quadratic in naive parsers, such as many unclosed brackets under emphasis delimiters. Growth tests check this.

## Size

`pnpm --filter benchmark size`: esbuild, minified, ES2020, GFM included on both sides.

| Build   | talata                | `mdast-util-from-markdown` + GFM |
| ------- | --------------------- | -------------------------------- |
| Node    | 92.1 KB, 32.6 KB gzip | 118.2 KB, 35.9 KB gzip           |
| Browser | 68.9 KB, 22.4 KB gzip | 82.5 KB, 23.8 KB gzip            |

The browser build decodes named character references with the DOM instead of shipping a table, as the reference does. Bundlers pick it through the `browser` export condition. Workers, Deno, edge runtimes (`worker`, `workerd`, `edge-light`, `deno`), React Native and Convex get the table build. A bundle built for `browser` and run where there is no `document` throws on the first named character reference.

## How it is tested

- Every CommonMark 0.31.2 spec example and every GFM spec example, with and without GFM, gives the same tree as the reference.
- Every file of the benchmark corpus gives the same tree, positions included.
- A differential fuzzer compares talata with the reference on generated documents. A run of 1,000,000 documents found no difference.

## Differences from the reference

talata matches the reference, not the spec, where the two disagree. Cases that may surprise you, all of which talata reproduces:

- Kind 7 HTML on a lazy line stays inside its containers.
- Indented code on a lazy line is one line long.
- Fenced code trims one line ending from each end of its value.
- An emphasis run next to a NUL keeps its whole value.
- List items end at the closing event after a child that kept its line ending.
- After a list item whose marker line is empty, a lazy paragraph that starts with `[ ]` loses it. Its parent gets `checked`, even when that parent is the root or a block quote (`-\n[ ] a`). Setext headings and table headers in that position keep `[ ]`.
- Strikethrough and emphasis resolve in the order of the first `~` run or `*`/`_` run in the paragraph.
- Literal autolinks have no position, and `www.` alone links to `http://www`.
- A kind 7 HTML line as a table header takes the delimiter row (`a\n<n>\n|-`). A table closed by a lazy line blocks a header on the next line. `a\n:-` is a one-column table.

Where talata does not match:

- The reference never finishes on `[^n]: x\n\n![ \n^n]` with GFM. talata parses it.
- The reference throws a `RangeError` on a paragraph with more than about 70,000 literal autolinks. talata parses it.

## License

MIT

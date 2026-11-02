# talata

A fast Markdown parser written in TypeScript. It returns the same [mdast](https://github.com/syntax-tree/mdast) tree as [`mdast-util-from-markdown`](https://github.com/syntax-tree/mdast-util-from-markdown), positions included. It covers CommonMark and GitHub Flavored Markdown (GFM), and parses about 22 to 24 times faster.

Because the tree is the same, everything that reads mdast keeps working: remark plugins that transform the tree, `remark-rehype`, `mdast-util-to-hast`, `remark-stringify` and your own code.

The name is Tagalog for "paragraph".

Coming from `mdast-util-from-markdown` or `remark-parse`? See the [migration guide](../../docs/migration.md).

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

## Extensions

Frontmatter, math and directives ship in the same package, each behind its own subpath. Pass them in `extensions`. Code for an extension reaches your bundle only when you import its subpath.

```js
import { fromMarkdown } from 'talata';
import { frontmatter } from 'talata/frontmatter';
import { math } from 'talata/math';
import { directive } from 'talata/directive';

const tree = fromMarkdown(value, {
  gfm: true,
  extensions: [frontmatter(), math(), directive()],
});
```

| Subpath              | Factory                 | Same tree as                                                 | Options                                                                                                                              |
| -------------------- | ----------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `talata/frontmatter` | `frontmatter(options?)` | `micromark-extension-frontmatter` + `mdast-util-frontmatter` | The same as the reference: `'yaml'`, `'toml'`, or matter objects with `type`, `marker` or `fence`, and `anywhere`. Default `'yaml'`. |
| `talata/math`        | `math(options?)`        | `micromark-extension-math` + `mdast-util-math`               | `{ singleDollarTextMath }`, default `true`.                                                                                          |
| `talata/directive`   | `directive()`           | `micromark-extension-directive` + `mdast-util-directive`     | None, as in the reference.                                                                                                           |

The unified plugin takes the same option: `.use(talata, { gfm: true, extensions: [frontmatter(), math(), directive()] })`. To serialize with `remark-stringify`, keep `remark-frontmatter`, `remark-math` and `remark-directive` in the pipeline for their serializer rules, as with `remark-gfm`.

One known difference, only with `anywhere: true`: take a matter that interrupts a lazy paragraph in a block quote or list (`> a\n---\nb\n---`). talata keeps it outside the quote, and the reference puts it inside.

### Directives

`directive()` replaces `remark-directive`. It parses text directives (`:name[label]{key=value}`), leaf directives (`::name`) and container directives (`:::name`), and builds `textDirective`, `leafDirective` and `containerDirective` nodes. Positions, `attributes`, labels and the content of containers match `micromark-extension-directive` 4.0.0 with `mdast-util-directive` 3.1.1.

```js
import { unified } from 'unified';
import { talata } from 'talata/unified';
import { directive } from 'talata/directive';

const processor = unified().use(talata, { gfm: true, extensions: [directive()] });
const tree = processor.parse(
  ':::note{.warn}\nSee :abbr[HTML]{title="HyperText Markup Language"}.\n:::',
);
```

Remove `remark-parse` and `remark-directive` from the pipeline. Plugins that read directive nodes, such as the ones that turn them into hast, keep working because the tree is the same. Steps and a before and after example: [migration guide](../../docs/migration.md#directives).

talata decides some line ends inside a container directive by looking one line ahead, where the reference lets micromark do it. The fuzzer found no difference in 1,000,000 documents, but it found several such cases while the extension was built, so report any difference you see.

## What is not supported

- **micromark syntax extensions.** talata does not run micromark, so plugins that add syntax through it do not work. Examples are `remark-mdx` and `remark-wiki-link`. With the unified plugin, their syntax is parsed as plain Markdown. Tree plugins are not affected. For frontmatter, math and directives, use talata's own extensions above. MDX is planned.
- **The rest of the `mdast-util-from-markdown` signature.** There is no `encoding` argument, no `Buffer` input, and the `extensions` option takes talata extensions, not micromark ones. There is no `mdastExtensions` option: each talata extension builds its own nodes. Pass a string.

## Speed

`pnpm --filter benchmark interleaved`: each round runs every parser once in random order, and the table shows the median of 15 rounds. Apple M2, Node 26.12.1. The load average was 8 to 25 from other jobs, so absolute times are higher than on a quiet machine. The ratios are the useful part.

| Parser                           | Output | READMEs (174 files, 1.5 MB) | node `fs.md` (311 KB) | node `CHANGELOG_V22` (867 KB) |
| -------------------------------- | ------ | --------------------------- | --------------------- | ----------------------------- |
| `mdast-util-from-markdown` + GFM | mdast  | 2407.7 ms                   | 421.0 ms              | 840.2 ms                      |
| **talata**, `gfm: true`          | mdast  | **100.5 ms**                | **19.2 ms**           | **36.2 ms**                   |
| talata speedup                   |        | **24.0x**                   | **22.0x**             | **23.2x**                     |
| `micromark` + GFM                | HTML   | 2115.7 ms                   | 365.0 ms              | 762.3 ms                      |
| markdown-it                      | HTML   | 244.9 ms                    | 70.7 ms               | 130.5 ms                      |
| marked                           | HTML   | 148.3 ms                    | 36.8 ms               | 92.8 ms                       |

markdown-it and marked build HTML, not mdast, so they are there for scale only.

Parse time grows linearly with input size, including on inputs that are quadratic in naive parsers, such as many unclosed brackets under emphasis delimiters. Growth tests check this.

## Size

`pnpm --filter benchmark size`: esbuild, minified, ES2020, GFM included on both sides.

| Build   | talata                | `mdast-util-from-markdown` + GFM |
| ------- | --------------------- | -------------------------------- |
| Node    | 94.0 KB, 33.2 KB gzip | 118.2 KB, 35.9 KB gzip           |
| Browser | 94.0 KB, 33.2 KB gzip | 82.5 KB, 23.8 KB gzip            |

talata ships one build for every runtime, with a table of the 2,125 named character references (about 9.5 KB gzip). In browser bundles, the reference decodes those names through the DOM and ships no table, so it is smaller there.

Each extension adds to a bundle only when imported: `talata/frontmatter` is 1.3 KB gzip and `talata/math` is 12.8 KB gzip and `talata/directive` is 19.1 KB gzip. Both include the shared core code they reuse, so most of that is already in a bundle that imports `talata`.

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

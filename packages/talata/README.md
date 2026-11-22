# talata

A fast Markdown parser written in TypeScript. It returns the same [mdast](https://github.com/syntax-tree/mdast) tree as [`mdast-util-from-markdown`](https://github.com/syntax-tree/mdast-util-from-markdown), positions included. It covers CommonMark and GitHub Flavored Markdown (GFM), and parses about 17 to 21 times faster.

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

Frontmatter, math, directives and MDX ship in the same package, each behind its own subpath. Pass them in `extensions`. Code for an extension reaches your bundle only when you import its subpath.

```js
import { fromMarkdown } from 'talata';
import { frontmatter } from 'talata/frontmatter';
import { math } from 'talata/math';
import { directive } from 'talata/directive';
import { mdx } from 'talata/mdx';

const tree = fromMarkdown(value, {
  gfm: true,
  extensions: [frontmatter(), math(), directive(), mdx()],
});
```

| Subpath              | Factory                 | Same tree as                                                 | Options                                                                                                                              |
| -------------------- | ----------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `talata/frontmatter` | `frontmatter(options?)` | `micromark-extension-frontmatter` + `mdast-util-frontmatter` | The same as the reference: `'yaml'`, `'toml'`, or matter objects with `type`, `marker` or `fence`, and `anywhere`. Default `'yaml'`. |
| `talata/math`        | `math(options?)`        | `micromark-extension-math` + `mdast-util-math`               | `{ singleDollarTextMath }`, default `true`.                                                                                          |
| `talata/directive`   | `directive()`           | `micromark-extension-directive` + `mdast-util-directive`     | None, as in the reference.                                                                                                           |
| `talata/mdx`         | `mdx(options?)`         | `micromark-extension-mdx` or `-mdxjs` + `mdast-util-mdx`     | `{ acorn, acornOptions }`, as `micromark-extension-mdxjs`. Without `acorn`, braces are counted.                                      |

The unified plugin takes the same option: `.use(talata, { gfm: true, extensions: [frontmatter(), math(), directive(), mdx()] })`. To serialize with `remark-stringify`, keep `remark-frontmatter`, `remark-math`, `remark-directive` and `remark-mdx` in the pipeline for their serializer rules, as with `remark-gfm`.

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

talata decides some line ends inside a container directive by looking one line ahead, where the reference lets micromark do it. The fuzzer found no difference in 1,000,000 documents. It found several such cases while the extension was built, so report any difference you see.

### MDX

`mdx()` replaces `remark-mdx`. It parses JSX elements in flow and text, expressions in braces, and attribute and spread expressions. It builds `mdxJsxFlowElement`, `mdxJsxTextElement`, `mdxFlowExpression` and `mdxTextExpression` nodes, with positions, as `micromark-extension-mdx` 2.1.0 with `mdast-util-mdx` 3.0.0. As in the reference, indented code, autolinks and HTML are off.

```js
import { fromMarkdown } from 'talata';
import { mdx } from 'talata/mdx';

const tree = fromMarkdown('# Hi\n\n<Note kind="info">{props.text}</Note>\n', {
  extensions: [mdx()],
});
```

Without a JS parser, `mdx()` counts braces to find the end of an expression and does not parse `import` and `export`. To get what `remark-mdx` gives, pass acorn. talata does not depend on it: you install `acorn` and `acorn-jsx` and pass the parser in.

```js
import * as acorn from 'acorn';
import acornJsx from 'acorn-jsx';
import { mdx } from 'talata/mdx';

const extension = mdx({ acorn: acorn.Parser.extend(acornJsx()) });
```

With acorn, acorn decides where an expression ends, so `{"}"}` is one expression, and `import` and `export` lines become `mdxjsEsm` nodes. `acornOptions` is passed to acorn, with the same default as `micromark-extension-mdxjs` (`{ ecmaVersion: 2024, sourceType: 'module' }`). The tree matches `micromark-extension-mdxjs` 3.0.0 with `mdast-util-mdx`.

With unified:

```js
import { unified } from 'unified';
import { talata } from 'talata/unified';
import { mdx } from 'talata/mdx';

const processor = unified().use(talata, { gfm: true, extensions: [mdx({ acorn })] });
```

Remove `remark-parse` and `remark-mdx` from the pipeline. Plugins that read MDX nodes keep working because the tree is the same. Steps and a before and after example: [migration guide](../../docs/migration.md#mdx).

Differences from the reference:

- **No `data.estree`.** The reference with acorn attaches the parsed program to each expression, attribute and ESM node. talata checks the code with acorn and does not keep the result. Plugins that read `data.estree`, such as `recma` plugins or `@mdx-js/mdx` compile steps, need the reference parse step.
- **Errors.** Bad syntax throws an `MdxError`, a subclass of `Error`, with the reference's `reason` and `place` (a point or a position, or `undefined` for a tag left open at the end). `message` is the reason followed by the place. The `source` and `ruleId` fields of the reference are not set. Code that acorn rejects throws the same way.
- **One known gap.** When a failed JSX or expression construct holds a container directive opener that is never closed there (`[a]:\n{a\n:::x\n}x\n`), the tree misses that directive. The fuzzer found no other difference in 1,000,000 documents.

## What is not supported

- **micromark syntax extensions.** talata does not run micromark, so plugins that add syntax through it do not work. An example is `remark-wiki-link`. With the unified plugin, its syntax is parsed as plain Markdown. Tree plugins are not affected. For frontmatter, math, directives and MDX, use talata's own extensions above.
- **The rest of the `mdast-util-from-markdown` signature.** There is no `encoding` argument, no `Buffer` input, and the `extensions` option takes talata extensions, not micromark ones. There is no `mdastExtensions` option: each talata extension builds its own nodes. Pass a string.

## Speed

`pnpm --filter benchmark interleaved`: each round runs every parser once in random order, and the table shows the median of 15 rounds. Apple M2, Node 26.12.1, load average under 4.

| Parser                           | Output | READMEs (192 files, 1.6 MB) | node `fs.md` (311 KB) | node `CHANGELOG_V22` (867 KB) |
| -------------------------------- | ------ | --------------------------- | --------------------- | ----------------------------- |
| `mdast-util-from-markdown` + GFM | mdast  | 829.0 ms                    | 192.8 ms              | 535.3 ms                      |
| **talata**, `gfm: true`          | mdast  | **48.4 ms**                 | **10.5 ms**           | **25.3 ms**                   |
| talata speedup                   |        | **17.1x**                   | **18.3x**             | **21.2x**                     |
| `micromark` + GFM                | HTML   | 796.0 ms                    | 178.8 ms              | 507.0 ms                      |
| markdown-it                      | HTML   | 122.3 ms                    | 35.4 ms               | 96.2 ms                       |
| marked                           | HTML   | 76.7 ms                     | 17.8 ms               | 64.3 ms                       |

markdown-it and marked build HTML, not mdast, so they are there for scale only.

Parse time grows linearly with input size, including on inputs that are quadratic in naive parsers, such as many unclosed brackets under emphasis delimiters. Growth tests check this.

## Size

`pnpm --filter benchmark size`: esbuild, minified, ES2020, GFM included on both sides.

| Build   | talata                | `mdast-util-from-markdown` + GFM |
| ------- | --------------------- | -------------------------------- |
| Node    | 94.8 KB, 33.4 KB gzip | 118.2 KB, 35.9 KB gzip           |
| Browser | 94.8 KB, 33.4 KB gzip | 82.5 KB, 23.8 KB gzip            |

talata ships one build for every runtime, with a table of the 2,125 named character references (about 9.5 KB gzip). In browser bundles, the reference decodes those names through the DOM and ships no table, so it is smaller there.

Each extension adds to a bundle only when imported: `talata/frontmatter` is 1.3 KB gzip, `talata/math` is 12.8 KB, `talata/directive` is 19.8 KB and `talata/mdx` is 29.8 KB. All four include the shared core code they reuse, so most of that is already in a bundle that imports `talata`.

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

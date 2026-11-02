# Migrate to talata

talata returns the same mdast tree as `mdast-util-from-markdown`, positions included. Moving a project over means changing how the parser is called. Everything that reads the tree keeps working.

This guide covers three starting points:

- [`mdast-util-from-markdown`](#from-mdast-util-from-markdown), with or without GFM.
- [Frontmatter and math](#frontmatter-and-math) extensions.
- [Directives](#directives).
- [`unified` with `remark-parse`](#from-unified-and-remark-parse).

Then it lists [what does not carry over](#what-does-not-carry-over) and shows how to [check your output](#check-your-output).

In every example, `value` is the Markdown string to parse.

## Install

```sh
npm install talata
```

Node 20 or later, or a current browser. The unified plugin needs `unified` 11 (`^11.0.0`).

## From `mdast-util-from-markdown`

Before:

```js before
import { fromMarkdown } from 'mdast-util-from-markdown';

const tree = fromMarkdown(value);
```

After:

```js after
import { fromMarkdown } from 'talata';

const tree = fromMarkdown(value);
```

Only the import changes. `value` must be a string.

### With GFM

The reference needs a micromark extension and an mdast extension for GFM. talata has one option.

Before:

```js before
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';

const tree = fromMarkdown(value, {
  extensions: [gfm()],
  mdastExtensions: [gfmFromMarkdown()],
});
```

After:

```js after
import { fromMarkdown } from 'talata';

const tree = fromMarkdown(value, { gfm: true });
```

You can remove `micromark-extension-gfm` and `mdast-util-gfm` from your dependencies when nothing else uses them.

`gfm: true` takes no settings. talata does not support `gfm({ singleTilde: false })` or the `firstLineBlank` option of the footnote extension.

## Frontmatter and math

Each extension is a subpath of the `talata` package, so there is nothing else to install. The code for an extension reaches your bundle only when you import its subpath. The factories take the same options as the micromark extensions.

Before:

```js before
import { fromMarkdown } from 'mdast-util-from-markdown';
import { frontmatterFromMarkdown } from 'mdast-util-frontmatter';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { mathFromMarkdown } from 'mdast-util-math';
import { frontmatter } from 'micromark-extension-frontmatter';
import { gfm } from 'micromark-extension-gfm';
import { math } from 'micromark-extension-math';

const tree = fromMarkdown(value, {
  extensions: [gfm(), frontmatter(['yaml', 'toml']), math({ singleDollarTextMath: false })],
  mdastExtensions: [
    gfmFromMarkdown(),
    frontmatterFromMarkdown(['yaml', 'toml']),
    mathFromMarkdown(),
  ],
});
```

After:

```js after
import { fromMarkdown } from 'talata';
import { frontmatter } from 'talata/frontmatter';
import { math } from 'talata/math';

const tree = fromMarkdown(value, {
  gfm: true,
  extensions: [frontmatter(['yaml', 'toml']), math({ singleDollarTextMath: false })],
});
```

Notes:

- `frontmatter(options?)` takes `'yaml'`, `'toml'`, a matter object (`type`, `marker` or `fence`, `anywhere`), or a list of them. The default is `'yaml'`.
- `math(options?)` takes `{ singleDollarTextMath }`. The default is `true`.
- `frontmatterFromMarkdown` and `mathFromMarkdown` have no counterpart. Each talata extension builds its own nodes.
- The extensions also work without `gfm: true`.

## Directives

`talata/directive` replaces `micromark-extension-directive` with `mdast-util-directive`, and `remark-directive` in unified. It parses text (`:name[label]{attributes}`), leaf (`::name`) and container (`:::name`) directives into `textDirective`, `leafDirective` and `containerDirective` nodes. Like the reference, `directive()` takes no options.

Before:

```js before
import { fromMarkdown } from 'mdast-util-from-markdown';
import { directiveFromMarkdown } from 'mdast-util-directive';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { directive } from 'micromark-extension-directive';
import { gfm } from 'micromark-extension-gfm';

const tree = fromMarkdown(value, {
  extensions: [gfm(), directive()],
  mdastExtensions: [gfmFromMarkdown(), directiveFromMarkdown()],
});
```

After:

```js after
import { fromMarkdown } from 'talata';
import { directive } from 'talata/directive';

const tree = fromMarkdown(value, { gfm: true, extensions: [directive()] });
```

With unified, before:

```js before
import remarkDirective from 'remark-directive';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkDirective);
const tree = await processor.run(processor.parse(value));
```

After:

```js after
import { unified } from 'unified';
import { directive } from 'talata/directive';
import { talata } from 'talata/unified';

const processor = unified().use(talata, { gfm: true, extensions: [directive()] });
const tree = await processor.run(processor.parse(value));
```

Notes:

- `directiveFromMarkdown` has no counterpart. The extension builds its own nodes.
- Plugins that turn directives into HTML, for example by setting `data.hName` in a transform, keep working. They only read the tree.
- `directive()` combines with `frontmatter()` and `math()` in the same `extensions` list, and works without `gfm: true`.
- With `remark-stringify`, keep `remark-directive` in the pipeline for its serializer, the same way as [the other extensions](#with-remark-stringify).

## From unified and `remark-parse`

`talata/unified` is a unified plugin that replaces `remark-parse`. It also replaces `remark-gfm`, `remark-frontmatter` and `remark-math` as parsers. Keep the rest of the pipeline as it is.

Before:

```js before
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

const html = String(
  await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(value),
);
```

After:

```js after
import rehypeStringify from 'rehype-stringify';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { talata } from 'talata/unified';

const html = String(
  await unified().use(talata, { gfm: true }).use(remarkRehype).use(rehypeStringify).process(value),
);
```

`talata/unified` has a named export `talata` and a default export. Both are the same plugin.

### With frontmatter and math

Before:

```js before
import rehypeStringify from 'rehype-stringify';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

const html = String(
  await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkFrontmatter, ['yaml', 'toml'])
    .use(remarkMath, { singleDollarTextMath: false })
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(value),
);
```

After:

```js after
import rehypeStringify from 'rehype-stringify';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { frontmatter } from 'talata/frontmatter';
import { math } from 'talata/math';
import { talata } from 'talata/unified';

const html = String(
  await unified()
    .use(talata, {
      gfm: true,
      extensions: [frontmatter(['yaml', 'toml']), math({ singleDollarTextMath: false })],
    })
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(value),
);
```

`remark-frontmatter` and `remark-math` pass their options to the micromark extensions, so the same values go to `frontmatter()` and `math()`.

### With `remark-stringify`

`remark-stringify` writes the tree back to Markdown. For GFM, frontmatter and math nodes it needs the serializer rules that `remark-gfm`, `remark-frontmatter` and `remark-math` add. Keep those plugins in the pipeline. talata parses, and they only add the serializer.

Before:

```js before
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';

const markdown = String(
  await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkFrontmatter)
    .use(remarkMath)
    .use(remarkStringify)
    .process(value),
);
```

After:

```js after
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import { frontmatter } from 'talata/frontmatter';
import { math } from 'talata/math';
import { talata } from 'talata/unified';

const markdown = String(
  await unified()
    .use(talata, { gfm: true, extensions: [frontmatter(), math()] })
    .use(remarkGfm)
    .use(remarkFrontmatter)
    .use(remarkMath)
    .use(remarkStringify)
    .process(value),
);
```

`talata/unified` ignores the parser settings that `remark-gfm`, `remark-frontmatter` and `remark-math` register. If you keep `remark-gfm` but leave out `{ gfm: true }`, nothing parses GFM, and a table becomes a paragraph.

## What does not carry over

- **micromark syntax extensions.** talata does not run micromark. Plugins that add syntax through it do not work, for example `remark-mdx` and `remark-wiki-link`. With the unified plugin, their syntax is parsed as plain Markdown. Plugins that only transform the tree are not affected.
- **`mdastExtensions`.** There is no such option. The `extensions` option takes talata extensions only, and a micromark extension passed there does not work.
- **The `encoding` argument.** `mdast-util-from-markdown` accepts `fromMarkdown(value, encoding, options)`. talata has `fromMarkdown(value, options)`. A string in the second place is ignored without an error, so the options after it are lost.
- **`Buffer` input.** Pass a string. Call `buffer.toString('utf8')` first.
- **Other options.** `fromMarkdown` takes `gfm` and `extensions`, and no others. Other keys in the options object are ignored without an error.
- **GFM settings.** `gfm` is a boolean. The `singleTilde` option of `micromark-extension-gfm` and the `firstLineBlank` option of `mdast-util-gfm` have no counterpart.
- **HTML output.** talata returns mdast and does not render HTML. Use `remark-rehype` in a unified pipeline, or `mdast-util-to-hast` with `hast-util-to-html` on the tree. The README shows both.
- **Third-party extensions.** The extension interface is internal. Only the extensions in the package work.
- **MDX.** Not supported.

### Known differences

talata matches the reference, not the CommonMark spec, where the two disagree. A few inputs still differ from the reference:

- The reference never finishes on `[^n]: x\n\n![ \n^n]` with GFM. talata parses it.
- The reference throws a `RangeError` on a paragraph with more than about 70,000 literal autolinks. talata parses it.
- With `anywhere: true`, a frontmatter matter that interrupts a lazy paragraph in a block quote or list (`> a\n---\nb\n---`) stays outside the quote in talata. The reference puts it inside.

The [README](../packages/talata/README.md#differences-from-the-reference) lists the cases where talata reproduces behavior that the spec does not describe.

## Check your output

The trees are the same by design. A comparison on your own files shows it for your documents. This function compares both parsers on one string:

```js check
import { deepStrictEqual } from 'node:assert';
import { fromMarkdown as reference } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
import { fromMarkdown } from 'talata';

function compare(source) {
  const expected = reference(source, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  const actual = fromMarkdown(source, { gfm: true });
  deepStrictEqual(actual, expected);
}

compare(value);
```

Call `compare` with the content of each of your `.md` files, and pass the same extensions to both sides. `deepStrictEqual` compares positions too. When it throws, the error shows the first difference. Please open an issue with that input.

To check a whole pipeline, compare the HTML or Markdown that it writes with the output of the `remark-parse` pipeline from the "Before" examples.

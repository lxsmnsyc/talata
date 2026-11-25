# talata

## 0.4.0

### Minor Changes

- 2d64f7f: Add the `acorn` and `acornOptions` options of `talata/mdx`. `mdx({ acorn: Parser.extend(acornJsx()) })` returns the same tree as `micromark-extension-mdxjs` with `mdast-util-mdx`, positions included. acorn decides where an expression ends, so `{"}"}` is one expression, and `import` and `export` lines become `mdxjsEsm` nodes. Expressions, attribute expressions and ESM carry acorn's program in `data.estree`, with places in the document. Code that acorn rejects throws an `MdxError` with the reference's reason and place. acorn stays the caller's: talata gets no new dependency.

  With acorn, `@mdx-js/mdx` 3.1.1 can use talata as its parser and compiles the same JS: pass `remarkPlugins: [[talata, { extensions: [mdx({ acorn })] }]]` with `talata` from `talata/unified`. Without acorn there is no ESM and no `data.estree`, and `@mdx-js/mdx` compiles broken JS (`import a from "b"\n\n{a} <A b={c} />`).

- 6562e7b: Add the `talata/mdx` subpath. `mdx()` parses JSX elements in flow and text, expressions in braces, and attribute and spread expressions, and returns the same tree as `micromark-extension-mdx` with `mdast-util-mdx`, positions included. Braces are counted, as the reference does without a JS parser; ESM (`import` and `export`) is not parsed. As in the reference, indented code, autolinks and HTML are off, and bad syntax throws an `MdxError` with the reference's reason and place. Pass it in `extensions`, with the core or the unified plugin. Its code is not in the main entry.

### Patch Changes

- 351fcde: `talata/directive` parses the content of a container directive as a document of its own, after the text around it, as `micromark-extension-directive` does. Two trees change to match the reference:

  - A reference or footnote reference in a text directive label inside another label no longer resolves to a definition that comes later, two container directives deep (`:e[:b[[a]]]\n:::y\n:::x\n[a]: u` gives the text `[a]`).
  - With `frontmatter({ anywhere: true })`, a matter at column 1 in the content of a container directive is a matter node (`:::x\n---\na: b\n---\n:::` gives `yaml`).

- 056b425: Make deeply nested container directives in `talata/directive` parse faster. Each line read every directive around each open directive again, so a chain of 800 nested directives took over 4 seconds; it now takes about 12 ms. The tree does not change.

## 0.3.0

### Minor Changes

- 6931e15: Add the `talata/directive` subpath. `directive()` parses `:name[label]{attributes}`, `::name` and `:::name` directives and returns the same tree as `micromark-extension-directive` and `mdast-util-directive`, positions included. Pass it in `extensions`, with the core or the unified plugin. The main entry does not grow.

### Patch Changes

- c42a8ef: Fix `spread` of a list item in a GFM footnote definition when the item ends with blank lines inside a block quote, such as `[^a]:>7.\n    >\n    >`. It now matches `mdast-util-from-markdown`.

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

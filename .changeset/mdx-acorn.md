---
'talata': minor
---

Add the `acorn` and `acornOptions` options of `talata/mdx`. `mdx({ acorn: Parser.extend(acornJsx()) })` returns the same tree as `micromark-extension-mdxjs` with `mdast-util-mdx`, positions included. acorn decides where an expression ends, so `{"}"}` is one expression, and `import` and `export` lines become `mdxjsEsm` nodes. Expressions, attribute expressions and ESM carry acorn's program in `data.estree`, with places in the document. Code that acorn rejects throws an `MdxError` with the reference's reason and place. acorn stays the caller's: talata gets no new dependency.

With acorn, `@mdx-js/mdx` 3.1.1 can use talata as its parser and compiles the same JS: pass `remarkPlugins: [[talata, { extensions: [mdx({ acorn })] }]]` with `talata` from `talata/unified`. Without acorn there is no ESM and no `data.estree`, and `@mdx-js/mdx` compiles broken JS (`import a from "b"\n\n{a} <A b={c} />`).

---
'talata': minor
---

Add the `acorn` and `acornOptions` options of `talata/mdx`. `mdx({ acorn: Parser.extend(acornJsx()) })` returns the same tree as `micromark-extension-mdxjs` with `mdast-util-mdx`, positions included, without `data.estree`: acorn decides where an expression ends, so `{"}"}` is one expression, and `import` and `export` lines become `mdxjsEsm` nodes. Code that acorn rejects throws an `MdxError` with the reference's reason and place. acorn stays the caller's: talata gets no new dependency.

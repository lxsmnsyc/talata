---
'talata': minor
---

Add the `talata/mdx` subpath. `mdx()` parses JSX elements in flow and text, expressions in braces, and attribute and spread expressions, and returns the same tree as `micromark-extension-mdx` with `mdast-util-mdx`, positions included. Braces are counted, as the reference does without a JS parser; ESM (`import` and `export`) is not parsed. As in the reference, indented code, autolinks and HTML are off, and bad syntax throws an `MdxError` with the reference's reason and place. Pass it in `extensions`, with the core or the unified plugin. The main entry does not grow.

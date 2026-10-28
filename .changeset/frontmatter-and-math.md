---
'talata': minor
---

Add frontmatter and math as subpaths. `fromMarkdown` and the unified plugin take an `extensions` option. Pass `frontmatter()` from `talata/frontmatter` or `math()` from `talata/math` to get the same tree as `mdast-util-from-markdown` with `micromark-extension-frontmatter` and `mdast-util-frontmatter`, or with `micromark-extension-math` and `mdast-util-math`.

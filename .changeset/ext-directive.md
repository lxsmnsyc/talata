---
'talata': minor
---

Add the `talata/directive` subpath. `directive()` parses `:name[label]{attributes}`, `::name` and `:::name` directives and returns the same tree as `micromark-extension-directive` and `mdast-util-directive`, positions included. Pass it in `extensions`, with the core or the unified plugin. The main entry does not grow.

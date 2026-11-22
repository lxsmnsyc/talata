---
'talata': patch
---

`talata/directive` parses the content of a container directive as a document of its own, after the text around it, as `micromark-extension-directive` does. Two trees change to match the reference:

- A reference or footnote reference in a text directive label inside another label no longer resolves to a definition that comes later, two container directives deep (`:e[:b[[a]]]\n:::y\n:::x\n[a]: u` gives the text `[a]`).
- With `frontmatter({ anywhere: true })`, a matter at column 1 in the content of a container directive is a matter node (`:::x\n---\na: b\n---\n:::` gives `yaml`).

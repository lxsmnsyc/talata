---
'talata': patch
---

Fix `spread` of a list item in a GFM footnote definition when the item ends with blank lines inside a block quote, such as `[^a]:>7.\n    >\n    >`. It now matches `mdast-util-from-markdown`.

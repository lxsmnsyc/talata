# Wave report: MDX (m5-mdx code)

Six nodes landed on `batch/v2` and were cut as PR #27: mdx-core, ext-mdx, fix-mdx-reread-container, ext-mdx-acorn, fix-directive-nested-growth, fix-directive-list-indent. About 3.3M tokens in all.

- Contracts: extension v4 (`Extension.disable`, `indentLimit`) and v5 (`readLineAt`, `inlineIndents`) frozen.
- Added during the wave: fix-mdx-reread-container (gap left by ext-mdx), fix-directive-nested-growth and fix-directive-list-indent (found by reviews and fuzz), fix-mdx-directive-growth (should, not tied to 0.4).
- Lesson: for MDX, the 1M `--all` fuzz found far less than targeted generators for one shape each. Every node after ext-mdx needed one.
- Lesson: a literal 4 for the indent limit hid in five places across three nodes. Any new flow or container rule reads `line.indentLimit`.
- Lesson: two nodes rewriting the same re-read code in parallel cost one large rebase. Serialize nodes that own the same function.
- Next: release-0.4 (gate) once PR #27 merges.

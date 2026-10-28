# Log: gfm-tables

- Branch `feat/gfm-tables`. Read micromark-extension-gfm-table 2.1.2 (`dev/lib/syntax.js`, `infer.js`) and mdast-util-gfm-table 2.0.0 before writing the rule.
- Rule in `src/gfm/table.ts`, priority 750: after list items (a container that starts on the delimiter line closes micromark's flow, so the table attempt fails) and before indented code. Triggers `|:-`.
- Cell layout follows `resolveTable`: a leading pipe does not separate; each later pipe starts a cell at the pipe; the last cell is dropped when it has no data and is not the only one, so a trailing pipe and trailing whitespace belong to the cell before. `|` and `| |` give one empty cell. Content runs from the first data run to the end of the last.
- Header counts follow `headRowBreak`: a header that is one pipe is refused; the header's cell count must equal the delimiter's.
- `\|` in code spans: mdast-util-gfm-table unescapes it in `exitCodeText`. Inline parsing runs after all blocks close, so the cell passes a small adapter to `state.inline` whose `children` setter unescapes. Only cells with a backtick and `\|` use it.
- Fuzz seed 101 found three reference behaviors, all fixed and saved as fixtures:
  1. Header indentation was measured wrong when a quote split a tab and the content starts right after it (`>F\n>\t日\n>-|`).
  2. `a\n<n>\n|-` is HTML in the reference. The table check passes while the paragraph is open, then micromark parses the header line again with no paragraph, and kind 7 HTML (which cannot interrupt a paragraph) starts there. The table rule now starts the registered HTML rule on the header line and adds the delimiter line to it.
  3. After a table closed by a lazy line, the paragraph that line opens cannot use it as its header (`>r\n>-|\na||\n-|-`): micromark's flow continues, sees the previous table row and tries a body row, which fails on a lazy line. The table records its end in a `WeakMap` keyed by `Source` when it closes with `state.unmatched` and no container start (`closeKeepsLineEnding` false).
- A header line indented 4 or more columns after its container prefixes never tries an interrupt in micromark (content continuation returns ok first), so it is not a header. Computed from the paragraph's indent triples.
- Scratch table fuzzer (not committed): random lines from table pieces under mixed container prefixes. 170k documents, about 23k with tables, 0 differences after the fixes.
- GFM fuzz failures left are all gfm-inline's literal autolink text splits, plus `- [\n  ```*```` / `- [\r  *o*`, a GFM-only text position after `[` in a list item (no table syntax; the table rule does not run). Also seen in a scratch run: `-\n[x]\n-|-` drops `[x]` from the paragraph in the reference (task-list check after an empty item), for gfm-tasks-footnotes.
- Pathological inputs (manual, not tests): 200k pipes in one row, 20k header candidates, 50k rows, 10k HTML headers all parse in linear time.

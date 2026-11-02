# Log: fix-directive-quote-end

- Verify on main: both inputs fail, with and without GFM.
- Input 900612 (`>:::b\n>+ >\n>\n>  `): `closeEnds` raised the item's `indentEnd` to the last line through `child.openChild`, a quote that had closed on the blank line before. `openChild` stays linked after a block closes. Fix: raise only when `state.getDepth(inner) >= 0`.
- Input 295834 (`>:::9\n>>>:::a{}\n>>>\n`): a directive whose line was already the empty last line of an outer directive's content (`endContent`) ended at the line end. It kept the line end whenever a line ending followed in the text. Fix: an empty last line of content always ends the directive after the line ending before it.
- After the fix the fuzz replay of 900612 shrinks to `>:::b\n>+ >\n>\n>   c` (item `spread`, also on main). The quote in the item ends at the blank line's start, so the two children are one line apart. Fix in `spread.ts`: a child that ends at a line start, followed by another child, makes the item spread.
- Test `test/fix-directive-quote-end.test.ts`: 50 cases x GFM off/on. Without the fixes, 66 of the 100 fail.
- Fuzz 1: seed 20261302, 1,000,000 with `--all` (4 chunks of 250,000 by `--start`, run in parallel): 18 failures. 17 were `spread` regressions from the new `spread.ts` rule (lists, fenced code and HTML that end at a line start). Limited the rule to block quotes.
- The 18th, `[^1]::x[[[`]]\n\t]`(start 360344), also fails on main: a text directive label whose last line is a footnote definition's indent, a whole tab.`parseLabel`skipped the line-start end whenever a tab came before the closing bracket. It now skips it only when the tab is split (an`indents` entry with split-tab columns), as after a quote marker.
- Test file now 66 inputs (132 tests).

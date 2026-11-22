# Log: fix-mdx-directive-growth

## 2026-11-22

### Proof on main (3196f33)

- `test/mdx-growth.test.ts`, time ratio at 4x size, `n` = 1000 then 4000 units, best of 3, machine under load (docs worker fuzz):

  | Shape (`[directive, mdx]`)             | ms at n | ms at 4n | ratio |
  | -------------------------------------- | ------- | -------- | ----- |
  | `{a\n:::x\n}x\n`                       | 571     | 3446     | 6.0   |
  | same, `mdx({ acorn })`                 | 11.6    | 117      | 10.1  |
  | `> {a\n> :::x\n> }x\n`                 | 328     | 5295     | 16.1  |
  | same, acorn                            | 12.1    | 122      | 10.1  |
  | `- a\n` + `  {a\n  :::x\n  }x\n`       | 268     | 3946     | 14.7  |
  | same, acorn                            | 12.2    | 121      | 10.0  |
  | `- {a\n  :::x\n  }x\n` (one item each) | 9.2     | 41       | 4.5   |
  | `[a]:\n{a\n:::x\n}x\n`                 | 320     | 4928     | 15.4  |
  | `{a\n:::x\n}x\n` then `:::\n` n times  | 259     | 4009     | 15.5  |
  | `{a\n:::x\n}x\n`, all four extensions  | 257     | 3993     | 15.6  |

- Built `dist`, `{a\n:::x\n}x\n`: 94 ms at 1000 units, 1290 ms at 4000 (13.7).
- Reference on the same shapes (vitest, 1000 then 4000): 2.5 (root), 3.1 (quote), 3.7 (definition first). With acorn the reference is quadratic: 22.3, 21.6, 24.8.

### Profile on main

- `{a\n:::x\n}x\n` x 4000, `node --cpu-prof` on `dist`: `walkTo` 27 % self, `isClosingFence` 18 %, the directive's `continue` 8 %, `continuesAfter` 8 %, `continuesNext` 8 %, `processLine` 7 %. 78 % inclusive under the directive's `continue`. Each unit's re-read opens one container directive inside the last, so line `k` continues `k/3` directives.
- Acorn shape, x 16000: 93 % in `isEmpty` (`acorn.ts`): two regular expression replaces over the whole expression at each `}`. No `}` ends the expression with acorn, so the code grows to the end of the document.

### Fix

- The reference throws the text error of the first paragraph (`{a` at 1:3) before it tokenizes the directive's content: text at depth `d` is pass `2d + 1`, flow inside a directive at depth `d + 1` is pass `2d + 1` too, and the paragraph comes first in document order (`order.ts`). Nothing in that content can change the result; only where the directive ends can, and that depends on its fence and the containers around.
- `flow.ts`: when a failed construct hands over to a container directive and the paragraph before it certainly fails as text (`failsAsText`: only plain characters before the first `{` or `<`, and the text scanner throws on it), the directive goes in `doomed`. Re-reads inside a doomed directive run with `rereadOptions.directives` off (`reread.ts`): `:::` lines are text there, so the directives no longer nest.
- `acorn.ts` `isEmpty`: returns at the first character that is not whitespace unless it is `/`.
- Plain set: letters, digits, spaces, tabs, `}`, `]`, `[` not after `]`, `:` not before a name. Code spans, math, escapes, labels after `](`/`][`, directives and autolinks could take the `{` or put it in a label.

### Branch growth (alone, n = 2000 then 8000, best of 5)

root 3.8, root acorn 4.8, quote 4.1, quote acorn 4.6, list 3.8, list items 4.0, list acorn 4.9, definition first 4.2, closed later 4.2, all extensions 4.2.

- In the full parallel suite the same test gives 4 to 6 (other files slow the large input more), so the test limit is 8 (12 with acorn).
- Acorn stays quadratic in principle: each `}` hands acorn the whole code, as the reference does; talata now copies it once per `}`. Built `dist`, 4000 to 16000 units: 20 ms to 165 ms (8.1). The reference takes 5.9 s at 4000 units.

### Regression found by the doomed generator, fixed

- `>{\n>:::x\n>}{\n><a b="\n>{">x\n` gives 5:6 on main (the reference 1:3). A directive that runs to the end of a quote ends before the last line ending, so an end-of-file error at the end of its content was counted outside it (`order.ts` `containers`). Main hid it in the generator's case because a second `:::x` nested the construct one level deeper; with directives off in doomed re-reads it showed. Fix: content followed only by whitespace, line endings and quote markers runs to the end of the text.

### Coordinator addition: lazy line place in directives (`prefixes.ts`)

- `>:::b[[[]]]\n>>{\n>\n` with `--all --acorn` (seed 20261401, document 125133): reference 3:1, talata 3:2.
- Grids against the reference (outer quote, directive indent, whitespace, next line) gave the rule: in a directive's content, a line with nothing left after the directive's indent is lazy from its start when the next line is missing, or lazy for the containers above the directive and starts no new container (micromark ends the content before it: `nonLazyLine` check). With a next line that continues them, the place is after the prefixes.
- Tabs: a quote takes one column of a tab; the indent takes the other columns before spaces (`take`, `virtual`). On main the column count started again from the line start, which counted whole tabs.
- List items in a directive at the end of the text: a list that takes the rest of the line with no columns left makes the place the line start; with columns of a tab left, the list takes the tab.
- `afterSpace` (from fix-mdx-reread-container) now only covers a quote inside the directive at the end of the text; the outside case is part of the rule above.
- Probe sets: 112,000 configurations (quotes, lists, nested directives outside; labels, indents; quotes and tabs inside; tails), main 7440 differ from the reference, branch 0. A second grid of 2450 (next-line variants) and 960 (lists inside directives at the end of the text): branch 0, main 330 in the second.
- New generator `test/mdx-lazy-place.test.ts`, quotes outside. With list items and footnote definitions outside (not committed), 50,000 documents: main 3736 differ, branch 178 (all also on main). Those are another class (list or footnote lazy lines outside the directive), left for a node.

### Other base bugs seen (on main too, not fixed)

- `>:c[{{\n>}` with acorn: reference 2:2, talata 2:1 (acorn place in a text directive label across quote lines).
- `:{\n>:::x\n>{\n><}x\n:`: reference "Unexpected end of file in expression ... 1:3", talata "Unexpected character `}` ... 4:3" (error order).
- 10 of 100,000 documents of the doomed generator differ on main and on the branch (seed 20261122, indices 21847, 27437, 30675, 31810, 48942, 64809, 78637, 80347, 82802, 98486), the two above among them after shrinking.

### Review: doomed shortcut removed

- The review found two regressions against main, where a lazy line after the last `}x` makes the content matter: `>{\n>:::x\n>}x\n>{\n>:::x\n><d\n>}x\ny\n` and `- {\n  :::x\n  }x\n  {\n  :::x\n  <d\n  }x\n:\n`. Heads outside the plain set also stayed quadratic.
- `flow.ts` and `reread.ts` are back to main, and `test/mdx-growth.test.ts` is removed. The two inputs are in `test/mdx-lazy-place.test.ts` and match the reference.
- Kept: `prefixEnd`, `order.ts` `blankEnd`, the `isEmpty` early exit, `toSorted`. The growth evidence is in the outcome, for the spike.

# Log: blocks-container

## 2026-10-28

- Branch renamed to `feat/blocks-container`. No earlier work on this node (no log, no rule files). `pnpm install --offline` was needed in the fresh worktree.
- Read micromark's `list.js`, `block-quote.js`, `initialize/document.js`, `micromark-util-subtokenize` and `mdast-util-from-markdown`'s `prepareList` to get the position and `spread` rules. Findings:
  - A container exit (list, block quote) walks back over line endings, `linePrefix` and `listItemIndent`, and stops at anything else, block quote prefixes included. The end is the start of the first line ending in that run. So a list inside a quote that continues over a blank `>` line ends after that `>`.
  - List items (`prepareList`) also skip block quote prefixes, so items end at their last content.
  - When a new container closes containers on a line where a quote prefix was matched, the exit sits at the current position, after the matched prefixes (`> - a\n> > b`: list ends at 2:3). Lazy and new-sibling closes put the exit after the previous line.
  - `list.spread` is true only when two line endings separate an item from the next item or from the list exit. `listItem.spread` is true when a blank line sits between two direct children. Both reduce to "next start line minus previous end line is 2 or more".
  - micromark's `interrupt` flag is only set when every container matched the line. A lazy paragraph does not restrict list starts (`> a\n2. b` is a list starting at 2). Indented code also sets it (`    a\n2. b` is a paragraph); see the change request.
- Wrote `blockquote.ts`, `list.ts`, `list-item.ts` and registered them. First spec run: 28 failures in the three sections, all needing indented code, fenced code, setext, HTML or definitions. They are in the `waiting` map of `test/blocks-container.test.ts`.
- Scratch fuzz: the first 18k documents gave 383 failures. Cause: micromark keeps `interrupt` for every container that starts on the line (`a\n- - `). Fixed with `interruptLine`. Next failure: the nested-quote end-of-file rule fired after list indentation alone (`- - > \n `). It now needs a quote prefix at or above (`parentQuoteLine`). After that: 178k plus 64k documents with no differences.
- Wrote the change request for the indented-code interrupt case. Left `core-sections.test.ts` alone (57, 60, 61 pass; editing would conflict with blocks-leaf).

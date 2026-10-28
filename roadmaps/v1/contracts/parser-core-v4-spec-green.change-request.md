# Change request: parser-core v3 to v4

- From node: spec-green
- Status: accepted

## Problem

Five reference behaviors need information the v3 interfaces do not carry. Each was found by the differential fuzzer and checked against mdast-util-from-markdown 2.1.0.

1. Indented code that starts on a line where an open container did not match, with no new container on that line, is one line long. micromark's `furtherStart` checks `parser.lazy[now().line]` at that line's own line ending. `>\n    a\n    b` gives two code blocks; `-\n\n    -\n    ` gives code `-` ending at 3:6. A block rule cannot tell that an open container did not match: `container` is the innermost matched one, and `lazy` is only set when a paragraph is open.
2. Kind 7 HTML that interrupts a lazy paragraph stays inside the containers, and they continue on later lines: `> a\n<x>\n> c` gives a quote holding html `<x>\nc`, and `- a\n<x>\n  c\nd` gives an item holding html `<x>\nc`. In interrupt mode kind 7 has no early `ok`, so its check reads into the next line, and the paragraph's content token is still open when the document tokenizer looks for a token that spans the lazy line's start. The containers are then not exited. At the end of the text without a line ending the check finishes and the html lands outside (`> a\n<x>`). The core always closes the unmatched containers before a new block.
3. NUL: micromark keeps a NUL as its own chunk. An emphasis opener run that ends right before a NUL and loses markers from its end keeps the whole run as its text value (`**\0*` gives text `"**"` at 1:1-1:2, then emphasis). `Source.text` has NUL replaced, so rules cannot tell a NUL from a literal U+FFFD (`**�*` gives text `"*"`).
4. The end-of-file quote rule in the Positions section keeps nested quotes matched over an empty last line (`> > ```\n> > a\n>`). micromark treats that line as lazy for the inner quote, so a fenced code or HTML block inside ends at 2:6, before the line. A leaf cannot tell that its quote matched only through that rule.
5. Block-quote and list-item ends after a child that kept its line ending (fenced code, HTML 1 to 5). This one needs no contract change. It is in `TrackedContainer` (`src/blocks/blockquote.ts`), which v3 already asks new containers to implement.

## Proposed change

```ts
// core/blocks.ts
interface BlockState {
  // True when an open container did not match the line and no container
  // started on it (micromark's lazy line, with or without a paragraph).
  unmatched: boolean;
  // Index of the last line a block quote matched only through the
  // end-of-file rule, or -1. Set by the quote in `continue`.
  endOnlyLine: number;
}
interface OpenBlock {
  // Leaves: when true and the block interrupts a lazy paragraph on a line
  // that has a line ending, the unmatched containers stay open and the block
  // goes in the paragraph's container. Kind 7 HTML sets it.
  keepsLazyContainers?: boolean;
}

// core/source.ts
interface Source {
  // The text before NUL was replaced, when it had a NUL; else undefined.
  withNul: string | undefined;
}

// blocks/blockquote.ts (not in the contract; for container authors)
interface TrackedContainer {
  // Called when a new container starts on a line and closes this block:
  // `position` is where that container starts, after the matched prefixes.
  closedAt?(position: number, lineStart: number): void;
}
```

Behavior:

- `unmatched` is set with `paragraph`, `lazy` and `tip`, and reset when a container starts on the line. Indented code started while it is true never continues. Such code also does not count as the `tip` for list restrictions (micromark has already ended it): its open block is named `codeIndentedLine`.
- A quote that matches a line only through the end-of-file rule sets `endOnlyLine` to it. Fenced code and HTML 1 to 5 return false from `continue` on an empty last line when it is set (`matchedOnlyAtEnd()` in `src/blocks/blockquote.ts`), so they end before the line without its line ending.
- When a leaf with `keepsLazyContainers` starts while `lazy` is true and the line has a line ending, the core closes only the paragraph before it attaches the block.
- Containers whose last child ends at the start of the closing line end at the closing event: list items at the next sibling's marker and whitespace, or at the end of the text when they continued on a last line with no line ending (`- ```\n ` ends at 2:2). Items and quotes end where a new container starts (`closedAt`) (`* ><pre\n  -` ends the quote at 2:3). GFM footnote definitions should do the same.

## Affected nodes

- gfm-tasks-footnotes: a footnote definition container should implement `closedAt` and the same end rule, like list items.
- gfm-tables: a table body row on a lazy line may need the same check as `unmatched` (not tested).
- Anyone who builds a `Source` by hand: `createSource` fills `withNul`.
- ext-math and ext-directive: a math block (`$$`) or directive container is a multi-line block that can keep its line ending like fenced code. It should check `matchedOnlyAtEnd()` (`endOnlyLine`) on an empty last line. A container directive should implement `closedAt` and the item end rule, as footnote definitions should.

## Workaround in place

spec-green implements all of this in `src/core/blocks.ts`, `src/core/source.ts`, `src/blocks/code-indented.ts`, `src/blocks/html.ts`, `src/blocks/blockquote.ts`, `src/blocks/list-item.ts` and `src/inline/emphasis.ts`. Tests: `test/spec-green.test.ts`.

v3 items done in the same branch: `BlockState.tip` and `inline(node, ranges, indents?)` with `InlineState.indents`. The `lineIndents` WeakMap is gone.

## Decision

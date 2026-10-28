# Change request: parser-core v2 to v3

- From node: inline-core
- Status: open

## Problem

Inline ranges start at the first non-blank character of each line (`OpenParagraph.lines` pairs start at `line.nonBlank`). That is right for text nodes, but micromark keeps a line's leading whitespace after the container prefixes in three places. The reference output (mdast-util-from-markdown 2.1.0):

- Code spans keep it: `` `a\n   b` `` gives `inlineCode` value `"a\n   b"`. `` - x `a\n         b` `` gives `"a\n       b"` (9 spaces minus the item's 2-column indent). `` >\t`a\n>\t\tb` `` gives `"a\n  \tb"`: the split tab's 2 leftover columns become spaces.
- Raw HTML keeps all but the first 3 columns: `x <a\n      b>` gives `"<a\n   b>"`; `x <a\n\t\tb>` gives `"<a\n \tb>"`.
- A reference's `label` keeps it: `[a\n   b]` gives label `"a\n   b"`; `> [a\n>   b]` gives `"a\n  b"`.

The inline parser cannot compute this from the ranges. It knows where the content starts but not where the container prefixes end, or how many columns of a split tab are left. A list item's indent and a top-level line's indent are both plain whitespace before the range.

## Proposed change

Give the inline parser each line's start after container prefixes:

```ts
// core/blocks.ts
interface OpenParagraph extends OpenBlock {
  lines: number[]; // unchanged: flat [start, end) pairs, content start to line end
  prefixes: number[]; // new: per line, flat [offset, partialTab] pairs: line.start and line.partialTab after container prefixes
  start: number;
}
interface BlockState {
  inline(node: { children: PhrasingContent[] }, ranges: number[], prefixes?: number[]): void;
}

// core/inline.ts
interface InlineState {
  prefixes: number[] | undefined; // as passed to inline(); undefined for single-line leaves
}
```

Paragraph prefix rules that remove lines from `lines` also remove the matching pairs from `prefixes`. Setext headings pass the paragraph's arrays on.

## Affected nodes

core-skeleton's paragraph (now blocks-leaf for definitions and setext), blocks-container (sets `line.start` and `partialTab`), gfm-tables (cells stay single-line, can pass undefined), inline-core.

## Workaround in place

Round 2 (inline-core review): exact for paragraphs without a contract change. `src/blocks/paragraph.ts` already recorded `line.start` and `partialTab` for indented continuation lines (blocks-leaf, for definitions, only in paragraphs starting with `[`). It now records them for every multi-line paragraph and registers them in `lineIndents`, a `WeakMap` exported from `src/inline/lines.ts` and keyed by the paragraph's `lines` array, which is the ranges array the inline parser gets. Setext headings pass that same array.

For other multi-line leaves `lines.ts` still guesses: all whitespace when only whitespace precedes the range on its line, or what follows a `>` and its optional space or split tab. No other multi-line leaf exists yet.

The same data fixes a second case. A line ending ends after the next line's container prefixes when a lookahead (code span, raw HTML, link resource or label) already reached that line, as micromark feeds lines one at a time.

The interface change above would replace the side table with an explicit field. The orchestrator can accept it or close this request as handled by the side table.

## Decision

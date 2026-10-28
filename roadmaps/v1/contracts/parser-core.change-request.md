# Change request: parser-core v2 to v3

- From node: blocks-container
- Status: open

The accepted v1 to v2 request from core-skeleton is in git history (last at commit a56d61d).

## Problem

A list item rule cannot tell that an indented code block is open, so it cannot apply the paragraph-interrupt restrictions after one.

micromark sets its `interrupt` flag when every container matched the line and the flow is inside any construct that is not finished. That covers an open paragraph and also open indented code. The reference parser shows it:

- `    a\n2. b` gives `code` then a paragraph `2. b`, not a list.
- `    a\n-\n` gives only the `code`; the empty item is refused.

`BlockState` exposes `paragraph` and `lazy`, which cover the paragraph case. While the line closes indented code, the code block is not matched (its `continue` returned false) and nothing in `BlockState` says it was the open tip. Lazy lines are not affected: micromark does not set `interrupt` unless every container matched (`> a\n2. b` is a list starting at 2, which talata already matches).

## Proposed change

Add one field to `BlockState`:

```ts
interface BlockState extends DocumentState {
  // ...
  // The open leaf at the tip when every container matched the line, whether
  // or not the leaf continued; undefined otherwise. Rules use it to apply
  // paragraph-interrupt restrictions after leaves that micromark treats as
  // still open (indented code).
  tip: OpenBlock | undefined;
}
```

`BlockParser.processLine` sets it next to `paragraph` and `lazy`. The indented code block (blocks-leaf) needs a name that is distinct from fenced code, for example `codeIndented`, so the item rule can test `state.tip?.name === 'codeIndented'`. A boolean `OpenBlock.interruptsLikeParagraph` on the leaf would work too and avoids the name test.

## Affected nodes

- blocks-container: `src/blocks/list-item.ts` reads it.
- blocks-leaf: names its indented code block, or sets the flag.
- core: `src/core/blocks.ts` sets the field.

## Workaround in place

None. The list item rule applies the restrictions only after an open, matched paragraph (`state.paragraph !== undefined && !state.lazy`). After indented code, `2. b` and an empty `-` start a list where the reference does not. No spec example in Block quotes, List items or Lists depends on it.

## Decision


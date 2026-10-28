# Change request: parser-core v2 to v3

- From node: blocks-leaf
- Status: open

## Problem

Fenced code and HTML blocks of kinds 1 to 5 sometimes keep the line ending after their last line, and a leaf cannot tell when. micromark keeps it when the next line is not lazy. In the core's terms, that is when one of these holds:

- a container starts on the next line (`- ```\n  a\n- b`: code ends at 3:1, after the line ending; `> ```\n> a\n- b` the same);
- the document ends after a line ending and every open container continues on the empty line after it (` ```\na\n` and `- ```\n  a\n` end at 3:1; `> ```\n> a\n` ends at 2:4).

When a leaf starts (`> ```\n> a\n# b`), the line is lazy (`> ```\n> a\nb`), or the line is blank (`> ```\n> a\n\nb`), the block ends before the line ending. `close(state, children)` runs inside `attach` or `closeTo`, and `BlockState` does not say which one, so the leaf cannot decide. HTML kinds 6 and 7 and indented code never keep it.

## Proposed change

Add one field to `BlockState`:

```ts
// True while open blocks close because a container starts on the current
// line, or because the document ends after a line ending that every open
// container continues over.
closeKeepsLineEnding: boolean;
```

Behavior: `attach(block)` sets it to `block.isContainer` while it closes blocks and resets it after. At the end of `run()`, when the text ends with a line ending and the tip is a leaf other than a paragraph, the core calls `continue` on each open container with the empty last line (`start === end === text.length`). The flag is true when all of them return true. Containers must accept that virtual line in `continue`. The test quote returns false for it, because `line.start > lineStarts[line.index]` fails.

## Affected nodes

- blocks-container: list items and footnote definitions must return true from `continue` on that empty last line, as they do for blank lines, and must not change their end position for it. Block quotes return false.
- gfm-tasks-footnotes: the same for footnote definitions.
- spec-green, differential-fuzz: they will see these positions.

## Workaround in place

blocks-leaf implements the field and the behavior above in `packages/talata/src/core/blocks.ts` (a shared path in its brief), as an addition to `BlockState` and `BlockParser`. `blocks/code-fenced.ts` and `blocks/html.ts` read it in `close`.

Known gap, not covered by the flag: `> > ```\n> > a\n>`. The inner quote stays matched through the end-of-file special case in the contract's Positions section. The reference treats that line as lazy and ends the code at 2:6, but talata ends it at 3:1. A fix needs the container to say it matched only through that special case, for example by leaving a flag on the state. blocks-container owns the quote rule, so it can decide.

## Decision

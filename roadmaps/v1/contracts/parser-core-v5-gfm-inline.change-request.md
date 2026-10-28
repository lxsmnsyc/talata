# Change request: parser-core v4 to v5

- From node: gfm-inline
- Status: proposed

## Problem

1. The Positions section says "Nodes created by transforms (GFM autolink literals) have no `position`", and the gfm-inline brief says the reference finds literal autolinks only in a tree transform. That is half of it. micromark-extension-gfm-autolink-literal 2.1.0 also tokenizes `www.`, `http(s)://` and email literals in the text tokenizer, and mdast-util-gfm-autolink-literal turns those tokens into links with positions (`a www.b.c` gives a link at 1:3-1:10). The `findAndReplace` transform then runs on the text that is left, and only its nodes lack positions: links inside an open `[` (`[www.a.b`), after a character the tokenizer refuses but the transform allows (`"www.a.b"`, `a-www.b.c`), or after an escape (`\_a@b.c`). Every text node it splits loses its position too.
2. `resolveSpan` runs resolvers in priority order. micromark's top-level order is the order in which the first strikethrough or attention sequence of the leaf was tokenized (`resolveAllConstructs` in create-tokenizer.js): `~~a *b~~ c*` gives a delete, `*a ~~b* c~~` emphasis. Inside a link and inside every pair, strikethrough always resolves first, because the gfm extension's `insideSpan` constructs are spliced before the default `attention`: `[*a ~~b* c~~](u)` gives a delete.

## Proposed change

Wording only, no interface change:

- Positions: "GFM literal autolinks found by the inline rule have positions. Nodes created by transforms (the autolink literals the inline rule misses, and the text nodes they split) have no `position`, matching `mdast-util-find-and-replace`."
- Inline: "Resolvers run in priority order. A rule whose order relative to another depends on the input (strikethrough and emphasis) decides it in its own resolve, which may run the later resolvers itself."

## Affected nodes

- perf-pass: the transform walks every text node of a GFM document. It skips nodes without a `.`, so it is cheap on prose, but moving it into the inline pass is not possible as a whole: the transform's matches are exactly the cases the inline rule rejects.
- gfm-tasks-footnotes: the autolink rule treats any delimiter with marker 91 (`[`) or 33 (`![`) on the stack as an open bracket (micromark's `previousUnbalanced`). Footnote calls that push bracket delimiters should keep that meaning.

## Workaround in place

`src/gfm/autolink-literal.ts` (inline rule with positions) and `src/gfm/autolink-literal-transform.ts` (transform without). `src/gfm/strikethrough.ts` records the first sequence per leaf (`attentionOrder`, a rule on `*_` that always returns false) and, at the top-level resolve, runs the emphasis resolver before its own when `*`/`_` came first.

## Decision

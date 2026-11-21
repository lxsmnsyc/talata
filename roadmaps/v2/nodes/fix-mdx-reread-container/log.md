# Log: fix-mdx-reread-container

## Proof on batch/v2

- Commit: 0940869 (batch/v2).
- Test: `packages/talata/test/mdx-reread.test.ts`, input `[a]:\n{a\n:::x\n}x\n`, `[directive, mdx]` against the reference, gfm false and true.
- Command: `cd packages/talata && NODE_ENV=production npx vitest run test/mdx-reread.test.ts`
- Result: 2 of 2 fail. The reference gives a definition, then a `containerDirective` `x` (3:1-5:1) holding a paragraph `}x`. Talata gives the definition only.

## Second class (scope addition from the coordinator)

- Input `<a b="\n{a">x\n>}x`, plain `mdx()`, gfm off and on, against the reference, on batch/v2 (a copy of `packages/talata/src` and `test` from 0940869).
- Result: differs. Talata reports `... before the end of paragraph at 1:1-2:6`, the reference `... at 1:1-3:4`. The re-read probe of `{a">x` reads line 3, but the block parser ended the paragraph at line 2 and started a quote on `>}x`.
- The probe also read source lines with quote prefixes only. In lists it gave the wrong error: `- <a b="\n  {a">x\n}x`, where the reference has a lazy line error at 3:1. That is wrong on batch/v2 as well.

## Notes

- The generator found, on batch/v2 too:
  - fenced code whitespace;
  - setext start;
  - list item spread;
  - nodes lost or misordered before definitions;
  - tables after definitions;
  - `=` as a table row;
  - a flow error at the end of the text not counted inside a directive that runs to it (`a <\n\n:::y\n>{\n>`).
- Two growth tests were quadratic on batch/v2: `throwWaiting` (errors × directives) and `splice` of marker children in `build.ts`.
- `nodesBefore` hid nodes from the block parser and from the directive transform. That made `spread` wrong. It is replaced by closing the block and opening a new paragraph block (`goOnAsParagraph`).

## Review of 0594622

- Regression (passes on batch/v2, failed on the branch): a table delimiter row after a line read again. `handOver` replayed the header row through `readLineAt`, and `mdxFlow` started on it. Fixed with `textAt`.
- `<a b="\n{">x\n-\n-|\n}x`: a setext underline after text was taken as a table header. Now no table follows a span, except an underline with no paragraph text before it.
- Three batch/v2 bugs, now fixed:
  - `- {\n   }x\n  -`: `paragraphIndents` gave nothing for an `OpenMdxFlow`;
  - `>:::z\n>>{\n> `: the lazy point after a quote marker and its space in a directive;
  - `{\n{\n}\n-|\n}x`: a two-line span's last line was taken as a table header.
- Not touched: the cubic time of deep unclosed directive chains (its own node).

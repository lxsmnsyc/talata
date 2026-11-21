# Log: fix-directive-list-indent

## 2026-11-22: proof on batch/v2 (fd1dbbc)

- The input differs only with `mdx` in the extensions (gfm off and on). With `[directive]` and `[frontmatter, math, directive]` it matches. The reference ends the inner directive at 3:1 (with its line ending); talata ends it at 2:10.
- With `mdx`, `codeIndented` is off and `line.indentLimit` is Infinity, so `    >` (4 spaces) starts a block quote at the root. `continuesAfter` of the outer directive asks whether a container starts on the next line with `next.indent < 4`, a literal limit, so it answered no. The outer directive then took the next line as lazy and called `endContent` on line 2. The inner directive, opened on that line, ended without its line ending.
- Test: `packages/talata/test/directive-list-indent.test.ts`. It runs 1665 inputs: the brief's input, plus six list markers and widths, every indent under the item's, eight last lines (`>`, `> b`, `- b`, `1. b`, `[^a]: b`, `b`, empty, `:::`), one to three nested directives, with and without a final line ending, in a block quote, and with text in the inner directive. It covers `[directive]`, `[directive, mdx]` and `[frontmatter, math, directive, mdx]`, gfm off and on.
- `cd packages/talata && npx vitest run test/directive-list-indent.test.ts` on batch/v2: the 4 runs with `mdx` fail, with 121 inputs (gfm off) and 151 (gfm on) different from the reference. The 2 runs without `mdx` pass.

## 2026-11-22: fix

- `src/ext/directive/container.ts`, `walkTo`: `next.indent < next.indentLimit` in place of `next.indent < 4` for "a container starts on the next line". The other literal 4 in the file, the continuation indent of a footnote definition, is not a limit and stays (contract v4).
- The same test passes: 6 of 6.

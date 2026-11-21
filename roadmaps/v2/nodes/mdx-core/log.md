# Log: mdx-core

- Turning off `codeIndented` is more than removing the rule. The first test run failed only for lists with it: micromark limits flow construct indent to 3 columns only while `codeIndented` is on. Added `Line.indentLimit` (4 or Infinity) and replaced the literal 4 in core block rules and GFM table and footnote start.
- Name filtering is in `createRegistry`; `index.ts` only collects the lists.
- Paragraph continuation and lazy checks needed no change: they do not read the indent.
- `ext/math/flow.ts` and `ext/directive/*` keep the literal 4 (outside the brief's paths).
- Tests: 8 disable lists x gfm on/off x about 130 inputs equal the reference. Fuzz 100,000 documents with --all: 0 failures.

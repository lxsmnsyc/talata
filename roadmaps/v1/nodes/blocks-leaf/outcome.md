# Outcome: blocks-leaf

## Built

All paths are under `packages/talata/src/`. Each rule is the default export of its file and is registered in `blocks/index.ts`.

- `blocks/heading-setext.ts`: `headingSetext`, priority 500, triggers `=-`. Checks the underline first, then calls `takeParagraph()`. The heading starts at `paragraph.start` and ends at the line end. Lazy lines and indents of 4 or more are refused.
- `blocks/code-indented.ts`: `codeIndented` (open block name `codeIndented`), priority 800, no triggers, cannot interrupt a paragraph. The block starts at `line.start`. It drops trailing blank lines unless they have 4 or more columns. A value that ends in a line ending loses one, as the reference does. It also exports `lineContent(line, columns)` (consume indentation, split-tab columns become spaces) and `isEmptyLastLine(line)`.
- `blocks/code-fenced.ts`: `codeFenced` (name `codeFenced`), priority 300, triggers `` `~ ``. Lang and meta are decoded. Meta keeps its trailing whitespace. Content lines lose up to the fence's indentation. An unclosed fence that ends without keeping its line ending drops the line ending before an empty last content line (`> ```\n> a\n>\nb` gives "a"). The closing fence needs at least as many markers and an indent under 4.
- `blocks/html.ts`: `html`, priority 400, trigger `<`, all seven kinds. The start and end scans follow micromark's html-flow states (complete-tag attribute grammar, CDATA `]]]>` quirk, any raw end tag closes any raw block). Kind 7 refuses only a matched (non-lazy) paragraph.
- `blocks/definition.ts`: `definition`, a `ParagraphPrefixRule` (priority 100). It scans label, destination and title over the paragraph's flat line pairs, with backtracking when a title fails. It fills `state.definitions` with `normalizeIdentifier(rawLabel)` (uppercase form), and gives the mdast `identifier` in lowercase. With GFM, `[^` is refused. One scanner per paragraph keeps a forward-only cursor into the paragraph's indents, so multi-line labels stay linear.
- `blocks/decode.ts`: `decodeString(value)` (default export), shared by fenced code and definitions: backslash escapes and numeric character references (micromark's U+FFFD rules).
- `blocks/paragraph.ts`: paragraphs record the whitespace after container prefixes on continuation lines (`indents`, sparse, only when the paragraph starts with `[`). `paragraphIndents(paragraph)` exposes it, so multi-line definition labels keep it as the reference does (`[Foo\n  bar]`).
- `core/blocks.ts`: `BlockState.closeKeepsLineEnding` (see Deviations). `takeParagraph`: when definitions take every line it returns undefined but leaves `state.paragraph` set (empty) for the rest of the line, so later rules still treat the line as interrupting a paragraph (`[a]: /u\n-` gives a paragraph "-", not an empty list item). Calling it again on that empty paragraph returns undefined and changes nothing.
- Tests: `test/blocks-leaf.test.ts` has:
  - the five spec sections, with a waiting map naming the node each skipped example needs;
  - a block-structure check of every spec example, with inline content stripped;
  - about 230 hand-written cases;
  - decoder unit tests;
  - cross cases with copies of the test-only quote and `+` list from `test/core.test.ts`, and with the real list rule;
  - a step-count test that the label indent lookup is linear (`indentSteps` in `blocks/definition.ts`).

## Deviations

- Contract: added `closeKeepsLineEnding: boolean` to `BlockState`, implemented in `core/blocks.ts` (`attach` sets it for container starts; `run()` sets it at a final line ending when every open container continues over the empty last line, through a new `continuesOverEnd`). Change request: `roadmaps/v1/contracts/parser-core-v3-blocks-leaf.change-request.md`. Without it, fenced code and HTML 1 to 5 get wrong end positions and values (`- ```\n  a\n- b`, ` ```\na\n`).
- `test/core-sections.test.ts`: removed 48, 59, 69 and 225 from its waiting list, as the core-skeleton outcome asks. They pass now.
- New test file `test/blocks-leaf.test.ts`, outside the owned paths.
- `blocks/index.ts`: one rule per line; main (blocks-container) is merged in, with both rule sets kept.
- `.gitignore`: added `packages/talata/.vitest/` (vitest cache).
- `core/blocks.ts` `takeParagraph`: behavior change described under Built. The contract says undefined is returned when definitions took every line; it does not say what `state.paragraph` is afterwards. The reference needs it to still count as a paragraph for interrupt checks.
- `blocks/decode.ts` is a new file outside the owned paths (review nit: shared by two rules).
- `test/blocks-container.test.ts`: emptied its waiting map (every blocks-leaf example passes). `test/core-sections.test.ts`: removed 57, 60 and 61 too.

## Stubs left

- Named character references (`&ouml;`) in info strings, definition labels, URLs and titles stay raw. `decodeString` in `blocks/decode.ts` should look names up in inline-core's `src/inline/entities.ts` once it merges. This affects spec examples 33 and 34 and an `it.fails` test in `blocks-leaf.test.ts`. Flip that test to `it` when it is wired.
- 35 spec examples in my sections wait for inline-core (emphasis, escapes, code spans, raw HTML, reference links). They are listed in the `waiting` map in `test/blocks-leaf.test.ts`. Their block structure already matches.

## Gotchas

- Cross cases with the real lists: `- ```\n  a\n` and `- [a]: /u\n\n  b` match. `- ```\n  a\n- b` (and `- ```\n- b`, `- <!--\n  a\n- b`) match for the leaf, but the reference ends the first listItem at 3:3, after the next marker, and talata at 3:1. That is the list item end rule, for spec-green.
- Not mine, sent to spec-green by review: kind 7 HTML on a lazy line (`> a\n<x>\n`) lands outside the container.
- Known gap: `> > ```\n> > a\n>`. The inner quote stays matched through the end-of-file special case, so the code ends at 3:1 where the reference ends it at 2:6 (the line is lazy for micromark). Fixing it needs the quote to report that it matched only through that special case. This is noted in the change request.
- An empty last line after container prefixes (`> ```\n> a\n>`) ends fenced code and HTML 1 to 5 right after the previous line ending, with no content line (`isEmptyLastLine`).
- The reference keeps the leading whitespace of continuation lines in definition labels, but not in titles or paragraph text.
- Open block names: `codeIndented`, `codeFenced`, `html`, `heading` (setext). As the orchestrator asked, a later list rule can test for `codeIndented`.

## Proposed learnings

- Read micromark's tokenizer for a construct before writing its rule. The spec misses quirks the reference has: CDATA `]]]>`, `<?>`, paren titles with `(`, kind 7 interrupting lazy paragraphs | each of these came out of the micromark source, not the spec | packages/talata/src/blocks | yes (hand-written cases against the reference)
- Whether a leaf keeps its trailing line ending depends on whether the next line is lazy. Test leaf ends with a new container, a lazy line, a blank line and EOF | most position differences found here were at block ends | packages/talata/src/blocks | yes

## Verification

- `pnpm --filter talata test` (review round 2, run twice): 1329 passed, 1 expected fail, 1988 skipped both times.
- `npx tsc --noEmit -p packages/talata`: clean.
- `npx oxlint`: clean. `npx oxfmt --check packages/talata/src packages/talata/test`: clean.
- Scratch fuzz (not committed): about 200k random documents from leaf-block fragments, compared with the reference with paragraph and heading children stripped and container documents skipped: no differences.

## Size

- Estimated L, actual L.

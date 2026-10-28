# Outcome: inline-core

## Built

All paths are under `packages/talata/src/inline/`. Each rule is a default export registered in `index.ts`.

- `escape.ts` (priority 100, `\`): backslash escapes and backslash hard breaks. The break is pushed over `\` and the core extends it over the line ending. A `\` at the end of the last range is literal.
- `character-reference.ts` (100, `&`): named (up to 31 alphanumerics, must be in the table), decimal (up to 7 digits) and hex (up to 6) references. Invalid code points decode to U+FFFD, as micromark-util-decode-numeric-character-reference does.
- `code-span.ts` (100, `` ` ``): finds the closing run across ranges. Line endings stay raw. Strips one space or line ending from each side when both have one and the content is not all padding. An unclosed opening run becomes text in one piece.
- `emphasis.ts` (100, `*_`, with `resolve`): micromark's attention algorithm. Flanking uses UTF-16 code units, range edges count as whitespace, `_` has the intraword rule, and the rule of three uses current run sizes. Before wrapping a pair it calls `resolveSpan(state, open + 1)` on the delimiters in between, as micromark resolves `insideSpan`. With GFM, a `~` next to the run counts like a letter.
- `link.ts` (500, `[`, `]`, `!`): `[` and `![` push bracket delimiters (markers 91 and 33). `]` takes the nearest bracket. An inactive or failed bracket is removed and `]` stays text. Handles inline resources (32-deep paren balance, `<...>` destinations, `"`/`'`/`(` titles across lines) and full, collapsed and shortcut references against `state.definitions`. Follows micromark's fallbacks: a failed resource falls back to a shortcut when the label is defined; `[a][x]` with `x` undefined is not a link even when `a` is defined. A link deactivates earlier `[` brackets. Image `alt` matches mdast-util-to-string. Reference `label` is decoded and `identifier` is normalized from the raw text.
- `autolink.ts` (100, `<`): URL autolinks (schemes of 2 to 32 characters) and email autolinks (labels of up to 63 characters), on one line.
- `html.ts` (200, `<`): raw HTML as micromark's html-text state machine: tags, comments (`<!-->` and `<!--->` included), instructions, declarations and CDATA, across lines.
- Helpers: `classify.ts` (character classes), `decode.ts` (`parseCharacterReference`, `decodeString`), `lines.ts` (a cursor across ranges, `linePrefix`, `rangeText`), `entities.ts` (generated table, default export `decodeNamed`).
- `test/inline.test.ts`: the CommonMark inline sections (Backslash escapes, Entity references, Inlines, Code spans, Emphasis, Links, Images, Autolinks, Raw HTML, Hard and Soft line breaks, Textual content) compared to the reference with positions; 79 edge cases; 4 GFM flanking cases; 23 reference cases. A test-only paragraph prefix rule (`testDefinition`) turns single-line definitions into nodes by parsing each line with the reference, and fills `definitions`.

## Deviations

- New files outside the owned paths: `packages/talata/test/inline.test.ts` and `packages/talata/scripts/generate-entities.mjs` (rebuilds `entities.ts` from https://html.spec.whatwg.org/entities.json or a local copy). Both are new, so they should not conflict.
- `test/core-sections.test.ts` is not edited, so it does not conflict with blocks-leaf and blocks-container, which edit the same map. Examples 56, 65, 66 and 76 can come off its `waiting` list once this merges; they are inline-core's.
- `]` with an inactive or failed bracket returns false but removes that bracket from `state.delimiters`. The contract says a failed `parse` changes nothing, but micromark marks the label start balanced here. The core does not depend on this.
- Change request filed: `roadmaps/v1/contracts/parser-core-v3-inline-core.change-request.md`. Code spans, raw HTML and reference labels keep the whitespace left on a line after its container prefixes. Ranges do not say where container prefixes end, so `lines.ts` guesses. The guess is right at top level, in lazy lines and in block quotes, and wrong inside list items.

## Stubs left

- None in `src/`. The test-only `testDefinition` rule in `test/inline.test.ts` stands in for blocks-leaf's definitions.

## Gotchas

- Re-check after blocks-leaf merges: the 23 `referenceCases` and spec examples 18, 19, 21, 24, 31, 34, 36 and 541 (code blocks, HTML blocks, multi-line definitions). Replace `testDefinition` with the real rule. `definitions` must hold `normalizeIdentifier(label)` (the uppercase form).
- Re-check after blocks-container merges: example 38 (list), plus code spans, raw HTML and reference labels that span lines inside block quotes and lists. Lists stay wrong until the change request lands.
- gfm-inline: strikethrough must not use priority 0 if it needs to resolve before emphasis. Resolvers run in priority order, and the reference's order depends on which construct appears first: `~~a *b~~ c*` gives delete, `*a ~~b* c~~` gives emphasis. Emphasis already treats an adjacent `~` as a letter under GFM.
- gfm-tasks-footnotes: footnote calls must register at a priority below 500 on `[`. In the reference, `[^a](b)` with GFM is a plain link.
- `link.ts` and `html.ts` reuse module-level cursors. `code-span.ts` and `html.ts` keep per-leaf caches keyed by the `ranges` array identity. Do not reuse a ranges array between leaves.
- Non-ASCII punctuation is tested with a `\p{P}|\p{S}` regex. It only runs when a `*`/`_` run touches a non-ASCII character.

## Proposed learnings

- Port micromark's state machines and fallbacks, not the CommonMark prose | label-end fallbacks, the attention `~` loosening and the html-text line prefix limit all differ from the spec text | packages/talata/src/inline | yes (reference comparison)
- Cache "no closer after offset X" for constructs that scan to the end of a leaf | unclosed `<!--` on every line was quadratic | packages/talata/src/inline | yes (timed pathological test)

## Verification

- `pnpm --filter talata test`: 7 files passed, 1 skipped; 722 tests passed, 2130 skipped (readiness flags still off).
- `npx tsc --noEmit -p packages/talata`: no errors.
- `npx oxlint`: no findings. `npx oxfmt --check` on the new files: clean.
- Scratch fuzz, not committed: about 220k random inline-heavy documents (plain, GFM, with single-line definitions) compared with the reference: 0 differences.
- Scratch corpus check: 5843 top-level paragraphs and headings compared; the 5 differences are all GFM autolink literals.
- Pathological inputs (20k repeats of `*a _`, `[`, `<!--\n`, unclosed `` `` ``, `<?`, `<![CDATA[`, `[a](b `): each under 25 ms.

## Size

- Estimated L, actual L.

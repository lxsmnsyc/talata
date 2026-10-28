# Outcome: inline-core

## Built

All paths are under `packages/talata/src/inline/`. Each rule is a default export registered in `index.ts`.

- `escape.ts` (priority 100, `\`): backslash escapes and backslash hard breaks. The break is pushed over `\` and the core extends it over the line ending. A `\` at the end of the last range is literal.
- `character-reference.ts` (100, `&`): named (up to 31 alphanumerics, must be in the table), decimal (up to 7 digits) and hex (up to 6) references. Invalid code points decode to U+FFFD, as micromark-util-decode-numeric-character-reference does.
- `code-span.ts` (100, `` ` ``): finds the closing run across ranges. Line endings stay raw. Strips one space or line ending from each side when both have one and the content is not all padding. An unclosed opening run becomes text in one piece.
- `emphasis.ts` (100, `*_`, with `resolve`): micromark's attention algorithm. Flanking uses UTF-16 code units, range edges count as whitespace, `_` has the intraword rule, and the rule of three uses current run sizes. With GFM, a `~` next to the run counts like a letter. Two resolve paths:
  - Linear, for spans with only `*`/`_` runs and dead brackets. It pairs on the delimiters alone: a linked list drops the delimiters between a pair, and cmark's openers_bottom (per marker, closer size mod 3, closer canOpen) stops closers with no opener from searching again. An opener that shrinks lowers every bottom above it, because micromark compares current sizes. The delimiters dropped by a pair are queued and paired again as their own list, as micromark resolves a pair's inside again (`_**a****b*_`). The nodes are then rebuilt in one pass.
  - Mixed, for spans with other rules' delimiters (GFM `~`). Before wrapping a pair it calls `resolveSpan(state, open + 1)` on the delimiters in between, as micromark resolves `insideSpan`. This path is quadratic on adversarial input.
- `link.ts` (500, `[`, `]`, `!`): `[` and `![` push bracket delimiters (markers 91 and 33). `]` takes the nearest bracket from a side stack of open brackets, so it does not scan the delimiter stack. An inactive or failed bracket is removed, `]` is appended as text and `parse` returns true. Handles inline resources (32-deep paren balance, `<...>` destinations, `"`/`'`/`(` titles across lines) and full, collapsed and shortcut references against `state.definitions`. Follows micromark's fallbacks: a failed resource falls back to a shortcut when the label is defined; `[a][x]` with `x` undefined is not a link even when `a` is defined. A link deactivates earlier `[` brackets through a watermark (links closed since each bracket opened), not a loop. The definition lookup runs only on the paths that read it. It skips an empty `definitions`, collapses whitespace without building the label, and stops once the collapsed text is longer than the longest definition key. Case folding never shortens a string, so that bound is exact. Image `alt` matches mdast-util-to-string. Reference `label` is decoded and `identifier` is normalized from the raw text.
- `autolink.ts` (100, `<`): URL autolinks (schemes of 2 to 32 characters) and email autolinks (labels of up to 63 characters), on one line.
- `html.ts` (200, `<`): raw HTML as micromark's html-text state machine: tags, comments (`<!-->` and `<!--->` included), instructions, declarations and CDATA, across lines.
- Helpers: `classify.ts` (character classes), `decode.ts` (`parseCharacterReference`, `decodeString`), `entities.ts` (generated table, default export `decodeNamed`), and `lines.ts`:
  - a cursor across ranges, `linePrefix` and `rangeText`;
  - `lineIndents`: container prefix ends registered by paragraphs, read by `containerEnd`;
  - `reach`/`wasReached`: the furthest line a lookahead looked into, which decides where a line ending ends;
  - `workSteps`: a work counter for tests.
- `text.ts` `endRange`: after a lookahead reached the next line, the line ending (and a hard break over it) ends after that line's container prefixes, as in micromark.
- `test/inline.test.ts`: all 357 examples of the CommonMark inline sections (Backslash escapes, Entity references, Inlines, Code spans, Emphasis, Links, Images, Autolinks, Raw HTML, Hard and Soft line breaks, Textual content) compared to the reference with positions, through the registered rules (blocks-leaf's real definitions); 79 edge cases; 4 GFM flanking cases; 23 reference cases; 14 review cases (re-resolution, line endings after lookahead, list items); a differential test of both emphasis paths on 8000 xorshift-generated inputs; 12 growth tests. Each growth test makes the input 8 times larger and requires `workSteps` to grow less than 12 times; linear work grows 8.0 times, quadratic 64. No test asserts time.

## Deviations

- New files outside the owned paths: `packages/talata/test/inline.test.ts` and `packages/talata/scripts/generate-entities.mjs` (rebuilds `entities.ts` from https://html.spec.whatwg.org/entities.json or a local copy). Both are new, so they should not conflict.
- Review round 1, after blocks-leaf merged, outside the owned paths:
  - `src/blocks/decode.ts` now re-exports the inline `decodeString`, so named references decode in info strings and definitions.
  - `test/blocks-leaf.test.ts`: dropped every inline-core entry from its waiting lists (35 examples, 2 block-structure examples, 10 raw-HTML cases), turned its `it.fails` for named references into `it`, and changed one decode expectation (`&amp;` now decodes to `&`).
  - `test/core-sections.test.ts`: dropped examples 56, 65, 66 and 76 from `waiting`; the map is now empty.
- Review round 2: `src/blocks/paragraph.ts` records container prefix ends for every multi-line paragraph, no longer only for paragraphs starting with `[`. It registers them in `lineIndents` (`src/inline/lines.ts`), a `WeakMap` keyed by its `lines` array. This works around the change request without changing the contract. Definitions read the same list as before.
- Change request filed: `roadmaps/v1/contracts/parser-core-v3-inline-core.change-request.md`. Code spans, raw HTML and reference labels keep the whitespace left on a line after its container prefixes. Ranges do not say where container prefixes end. Since round 2, paragraphs supply this through the `lineIndents` side table, so paragraphs are exact. Other multi-line leaves would fall back to a guess, but none exist yet. The request can be accepted (an explicit field) or closed.

## Stubs left

- None.

## Gotchas

- `definitions` must hold `normalizeIdentifier(label)` (the uppercase form); the link lookup folds the same way.
- A new multi-line leaf that calls `state.inline` with its own ranges array gets the guessed container prefix ends. Register `lineIndents` for it, as paragraphs do, to make them exact.
- gfm-inline: a `~` delimiter in a span sends emphasis to the quadratic mixed path. A strikethrough resolver with a lower priority than emphasis (100) resolves and removes its delimiters first, which keeps emphasis on the linear path. Strikethrough must not use priority 0 if it needs to resolve before emphasis. Resolvers run in priority order, and the reference's order depends on which construct appears first: `~~a *b~~ c*` gives delete, `*a ~~b* c~~` gives emphasis. Emphasis already treats an adjacent `~` as a letter under GFM.
- gfm-tasks-footnotes: footnote calls must register at a priority below 500 on `[`. In the reference, `[^a](b)` with GFM is a plain link.
- `link.ts` and `html.ts` reuse module-level cursors. `link.ts` (bracket side stack), `code-span.ts` and `html.ts` keep per-leaf state keyed on the `InlineState` object, which `parseInline` creates for each leaf. A rule that pushes its own bracket delimiters (markers 91 or 33) is not on link.ts's side stack; `]` only closes brackets that link.ts opened.
- Non-ASCII punctuation is tested with a `\p{P}|\p{S}` regex. It only runs when a `*`/`_` run touches a non-ASCII character.

## Proposed learnings

- Port micromark's state machines and fallbacks, not the CommonMark prose | label-end fallbacks, the attention `~` loosening and the html-text line prefix limit all differ from the spec text | packages/talata/src/inline | yes (reference comparison)
- Cache "no closer after offset X" for constructs that scan to the end of a leaf | unclosed `<!--` on every line was quadratic | packages/talata/src/inline | yes (timed pathological test)

## Verification

- Round 2: `pnpm --filter talata test` three times: 11 files passed, 2 skipped; 1861 tests passed, 1988 skipped each time. `npx tsc --noEmit -p packages/talata`: no errors. `npx oxlint`: no findings.
- Round 1, after merging main (blocks-leaf at 723e21c): `pnpm --filter talata test`: 1844 tests passed, 1988 skipped (readiness flags still off), 6 runs in a row. With the git-ignored corpus present, the harness's reference-only sanity test for `large/node-changelog-v22.md` times out at 5 s on this machine; it does not touch talata. I removed my local corpus copy.
- `npx tsc --noEmit -p packages/talata`: no errors.
- `npx oxlint`: no findings. `npx oxfmt --check` on the new files: clean.
- Scratch fuzz, not committed: about 220k random inline-heavy documents (plain, GFM, with single-line definitions) compared with the reference: 0 differences. After review round 1, with every registered block rule and no block filter: 40k emphasis-heavy and 40k mixed documents, 0 differences. After round 2, 80k documents with multi-line inline content in 13 container styles: 0 differences.
- Scratch corpus check: 5843 top-level paragraphs and headings compared; the 5 differences are all GFM autolink literals.
- Pathological inputs at 50 KB, measured in vitest on this machine (best of runs; the reference from one run, in parentheses):

  | Input                        | talata      | reference    |
  | ---------------------------- | ----------- | ------------ |
  | `[`×25000 then `]`×25000     | 28 ms       | 2026 ms      |
  | `* a`                        | 18 to 23 ms | 7924 ms      |
  | `_a*b `                      | 33 ms       | 10624 ms     |
  | `**_ a`                      | 31 ms       | 5985 ms      |
  | `a**b`                       | 16 ms       | 2974 ms      |
  | `*a `×n then ` a*`×n         | 22 ms       | 46653 ms     |
  | `*a* `                       | 34 to 50 ms | 964 ms       |
  | `[a](b) `                    | 19 ms       | 515 ms       |
  | `[a [b] c `                  | 9 ms        | 286 ms       |
  | unclosed `<!--` on each line | 14 ms       | not measured |

  Timings were 2 to 3 times higher while a fuzz run shared the machine.

## Size

- Estimated L, actual L.

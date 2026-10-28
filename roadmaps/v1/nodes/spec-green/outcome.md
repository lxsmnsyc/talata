# Outcome: spec-green

## Built

Branch `feat/spec-green`. Paths are under `packages/talata/` unless noted.

- Flags: `ready.commonmark` and `ready.corpus` are on in `test/parsers.ts`. `setext`, `code`, `blockquote`, `list`, `html`, `definition` and `inline` are on in `test/fuzz/features.ts`.
- All 652 CommonMark spec examples give the reference's tree with positions, with and without GFM, except 5 examples that hold literal autolinks under GFM (see Deviations). They already matched when the flags went on. Every corpus file (142) matches the reference without GFM.
- parser-core v3, as accepted:
  - `BlockState.tip` (`src/core/blocks.ts`). `interrupts()` in `src/blocks/blockquote.ts` treats open indented code like an open paragraph, so `    a\n2. b` and `    a\n\n2. b` give a paragraph, as the reference does. Only list starts are restricted: the reference allows kind 7 HTML after indented code.
  - `BlockState.inline(node, ranges, indents?)` and `InlineState.indents` (`src/core/inline.ts`, `src/core/parse.ts`). Paragraphs and setext headings pass their indent triples. The `lineIndents` WeakMap in `src/inline/lines.ts` is gone.
- Fixes, each with cases in `test/spec-green.test.ts` (compared with the reference, with and without GFM):
  - Indented code on a micromark lazy line (an open container did not match and no container started) ends with that line: `>\n    a\n    b` gives two code blocks. This needs the new `BlockState.unmatched`. Such code is named `codeIndentedLine` and is not a `tip`, so `>\n    a\n3.` gives a list.
  - Kind 7 HTML that interrupts a lazy paragraph on a line with a line ending stays in the containers, and they continue: `> a\n<x>\n> c` gives a quote holding html `<x>\nc`. This needs the new `OpenBlock.keepsLazyContainers`, set in `src/blocks/html.ts`.
  - A list item whose last child kept its line ending (fenced code, HTML 1 to 5) ends at the closing event. That is the next sibling's marker and whitespace (`- ```\n  a\n- b`: 3:3), a new container's position (`TrackedContainer.closedAt`), or the end of the text when the item continued on a last line with no line ending (`- ```\n `: 2:2). Block quotes do the same for a new container (`* ><pre\n  -`: quote ends at 2:3). Code is in `src/blocks/list-item.ts` and `src/blocks/blockquote.ts`.
  - A quote that matched the last line only through the end-of-file rule: fenced code and HTML 1 to 5 inside it end before that line (`> > ```\n> > a\n>`: code ends at 2:6). The quote sets the new `BlockState.endOnlyLine`; leaves read it through `matchedOnlyAtEnd()` in `src/blocks/blockquote.ts`.
  - Fenced code values are built like the reference's buffer, every line ending after the opening fence included, then one line ending is trimmed from each end (`trimLineEndings` in `src/blocks/code-fenced.ts`). So a `\r` after the fence and the `\n` of an empty first line go together: ` ~~~\r \n_` gives `"_"`.
  - Emphasis next to NUL: an opener run that ended right before a NUL and lost markers from its end keeps the whole run as its value (`**\0*` gives text `"**"` at 1:1-1:2). This needs the new `Source.withNul` (`src/core/source.ts`) and `leftover()` in `src/inline/emphasis.ts`.
  - Empty link, image and definition titles (`[a](b "")`) give `title: null` (`src/inline/link.ts`, `src/blocks/definition.ts`).
  - Code spans: split-tab columns after a container prefix are data, not padding (see the "code span padding with split tabs" cases), in `src/inline/code-span.ts` with `prefixSplitColumns()` in `src/inline/lines.ts`.
  - The brief's trailing-space hard break cases in quotes and items (`>  \n>|` and the `5.` case) already matched. `\ta\r*` was fixed by `tip`.
- `test/fuzz/fixtures/`: 81 minimized fuzz failures, all fixed, replayed by `test/fuzz/fuzz.test.ts`.

## Deviations

- Contract: four additions beyond v3, implemented and described in `roadmaps/v1/contracts/parser-core-v4-spec-green.change-request.md`: `BlockState.unmatched`, `BlockState.endOnlyLine`, `OpenBlock.keepsLazyContainers` and `Source.withNul`. Also `TrackedContainer.closedAt` in `src/blocks/blockquote.ts`, which is not in the contract but which new containers (GFM footnote definitions) should implement.
- Test files outside my owned paths:
  - `test/corpus.test.ts`: added a talata suite without GFM (all 142 files). The GFM suite runs too; a `gfmWaiting` map skips the 23 files that need unbuilt GFM features until their flags are on. Each entry names its features: table (gfm-tables), autolinkLiteral (gfm-inline), taskList (gfm-tasks-footnotes). The other 119 files already match with GFM.
  - `test/equivalence.test.ts`: the "with GFM" variant of spec examples 602, 606, 608, 611 and 612 (literal autolinks) waits on `ready.gfm.autolinkLiteral` through a `gfmWaiting` map. gfm-inline removes them by turning its flag on.
  - `test/fuzz/check.ts`: the literal-autolink skip applies only with GFM (review nit). Without GFM, the fuzzer now compares every document.
  - The brief says the GFM suites may still be skipped. I gated these two suites example by example and file by file instead of leaving them red.
- `packages/talata/README.md` was not changed. The brief does not ask for the list of reference-versus-spec cases, and the README is outside `src/`. The quirks found here are candidates for that list: kind 7 HTML on a lazy line, one-line indented code on a lazy line, fenced code line ending trimming, NUL next to emphasis, item ends after kept line endings.

## Stubs left

- None.

## Remaining differences from the reference (for the gate review)

Without GFM: none known. The final 200,000-document run and every run since the last fix found no difference. Every spec example and every corpus file match.

With GFM, every difference found comes from GFM features that are not built yet:

| Input                                                                      | Reference                                    | Talata             | Owner                                                                    |
| -------------------------------------------------------------------------- | -------------------------------------------- | ------------------ | ------------------------------------------------------------------------ |
| `www.a.b`, `a@b.c` (spec 602, 606, 608, 611, 612)                          | link                                         | text               | gfm-inline                                                               |
| `[www.`                                                                    | text `"["`, then `"www."` as a separate node | one text `"[www."` | gfm-inline (the literal autolink attempt splits text even when it fails) |
| `<\+@b.c`                                                                  | text `"<"`, then the rest                    | one text node      | gfm-inline (same)                                                        |
| `~~a~~`                                                                    | delete                                       | text               | gfm-inline                                                               |
| `![~~a~~](b)`                                                              | alt `"a"`                                    | alt `"~~a~~"`      | gfm-inline (alt comes from the delete's text)                            |
| `\| a \|\n\| - \|`                                                         | table                                        | paragraph          | gfm-tables                                                               |
| `- [ ] a`                                                                  | `checked: false`                             | `null`             | gfm-tasks-footnotes                                                      |
| `a[^1]\n\n[^1]: b`                                                         | footnote                                     | text and paragraph | gfm-tasks-footnotes                                                      |
| 23 corpus files with GFM (listed in `gfmWaiting` in `test/corpus.test.ts`) | tables, autolinks, task items                |                    | gfm-tables, gfm-inline, gfm-tasks-footnotes                              |

The fuzzer's support filter does not skip the two text-split cases, so a GFM fuzz run reports them while `autolinkLiteral` is off.

## Gotchas

- A rule that starts a leaf must not assume the unmatched containers close first. A leaf with `keepsLazyContainers` goes into the lazy paragraph's container.
- Indented code has two open-block names: `codeIndented` and `codeIndentedLine` (one-line code on a lazy line). Test `tip?.name === 'codeIndented'` only.
- A container whose last child can keep its line ending must end at the closing event, not at the child's end. GFM footnote definitions should implement `closedAt` and copy the end rule from `OpenListItem.close`.
- The end-of-file quote rule records the line in `BlockState.endOnlyLine`, read by fenced code and HTML through `matchedOnlyAtEnd()`. A new multi-line leaf that ends "after the line ending" on an empty last line (ext-math blocks, directives) must check it too.
- `Source` gained `withNul`. Code that builds a `Source` by hand must set it (undefined when there is no NUL).
- Fenced code `value` is built from a raw buffer. Do not trim it line by line.

## Proposed learnings

- When a container's end looks off by a few columns, read mdast-util-from-markdown's `prepareList` walk-back, not micromark's exits | items end at the next event when no line ending lies between, and that explained every item-end difference here | packages/talata/src/blocks | yes (reference comparison)
- micromark's `parser.lazy` checks happen at different lines for different constructs (code-indented checks the current line, fenced code and HTML the next) | it decides whether code continues after a lazy start | packages/talata/src/blocks | yes (fuzz)
- Fuzz with `--no-gfm` while GFM is missing | GFM-mode runs report literal autolink text splits the filter does not skip | packages/talata/test/fuzz | no

## Verification

- `pnpm --filter talata test`, twice after review round 1: 15 files passed, 4424 tests passed, 59 skipped (GFM-gated) both times. The corpus is present in this worktree.
- `npx tsc --noEmit -p packages/talata`: no errors.
- `npx oxlint`: no findings.
- Fuzz without GFM: seed 33 50k, seed 202 50k, seed 303 `--no-corpus` 50k: 0 failures. Earlier runs found the failures listed in Built, all fixed. Final run, seed 2026, 200,000 documents: 198,339 compared, 1,661 skipped (autolinkLiteral), 0 failures, 397 s.
- After review round 1, seed 404, 20k without GFM: 20,000 compared, 0 skipped, 0 failures.
- Fuzz with GFM, seed 34, 50k: 14 failures, all GFM literal-autolink text splits (table above).
- Performance: not benchmarked (brief). The `lineIndents` WeakMap lookup is gone; inline-core measured it at about 15% on paragraph-heavy documents. The other changes add a few branches on block close and nothing per character.

## Size

- Estimated M, actual M.

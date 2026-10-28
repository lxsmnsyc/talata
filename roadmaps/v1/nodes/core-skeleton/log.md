# Log: core-skeleton

- 2026-10-28: branch renamed to feat/core-skeleton. No prior work: `src/index.ts` throws. Fast check passes on the empty tree (spec suites skipped).
- Reference facts measured with a scratch script against mdast-util-from-markdown:
  - A leading BOM is dropped and offsets count from after it. NUL becomes U+FFFD.
  - Root spans 1:1/0 to the end of the file.
  - Paragraph ends at the end of its last line, trailing whitespace included. The text inside stops before that whitespace.
  - Trailing whitespace before a line ending: a hard break when it is 2+ characters with no tab. The break ends after the line ending, before the next line's indentation.
  - Soft breaks keep the raw line ending (`\r\n`, `\r`) in the text value.
  - ATX heading and thematic break end at the line end, trailing whitespace included.
  - A tab partly consumed by a container prefix (`>\t\tfoo`): the next block starts at the offset after the tab. So the line model keeps `start` after the tab and counts the unconsumed columns in `partialTab`.
- Built core (source, line, state, blocks, inline, registry, transform, parse), paragraph, ATX heading, thematic break and inline text. Registry is passed to `parse`, so tests can add rules.
- Lint (repo oxlint config) forces default exports in single-export files and `this` in class methods; rule files export their rule as default, never-continue methods are class fields.
- Tests: `test/core.test.ts` (source, line, positions, test-only block quote, prefix rule, transform) and `test/core-sections.test.ts` (spec sections; 11 examples wait on other nodes). New files under `test/`, outside owned paths.
- Scratch fuzz: 300k random strings over `ab #-*_\t\r\n\0 BOM`, reference trees limited to supported node types: no differences. Removed afterwards.
- Rough timing (vitest, not the benchmark): 345 KB of headings, paragraphs and breaks, talata 12 ms vs reference 264 ms. No inline rules yet.
- The draft contract needed changes; wrote `contracts/parser-core.change-request.md` with the final TypeScript instead of editing the contract.
- Gate review round: closed six contract gaps. Added `splitParagraph`, `interruptible`, `resolve(state, bottom)` with `resolveSpan`, `nodeIndex` and `mergeText`, `OpenParagraph.start`, `canContain` with `openContainer` and a no-progress guard, and the end-of-file container note. Also line restore around failed starts, the reworded takeParagraph doc and footnote sentence, `\uFEFF` escapes in tests, and `specExamples`/`specText` reuse. Each gap has a test-only rule in `test/core.test.ts`; inline span tests match the GFM reference.
- Found while testing: `> a\n  ` closes the quote at 1:4, so the end-of-file extension applies only after an outer prefix consumed something.

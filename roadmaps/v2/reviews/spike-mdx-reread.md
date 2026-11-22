# Spike: MDX re-read, error order and the directive DoS

Scripts: `scratchpad/exp/` (`env.mjs` loads the reference and talata `dist` built from main 3196f33, `trace.mjs` runs micromark's `parse` + `subtokenize` by hand and logs each tokenizer call with its pass). Times are best of 3, in ms.

## 1. Why the reference is linear

micromark tokenizes in passes:

- Pass 0, the document parse. The document tokenizer feeds each line to its flow at once (`micromark/lib/initialize/document.js:198,246`). Content (definitions, paragraph) is subtokenized when it closes (`micromark-core-commonmark/lib/content.js:37`). So top-level flow, quotes and lists are done here, and a top-level flow error throws here.
- Later passes: `postprocess.js:14` loops `while (!subtokenize(events))`. Each `subtokenize` walks the events in order and tokenizes every token with a `contentType` (`micromark-util-subtokenize/index.js:66-71`). It then jumps over the events it spliced in (`index = jumps[index]`), so they wait for the next pass.
- A container directive's content is a `chunkDocument` with `contentType: 'document'` (`micromark-extension-directive/lib/directive-container.js:141-142`). It is tokenized only in a later pass. During pass 0 the directive just collects raw lines until a closing fence. It is `concrete` (line 14), so it takes no lazy lines.
- A failed MDX flow construct is a plain `nok` (`jsx-flow.js:117`, `mdx-expression/lib/syntax.js:167`). Flow then reads those lines again, at the same document level. The container decisions on those lines are already made, and both constructs are `concrete`, so no lazy lines were taken. The throws are in `factory-tag.js:806` and `micromark-factory-mdx-expression/index.js:112-291`.

Trace of `'{a\n:::x\n}x\n'.repeat(3)`:

```
pass 0: document@1:1 flow@1:1 content@1:1
pass 2: text@1:1  -> throws 1:3
```

- The expression is tried once, at 1:1.
- `:::x` interrupts the paragraph and its directive collects every later line as raw chunks.
- The paragraph's text is the first chunk of pass 2, and it throws.
- No nested `document` tokenizer is ever made. The reference makes 4 tokenizer calls at n = 1000 and at n = 4000, for every error shape below.

| shape (repeated n times)              |     ref n=1000 | ref 4000 |    talata 1000 | talata 4000 |
| ------------------------------------- | -------------: | -------: | -------------: | ----------: |
| `{a\n:::x\n}x\n`                      |           13.2 |     26.9 |            119 |        1390 |
| `a. {a\n:::x\n}x\n`                   |            4.9 |     21.0 |             77 |        1145 |
| `a {a\n:::x\n}x\n`                    |            8.2 |     22.0 |             89 |        1319 |
| `[a] {a\n:::x\n}x\n`                  |            9.6 |     19.9 |             79 |        1140 |
| `a\n:::x\n` (no error), n=125/250/500 | 51 / 191 / 771 |          | 1.2 / 3.5 / 13 |             |

The shapes with `a.`, `a` and `[a]` start no MDX flow construct, so no re-read happens. They are n real nested directives. talata's eager block parser walks all of them on every line, which is O(n²). The `doomed` heuristic on `fix/mdx-directive-growth` covers only the `handOver` path, so it cannot help these shapes. With no error, the reference is quadratic too, and about 60 times slower than talata. The reference is linear only because the first text error ends the parse before any nested document is tokenized.

The error order follows one rule:

- The first throw in micromark's own order wins. Top-level flow throws first, during pass 0. After that, chunks go breadth first by pass, and in document order of the chunk's start within a pass.
- In my trace's numbering, depth-d content is tokenized in pass 2d and its text in pass 2d+2. Each text directive label adds one pass: `:::x\nb {\n:::\n:a[{]` tokenizes the label at pass 3, before the inner `b {` at pass 4, and throws at 4:5.
- `order.ts` gives the same order with every pass number one lower: flow `2d-1`, text `2d+1+labels`, then the chunk start, then the place (`order.ts:175-185`).
- So `order.ts` is exact. Its misses come from the depth and chunk it is given.

Example: `:{\n>:::x\n>{\n><}x\n:`, a known open case.

- The reference throws at 1:3, from text@1:1 in pass 2.
- talata throws the flow error at 4:3, from inside the directive.
- That points to `flowError` (`flow.ts:100`) thrown at once with `containerDepth` 0, because the directive opened by the re-read is not on the stack. This is likely, not confirmed by debugging.

## 2. An exact design

The rule is simple. The hard part is the structure: micromark has two layers, and its container directive is a raw collector whose content is parsed later. talata uses one stack and opens directives as real containers at once.

**Design D (deferred documents, exact by construction):**

1. **Core: split the layers.**
   - The document layer handles quotes, lists, footnotes, the per-line container decisions and laziness.
   - The flow layer for each container reads leaf blocks from line spans: offset, end, start column and the columns left over from a split tab.
2. **Flow rewind.** When an MDX flow construct starts, the flow layer keeps a mark (the number of nodes it has emitted; nothing is open). It also buffers the spans of the construct's lines.
   - If the construct fails, the layer goes back to the mark and reads the buffered spans again, with the construct off at the first line only.
   - The container decisions are kept, as in micromark.
   - The flow then goes on live, for example as a paragraph that takes later lines lazily.
3. **Container directive as a collector.** In pass 0 it is a concrete leaf, like fenced code. It closes at the first `:::` fence of at least its size (checked: `:::x\n:::y\nb\n:::\nc\n:::` matches the reference) or at the end of its parent. It stores its spans.
4. **Pass scheduler** (new `core/passes.ts`, or in mdx).
   - A queue of chunks: leaves, labels and directive contents.
   - Each pass runs its chunks in document order. A leaf gets the inline parse, and a directive gets a nested two-layer parse of its spans, whose chunks join the next pass.
   - Errors simply throw.
   - Definitions build up in this same order, as `parser.defined` does (`micromark/lib/parse.js:34`, `label-end.js:165`).

**Replaced:**

- In `ext/mdx`: `reread.ts` (436 lines), `prefixes.ts` (130), `order.ts` (206; the scheduler makes it exact), and in `flow.ts` the parts `reread`, `rereadAll`, `handOver`, `waitFor`, `goOnAsParagraph`, `doomed` and `raw`, about half of its 1085 lines. Also `inline.ts` `enterChunk` (the chain becomes the scheduler's depth) and the nodes-marker queue in `build.ts`.
- In the core: `BlockState.readLineAt` (`core/blocks.ts:131,525`) and `OpenParagraph.inlineIndents`.
- Most of `ext/directive/container.ts` (34 KB), which emulates "the content is a document of its own" inside one stack.

**New core hooks (contract v6):**

- `parseSpans(spans, depth)`, which returns nodes plus pending chunks.
- A flow-layer `mark()` / `rewind(mark, spans, skipFirst)`.
- A leaf-close event.
- A chunk queue that extensions can add to (labels).

**A middle design, M (snapshot and replay, about L).**

- Keep one stack. At the start of a construct, snapshot the open-block stack. This needs `clone()` on every block, from the core and from extensions.
- On failure, restore the snapshot and read the lines again, with the container decisions recorded during the construct forced (a generalised `readLineAt`).
- Directives opened during the replay are then really on the stack, so the depth given to `order.ts` is right.
- This removes `reread.ts`, `prefixes.ts` and the `flow.ts` emulation. It keeps eager directives, so it still needs the fix in section 4 for the DoS.
- It is exact only while `container.ts` matches the collector semantics.

## 3. Estimates

| Option                 | Size          | Risk                                                                                                                 | Fixes                                                                                                                                            |
| ---------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| D: deferred documents  | XL            | High. A core refactor; it touches talata/directive output and tab-column spans. The corpus and tree hashes guard it. | The DoS (it never builds what micromark skips), the error-order class, lazy-line places (container decisions are made once), the re-read classes |
| M: snapshot and replay | L             | Medium. Every block type needs `clone()`, and directives stay emulated.                                              | Re-read structure, most error order, lazy places inside the construct. Not the DoS.                                                              |
| Keep patching          | S–L per class | Low per patch, but it keeps growing                                                                                  | One class at a time                                                                                                                              |

How the patching has gone:

- Every MDX node overran its estimate: ext-mdx L to XL, ext-mdx-acorn M to L, fix-mdx-reread-container M to L, fix-mdx-directive-growth S to L.
- Each found 1 to 10 older classes. The ext-mdx outcome says "every 1M fuzz run before the last found new classes".

Open now:

- About 5 classes tied to the re-read and the order:
  - lazy lines with lists or footnotes outside a directive (178 in 50k targeted documents);
  - with acorn, the place in a text directive label across quote lines;
  - the error order `:{\n>:::x…`;
  - the acorn error order, seed 20261503 doc 344943;
  - the doomed generator residue (21 in 300k and 10 in 100k).
- General fuzz: about 1 failure per 1M documents per run, both also on main.
- Targeted generators: 1e-4 to 4e-3.

New classes keep appearing at about one or more per new generator, and each patch adds a model of micromark (`prefixEnd` is "a small model of micromark's document tokenizer").

## 4. A cheap, exact DoS fix, independent of the redesign

This generalises `doomed` with a sound rule.

1. When any leaf or label closes for good, wherever it closed, pre-scan it with the real inline parser. If the scan throws an MDX error, and no definition lookup was made before that error, record `K = (2d+1+labels, chunkStart)`. The lookup case matters because a `]` that resolves a reference or footnote can make a `{` label text, so the result depends on definitions not yet known.
2. When a container directive opens at depth D with content start s, and `(2D-1, s) > K` (for a top-level leaf, any D ≥ 1 after it), open it opaque. Its content lines are raw: only the closing fence, the outer container prefixes, concrete with no laziness, and the end of the parent.

Why it is exact:

- Everything inside an opaque directive sorts after K, so it cannot be the first error.
- K's chunk is sure to throw, so the tree is never returned.
- A raw collector ends exactly where micromark's does, which is more faithful than today's real container.
- Errors before K in the order (top-level flow, shallower text, directives opened earlier) are still parsed normally.

Cost and scope:

- One extra inline scan per leaf, which can be cached for the inline phase.
- It replaces `doomed`, `failsAsText` and `rereadOptions.directives`.
- It needs a leaf-close notification for mdx, and a predicate `container.ts` asks at open ("prune content at this depth").
- Size S to M.

Gap:

- `[a] {a…` does a lookup before the error, so it falls back to eager parsing and stays quadratic.
- To close that, prune on the guess that no labels are defined, check the guess against the final definitions after the block pass, and on a mismatch parse once more without that K. That is still exact, at a worst case of 2 parses.
- It also needs a growth test over the four shapes above, and the doomed generator run against main.

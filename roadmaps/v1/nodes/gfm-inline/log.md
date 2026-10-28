# Log: gfm-inline

## 2026-10-28

- Branch `feat/gfm-inline`. Corpus copied from the main checkout.
- Read micromark-extension-gfm-strikethrough 2.1.0, micromark-extension-gfm-autolink-literal 2.1.0, mdast-util-gfm-autolink-literal 2.0.1, mdast-util-find-and-replace 3.0.4 and micromark's create-tokenizer and label-end.
- Finding: the reference makes literal autolinks in two places. The text tokenizer makes links with positions; the findAndReplace transform makes the rest without positions. The brief and contract mention only the transform. Change request filed (`contracts/parser-core-v5-gfm-inline.change-request.md`).
- Finding: top-level resolve order of strikethrough and emphasis is the order of the first sequence in the leaf; inside links and pairs strikethrough is always first (extension `insideSpan` constructs are spliced before `attention`). Checked with the reference: `~~a *b~~ c*` delete, `*a ~~b* c~~` emphasis, `[*a ~~b* c~~](u)` delete.
- Strikethrough: priority 50, pairs on the delimiters with one stack per size, then rebuilds the nodes in one pass. Each delete's inside is resolved by the later resolvers with `state.nodes`/`state.delimiters` swapped to the region. Emphasis-first leaves with a possible tilde pair go through emphasis's mixed path (quadratic on adversarial input; the reference is slower there: 20 s for 100 KB of `~a~ a* `).
- Autolink rule: triggers `.:@_` instead of every `w`/`h`/atext character, then takes back the pending plain text the link starts in. Email first at `_` (before emphasis), `.` and `@`; www at `.`, protocol at `:`. Open bracket check reads the delimiter stack (cached).
- Bug found by probes: text before a link at a line start ended after the container prefix. `takeBack` now restores the line ending's end as `endRange` set it.
- Quadratic cases found by timing and fixed with memos: `www._` repeated (domain scan failure memo), dots after `www.a` (trail check memo), transform candidates inside the same run (run end and domain check memo). Growth tests in `test/gfm-inline.test.ts` count `workSteps`.
- Fuzz (GFM on): seed 11 20k, seed 4242 50k: 0 failures. Scratch random fuzzer over GFM-inline atoms (about 170k short documents): only table differences.
- Merged main after gfm-tables landed; fast check green. Final 100k fuzz and a post-merge 50k each found one task-list lookahead difference (`- [
  *x*`), outside this node.

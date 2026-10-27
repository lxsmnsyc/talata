# Adversarial review (fresh-context agent), with dispositions

1. The contract had no document state for definitions and footnotes, no post-parse transforms, and no normalization rule. Accepted: added `DocumentState`, `normalizeIdentifier`, the three-phase model and `transforms`.
2. Block rules could not take over the open paragraph, and containers lacked hooks. Accepted: added `takeParagraph()`, `ParagraphPrefixRule`, `isContainer`, `acceptsLazy`, `children` and rule priorities.
3. gfm-tasks-footnotes missed files it must change. Accepted: added `core/blocks.ts`, `list-item.ts`, `definition.ts` and `inline/link.ts` to its shared paths, and priorities to the contract so it can override instead of edit.
4. `paragraph.ts` was owned by core-skeleton only. Accepted: shared by blocks-leaf and gfm-tables. blocks-container merges before blocks-leaf.
5. The position model mixed visual columns and unist columns. Accepted: `Line.visualColumn`, `partialTab`, and the position invariants section.
6. The autolink literal brief understated the reference's tree pass and missing positions. Accepted: brief rewritten, transform first, inline-pass optimization left to perf-pass.
7. Edges. Accepted: unified-plugin now depends on the contract only; GFM nodes depend on the CommonMark nodes they touch instead of spec-green; inline-core tests reference links with an injected `definitions` set. Not added: an edge between blocks-leaf and blocks-container. A merge order and cross-case tests cover it without serializing wave 2.
8. One `READY` flag blocked GFM nodes' own checks; unified-plugin missed `tsdown.config.ts`; bundle-size could measure code perf-pass was changing. Accepted: per-feature readiness flags defined by harness, owned paths fixed, bundle-size depends on perf-pass.

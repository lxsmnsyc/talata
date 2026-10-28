# Outcome: ext-directive

## Built

- `talata/directive` (`packages/talata/src/directive.ts`): `directive()` returns the cached extension from `src/ext/directive/index.ts`.
- Rules in `packages/talata/src/ext/directive/`:
  - `text.ts`: inline rule `directiveText` (priority 80) for `:name[label]{attributes}`.
  - `leaf.ts`: block rule `directiveLeaf` (345).
  - `container.ts`: block rule `directiveFence` (340), plus `directiveCode` (799), `directiveHtml` (399) and three rules that start quotes, list items and footnote definitions inside a directive (`directiveBlockquote`, `directiveListItem`, `directiveFootnoteDefinition`, one priority after the core rules).
  - `syntax.ts` (name, label, attributes), `entities.ts` (character references in attribute values as `parse-entities` reads them), `fixes.ts` (transform: labels, `alt`, list item spread), `scopes.ts` (visibility of definitions inside a container).
- Fuzz hook `packages/talata/test/fuzz/ext-directive.ts` (`ready: true`, `block` and `inline` generators).
- Tests `packages/talata/test/directive.test.ts`: 260 inputs copied from the reference tests, own cases, and frontmatter with directives.

## Deviations

- The contract said parser-core v5 was enough. It was not: see `roadmaps/v2/contracts/extension-directive.change-request.md`. The container rule reads `stack`, `containerIndex`, `closeTo` and `closeKeepsLineEnding` of the block parser through casts, redefines `closeKeepsLineEnding` as an accessor on the parser instance, and answers false on the first read of `isContainer`.
- Text directive labels are parsed in a transform after all leaves, not inside the rule.
- Priorities as in the contract (340, 345, 80). Extra block rules: 399, 799 and the three inside-directive rules.
- The container rule is named `directiveFence`, not `directiveContainer`. The frontmatter extension drops rules named `directiveContainer` after an unclosed fence, but the reference still starts a directive there (`---\n:::a\nb\n:::` gives a thematic break and a container directive). The test `frontmatter and directives` in `test/directive.test.ts` fails under that name. The frontmatter extension also drops quote, list item and footnote rules for the rest of the document; inside a directive the reference starts them, so the three `inside` rules restore them there. The orchestrator should remove `directiveContainer` from `CONTAINER_RULES` in `src/ext/frontmatter/matter.ts`.

## Stubs left

- None.

## Gotchas

- Module state of the inline rules (link brackets, strikethrough order, literal autolink caches) belongs to the leaf being parsed. A rule must not call `parseInline` from `parse`.
- A directive container is not a container for the reference: blocks it closes do not keep their line ending, and the quote prefixes around it are not in its content.
- A tab is part of a directive name or attribute name (micromark does not classify it as whitespace).
- Definitions inside a container are unknown to text read in an earlier or the same pass of the reference. `scopes.ts` models it by depth.
- A last line with nothing left after the prefixes ends the content before it (empty last line rules in `container.ts`).

## Proposed learnings

- An inline rule that needs to parse content inside a construct queues it for after the leaf | module state of other rules breaks otherwise | packages/talata/src/ext | no
- Check a rule against the reference with quotes, lists and tabs in front of it, not only at the root | the container ends differ there | packages/talata/test | yes (fuzz)

## Verification

- Reference inputs: 260 of 260 match `parseReference` with and without GFM.
- `pnpm fuzz --count 200000 --seed 8303 --no-save` (GFM, frontmatter, math and directive on): 200000 documents, 0 failures. Seeds 77 (no GFM) and 5, 100000 each, found 1 failure each, both with a tab or an indent of 4 columns inside a quote or list around a directive; not fixed.
- `pnpm --filter talata test`: 5764 passed. tsc, oxlint (two max-depth warnings), oxfmt --check pass.
- `pnpm --filter benchmark size`: main entry 32864 bytes gzip (this branch touches no core file). `talata/directive` is 24311 bytes gzip.

## Size

- Estimated M, actual L. Container ends inside quotes, lists and nested directives took most of the time.

# Outcome: ext-frontmatter

## Built

- `packages/talata/src/ext/frontmatter/matter.ts`: the block rule (priority 50, leaf, looks ahead for the closing fence).
- `packages/talata/src/frontmatter.ts`: `frontmatter(options)` resolves presets, `marker` and `fence` matters into the rule. Same options as the reference.
- `packages/talata/test/frontmatter.test.ts`: the 23 reference inputs, 40 inputs of our own, unit tests for `toml`, `['yaml','toml']`, custom marker and fence, same-start matters, `anywhere`, non-ASCII fence, and the benchmark corpus (as is, behind a matter, behind an unclosed fence). All with and without GFM.
- `packages/talata/test/fuzz/ext-frontmatter.ts`: `ready: true` with a `start` generator.

## Deviations

- An opening fence with no closing fence stops new containers (quote, list item, footnote definition) on all later lines in the reference. The rule reproduces this by swapping `state.rules` for a registry copy without container rules, matched by name. The directive container rule must be named `directiveContainer` for this to cover it; ext-directive should check the name.
- Known gap: with `anywhere`, a matter that interrupts a lazy paragraph of a quote or list stays inside that container in the reference. Here it does not start. The default options are not affected.
- Priority 50 and `canInterruptParagraph: anywhere` as in the contract.

## Stubs left

- None.

## Gotchas

- `test/ext-api.test.ts` ("same tree for the stub extensions") and `test/ext-api-bundle.test.ts` ("does not bundle the parser", under 5000 characters; frontmatter is 7955) fail now. They assume empty stubs and need an update by the orchestrator.
- `npx oxlint` reports errors in `.github/scripts/smoke.mjs` that are not from this node.
- Main entry is 32780 bytes gzip, 3 bytes over main (32777): the core helpers the rule imports are exported from the shared chunk.

## Proposed learnings

- A multi-line concrete construct that fails turns off container starts for the rest of the document in micromark | found with the fuzzer | src/ext | yes, with `---\n>`.

## Verification

- `pnpm fuzz --count 200000 --seed 8101 --no-save` (GFM): 200000 documents, 200000 compared, 0 skipped, 0 failures.
- `test/frontmatter.test.ts`: 464 passed. Full talata suite: 5462 passed, 2 failed (the two stub tests above).
- tsc and oxfmt pass. oxlint is clean for this node's files.
- `pnpm --filter benchmark size`: main entry 32780 bytes gzip.

## Size

- Estimated S, actual M: the unclosed-fence container rule needed a fuzz-driven fix.

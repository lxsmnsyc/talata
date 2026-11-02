# Outcome: ext-directive

## Built

- `talata/directive` is back: export and `micromark-extension-directive` 4.0.0 / `mdast-util-directive` 3.1.1 dev dependencies in `packages/talata/package.json`, the `src/directive.ts` entry in `tsdown.config.ts`, `benchmark/size/size.mjs`, `test/parsers.ts` (`'directive'` in `ExtensionName`), `test/fuzz/ext.ts`, `test/ext-api.test.ts`, `test/ext-api-bundle.test.ts`, the lock file.
- `directive()` (`packages/talata/src/directive.ts`, named and default export, no options) returns `cachedExtension('directive', ...)` with `name: 'talata:directive'`.
- Rules in `packages/talata/src/ext/directive/`:
  - `container.ts`: `directiveContainer` (block, `:`, 340), `directiveEnd` (block, no triggers, priority 1, never starts a block, see Gotchas) and `directiveHtml` (block, `<`, 399, runs the core HTML rule).
  - `leaf.ts`: `directiveLeaf` (block, `:`, 345).
  - `text.ts`: `directiveText` (inline, `:`, 80). Labels parse in place with `parseInline`.
  - `spread.ts`: transform `directiveSpread` (list items with a blank line inside a container directive are spread); runs only when the parse made a container directive.
  - `syntax.ts` (name, label, attributes), `entities.ts` (character references in attribute values), `labels.ts` (label parsing, trailing whitespace), `scopes.ts` (which definitions text inside or around a directive can see).
- Fuzz hook `packages/talata/test/fuzz/ext-directive.ts`, `ready: true`, with `block` and `inline` generators.
- Tests `packages/talata/test/directive.test.ts`: the 260 inputs of the reference packages' tests (license note in the file), own cases, container cases (containers around and inside, the two old fuzz failures and the later ones), frontmatter with directives, and the benchmark corpus with `[directive]` and `[frontmatter, math, directive]`, with and without GFM.

## Deviations

- Two extra block rules, `directiveEnd` and `directiveHtml`, and a transform, `directiveSpread`. The brief listed only the three rules. See the change request.
- The container is named `directiveContainer` as in the contract. Frontmatter no longer drops rules by name.
- No casts to parser state. `grep -rn "as unknown as" src/ext/directive` finds three, each building an mdast node (`textDirective`, `leafDirective`, `containerDirective`).
- The container sets `state.container` while it calls `continue` on the blocks inside it with an empty line (as `continuesOverEnd` does) and restores it after. `container` is a public field of `BlockState`.
- Change request `roadmaps/v2/contracts/extension-directive.change-request.md` (v2 to v3). It asks for three hooks: one for blocks that a new container closes, read access to the open blocks, and a way to mark a line as the last line of a content. The workarounds for all three are guesses, and the remaining fuzz failures sit in them.
- Acceptance not met: the 1,000,000-document fuzz run still finds about 4 differences per million.
- No changeset. The orchestrator's plan has release-0.3 write the minor changeset for 0.3. The changesets skill gives a new subpath a `minor` entry, so release-0.3 must add it.

## Stubs left

- None.

## Gotchas

- `directiveEnd` runs on every line that is not blank, for every parse that has the extension. It returns at once when no directive is open (one `WeakMap` lookup). When open directives do not match the line, it closes them and their content before any other rule runs, guessing from the line whether a container starts (`isContainerStart`). A wrong guess changes ends: `[^ e]:` read as a footnote start gave 30 failures in one run.
- The content of a directive is a document of its own for the reference. Its end depends on whether the next line is lazy for micromark: the containers around do not continue and no container starts. The directive replays the prefixes of the containers around it on the next line (`continuesAfter`), since `BlockState` gives no access to them.
- Definitions inside a directive are not known to text in the same or an earlier micromark pass (`scopes.ts`). The block pass adds them to `definitions`. A directive takes out what its content added when it closes. Hooks queued with `state.inline` (objects with a `children` setter) put them back while the inline pass runs. A label of a text directive sees definitions up to one level deeper than its leaf.
- Leaf and container labels keep trailing spaces and tabs: the object queued with `state.inline` appends them in its `children` setter.
- A directive in a quote sets `closeEnd` and calls `closedAt` on the containers inside on some lines. List items ignore `closeEnd`.

## Proposed learnings

- A container whose content is a document of its own decides its end from whether the next line is lazy for micromark (containers around fail and no container starts) | `nonLazyLine` in micromark-extension-directive | packages/talata/src/ext | yes (fuzz)
- Fuzz an extension with several seeds of 100,000 in parallel after each fix, then once with 1,000,000 | single runs missed classes that the next seed found | packages/talata/test/fuzz | no

## Verification

- Fast check `pnpm --filter talata test && (cd packages/talata && npx tsc --noEmit -p .) && npx oxlint && npx oxfmt --check`: pass. 27 files, 6391 tests (the 260 reference inputs and the corpus with and without GFM included). oxlint needs `dist/` for `.github/scripts/smoke.mjs`; run after a build, it shows only two `max-depth` warnings in the ported `syntax.ts` and `entities.ts`.
- `pnpm --filter benchmark corpus && pnpm --filter benchmark interleaved && pnpm --filter benchmark size` (uptime load 2.2 at start, 5.0 at end): talata 17.82x (readmes), 19.44x (node fs.md), 22.84x (CHANGELOG_V22) faster than "mdast + gfm". Main entry 33016 bytes gzip (limit 33112). `talata/directive` alone 20153 bytes gzip.
- `test/ext-api-bundle.test.ts`: pass, no `talata:directive` in the main entry.
- `grep -rn "as unknown as" src/ext/directive`: three, each building an mdast node.
- Fuzz, `pnpm fuzz --count 1000000 --seed <S> --all` (GFM, frontmatter, math, directive): NOT clean. Final run, seed 20261106: 1,000,000 compared, 4 failures, 675 s. Inputs: `>:::a\n>>+ +\n>\n>`, `-\n  :::é{k=""}\n  - ```\n\t\n<`, `-\n  1) :::a\n     :::c\n\r    2)`, `1. +\n     :::b[[]]\n     :::b\n\n    +`. Earlier runs on earlier code: seed 20261103 4 failures, seed 20261104 13, seed 20261105 over 30 (most from one wrong guess, `[^ e]:`, fixed). Each run finds new classes, all with a directive inside a quote or list item and a blank or last line. The old seeds 77 (no GFM) and 5 (GFM), 100,000 each: 0 failures.

## Size

- Estimated L, actual L. Most of the time went to container ends inside quotes and lists, found by the fuzzer.

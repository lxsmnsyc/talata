# Outcome: ext-directive

## Built

- `talata/directive` is back: the export and the `micromark-extension-directive` 4.0.0 / `mdast-util-directive` 3.1.1 dev dependencies in `packages/talata/package.json`, the `src/directive.ts` entry in `tsdown.config.ts`, `benchmark/size/size.mjs`, `test/parsers.ts` (`'directive'` in `ExtensionName`), `test/fuzz/ext.ts`, `test/ext-api.test.ts`, `test/ext-api-bundle.test.ts` and the lock file.
- `directive()` (`packages/talata/src/directive.ts`, named and default export, no options) returns `cachedExtension('directive', ...)` with `name: 'talata:directive'`.
- Rules in `packages/talata/src/ext/directive/`, registered in `index.ts`:
  - `container.ts`: `directiveContainer` (block, `:`, 340) and `directiveScope` (block, no triggers, priority 1, never starts a block; see Gotchas).
  - `leaf.ts`: `directiveLeaf` (block, `:`, 345).
  - `text.ts`: `directiveText` (inline, `:`, 80). Labels parse in place with `parseInline`.
  - `spread.ts`: the transform `directiveSpread` (list items with a blank line inside a container directive are spread). It runs only when the parse made a container directive.
  - `syntax.ts` (name, label, attributes), `entities.ts` (character references in attribute values), `labels.ts` (label parsing, trailing whitespace), `scopes.ts` (which definitions text inside or around a directive can see).
- The container uses the contract v3 hooks:
  - `willClose`: when a container starts outside, the directive closes the blocks inside it. `keepsLineEnding` is true only when every container between them and the outermost closing directive continues over an empty line (`segmentKeeps`); `state.unmatched` is off while they close.
  - `getBlock`: `getInside` walks the open blocks above the directive. `continuesAfter` walks the blocks below it (`continuesNext`) to decide whether the next line continues them.
  - `endContent(this)`: called when micromark reads the next line as lazy (the containers around do not continue, and no container starts), or before a final line ending inside a quote. The core rules then read the line through `isLastLine`.
- Container `start` closes the open directives that did not match the line before it queues its label (`keepsLineEnding` false, as `attach` does for a `startsContainer: false` block). The inline pass then leaves their scope before it reads the label.
- `closeEnds` (ends of containers inside the directive on a line with a prefix around it): blocks in a quote that ends on a blank line end at the line start. A quote after a list item ends at the line end only when no whitespace is left after the item's indent. When the prefix is a footnote definition's indent, an item ends at least at the line start. Blank lines after an inner quote fix the item's end (`raiseIndentEnd`).
- `spread.ts`: also looks at directives in a footnote definition in the item. A footnote definition that ends at a line start holds the blank lines after it. An item in a directive that ends at a line start after a blank line is spread.
- `labels.ts`: a hard break that ends a text directive label before an empty last line ends at the line start, as text does.
- Removed from the first pass: `directiveEnd` and its guess on the current line, `directiveHtml`, the quote-only last-line branch, `takeBlankLine`, and the replayed prefixes (`measurePrefix`, `runs`, `nextStartsContainer`, `isLazy`).
- Fuzz hook `packages/talata/test/fuzz/ext-directive.ts`: `ready: true`, with `block` and `inline` generators.
- Tests in `packages/talata/test/directive.test.ts`: the 260 inputs from the reference packages' tests (license note in the file), own cases, container cases (containers around and inside, every fuzz failure found so far), frontmatter with directives, and the benchmark corpus with `[directive]` and with `[frontmatter, math, directive]`, with and without GFM.

## Deviations

- Two parts beyond the three rules in the brief: the block rule `directiveScope` and the transform `directiveSpread`.
- Change request `roadmaps/v2/contracts/extension-directive.change-request.md` (v3 to v4, open). It replaces the text of the accepted v2-to-v3 request, which stays in git history. Three points, none blocking 0.3:
  1. There is no hook to ask whether a container starts on the next line. `isContainerStart` still guesses it, for the lookahead only.
  2. On the line after `endContent`, the core's `unmatched` false also reaches blocks that start outside. `directiveScope` closes the content first, then sets `unmatched` back to true.
  3. `continuesNext` copies the continuation rules of quotes, list items (`OpenList.item.size`) and footnote definitions.
  4. Container ends can only be set through `closeEnd` and `closedAt`, and list items ignore `closeEnd`. `raiseIndentEnd` writes the list item's `indentEnd` field through an `'indentEnd' in block` check.
- `continuesNext` and `closeEnds` read `OpenList` (default export of `src/blocks/list.ts`) and its `item` (`ItemState`) through `instanceof`, with no cast. The class is exported, but the contract does not list it.
- No casts to parser state. `grep -rn "as unknown as" src/ext/directive` finds three, each building an mdast node (`textDirective`, `leafDirective`, `containerDirective`).
- The container sets `state.container` while it calls `continue` with an empty line on the blocks inside it (`segmentKeeps`, `keepsFor`, `closeInside`, as `continuesOverEnd` does), then restores it.
- No core files changed.
- No changeset: release-0.3 adds the minor changeset for the new subpath.

## Stubs left

- None.

## Gotchas

- `directiveScope` runs first on every non-blank line of a parse that has the extension. It returns at once when no directive is open. For each open directive that did not match the line, it (a) closes the blocks inside when the directive called `endContent` on the line before, then sets `state.unmatched` back to true, and (b) takes the labels the content defined out of `definitions` and `footnotes` (`takeEarly`). A footnote definition on that line outside the directive then adds its label again (`[^a]\n>:::x\n>[^a]:\n[^a]:`). `willClose` takes the labels of definitions that close during its own `closeOpenBlocks`.
- `isContainerStart` is still a guess: a quote marker, a list marker that is not a thematic break, or, with GFM, `[^label]:` with no whitespace or brackets in the label. A wrong guess changes where the content ends.
- Every 1,000,000 run up to seed 20261110 found one to four new directive classes, all container or label ends at a blank or last line in a quote, list or footnote. Seed 20261111 was the first clean run. Expect a rare new one; fix it in `closeEnds` or `spread.ts` and add the input to `directive.test.ts`.
- `closedAt` from a new container cuts the directive's `openChild` chain before `willClose` runs. Walk the stack with `getBlock`, not the chain.
- The content of a directive is a document of its own for the reference. Its end depends on whether micromark reads the next line as lazy. Quote prefixes around the directive count for end positions of the containers inside only in some cases (`closeEnds`). On a blank line, a quote inside after a list item ends at the line start when whitespace is left after the item's indent.
- Definitions inside a directive are not known to text in the same or an earlier micromark pass (`scopes.ts`). A text directive label sees definitions up to one level deeper than its leaf.
- Leaf and container labels keep trailing spaces and tabs: the object queued with `state.inline` appends them in its `children` setter.

## Proposed learnings

- A container whose content is a document of its own decides its end from whether micromark reads the next line as lazy (the containers around fail and no container starts) | `nonLazyLine` in micromark-extension-directive | packages/talata/src/ext | yes (fuzz)
- Fuzz an extension with several seeds of 100,000 in parallel after each fix, then once with 1,000,000 | single runs missed classes that the next seed found | packages/talata/test/fuzz | no

## Verification

- Fast check `pnpm --filter talata test && (cd packages/talata && npx tsc --noEmit -p .) && npx oxlint && npx oxfmt --check`: pass. 29 files, 6109 tests: the 260 reference inputs, every fuzz input above, and the corpus with and without GFM. oxlint shows only two `max-depth` warnings, in the ported `syntax.ts` and `entities.ts`. Without `dist/` (before a build) it also reports the known `.github/scripts/smoke.mjs` errors.
- Acceptance fuzz, `cd packages/talata && pnpm fuzz --count 1000000 --seed 20261111 --all` (GFM, frontmatter, math, directive): 1,000,000 compared, 1 failure in 1142 s (machine load 5 to 14 from other sessions). That failure, `[^1]:>+\n    >\n    >` (list item `spread`), has no directive and reproduces on main with no extensions. It is the footnote bug that fix-footnote-spread owns. No directive differences.
- Earlier runs on this pass, each followed by a fix and a test case: 4 x 100,000 (seeds 301 to 304) 84 failures; 4 x 100,000 (311 to 314) 4; 4 x 100,000 (321 to 324) 0; 1,000,000 seed 20261107: 2; 20261108: 2; 20261109: 1; 20261110: 4 (3 shown, the same classes). Old failing inputs: the four of seed 20261106, seeds 77 and 5, and the v2-to-v3 change request examples all pass (in `directive.test.ts`).
- Full check (fast check, then `pnpm --filter benchmark corpus && pnpm --filter benchmark interleaved && pnpm --filter benchmark size`): pass. Interleaved, after a build (load 4.7 to 7.2): talata 17.66x (readmes), 20.41x (node fs.md), 26.81x (CHANGELOG_V22) faster than "mdast + gfm". The first interleaved run in the script skipped talata because `dist/` did not exist yet, so it was run again after `size` built it.
- `pnpm --filter benchmark size`: main entry 93905 bytes minified, 33178 bytes gzip (core-hooks-2 reported 33141; the main entry holds no directive code, and `test/ext-api-bundle.test.ts` passes). `talata/directive` alone: 19078 bytes gzip (first pass: 20153).
- `grep -rn "as unknown as" src/ext/directive`: three, each building an mdast node.

## Size

- Estimated L, actual L. The hooks removed the guesses, but each 1,000,000 run still found one to four new classes of container ends, which took five fuzz rounds.

## Landed

PR #20 merged into main as 724bfb7 (2026-11-02), after one fresh review (clean) and one round of review fixes (4959fe0).

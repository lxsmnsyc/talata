---
name: extension
version: 1
status: frozen
defined_by: ext-api
---

# Contract: extension

## Purpose

How an extension adds syntax to talata. Used by the subpaths `talata/frontmatter`, `talata/math`, `talata/directive` and later `talata/mdx`. Internal in 0.2: not documented for third parties. Paths are under `packages/talata/`. Built on `roadmaps/v1/contracts/parser-core.md` (v5); an extension is a bundle of rules of the types defined there.

## Interface

```ts
// src/ext/api.ts (types and one helper; imported only from subpath entries)
import type { BlockRule, ParagraphPrefixRule } from '../core/blocks';
import type { InlineRule } from '../core/inline';
import type { Transform } from '../core/transform';

interface Extension {
  name: string; // `talata:<subpath>`, e.g. `talata:math`
  blockRules?: BlockRule[];
  paragraphPrefixRules?: ParagraphPrefixRule[];
  inlineRules?: InlineRule[];
  transforms?: Transform[];
}

// Returns the object stored under `key`, creating it on first use.
function cachedExtension(key: string, create: () => Extension): Extension;

// src/index.ts (the unified plugin forwards the same object to fromMarkdown)
interface Options {
  gfm?: boolean;
  extensions?: Extension[]; // default []
}
```

Factories, one per subpath entry (each also a default export in `directive.ts` only; use the named export):

```ts
// src/frontmatter.ts
type Preset = 'toml' | 'yaml';
interface Info {
  close: string;
  open: string;
}
interface MatterProps {
  type: string;
  anywhere?: boolean | null | undefined;
}
type Matter =
  | (MatterProps & { marker: Info | string; fence?: never })
  | (MatterProps & { fence: Info | string; marker?: never });
type Options = Matter | Preset | (Matter | Preset)[]; // as micromark-extension-frontmatter 2.0.0
function frontmatter(options?: Options | null): Extension; // default 'yaml'

// src/math.ts
interface Options {
  singleDollarTextMath?: boolean | null | undefined;
} // as micromark-extension-math 3.1.0
function math(options?: Options | null): Extension;

// src/directive.ts (micromark-extension-directive 4.0.0 takes no options)
function directive(): Extension;
```

Test side (`test/parsers.ts`, `test/fuzz/ext.ts`):

```ts
type ExtensionName = 'frontmatter' | 'math' | 'directive';
interface ExtensionOptions { frontmatter?: FrontmatterOptions; math?: MathOptions }
parseReference(value, gfm, names?: ExtensionName[], options?: ExtensionOptions): Root  // reference with [gfm, ...names] micromark and mdast extensions
parseTalata(value, gfm, names?: ExtensionName[], options?: ExtensionOptions): Root     // fromMarkdown with the same names, from the subpath modules
talataExtensions(names, options?): Extension[]

interface ExtensionFuzz {                      // test/fuzz/ext-<name>.ts, default export
  name: ExtensionName;
  ready: boolean;                              // false: left out of both parsers
  nodeTypes: string[];                         // mdast types the reference produces for it
  start?: (random: Random) => string[];        // lines first in a document, chance 0.3
  block?: (random: Random, text: () => string) => string[]; // lines of a block, at any depth
  inline?: (random: Random, text: () => string) => string;  // inline piece; `text` makes label content
}
Features.extensions: ExtensionName[]           // set from the ready hooks in `supported` and `allFeatures()`
```

## Behavior

Registration and order:

- `extensions` is an ordered list. For one parse, the rule lists are the core lists (CommonMark, then GFM, as in `blockRules`, `paragraphPrefixRules`, `inlineRules`, `transforms`) followed by each extension's lists in list order. `createRegistry` then drops `gfm` rules when `gfm` is off, and sorts by `priority`, lower first, keeping registration order on ties.
- So at equal priority core and GFM rules run first, then the first extension's rules, then the next. Do not rely on ties. micromark runs the later extension first on the same character, so an extension node picks a distinct priority for each rule that shares a trigger character with another rule and checks the order against the reference with the fuzzer.
- Extension rules may set `gfm: true` and then register only with `gfm: true`; the 0.2 extensions do not.
- Transforms run after core and GFM transforms, in list order, after inline parsing.
- An empty or absent `extensions` gives the same tree as before this contract. Nothing about `Options.gfm` changes.

Priorities for the 0.2 extensions (core: blockquote 100, ATX 200, fenced code 300, HTML 400, setext 500, thematic break 600, list item 700, table 750, indented code 800; inline: GFM autolink literal 90, escape, entity, code span, emphasis 100, link 500). These are the starting values; the extension node may change them with a reason in its outcome.

| Rule                | Kind   | Triggers                                                       | Priority                                                                                                 | Interrupts paragraph                                              |
| ------------------- | ------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| frontmatter         | block  | first characters of the matter fences (`-+` for yaml and toml) | 50                                                                                                       | no (start of document); with `anywhere`, as the reference decides |
| math flow           | block  | `$`                                                            | 350                                                                                                      | yes                                                               |
| directive container | block  | `:`                                                            | 340                                                                                                      | yes                                                               |
| directive leaf      | block  | `:`                                                            | 345                                                                                                      | yes                                                               |
| math text           | inline | `$`                                                            | 100                                                                                                      | not applicable                                                    |
| directive text      | inline | `:`                                                            | 80, before GFM autolink literal (90) so `:name` after `http` is a directive as in `[gfm(), directive()]` | not applicable                                                    |

Caching:

- The registry cache lives in `src/index.ts`. Its key is the pair (`gfm`, the ordered list of extension objects compared by identity). The list is copied when stored, so changing the caller's array later has no effect. The cache holds the 8 most recently used keys (a hit moves to the back; the least recently used goes first), so nine extension combinations do not evict the plain registries.
- Factories return the same object for equal options, so a call such as `fromMarkdown(x, { extensions: [math()] })` in a loop hits the cache. A factory computes a string from its normalized options and returns `cachedExtension(key, create)`. Keys: `frontmatter:<JSON of options, default "yaml">`, `math:single` or `math:double`, `directive`. Normalize so that equal meaning gives an equal key (`math()` and `math({ singleDollarTextMath: true })` are the same). Two different option sets never share a key.
- A hand-made `Extension` object (tests) is cached by identity. Making a new object per call rebuilds the registry each time.

Bundling:

- Nothing under `src/ext/` and none of the three subpath modules is imported, at runtime, from `src/index.ts`, `src/unified.ts` or the core. A type-only import of `./ext/api` is allowed. The test `test/ext-api-bundle.test.ts` builds with tsdown and fails if `talata:frontmatter`, `talata:math`, `talata:directive` or `cachedExtension` appears in the main entry or `unified` output.
- Each extension's `name` is `talata:<subpath>` and stays in the built output; the test relies on it.
- Extension code lives in `src/ext/<name>/` and may import any read-only helper from `src/core/**`, `src/blocks/**` and `src/inline/**` (`advanceLine`, `matchedOnlyAtEnd`, `parseInline`, `point`, `isTracked` and so on). It does not edit them. Core files are changed only through a change request to parser-core.
- The output is one build with the entries `index`, `unified`, `frontmatter`, `math`, `directive`. Subpath entries share the chunk that holds `cachedExtension`. Add dependencies on nothing but `@types/mdast`. The mdast nodes `yaml`, `toml`, `math`, `inlineMath` and the three directive types are not in `@types/mdast`: build them as plain objects and cast through `unknown` to `RootContent` or `PhrasingContent` where needed.

Test plumbing:

- `test/ext-api-dom.d.ts` declares an empty global `HTMLElement`: the type package `katex`, used by `micromark-extension-math`'s types, names it and the project has no DOM lib.
- An extension node: sets `ready: true` in its `test/fuzz/ext-<name>.ts` when its fuzz run is clean, fills `start`, `block` and `inline` as it needs, and tests with `parseReference(value, gfm, [name], options)` against `parseTalata(...)`. It edits nothing else in `test/fuzz/`, `test/parsers.ts`, `package.json` or `tsdown.config.ts`. The fuzzer's skip filter lets the node types in `nodeTypes` through only when the extension is in `Features.extensions`.
- The fuzz uses default options only. Non-default options (toml, custom matters, `anywhere`, `singleDollarTextMath: false`) need unit tests through `parseReference(value, gfm, [name], options)` against `parseTalata`.
- In GFM tables `\|` stays inside `inlineMath`, because the reference's `unescapePipes` touches only `inlineCode`.
- Combined runs use the order `[frontmatter, math, directive]`, the order GOAL.md uses.

## What each reference extension needs, and where it fits

Checked against the reference trees (mdast-util-frontmatter 2.0.1, mdast-util-math 3.0.0, mdast-util-directive 3.1.1) and a throwaway container rule run against the reference for `:::` fences. The interfaces of parser-core v5 are enough for all three. No core change was needed and none is planned.

- frontmatter: a block rule on the first line. It starts only when `line.index === 0`, `state.container.name === 'root'`, `line.start === 0` and `line.nonBlank === line.start` (`anywhere: true` lifts only the `line.index === 0` and `line.start === 0` conditions and the paragraph-interrupt limit; the container must still be `root`: the reference never matches inside a quote or list, where `> x\n>\n> ---\n> a\n> ---` gives a thematic break and a heading, while `x\n---\na\n---` gives yaml at the root). `start` looks ahead and accepts only if a closing fence line exists; otherwise it returns undefined (`---\na\n` gives a thematic break and a paragraph, `---yaml\na\n---` a setext heading). Block `triggers` are ASCII only, so a custom matter whose fence starts with a non-ASCII character leaves `triggers` undefined. Leaf with `addLine` and `close`; node `{ type, value }` (`yaml`, `toml` or the custom type), no inline content. The text has had its BOM removed, so offset 0 is the first character after it.
- math flow: meta may not contain `$`, otherwise the line falls back to a paragraph, and `$$ x $$` on one line is inline math. A leaf like `src/blocks/code-fenced.ts` (fence of 2 or more `$`, meta on the opening line, closing fence, `matchedOnlyAtEnd(state, line)` and `state.closeKeepsLineEnding` as fenced code uses them). Node `{ type: 'math', value, meta, data: { hName: 'pre', hChildren: [...] } }`; `data` must equal the reference.
- math text: an inline rule on `$` that consumes through the closing run, like `src/inline/code-span.ts`, across the ranges of a paragraph. It needs no `resolve`. The `singleDollarTextMath` option is captured by the factory in the rule's closure. Node `inlineMath` with `data` as the reference. Escapes are handled by the escape rule first (`\$`).
- directive text: an inline rule on `:` with name, optional `[label]` and optional `{attributes}`. It checks the character before `:` through `state.source.text`. The label is inline content: the rule calls `parseInline(state, ranges)` on the sub-ranges inside the brackets (a fresh span, so emphasis does not cross the brackets) and counts nested brackets itself. The rule runs before the GFM literal rule at `:`. A name may not end in `_` or `-`. A label ends at the first unescaped `]` and ignores code spans.
- directive leaf: a one-line leaf on `::name[label]{attributes}`. The label goes in through `state.inline(node, ranges)` or `parseInline`. Can interrupt a paragraph, can sit in lists and quotes through the normal container prefix handling.
- directive container: a container block (`isContainer: true`, `acceptsLazy: false`) on `:::name[label]{attributes}`. `start` consumes the whole opening line. `continue` checks, before anything else, for a closing fence of at least as many colons and only blanks after it; on that line it consumes the line, records the end, marks itself done and returns true; the next line it returns false. Every other line it accepts without consuming. Inner containers and fenced code see the closing line empty and close, which matched the reference in the cases tried: closing fence while a fenced code, an indented code, a quote, a list and an HTML block are open; nested `::::` over `:::`; inside a block quote. The label becomes a first child paragraph with `data: { directiveLabel: true }`, built in `close` from `state.inline(labelNode, ranges)` at `start`. Implement `TrackedContainer` (`src/blocks/blockquote.ts`: `quoteLine`, `openChild`, `closeEnd`, `interruptLine`, `closedAt`) and `linkChild`/`closeAtNewContainer` as the list item rule does, so positions inside quotes and lists are right. The node must end at the end of the closing fence line (or its last child at end of file); a wrong end shows in a parent list item's `spread`.

## Stub

`src/frontmatter.ts`, `src/math.ts` and `src/directive.ts` export the factories with the reference's option types. Each returns `cachedExtension(key, () => ({ name }))`, an extension with no rules. The three fuzz hooks `test/fuzz/ext-<name>.ts` have `ready: false`. The extension nodes replace the empty extensions with rules in `src/ext/<name>/` and import them into their entry file.

## Changes

- v1 (2026-10-28): frozen by ext-api.

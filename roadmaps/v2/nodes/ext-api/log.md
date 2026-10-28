# Log: ext-api

- Registry cache: first tried a WeakMap trie keyed by extension identity; replaced by a list of 8 entries compared by identity, because it costs fewer bytes in the main entry. Main entry gzip 32600 -> 32749 bytes (+149).
- Factories memoize by normalized options (`cachedExtension`), so `math()` in a loop hits the registry cache.
- Probed the container directive against the reference with a throwaway container rule in a test (not kept): closing `:::` with fenced code, indented code, quote, list, HTML and nested `::::` open all matched. One mismatch was the probe node's own end position (list item `spread`), not an interface gap.
- Reference order for the same trigger: micromark runs the later extension first; talata runs the earlier one first at equal priority. Contract says use distinct priorities.
- `katex` types need a DOM `HTMLElement`; added `test/ext-api-dom.d.ts` instead of editing tsconfig.
- Fuzz: `Features.extensions` lists ready extensions only, so `--all` and the pending-fixture test stay unchanged until a node sets `ready`.

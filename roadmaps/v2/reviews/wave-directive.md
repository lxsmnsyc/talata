# Wave report: directive and 0.3 (2026-11-02)

Nodes closed: ext-directive (PR #20), fix-footnote-spread (c42a8ef), fix-directive-quote-end (f5ea091), fix-directive-nesting (027839f), release-0.3 (PR #26). The directive migration guide landed as PR #25. Version Packages PR #24 now holds 0.3.0.

What changed in the plan:

- Two fix nodes were added before release-0.3. Its first 1,000,000-document fuzz found two directive differences, and reviews of the fixes found seven more bug classes in deep nesting.
- The v3-to-v4 change request from ext-directive was accepted and deferred to core-hooks-3 (outline, before ext-mdx). The directive ships with four workarounds that the reviews judged sound.

Lessons:

- A clean 1,000,000-document fuzz did not prove the directive correct. Shape generators that nest quotes, list items, footnote definitions and directives up to 5 deep found differences the fuzz missed. Run such a generator for every container extension, ext-mdx included.
- Fuzz and benchmarks under heavy load give false throws and inflated speed figures. Rerun on a quiet machine before trusting either.
- A release with known differences is not an option. Fix first.
- Changesets for fixes to a subpath that was never released add noise to the changelog. Fold them into the minor entry.

# Log: ci

- Branch renamed to feat/ci. No .github/ existed.
- vitest 5 needs Node ^22.12 and tsdown ^22.18, so tests cannot run on Node 20. The check job runs Node 22 and 24. A separate job builds on 24 and smoke-tests dist on Node 20 (.github/scripts/smoke.mjs).
- Action majors from the GitHub releases API: checkout v7, setup-node v7, pnpm/action-setup v6, changesets/action v2.
- Added packageManager pnpm@12.14.0 to root package.json. pnpm 12 then wrote a packageManagerDependencies block at the top of pnpm-lock.yaml.
- actionlint 1.7.12 (brew): clean.
- Found on main, outside this node: `npx oxlint` reports 1 error (packages/talata/src/gfm/autolink-literal.ts:284) and `npx oxfmt --check` lists 13 files (roadmaps/** briefs and outcomes, packages/talata/package.json, packages/talata/test/inline.test.ts). The check workflow will fail on these until they are fixed. Not touched.

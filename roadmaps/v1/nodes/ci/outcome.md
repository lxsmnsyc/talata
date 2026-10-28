# Outcome: ci

## Built

- `.github/workflows/check.yml`. Triggers: `pull_request`, and `push` to `main`. Superseded runs on the same ref are cancelled. Permissions: `contents: read`.
  - Job `check`, matrix Node 22 and 24, `fail-fast: false`. Steps in order: checkout, pnpm setup, Node setup with the pnpm store cached, `pnpm install --frozen-lockfile`, `pnpm --filter benchmark corpus`, `npx oxlint`, `npx oxfmt --check`, `npx tsc --noEmit -p .` (in `packages/talata`), `pnpm --filter talata build`, `pnpm --filter talata test`.
  - Job `smoke-node20`: builds on Node 24, then switches to Node 20 and runs `node .github/scripts/smoke.mjs`. It loads `dist/index.js` and `dist/index.cjs`, parses a GFM document and checks the tree shape.
- `.github/workflows/release.yml`. Trigger: `push` to `main`, only when the repository is `lxsmnsyc/talata`. Permissions: `contents: write`, `pull-requests: write`, `id-token: write`. One job on Node 24 (npm 11, needed for trusted publishing): install, then `changesets/action@v2` with `version: pnpm cs:ver` and `publish: pnpm cs:pub`. It opens or updates the "Version packages" pull request, and publishes when that pull request merges. `NPM_CONFIG_PROVENANCE=true`. No secret is referenced; a commented line shows where `NODE_AUTH_TOKEN` goes for token publishing.
- `.github/scripts/smoke.mjs`.
- Root `package.json`: `"packageManager": "pnpm@12.14.0"` (needed by `pnpm/action-setup`). `pnpm-lock.yaml` gained a `packageManagerDependencies` block from pnpm 12.
- Pinned majors: actions/checkout v7, actions/setup-node v7, pnpm/action-setup v6, changesets/action v2.

## Deviations

- Node 20 is not in the test matrix. vitest 5 requires Node ^22.12 and tsdown ^22.18, so tests and build cannot run on 20. As the brief allows, Node 20 gets the built-`dist` smoke test instead. `engines` still says `>=20`. The tests themselves never run on Node 20.

## Stubs left

- None.

## Gotchas

- The check workflow will fail on `main` until two existing problems are fixed (outside this node's paths): `npx oxlint` reports 1 error at `packages/talata/src/gfm/autolink-literal.ts:284` (unnecessary type assertion), and `npx oxfmt --check` lists 13 files (the `roadmaps/**` briefs and outcomes, `packages/talata/package.json`, `packages/talata/test/inline.test.ts`). Fix them with `npx oxfmt` and by removing the assertion, or ignore `roadmaps/` in `oxfmt.config.ts`.
- The corpus step downloads three files from raw.githubusercontent.com. A network failure there fails the job.
- The release job publishes whatever `pnpm cs:pub` finds unpublished. Changesets skips versions already on npm.

## Setup the user must do before the first release

1. Create the GitHub repository `lxsmnsyc/talata` and push `main`.
2. Settings, Actions, General, Workflow permissions: choose "Read and write permissions" and tick "Allow GitHub Actions to create and approve pull requests". Without this the "Version packages" pull request cannot be opened.
3. Check an npm account can publish `talata` (`npm view talata` should say not found, or you own it). Turn on 2FA.
4. First publish of 0.1.0, one of:
   - Manual (recommended): once the version is 0.1.0, run `pnpm --filter talata build`, then `cd packages/talata && npm publish --access public` while logged in with `npm login`. The release workflow then skips that version. This publish has no provenance.
   - Token: create a granular npm access token with read and write on `talata` (or all packages, since the package does not exist yet), add it as repository secret `NPM_TOKEN`, and uncomment the `NODE_AUTH_TOKEN` line in `release.yml`. Provenance works on this path.
5. After the package exists on npm: package Settings, Trusted Publisher, add GitHub Actions with owner `lxsmnsyc`, repository `talata`, workflow `release.yml`, no environment.
6. If you used a token, delete the secret and the `NODE_AUTH_TOKEN` line once trusted publishing works.
7. Optional: protect `main` and require the `Check (Node 22)`, `Check (Node 24)` and `Smoke test built package (Node 20)` checks.
8. Fix the lint and format failures under Gotchas before the first push, so the check workflow starts green.

## Proposed learnings

- Run the check workflow's commands locally in order before changing it | the workflows cannot be tested without a remote | .github | no

## Verification

- `actionlint` 1.7.12: no output.
- Locally, in workflow order, on Node 22.16: corpus fetch ok; `npx tsc --noEmit -p .` ok; build ok; `pnpm --filter talata test` 19 files, 5004 tests passed; `npx oxlint` and `npx oxfmt --check` fail only on the existing problems under Gotchas (nothing in `.github/`).
- Smoke script passes on Node 20.20.2 (via `npx -y node@20`) and on Node 26.12.1.
- Node 24 and a GitHub-hosted runner were not available locally. The first real run is the orchestrator's check.

## Size

- Estimated M, actual M.

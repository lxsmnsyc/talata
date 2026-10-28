# Outcome: ci

## Built

- `.github/workflows/check.yml`. Triggers: `pull_request`, and `push` to `main`. Concurrency group `${{ github.workflow }}-${{ github.ref }}`; runs are cancelled only on pull requests. Permissions: `contents: read`. Actions use major tags (`@v7`, `@v6`) with `persist-credentials: false` and `package-manager-cache: false`, as in brumate.
  - Job `check`, matrix Node 22 and 24, `fail-fast: false`. Steps in order: `pnpm install --frozen-lockfile`, `pnpm --filter benchmark corpus`, `npx oxlint`, `npx oxfmt --check`, `npx tsc --noEmit -p .` (in `packages/talata`), `pnpm --filter talata build`, `pnpm --filter talata test`.
  - Job `smoke-node20`: builds on Node 24, then switches to Node 20 and runs `node .github/scripts/smoke.mjs`. The script loads `dist/index.js`, `dist/index.cjs`, `dist/unified.js` and `dist/unified.cjs`, parses a GFM document and checks the tree shape.
- `.github/workflows/release.yml`, copied from the seroval pattern (actions pinned to commit SHAs with version comments, harden-runner in audit mode). Trigger: `push` to `main`. Top-level `permissions: {}`; concurrency group `${{ github.workflow }}-${{ github.ref }}`, `cancel-in-progress: false`. Node 24. Four jobs:
  - `select-mode` (only when the repository is `lxsmnsyc/talata`; `contents: read`): `changesets/action/select-mode@v2`, then a guard step that turns mode `publish` into `none` while `packages/talata/package.json` says `0.0.0`.
  - `version` (`contents: write`, `pull-requests: write`): runs when mode is `version`; opens or updates the "chore: version packages" pull request.
  - `pack` (`contents: read`): runs when mode is `publish`; build, `pnpm --filter talata test`, then `changesets/action/pack@v2`.
  - `publish` (`contents: write`, `id-token: write`): `changesets/action/publish@v2` with the pack artifact and `create-github-releases: true`.
  - Only npm trusted publishing (OIDC). No `NPM_TOKEN`, `NODE_AUTH_TOKEN`, `registry-url` or `NPM_CONFIG_PROVENANCE`.
- `.github/scripts/smoke.mjs`.
- Root `package.json`: `"packageManager": "pnpm@12.14.0"` (read by `pnpm/action-setup`). `pnpm-lock.yaml` gained a `packageManagerDependencies` block from pnpm 12.
- SHAs for checkout (v7.0.1), pnpm/action-setup (v6.1.0), setup-node (v7.0.0), changesets/action (v2.1.2) and harden-runner (v2.22.1) are the ones seroval uses.

## What the first push to main does

`select-mode` runs `changeset publish-plan`, which treats a package that is not on npm as publishable. I ran it locally: with `talata@0.0.0` and no changesets it lists `talata@0.0.0` to publish, so select-mode would return `publish`. The guard step overrides that to `none` while the version is `0.0.0`, so `version`, `pack` and `publish` are skipped and nothing is built or published. The guard stays harmless after release. When a changeset is added, select-mode returns `version` and the pull request opens. When that pull request merges (version 0.1.0, no changesets left, not on npm), select-mode returns `publish`.

## Deviations

- Node 20 is not in the test matrix. vitest 5 requires Node ^22.12 and tsdown ^22.18, so tests and build cannot run on 20. Node 20 gets the built-`dist` smoke test instead. `engines` still says `>=20`.
- The `unified` default export is checked only for the ESM entry. Importing the CJS file from ESM exposes `module.exports` as `default`.

## Stubs left

- None.

## Gotchas

- actionlint does not check inputs of third-party actions. The changesets/action sub-action inputs were read from the v2.1.2 README and `action.yml`.
- The release `pack` job runs on `ubuntu-latest` with Node 24; the check job does not run the corpus download there, so corpus tests skip in the release run. The check workflow covers them.
- The corpus step in the check workflow downloads three files from raw.githubusercontent.com. A network failure fails the job.
- Unverified: whether `changesets/action/publish` with pnpm 12 does the npm OIDC exchange itself. It publishes the tarballs from `pack` and the job has `id-token: write`, as seroval's does.

## Setup trusted publishing needs

1. Create the GitHub repository `lxsmnsyc/talata` and push `main`.
2. Settings, Actions, General, Workflow permissions: "Read and write permissions", and tick "Allow GitHub Actions to create and approve pull requests". The `version` job cannot open its pull request without it.
3. First publish of 0.1.0 is manual (the user's decision). Order matters:
   1. Push `main`. The release run finds `talata@0.0.0`, the guard sets mode `none`, and nothing is published.
   2. Add a changeset and merge it. The `version` job opens the "chore: version packages" pull request. Do not merge it yet.
   3. Check out that pull request branch (or run `pnpm cs:ver` locally so `packages/talata/package.json` says 0.1.0), then `pnpm --filter talata build` and, in `packages/talata`, `npm publish --access public` while logged in with `npm login` and 2FA. This publish has no provenance.
   4. Merge the pull request. select-mode sees 0.1.0 on npm, returns `none`, and no job publishes. If the pull request is merged before the manual publish, the `publish` job runs without a trusted publisher and fails at the publish step; nothing is lost, but the failure is confusing.
4. On npmjs.com, package `talata`, Settings, Trusted Publisher, GitHub Actions: owner `lxsmnsyc`, repository `talata`, workflow `release.yml`, no environment. From then on every release is made by the workflow with no token.
5. Optional: protect `main` and require `Check (Node 22)`, `Check (Node 24)` and `Smoke test built package (Node 20)`.

## Proposed learnings

- Run the check workflow's commands locally in order before changing it | the workflows cannot be tested without a remote | .github | no

## Verification

- `actionlint` 1.7.12: no output.
- After rebasing onto main: `npx oxlint` and `npx oxfmt --check` are clean; `npx tsc --noEmit -p .` passes; `pnpm --filter talata test` passes (5003 tests, Node 22.16); build passes.
- Smoke script passes on Node 20.20.2 (`npx -y node@20`).
- `changeset publish-plan` run locally shows the `talata@0.0.0` plan described above.
- Node 24 and a GitHub-hosted runner were not available locally. The first real run is the orchestrator's check.

## Size

- Estimated M, actual M.

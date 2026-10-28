# Outcome: ci

## Built

- `.github/workflows/check.yml`. Triggers: `pull_request`, and `push` to `main`. Concurrency group `${{ github.workflow }}-${{ github.ref }}`; runs are cancelled only on pull requests. Permissions: `contents: read`. Actions use major tags (`@v7`, `@v6`) with `persist-credentials: false` and `package-manager-cache: false`, as in brumate.
  - Job `check`, matrix Node 22 and 24, `fail-fast: false`. Steps in order: `pnpm install --frozen-lockfile`, `pnpm --filter benchmark corpus`, `npx oxlint`, `npx oxfmt --check`, `npx tsc --noEmit -p .` (in `packages/talata`), `pnpm --filter talata build`, `pnpm --filter talata test`.
  - Job `smoke-node20`: builds on Node 24, then switches to Node 20 and runs `node .github/scripts/smoke.mjs`. The script loads `dist/index.js`, `dist/index.cjs`, `dist/unified.js` and `dist/unified.cjs`, parses a GFM document and checks the tree shape.
- `.github/workflows/release.yml`, a copy of brumate's release workflow with major tags, no harden-runner and no repository guard. Trigger: `push` to `main`. Top-level `permissions: {}`; concurrency `${{ github.workflow }}-${{ github.ref }}`. Node 24. Four jobs:
  - `select-mode` ("Select mode", `contents: read`): `changesets/action/select-mode@v2`.
  - `version` ("Create the version pull request", `contents: write`, `pull-requests: write`): runs when mode is `version`; `changesets/action/version@v2` opens or updates the "Version Packages" pull request (the action default title).
  - `pack` ("Build and pack", `contents: read`): runs when mode is `publish`; `pnpm --filter talata build`, `pnpm --filter talata test`, then `changesets/action/pack@v2`. Brumate runs `pnpm build` and `pnpm test`; talata's root has neither script.
  - `publish` ("Publish to npm", `contents: write`, `id-token: write`): `changesets/action/publish@v2` with the pack artifact and `create-github-releases: true`.
  - Only npm trusted publishing (OIDC). No `NPM_TOKEN`, `NODE_AUTH_TOKEN`, `registry-url` or `NPM_CONFIG_PROVENANCE`.
- `.github/scripts/smoke.mjs`.
- Root `package.json`: `"packageManager": "pnpm@12.14.0"` (read by `pnpm/action-setup`). `pnpm-lock.yaml` gained a `packageManagerDependencies` block from pnpm 12.

## What the first push to main does

`select-mode` runs `changeset publish-plan`, which treats a package that is not on npm as publishable. I ran it locally with no changesets: it listed `talata@0.0.0`, so select-mode would return `publish` and the run would try to publish 0.0.0. To avoid that, the 0.1.0 changeset (a minor bump) is committed right before the first push. Changesets are then pending, so select-mode returns `version` and the first runs open the "Version Packages" pull request. After it merges (0.1.0 not on npm), select-mode returns `publish`.

## Deviations

- Node 20 is not in the test matrix. vitest 5 requires Node ^22.12 and tsdown ^22.18, so tests and build cannot run on 20. Node 20 gets the built-`dist` smoke test instead. `engines` still says `>=20`.
- The `unified` default export is checked only for the ESM entry. Importing the CJS file from ESM exposes `module.exports` as `default`.
- `package-manager-cache: false` on every `setup-node` step follows brumate. The brief asked for the pnpm store to be cached; the workflows do not cache it.

## Stubs left

- None.

## Gotchas

- actionlint does not check inputs of third-party actions. The changesets/action sub-action inputs were read from the v2.1.2 README and `action.yml`.
- The release `pack` job runs on `ubuntu-latest` with Node 24; the check job does not run the corpus download there, so corpus tests skip in the release run. The check workflow covers them.
- The corpus step in the check workflow downloads three files from raw.githubusercontent.com. A network failure fails the job.
- Checked by example: `lxsmnsyc/brumate` uses `packageManager: pnpm@12.14.0` and the same changesets/action v2 four-job `release.yml`. `npm view brumate@0.3.0 dist.attestations` shows SLSA provenance, so `changesets/action/publish` with pnpm 12.14.0 and changesets/action v2 does the npm OIDC trusted-publishing exchange.

## Setup trusted publishing needs

Do these in order. `packages/talata/package.json` stays at 0.0.0, which is not on npm, so do not push the repository without a pending changeset: the first run would try to publish 0.0.0.

1. Done by the user: the name is claimed with `talata@0.0.0-stage`, published by hand, as brumate did.
2. On npmjs.com, package `talata`, Settings, Trusted Publisher, GitHub Actions: owner `lxsmnsyc`, repository `talata`, workflow `release.yml`, environment left blank. The `publish` job uses no environment.
3. Create the GitHub repository `lxsmnsyc/talata`. Settings, Actions, General, Workflow permissions: "Read and write permissions", and tick "Allow GitHub Actions to create and approve pull requests". The `version` job cannot open its pull request without it.
4. Commit the 0.1.0 changeset (a minor bump) on `main` right before the first push.
5. Push `main`. The first release runs go to version mode and open the "Version Packages" pull request.
6. Merge that pull request. It publishes 0.1.0 through OIDC, with no token.
7. Optional: protect `main` and require `Check (Node 22)`, `Check (Node 24)` and `Smoke test built package (Node 20)`.

Brumate was set up the same way: `0.0.0-stage` published by hand, and its first releases ran in version mode because changesets were pending.

## Proposed learnings

- Run the check workflow's commands locally in order before changing it | the workflows cannot be tested without a remote | .github | no

## Verification

- `actionlint` 1.7.12: no output.
- After rebasing onto main, on Node 26.12.1 (the shell default): `npx oxlint`, `npx oxfmt --check`, `npx tsc --noEmit -p .` and `pnpm --filter talata build`; all pass.
- `pnpm --filter talata test` on Node 22.16.0 (the nvm install): 5003 tests pass.
- Smoke script on Node 20.20.2 (`npx -y node@20`): passes. It also passes on 26.12.1.
- `changeset publish-plan` run locally with no changesets lists `talata@0.0.0`, as described above.
- Node 24 was not run locally; it is covered only by CI. No GitHub-hosted runner was available either. The first real run is the orchestrator's check.

## Size

- Estimated M, actual M.

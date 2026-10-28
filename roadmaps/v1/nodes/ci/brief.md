---
id: ci
title: CI workflows for tests and releases
status: active
priority: must
type: feature
outline: false
milestone: m3-release
target:
from:
size: M
spike: false
verify:
exclusive: []
fulfilled_by:
gate: true
added: 2026-10-28
owns:
  - .github/**
shared:
  - package.json
  - pnpm-lock.yaml
  - roadmaps/v1/contracts/*.change-request.md
reserves: []
provides: []
depends_on: []
---

# CI workflows for tests and releases

## Goal

GitHub Actions workflows for the public repository `lxsmnsyc/talata`: one that checks every pull request and push to `main`, and one that releases with changesets.

## Context

The repository is created and pushed when perf-pass merges (GOAL.md Decisions). It is public, so Actions minutes are free. There is no `.github/` folder yet. pnpm is 12.14.0 locally and the root `package.json` has no `packageManager` field; add one if `pnpm/action-setup` needs it. `.changeset/config.json` exists, with `baseBranch: main` and `access: public`.

Check workflow, on `pull_request` and on `push` to `main`:

- Install with the pnpm store cached, `--frozen-lockfile`.
- Lint (`npx oxlint`), format check (`npx oxfmt --check`), typecheck (`cd packages/talata && npx tsc --noEmit -p .`), build (`pnpm --filter talata build`) and tests (`pnpm --filter talata test`).
- Fetch the corpus first (`pnpm --filter benchmark corpus`), so the corpus tests run instead of skipping. The script copies READMEs from `node_modules` and downloads three files from GitHub.
- Run tests on the Node versions the package claims (`engines` says `>=20`). If the test tooling needs a newer Node than 20, test the oldest supported Node by importing the built `dist` in a small smoke script instead, and say so in the outcome.
- No fuzzing and no benchmarks in CI.
- Cancel superseded runs on the same branch (`concurrency`).

Release workflow, on `push` to `main`:

- Use `changesets/action`: open or update the "Version packages" pull request while changesets are pending, and publish to npm when that pull request merges.
- Publish with npm provenance (`id-token: write`). Prefer npm trusted publishing (OIDC). npm configures a trusted publisher only for a package that already exists, so the first 0.1.0 publish needs either an `NPM_TOKEN` secret or a manual `npm publish`. Write down which one the user has to set up, step by step, in the outcome. Do not add secrets yourself.
- Give the workflow the least permissions it needs (`contents: write`, `pull-requests: write`, `id-token: write`).

The workflows cannot run before the repository exists. Check them with `actionlint` (install it with Homebrew or `go run` if missing; it is not installed now) and by running every command they call locally, in the same order. The orchestrator watches the first real runs after the push and sends back failures.

## Acceptance

- [ ] `.github/workflows/` holds a check workflow and a release workflow, and `actionlint` reports nothing.
- [ ] Every command in the check workflow passes locally, in order, from a clean install.
- [ ] The outcome lists the npm setup the user must do before the first release.
- [ ] After the push, the check workflow passes on `main` (the orchestrator checks this).
- [ ] Fast check passes: `pnpm --filter talata test && (cd packages/talata && npx tsc --noEmit -p .) && npx oxlint`

## Sizing

M: two workflows and the npm publishing setup, verified only after the push.

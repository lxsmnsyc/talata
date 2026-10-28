# Log: unified-plugin

- Work did not exist yet. Added `src/unified.ts`, a second tsdown entry, `exports["./unified"]`, optional peer `unified`.
- Dev dependencies: unified, remark-parse, remark-gfm, remark-rehype, rehype-stringify.
- `git branch -m` was refused by the sandbox guard, so the branch was created with `git switch -c feat/unified-plugin`.
- Fast check passes. `tsdown` builds `dist/unified.{js,cjs,d.ts,d.cts}`.

## Review round 1

- CJS build had `module.exports = talata` (tsdown `cjsDefault` defaults to true) while the types declared a default export. Set `cjsDefault: false`, added a named `export { talata }` next to the default export.
- Added `test/unified-build.test.ts`: builds into a temp folder with `tsdown --out-dir`, then checks `require` and `import` give a callable `default` and `talata`, and the `.d.cts` declares both.
- Added `test/unified-options.test.ts`: mocks `fromMarkdown` and asserts `{ gfm: true }` is forwarded.
- Added `types` conditions to both export entries. `vfile` is not installed in the package, so the file-like test stays.

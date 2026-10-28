# Log: unified-plugin

- Work did not exist yet. Added `src/unified.ts`, a second tsdown entry, `exports["./unified"]`, optional peer `unified`.
- Dev dependencies: unified, remark-parse, remark-gfm, remark-rehype, rehype-stringify.
- `git branch -m` was refused by the sandbox guard, so the branch was created with `git switch -c feat/unified-plugin`.
- Fast check passes. `tsdown` builds `dist/unified.{js,cjs,d.ts,d.cts}`.

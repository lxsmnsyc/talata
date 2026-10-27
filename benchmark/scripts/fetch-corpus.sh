#!/bin/sh
# Downloads the benchmark corpus. It is not committed, because the files are
# other projects' documentation under their own licenses.
set -e
cd "$(dirname "$0")/.."
mkdir -p corpus/readmes corpus/large
i=0
for f in $(find ../node_modules/.pnpm -path '*/node_modules/*' -maxdepth 4 -iname 'readme.md' | sort); do
  cp "$f" "corpus/readmes/$i.md"
  i=$((i + 1))
done
echo "copied $i package READMEs"
cd corpus/large
curl -fsSL -o node-fs.md https://raw.githubusercontent.com/nodejs/node/main/doc/api/fs.md
curl -fsSL -o node-changelog-v22.md https://raw.githubusercontent.com/nodejs/node/main/doc/changelogs/CHANGELOG_V22.md
curl -fsSL -o vite-config.md https://raw.githubusercontent.com/vitejs/vite/main/docs/config/shared-options.md
echo "downloaded large files"

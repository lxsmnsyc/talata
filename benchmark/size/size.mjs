// Bundles talata and the reference stack with esbuild and prints the minified
// and gzipped sizes, for a Node build and a browser build.
//
//   node size/size.mjs [--no-build] [--json] [--keep <dir>]
//
// Both sides use the same settings: ESM, ES2020, minified, one file, GFM on,
// tree shaking on. The entry of each side exposes one function, `parse(text)`.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const benchmarkDir = resolve(here, '..');
const talataDir = resolve(benchmarkDir, '../packages/talata');

const args = process.argv.slice(2);
const json = args.includes('--json');
const keepAt = args.indexOf('--keep');
const keep = keepAt === -1 ? undefined : resolve(args[keepAt + 1]);

if (!args.includes('--no-build')) {
  const result = spawnSync('pnpm', ['build'], {
    cwd: talataDir,
    stdio: json ? 'ignore' : 'inherit',
  });
  if (result.status !== 0) {
    throw new Error('building talata failed');
  }
}

const sides = {
  talata: `import { fromMarkdown } from 'talata';
export const parse = (text) => fromMarkdown(text, { gfm: true });`,
  'mdast + gfm': `import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
export const parse = (text) =>
  fromMarkdown(text, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });`,
};

const platforms = ['node', 'browser'];
const rows = [];
for (const platform of platforms) {
  for (const [name, contents] of Object.entries(sides)) {
    const result = await build({
      stdin: { contents, resolveDir: benchmarkDir, loader: 'js' },
      bundle: true,
      minify: true,
      format: 'esm',
      target: 'es2020',
      platform,
      write: false,
      legalComments: 'none',
      logLevel: 'error',
    });
    const code = result.outputFiles[0].contents;
    if (keep) {
      mkdirSync(keep, { recursive: true });
      const file = name.replaceAll(' + ', '-').replaceAll(' ', '-');
      writeFileSync(join(keep, `${file}.${platform}.js`), code);
    }
    rows.push({
      platform,
      name,
      minified: code.length,
      gzip: gzipSync(code, { level: 9 }).length,
      brotli: brotliCompressSync(code).length,
    });
  }
}

// Each subpath entry on its own, so a growing extension shows apart from the main entry.
const subpaths = ['frontmatter', 'math', 'unified'];
const entryRows = [];
for (const subpath of subpaths) {
  const result = await build({
    stdin: {
      contents: `export * from 'talata/${subpath}';`,
      resolveDir: benchmarkDir,
      loader: 'js',
    },
    bundle: true,
    minify: true,
    format: 'esm',
    target: 'es2020',
    platform: 'neutral',
    external: ['unified'],
    write: false,
    legalComments: 'none',
    logLevel: 'error',
  });
  const code = result.outputFiles[0].contents;
  entryRows.push({
    entry: `talata/${subpath}`,
    minified: code.length,
    gzip: gzipSync(code, { level: 9 }).length,
  });
}

const kb = (bytes) => (bytes / 1000).toFixed(1) + ' KB';
if (json) {
  console.log(JSON.stringify({ rows, entries: entryRows }, null, 2));
} else {
  console.log('\nMinified, one ESM file, ES2020, GFM on (1 KB = 1000 bytes)\n');
  console.log('build    stack          minified     gzip        brotli');
  for (const row of rows) {
    console.log(
      row.platform.padEnd(8),
      row.name.padEnd(13),
      kb(row.minified).padStart(10),
      kb(row.gzip).padStart(10),
      kb(row.brotli).padStart(10),
    );
  }
  for (const platform of platforms) {
    const [ours, theirs] = rows.filter((row) => row.platform === platform);
    const ratio = (ours.gzip / theirs.gzip).toFixed(2);
    const verdict = ours.gzip < theirs.gzip ? 'smaller' : 'LARGER';
    console.log(`\n${platform}: talata gzip is ${ratio}x the reference (${verdict})`);
  }
  const main = rows.find((row) => row.platform === 'node' && row.name === 'talata');
  console.log(`\nmain entry (node): ${main.minified} bytes minified, ${main.gzip} bytes gzip`);
  console.log('\nsubpath entries on their own (they include the shared extension helper)\n');
  console.log('entry                 minified     gzip');
  for (const row of entryRows) {
    console.log(
      row.entry.padEnd(18),
      kb(row.minified).padStart(10),
      kb(row.gzip).padStart(10),
      `(${row.gzip} bytes gzip)`,
    );
  }
}

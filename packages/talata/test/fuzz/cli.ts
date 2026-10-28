// Differential fuzzer: random Markdown through talata and the reference parser.
//
// Usage, from packages/talata:
//   pnpm fuzz --count 100000 [--seed N] [--start I] [--no-gfm] [--all]
//             [--max-failures K] [--shrink-ms MS] [--no-save]
//
// --seed       run seed (default: random, printed). Document I of seed S is the
//              same every time, so `--seed S --start I --count 1` replays it.
// --all        compare every feature, not only the ones talata supports now.
// --no-save    do not write minimized failures to test/fuzz/fixtures.
//
// Exit code 0 when no difference was found, 1 on a difference or a throw,
// 2 on bad arguments. Needs a Node version that strips TypeScript types.
/* oxlint-disable no-console */
import { mkdirSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

// The sources import each other without file extensions, like the bundler
// does. This hook lets Node find the .ts files.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (!specifier.startsWith('.')) {
        throw error;
      }
      for (const suffix of ['.ts', '/index.ts']) {
        try {
          return nextResolve(specifier + suffix, context);
        } catch {
          // Try the next suffix.
        }
      }
      throw error;
    }
  },
});

function readNumber(args: string[], name: string, fallback: number): number {
  const at = args.indexOf(name);
  if (at === -1) {
    return fallback;
  }
  const value = Number(args[at + 1]);
  if (!Number.isInteger(value) || value < 0) {
    console.error(`${name} needs a non-negative integer`);
    process.exit(2);
  }
  return value;
}

const args = process.argv.slice(2);
const known = new Set([
  '--count',
  '--seed',
  '--start',
  '--max-failures',
  '--shrink-ms',
  '--no-gfm',
  '--all',
  '--no-save',
]);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg.startsWith('--') && !known.has(arg)) {
    console.error(`unknown option ${arg}`);
    process.exit(2);
  }
}

const base = import.meta.url;
// Loaded here, after the hook above is in place.
const { supported, allFeatures } = await import('./features');
const { hashText } = await import('./random');
const { runFuzz } = await import('./run');

const count = readNumber(args, '--count', 10000);
const seed = readNumber(args, '--seed', Math.floor(Math.random() * 0xffffffff));
const start = readNumber(args, '--start', 0);
const maxFailures = readNumber(args, '--max-failures', 3);
const shrinkBudget = readNumber(args, '--shrink-ms', 5000);
const gfm = !args.includes('--no-gfm');
const features = args.includes('--all') ? allFeatures() : supported;

console.log(
  `fuzz: ${count} documents, seed ${seed}, start ${start}, gfm ${gfm}${args.includes('--all') ? ', all features' : ''}`,
);
const began = Date.now();
const report = runFuzz({
  count,
  seed,
  start,
  gfm,
  features,
  maxFailures,
  shrinkBudget,
  onProgress: (done: number) => {
    console.error(`  ${done} documents`);
  },
});

for (const failure of report.reported) {
  console.log(`\nfailure at document ${failure.index} (${failure.kind})`);
  console.log(`  input: ${JSON.stringify(failure.minimized)}`);
  console.log(`  ${failure.message.split('\n').join('\n  ')}`);
  console.log(
    `  replay: --seed ${seed} --start ${failure.index} --count 1${gfm ? '' : ' --no-gfm'}`,
  );
  if (!args.includes('--no-save')) {
    const dir = new URL('./fixtures/', base);
    mkdirSync(dir, { recursive: true });
    const name = `${hashText(failure.minimized)}.json`;
    const body = { input: failure.minimized, gfm, kind: failure.kind, seed, index: failure.index };
    writeFileSync(new URL(name, dir), `${JSON.stringify(body, null, 2)}\n`);
    console.log(`  saved: test/fuzz/fixtures/${name}`);
  }
}

const skipped: string[] = [];
for (const reason of Object.keys(report.skipReasons)) {
  skipped.push(`${reason} ${report.skipReasons[reason]}`);
}
console.log(
  `\n${report.documents} documents, ${report.compared} compared, ${report.skipped} skipped` +
    `${skipped.length > 0 ? ` (${skipped.join(', ')})` : ''}, ${report.failures} failures,` +
    ` ${((Date.now() - began) / 1000).toFixed(1)} s`,
);
process.exit(report.failures > 0 ? 1 : 0);

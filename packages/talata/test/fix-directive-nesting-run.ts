// Large runs of the deep-nesting generator, compared to the reference.
//
// Usage, from packages/talata:
//   node test/fix-directive-nesting-run.ts [--seed N] [--depth D] [--per-shape K]
//
// Prints each input that differs with the directive extension, with and
// without GFM. Inputs that also differ without the extension are core bugs,
// listed apart.
/* oxlint-disable no-console */
import { registerHooks } from 'node:module';

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

Object.assign(globalThis, { __TALATA_TEST__: false });

function readNumber(args: string[], name: string, fallback: number): number {
  const at = args.indexOf(name);
  return at === -1 ? fallback : Number(args[at + 1]);
}

const args = process.argv.slice(2);
const seed = readNumber(args, '--seed', 1);
const depth = readNumber(args, '--depth', 5);
const perShape = readNumber(args, '--per-shape', 30);

const { parseReference, parseTalata } = await import('./parsers');
const { describeDiff, firstDiff } = await import('./tree-diff');
const { default: generateInputs } = await import('./fix-directive-nesting-inputs');

const inputs = generateInputs(seed, depth, perShape);
const started = performance.now();
let differences = 0;
let core = 0;
for (const value of inputs) {
  for (const gfm of [false, true]) {
    const found = describeDiff(
      firstDiff(parseReference(value, gfm, ['directive']), parseTalata(value, gfm, ['directive'])),
    );
    if (found === undefined) {
      continue;
    }
    if (
      describeDiff(firstDiff(parseReference(value, gfm), parseTalata(value, gfm))) === undefined
    ) {
      differences++;
      console.log(`${JSON.stringify(value)}, gfm ${gfm}: ${found}`);
    } else {
      core++;
      console.log(`core: ${JSON.stringify(value)}, gfm ${gfm}`);
    }
  }
}
const seconds = ((performance.now() - started) / 1000).toFixed(1);
console.log(
  `seed ${seed}, depth ${depth}: ${inputs.length} inputs, ${differences} differences, ${core} also without the extension, ${seconds} s`,
);

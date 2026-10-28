// Prints the first difference between talata's tree and the reference tree.
//
// Usage, from packages/talata:
//   node test/diff.ts <file.md> [--no-gfm]
//
// Exit code 0 when the trees are equal, 1 when they differ or talata throws,
// 2 on bad arguments. Needs a Node version that strips TypeScript types.
/* oxlint-disable no-console, typescript/no-unsafe-type-assertion */
import { readFileSync } from 'node:fs';
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

interface Parsers {
  parseReference: (value: string, useGfm: boolean) => unknown;
  parseTalata: (value: string, useGfm: boolean) => unknown;
}

interface TreeDiff {
  firstDiff: (expected: unknown, actual: unknown) => { path: string } | undefined;
  describeDiff: (found: { path: string } | undefined) => string | undefined;
}

const args = process.argv.slice(2);
const useGfm = !args.includes('--no-gfm');
const file = args.find((arg) => !arg.startsWith('--'));
if (file === undefined) {
  console.error('usage: node test/diff.ts <file.md> [--no-gfm]');
  process.exit(2);
}

const parsers = (await import(new URL('./parsers.ts', import.meta.url).href)) as Parsers;
const treeDiff = (await import(new URL('./tree-diff.ts', import.meta.url).href)) as TreeDiff;

const value = readFileSync(file, 'utf8');
const expected = parsers.parseReference(value, useGfm);
let actual: unknown;
try {
  actual = parsers.parseTalata(value, useGfm);
} catch (error) {
  console.log(`talata threw: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
const message = treeDiff.describeDiff(treeDiff.firstDiff(expected, actual));
if (message === undefined) {
  console.log('equal');
} else {
  console.log(message);
  process.exit(1);
}

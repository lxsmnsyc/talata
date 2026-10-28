import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Runtimes without a DOM get the table build, as decode-named-character-reference
// does. The order matters: the first matching condition wins.
const noDom = ['convex', 'deno', 'edge-light', 'react-native', 'worker', 'workerd'];

const pack: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const exported: unknown = Reflect.get(asObject(pack), 'exports') as unknown;

function asObject(value: unknown): object {
  return typeof value === 'object' && value !== null ? value : {};
}

function get(value: unknown, key: string): unknown {
  return Reflect.get(asObject(value), key);
}

describe('export conditions', () => {
  for (const [entry, name] of [
    ['.', 'index'],
    ['./unified', 'unified'],
  ]) {
    it(`${entry}: no-DOM runtimes come before browser, and browser before import`, () => {
      const conditions: unknown = get(exported, entry);
      const keys = Object.keys(asObject(conditions));
      expect(keys.slice(0, noDom.length)).toEqual(noDom);
      expect(keys.indexOf('browser')).toBe(noDom.length);
      expect(keys.indexOf('import')).toBeGreaterThan(keys.indexOf('browser'));
      expect(get(conditions, 'browser')).toEqual({
        types: `./dist/${name}.d.ts`,
        default: `./dist/browser/${name}.js`,
      });
      for (const condition of noDom) {
        expect(get(conditions, condition)).toEqual({
          import: get(conditions, 'import'),
          require: get(conditions, 'require'),
          default: get(conditions, 'default'),
        });
      }
    });
  }
});

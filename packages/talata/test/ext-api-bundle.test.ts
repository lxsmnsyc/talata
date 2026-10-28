import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const names = ['frontmatter', 'math', 'directive'];
const build = { out: '' };

beforeAll(() => {
  build.out = mkdtempSync(join(tmpdir(), 'talata-ext-'));
  execFileSync('npx', ['tsdown', '--out-dir', build.out], { cwd: root, stdio: 'pipe' });
}, 60_000);

afterAll(() => {
  rmSync(build.out, { recursive: true, force: true });
});

// The text of a built file and of every file it imports or requires, as a bundler would load it.
function closure(file: string, seen = new Set<string>()): string {
  if (seen.has(file)) {
    return '';
  }
  seen.add(file);
  const code = readFileSync(file, 'utf8');
  let all = code;
  for (const match of code.matchAll(/(?:from|require\()\s*["'](\.[^"']+)["']/g)) {
    const next = resolve(dirname(file), match[1]);
    if (existsSync(next)) {
      all += closure(next, seen);
    }
  }
  return all;
}

describe('main entry', () => {
  for (const file of ['index.js', 'index.cjs', 'unified.js', 'unified.cjs']) {
    it(`holds no extension code in ${file}`, () => {
      const code = closure(join(build.out, file));
      expect(code.length).toBeGreaterThan(1000);
      for (const name of names) {
        expect(code).not.toContain(`talata:${name}`);
      }
      expect(code).not.toContain('cachedExtension');
    });
  }

  it('holds no import of src/ext in the source', () => {
    const source = readFileSync(join(root, 'src/index.ts'), 'utf8');
    for (const match of source.matchAll(/^import (type )?[^\n]*from '([^']+)'/gm)) {
      if (!match[0].startsWith('import type')) {
        expect(match[2]).not.toMatch(/ext\//);
      }
    }
  });
});

describe('subpath entries', () => {
  for (const name of names) {
    it(`talata/${name} builds for ESM, CJS and types`, async () => {
      for (const file of [`${name}.js`, `${name}.cjs`, `${name}.d.ts`, `${name}.d.cts`]) {
        expect(existsSync(join(build.out, file))).toBe(true);
      }
      const esm: unknown = await import(pathToFileURL(join(build.out, `${name}.js`)).href);
      const cjs: unknown = createRequire(import.meta.url)(join(build.out, `${name}.cjs`));
      for (const mod of [esm, cjs]) {
        const factory: unknown = Reflect.get(Object(mod), name);
        expect(typeof factory).toBe('function');
        if (typeof factory !== 'function') {
          throw new TypeError(`${name} is not exported`);
        }
        const extension: unknown = Reflect.apply(factory, undefined, []);
        expect(Reflect.get(Object(extension), 'name')).toBe(`talata:${name}`);
      }
    });

    it(`talata/${name} holds its extension name`, () => {
      expect(closure(join(build.out, `${name}.js`))).toContain(`talata:${name}`);
    });
  }

  it('are in package.json exports with the shape of "."', () => {
    const pkg: unknown = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const exportsField: unknown = Reflect.get(Object(pkg), 'exports');
    for (const name of names) {
      expect(Reflect.get(Object(exportsField), `./${name}`)).toEqual({
        import: { types: `./dist/${name}.d.ts`, default: `./dist/${name}.js` },
        require: { types: `./dist/${name}.d.cts`, default: `./dist/${name}.cjs` },
        default: `./dist/${name}.js`,
      });
    }
  });
});

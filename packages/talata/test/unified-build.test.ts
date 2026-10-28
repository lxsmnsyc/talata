import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
let out = '';

// Builds the real output into a temporary folder, so a missing dist/ cannot hide a problem.
beforeAll(() => {
  out = mkdtempSync(join(tmpdir(), 'talata-dist-'));
  execFileSync('npx', ['tsdown', '--out-dir', out], { cwd: root, stdio: 'pipe' });
}, 60_000);

afterAll(() => {
  rmSync(out, { recursive: true, force: true });
});

function exportsOf(value: unknown): Record<string, unknown> {
  if (typeof value === 'function' || (typeof value === 'object' && value !== null)) {
    return Object.fromEntries(Object.entries(value));
  }
  return {};
}

describe('built talata/unified', () => {
  it('has a default and a named export in CJS', () => {
    const mod = exportsOf(createRequire(import.meta.url)(join(out, 'unified.cjs')));
    expect(typeof mod.default).toBe('function');
    expect(mod.talata).toBe(mod.default);
  });

  it('has a default and a named export in ESM', async () => {
    const mod = exportsOf(await import(pathToFileURL(join(out, 'unified.js')).href));
    expect(typeof mod.default).toBe('function');
    expect(mod.talata).toBe(mod.default);
  });

  it('declares the default export in the CJS types', () => {
    const types = readFileSync(join(out, 'unified.d.cts'), 'utf8');
    expect(types).toContain('talata as default');
    expect(types).toContain('function talata');
  });
});

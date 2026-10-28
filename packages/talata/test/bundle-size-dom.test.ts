// @vitest-environment happy-dom
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import decodeDom from '../src/inline/entities.browser';
import decodeTable from '../src/inline/entities';

// The names come from the reference's own list.
const fromMarkdown = createRequire(import.meta.url).resolve('mdast-util-from-markdown');
const module: unknown = await import(
  pathToFileURL(createRequire(fromMarkdown).resolve('character-entities')).href
);
const list: unknown = Reflect.get(Object(module), 'characterEntities');
const names = Object.keys(Object(list));

describe('browser entity decoder under happy-dom', () => {
  it('decodes every name as the Node table does', () => {
    expect(names.length).toBe(2125);
    const different: string[] = [];
    for (const name of names) {
      if (decodeDom(name) !== decodeTable(name)) {
        different.push(name);
      }
    }
    expect(different).toEqual([]);
  });

  it('keeps `semi`, which decodes to a semicolon', () => {
    expect(decodeDom('semi')).toBe(';');
  });

  it('rejects names without a semicolon form, unknown names and partial matches', () => {
    // `notit` decodes to the legacy `not` plus `it;`, so the DOM text ends in `;`.
    for (const name of ['', 'notit', 'ampfoo', 'Aacut', 'zzzz', 'fjlig2', 'AMP;', 'amp2']) {
      expect(decodeDom(name)).toBeUndefined();
      expect(decodeTable(name)).toBeUndefined();
    }
  });
});

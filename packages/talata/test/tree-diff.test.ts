import { describe, expect, it } from 'vitest';
import { describeDiff, firstDiff } from './tree-diff';

// These run ungated. A helper that wrongly says "equal" would make every
// flag-gated suite pass without checking anything.
describe('firstDiff', () => {
  it('returns undefined for equal trees', () => {
    const tree = { type: 'root', children: [{ type: 'text', value: 'a', position: { x: 1 } }] };
    const copy = { type: 'root', children: [{ type: 'text', value: 'a', position: { x: 1 } }] };
    expect(firstDiff(tree, copy)).toBeUndefined();
    expect(describeDiff(firstDiff(tree, copy))).toBeUndefined();
  });

  it('reports a nested object difference with its path', () => {
    const expected = { children: [{ children: [{ value: 'a' }] }] };
    const actual = { children: [{ children: [{ value: 'b' }] }] };
    expect(firstDiff(expected, actual)).toEqual({
      path: 'root.children[0].children[0].value',
      expected: 'a',
      actual: 'b',
    });
  });

  it('reports the first difference in order', () => {
    const found = firstDiff({ a: 1, b: 2 }, { a: 3, b: 4 });
    expect(found?.path).toBe('root.a');
  });

  it('reports a differing array element', () => {
    expect(firstDiff({ list: [1, 2, 3] }, { list: [1, 5, 3] })).toEqual({
      path: 'root.list[1]',
      expected: 2,
      actual: 5,
    });
  });

  it('reports an extra array element', () => {
    expect(firstDiff({ list: [1] }, { list: [1, 2] })).toEqual({
      path: 'root.list[1]',
      expected: undefined,
      actual: 2,
    });
  });

  it('reports a missing array element', () => {
    expect(firstDiff({ list: [1, 2] }, { list: [1] })).toEqual({
      path: 'root.list[1]',
      expected: 2,
      actual: undefined,
    });
  });

  it('reports a missing key as (missing)', () => {
    const found = firstDiff({ a: 1, b: 2 }, { a: 1 });
    expect(found).toEqual({ path: 'root.b', expected: 2, actual: undefined });
    expect(describeDiff(found)).toBe('root.b\n  reference: 2\n  talata:    (missing)');
  });

  it('reports an extra key', () => {
    const found = firstDiff({ a: 1 }, { a: 1, b: 2 });
    expect(found).toEqual({ path: 'root.b', expected: undefined, actual: 2 });
    expect(describeDiff(found)).toBe('root.b\n  reference: (missing)\n  talata:    2');
  });

  it('tells null from undefined', () => {
    expect(firstDiff({ a: null }, { a: undefined })?.path).toBe('root.a');
    expect(firstDiff({ a: undefined }, { a: null })?.path).toBe('root.a');
    expect(firstDiff(null, undefined)?.path).toBe('root');
  });

  it('tells an object from an array', () => {
    expect(firstDiff({ a: [] }, { a: {} })?.path).toBe('root.a');
    expect(firstDiff({ a: {} }, { a: [] })?.path).toBe('root.a');
  });

  it('treats a key set to undefined as missing', () => {
    expect(firstDiff({ a: 1 }, { a: 1, b: undefined })).toBeUndefined();
    expect(firstDiff({ a: 1, b: undefined }, { a: 1 })).toBeUndefined();
  });

  it('tells a different type apart', () => {
    expect(firstDiff({ a: 1 }, { a: '1' })?.path).toBe('root.a');
  });
});

describe('describeDiff', () => {
  it('clips long values', () => {
    const found = firstDiff({ a: 'x'.repeat(1000) }, { a: 'y' });
    expect(describeDiff(found)).toContain('... (1002 chars)');
  });
});

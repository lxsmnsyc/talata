import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import decodeNamed from '../src/inline/entities';

// The reference is a dependency of a dependency, so resolve it from there.
const fromMarkdown = createRequire(import.meta.url).resolve('mdast-util-from-markdown');
const fromReference = createRequire(fromMarkdown);
const referencePackage = fromReference.resolve('decode-named-character-reference');
async function load(file: string, key: string): Promise<unknown> {
  const module: unknown = await import(pathToFileURL(file).href);
  return Reflect.get(Object(module), key);
}
const decodeFunction = await load(referencePackage, 'decodeNamedCharacterReference');
const entitiesObject = await load(fromReference.resolve('character-entities'), 'characterEntities');
if (typeof decodeFunction !== 'function' || typeof entitiesObject !== 'object') {
  throw new TypeError('the reference packages changed shape');
}
const reference = (name: string): unknown => Reflect.apply(decodeFunction, undefined, [name]);
function decodeReference(name: string): string | false {
  const value = reference(name);
  return typeof value === 'string' ? value : false;
}
const entities: object = entitiesObject ?? {};

describe('compact entity table', () => {
  const names = Object.keys(entities);

  it('has all 2,125 names', () => {
    expect(names.length).toBe(2125);
  });

  it('decodes every name as the reference does', () => {
    const different: string[] = [];
    for (const name of names) {
      const expected = decodeReference(name);
      if (expected === false || decodeNamed(name) !== expected) {
        different.push(name);
      }
    }
    expect(different).toEqual([]);
  });

  it('rejects names the reference rejects', () => {
    for (const name of ['', 'amp2', 'AMP;', 'notit', 'Aacut', 'zzzz', 'fjlig2', 'constructor']) {
      expect(decodeNamed(name)).toBe(decodeReference(name) || undefined);
    }
  });
});

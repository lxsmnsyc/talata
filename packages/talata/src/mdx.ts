import { cachedExtension } from './ext/api';
import type { Extension } from './ext/api';
import createMdx from './ext/mdx';
import { createJs } from './ext/mdx/acorn';
import type { Acorn, AcornOptions } from './ext/mdx/acorn';

export { MdxError } from './ext/mdx/error';
export type { Acorn, AcornOptions } from './ext/mdx/acorn';

/** Options of `mdx`, as `micromark-extension-mdxjs` takes them. */
export interface Options {
  /**
   * A JS parser: `acorn.Parser.extend(acornJsx())` from the `acorn` and
   * `acorn-jsx` packages. Without it, braces are counted and ESM is not
   * parsed, as `micromark-extension-mdx`.
   */
  acorn?: Acorn | null | undefined;
  /**
   * Options for acorn (default: `{ ecmaVersion: 2024, sourceType: 'module' }`).
   * `locations` is always on. `onComment` and `onToken` get the comments and
   * tokens of each program that parses, with places in the document, as
   * the reference calls them: twice for flow that interrupts a paragraph,
   * which micromark parses once to check the interrupt and once more.
   */
  acornOptions?: AcornOptions | null | undefined;
}

// One extension per acorn and equal options, so a parse in a loop with the
// same values finds its registry in the cache. Options that hold functions
// or arrays are not compared: each call makes a new extension, so the
// arrays of `onComment` and `onToken` get the comments and tokens.
const withAcorn = new WeakMap<Acorn, Map<string, Extension>>();

/**
 * A key for options made of plain values (strings, finite numbers,
 * booleans, null, undefined and plain objects), or undefined when they hold
 * anything else, such as a function or an array. `undefined` is kept, so
 * `{ ecmaVersion: undefined }` differs from `{}`.
 */
function keyOf(value: unknown): string | undefined {
  if (value === undefined) {
    return 'u';
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : undefined;
  }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    let key = '{';
    for (const name of Object.keys(value).sort()) {
      const part = keyOf(Reflect.get(value, name));
      if (part === undefined) {
        return undefined;
      }
      key += JSON.stringify(name) + ':' + part + ',';
    }
    return key + '}';
  }
  return undefined;
}

/**
 * MDX: JSX elements and expressions in flow and text, `<a b={c}>{d}</a>`.
 * Without options it matches `micromark-extension-mdx` with `mdast-util-mdx`,
 * which read expressions without a JS parser (braces are counted). With
 * `acorn` it matches `micromark-extension-mdxjs`: acorn decides where an
 * expression ends, `import` and `export` lines are ESM (`mdxjsEsm` nodes),
 * and expressions and ESM carry acorn's program in `data.estree`, with
 * places in the document, so `@mdx-js/mdx` can compile the tree. Turns off
 * indented code, autolinks and HTML, as `micromark-extension-mdx-md` does.
 * Bad syntax throws an `MdxError` with the reference's reason and place.
 */
export function mdx(options?: Options | null): Extension {
  const acorn = options?.acorn ?? undefined;
  const acornOptions = options?.acornOptions ?? undefined;
  if (acorn === undefined) {
    if (acornOptions !== undefined) {
      throw new Error('Expected an `acorn` instance passed in as `options.acorn`');
    }
    return cachedExtension('mdx', createMdx);
  }
  if (typeof acorn.parse !== 'function' || typeof acorn.parseExpressionAt !== 'function') {
    throw new Error('Expected a proper `acorn` instance passed in as `options.acorn`');
  }
  const key = keyOf(acornOptions);
  if (key === undefined) {
    return createMdx(createJs(acorn, acornOptions));
  }
  let byOptions = withAcorn.get(acorn);
  if (byOptions === undefined) {
    byOptions = new Map();
    withAcorn.set(acorn, byOptions);
  }
  let extension = byOptions.get(key);
  if (extension === undefined) {
    extension = createMdx(createJs(acorn, acornOptions));
    byOptions.set(key, extension);
  }
  return extension;
}

export default mdx;

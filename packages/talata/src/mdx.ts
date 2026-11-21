import { cachedExtension } from './ext/api';
import type { Extension } from './ext/api';
import createMdx from './ext/mdx';

export { MdxError } from './ext/mdx/error';

/**
 * MDX: JSX elements and expressions in flow and text, `<a b={c}>{d}</a>`.
 * Matches `micromark-extension-mdx` with `mdast-util-mdx`, which read
 * expressions without a JS parser (braces are counted). Turns off indented
 * code, autolinks and HTML, as `micromark-extension-mdx-md` does. Bad syntax
 * throws an `MdxError` with the reference's reason and place.
 */
export function mdx(): Extension {
  return cachedExtension('mdx', createMdx);
}

export default mdx;

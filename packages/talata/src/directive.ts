import { cachedExtension } from './ext/api';
import type { Extension } from './ext/api';
import createDirective from './ext/directive';

/**
 * Directives: `:name[label]{attributes}` in text, `::name` as a leaf and
 * `:::name` as a container. Matches `micromark-extension-directive` with
 * `mdast-util-directive`, which take no options.
 */
export function directive(): Extension {
  return cachedExtension('directive', createDirective);
}

export default directive;

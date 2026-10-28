import type { ExtensionFuzz } from './ext';

/**
 * Fuzz hook for `talata/frontmatter`. The extension node fills it in: it turns
 * `ready` on once talata matches the reference, and adds generators for the
 * syntax (see `ExtensionFuzz`). While `ready` is false the fuzzer leaves the
 * extension out of both parsers.
 */
const fuzz: ExtensionFuzz = {
  name: 'frontmatter',
  ready: false,
  nodeTypes: ['yaml', 'toml'],
};

export default fuzz;

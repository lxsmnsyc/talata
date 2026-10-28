import type { ExtensionFuzz } from './ext';

/** Fuzz hook for `talata/math`: inline `$` runs and `$$` fences. */
const fuzz: ExtensionFuzz = {
  name: 'math',
  ready: true,
  nodeTypes: ['math', 'inlineMath'],
  block(random, text) {
    const fence = random.pick(['$$', '$$', '$$$', '$$$$']);
    const lines = [
      fence + random.pick(['', '', ' tex', ' a b', 'x', ' $', '  \t', ' &amp;']),
      text(),
    ];
    if (random.chance(0.4)) {
      lines.push(random.pick(['', '  ' + text(), '$', '$$ x', '    $$']));
    }
    if (random.chance(0.8)) {
      lines.push(random.pick([fence, fence, fence + ' ', '  ' + fence, fence + '$', '$$']));
    }
    return lines;
  },
  inline(random, text) {
    const open = random.pick(['$', '$', '$$', '$$$']);
    const close = random.pick([open, open, open, '$', '$$', '']);
    const pad = random.pick(['', '', ' ', '  ']);
    return open + pad + text() + pad + close;
  },
};

export default fuzz;

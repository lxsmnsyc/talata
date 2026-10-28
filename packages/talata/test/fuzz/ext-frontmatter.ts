import type { ExtensionFuzz } from './ext';

const FENCES = ['---', '---', '---', '+++', '---  ', '--- ', '----', '---a', '-- -', '+++ '];
const CLOSES = ['---', '---', '+++', '--- ', '----', '', '  ---', '---a', '+++\t'];
const BODY = ['title: a', '', 'a: [b]', '# h', '> q', '- x', '---', '+++', '  ', '\tz', '***'];

/** Fuzz hook for `talata/frontmatter`: a matter at the start of a document. */
const fuzz: ExtensionFuzz = {
  name: 'frontmatter',
  ready: true,
  nodeTypes: ['yaml', 'toml'],
  start(random) {
    const lines = [random.pick(FENCES)];
    const count = random.int(4);
    for (let i = 0; i < count; i++) {
      lines.push(random.pick(BODY));
    }
    const close = random.pick(CLOSES);
    if (close !== '') {
      lines.push(close);
    }
    return lines;
  },
};

export default fuzz;

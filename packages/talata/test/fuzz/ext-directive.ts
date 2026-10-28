import type { ExtensionFuzz } from './ext';
import type { Random } from './random';

const names = ['a', 'b', 'note', 'x-y', 'a_b', 'é', '9', 'a-', '-a', 'a_', '\ta', 'b\tc'];
const spaces = ['', '', '', ' ', '  ', '\t'];
const attributeParts = [
  '#id',
  '.c',
  '.d',
  '#a.b',
  'k=v',
  'k="v w"',
  "k='v'",
  'k=&amp;',
  'k="&#35;&copy"',
  'k=&ampx',
  'k',
  'k=',
  'k=""',
  'class=x',
  'id=y',
  'k="a\\"b"',
  'k=a"b',
  'k=a=b',
  '.',
  '#',
  'a-b:c.d=1',
  '_x=1',
  'k = v',
  '__proto__=1',
  '=v',
  '"v"',
];

function pickName(random: Random): string {
  return random.pick(names);
}

function attributes(random: Random): string {
  if (!random.chance(0.35)) {
    return '';
  }
  const count = random.int(4);
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    parts.push(random.pick(attributeParts));
  }
  const glue = random.chance(0.9) ? ' ' : '  ';
  return (
    '{' +
    random.pick(spaces) +
    parts.join(glue) +
    random.pick(spaces) +
    (random.chance(0.95) ? '}' : '')
  );
}

function label(random: Random, text: () => string): string {
  if (!random.chance(0.4)) {
    return '';
  }
  const kinds = [
    () => text(),
    () => '',
    () => ' ',
    () => '*' + text() + '*',
    () => '[' + text() + ']',
    () => '\\]' + text(),
    () => '`' + text() + '`',
    () => text() + '  ',
    () => text() + ' \t',
    () => ':b[' + text() + ']',
    () => '[[' + text() + ']',
  ];
  return '[' + random.pick(kinds)() + (random.chance(0.95) ? ']' : '');
}

function head(random: Random, text: () => string): string {
  return pickName(random) + label(random, text) + attributes(random) + random.pick(spaces);
}

function inline(random: Random, text: () => string): string {
  const kind = random.int(6);
  if (kind === 0) {
    return ':' + pickName(random);
  }
  if (kind === 1) {
    return (
      random.pick(['\\', '\\::', 'a:', 'a::', '::', 'http', 'www.a.com']) + ':' + head(random, text)
    );
  }
  return ':' + head(random, text);
}

function fence(random: Random): string {
  return ':'.repeat(random.pick([3, 3, 3, 4, 5]));
}

function block(random: Random, text: () => string): string[] {
  const kind = random.int(10);
  if (kind < 2) {
    return ['::' + head(random, text)];
  }
  if (kind === 2) {
    // A text directive across lines.
    return [
      text() + ' :' + pickName(random) + '[' + text(),
      text() + ' ' + random.pick(['*', '', '_']) + text(),
      text() + ']' + (random.chance(0.5) ? '{k="v' : '{.a'),
      text() + (random.chance(0.5) ? '"}' : ' .b}') + ' ' + text(),
    ];
  }
  if (kind === 3) {
    return [text(), fence(random) + head(random, text), text()];
  }
  const size = fence(random);
  const lines: string[] = [random.pick(['', '', ' ', '  ']) + size + head(random, text)];
  const count = random.int(5);
  for (let i = 0; i < count; i++) {
    const part = random.int(12);
    if (part === 0) {
      lines.push('');
    } else if (part === 1) {
      lines.push(
        random.pick(['', ' ', '  ', '\t']) +
          random.pick([':::', '::::', '::', ':::::']) +
          random.pick(['', ' ']),
      );
    } else if (part === 2) {
      lines.push(...block(random, text));
    } else if (part === 3) {
      lines.push('```', text(), '```');
    } else if (part === 4) {
      lines.push('> ' + text());
    } else if (part === 5) {
      lines.push('- ' + text(), '  ' + text());
    } else if (part === 6) {
      lines.push('    ' + text());
    } else {
      lines.push(text());
    }
  }
  if (random.chance(0.7)) {
    lines.push(random.pick(['', '', '  ', ' ', '\t']) + size + random.pick(['', '', ' ', ':']));
  }
  return lines;
}

/** Fuzz hook for `talata/directive`. */
const fuzz: ExtensionFuzz = {
  name: 'directive',
  ready: true,
  nodeTypes: ['textDirective', 'leafDirective', 'containerDirective'],
  block,
  inline,
};

export default fuzz;

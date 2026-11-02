import { createRandom } from './fuzz/random';
import type { Random } from './fuzz/random';

// Generated inputs for container directives in deep nesting: every shape of
// 1 to `depth` containers (quote, list item, footnote definition, directive)
// with at least one directive. Each input picks random markers, indents,
// content and 1 to 3 last lines at a random depth. Used by
// `fix-directive-nesting.test.ts` and `fix-directive-nesting-run.ts`.

const KINDS = ['quote', 'item', 'footnote', 'directive'] as const;
type Kind = (typeof KINDS)[number];

const QUOTES = ['> ', '>', '>\t', ' > '];
const ITEMS = ['+ ', '* ', '- ', '-  ', '-   ', '-    ', '1) ', '1. ', '+    ', '-\t'];
const FOOTNOTE_INDENTS = ['    ', '    ', '\t', '  \t'];
const FENCES = [':::', ':::', '::::', ' :::', '  :::'];
const BODIES = [
  '',
  'a',
  '>',
  '> a',
  '>>',
  '+ >',
  '- a',
  '::x[a]',
  ':x[a] b',
  '| a |\n| - |',
  '```',
  '```\nb',
];
const ENDINGS = [
  '',
  'bare',
  ' ',
  '  ',
  '\t',
  'c',
  ':::',
  '::::',
  '>',
  '+ c',
  '| b |',
  '```',
  'lazy',
];

function addShapes(shapes: Kind[][], shape: Kind[], depth: number): void {
  if (shape.includes('directive')) {
    shapes.push(shape);
  }
  if (shape.length === depth) {
    return;
  }
  for (const kind of KINDS) {
    addShapes(shapes, [...shape, kind], depth);
  }
}

/** The prefix of later lines in a list item opened with `marker`. */
function continueItem(marker: string, random: Random): string {
  if (marker === '-\t') {
    return random.pick(['  ', '    ', '\t']);
  }
  const width = marker.length;
  if (width >= 4 && random.chance(0.2)) {
    return '\t' + ' '.repeat(width - 4);
  }
  return ' '.repeat(width);
}

function buildInput(shape: Kind[], random: Random): string {
  const lines: string[] = [];
  // The prefix of later lines inside each container, outermost first.
  const prefixes: string[] = [];
  let line = '';
  let prefix = '';
  let directives = 0;
  for (const kind of shape) {
    if (kind === 'quote') {
      const marker = random.pick(QUOTES);
      line += marker;
      prefix += random.chance(0.8) ? marker : '>';
    } else if (kind === 'item') {
      const marker = random.pick(ITEMS);
      line += marker;
      prefix += continueItem(marker, random);
    } else if (kind === 'footnote') {
      line += '[^1]: ';
      prefix += random.pick(FOOTNOTE_INDENTS);
    } else {
      line += random.pick(FENCES) + 'bcde'[directives % 4];
      directives++;
      lines.push(line);
      line = prefix;
    }
    prefixes.push(prefix);
  }
  let first = true;
  for (const part of random.pick(BODIES).split('\n')) {
    lines.push((first ? line : prefix) + part);
    first = false;
  }
  const count = 1 + random.int(3);
  for (let i = 0; i < count; i++) {
    const depth = random.int(shape.length + 1);
    const base = depth === 0 ? '' : prefixes[depth - 1];
    const ending = random.pick(ENDINGS);
    if (ending === 'bare') {
      lines.push(base.trimEnd());
    } else if (ending === 'lazy') {
      lines.push('lazy');
    } else {
      lines.push(base + ending);
    }
  }
  const lineEnding = random.chance(0.15) ? '\r\n' : '\n';
  return lines.join(lineEnding) + (random.chance(0.3) ? lineEnding : '');
}

/** Inputs for every shape up to `depth` containers, `perShape` each, without repeats. */
export default function generateInputs(seed: number, depth: number, perShape: number): string[] {
  const shapes: Kind[][] = [];
  addShapes(shapes, [], depth);
  const random = createRandom(seed);
  const seen = new Set<string>();
  for (const shape of shapes) {
    for (let i = 0; i < perShape; i++) {
      seen.add(buildInput(shape, random));
    }
  }
  return [...seen];
}

import type { Features } from './features';
import type { Random } from './random';

const WORDS = ['a', 'foo', 'bar', 'baz qux', 'Hello', 'x1', 'tab', 'é', '日本語', '😀', 'one two'];
// Characters that mean something to a Markdown parser. Used as noise.
const NOISE = ['*', '_', '[', ']', '(', ')', '!', '<', '>', '`', '~', '|', ':', '#', '-', '+', '='];
const SPACES = ['', ' ', '  ', '   ', '\t'];

interface Context {
  random: Random;
  on: Features;
}

function repeat(value: string, count: number): string {
  return value.repeat(count);
}

function spaces(random: Random, max: number): string {
  return repeat(' ', random.int(max + 1));
}

function word(random: Random): string {
  return random.pick(WORDS);
}

// Inline content

function inlineAtom(context: Context, depth: number): string {
  const { random, on } = context;
  const choices: string[] = ['word', 'word', 'word', 'noise'];
  if (on.inline) {
    choices.push(
      'emphasis',
      'strong',
      'code',
      'link',
      'image',
      'reference',
      'autolink',
      'html',
      'entity',
      'escape',
    );
  }
  if (on.strikethrough) {
    choices.push('delete');
  }
  if (on.autolinkLiteral) {
    choices.push('literal');
  }
  if (on.footnote) {
    choices.push('footnote');
  }
  const kind = random.pick(choices);
  const inner = (): string => (depth < 3 ? inlineText(context, depth + 1) : word(random));
  switch (kind) {
    case 'noise':
      return repeat(random.pick(NOISE), 1 + random.int(3));
    case 'emphasis':
      return `${random.pick(['*', '_'])}${inner()}${random.pick(['*', '_', ''])}`;
    case 'strong':
      return `${random.pick(['**', '__'])}${inner()}${random.pick(['**', '__', '*', ''])}`;
    case 'code': {
      const ticks = repeat('`', 1 + random.int(3));
      return `${ticks}${random.pick(['a', ' b ', 'c`d', '*x*'])}${ticks}`;
    }
    case 'link':
      return `[${inner()}](${random.pick(['/url', '<a b>', 'a(b)', '', '/u "t"', "/u 't'", '/u (t)'])})`;
    case 'image':
      return `![${inner()}](${random.pick(['/img.png', '/i "t"', ''])})`;
    case 'reference':
      return random.pick(['[foo]', '[foo][]', '[foo][bar]', '![foo]', '[x][foo]', '[Foo Bar]']);
    case 'autolink':
      return random.pick(['<http://a.b>', '<a@b.c>', '<mailto:x@y.z>', '<foo:bar>']);
    case 'html':
      return random.pick(['<span>', '</span>', '<a href="x">', '<!-- c -->', '<br/>', '<?p ?>']);
    case 'entity':
      return random.pick(['&amp;', '&#35;', '&#x26;', '&copy;', '&bogus;', '&#0;', '&']);
    case 'escape':
      return random.pick(['\\*', '\\\\', '\\[', '\\a', '\\`', '\\&', '\\_']);
    case 'delete':
      return `${random.pick(['~~', '~'])}${inner()}${random.pick(['~~', '~', ''])}`;
    case 'literal':
      return random.pick(['www.a.com', 'http://a.b/c', 'a@b.co', 'www.a.com/x_y)']);
    case 'footnote':
      return random.pick(['[^1]', '[^a]', '[^big note]']);
    default:
      return word(random);
  }
}

function inlineText(context: Context, depth: number): string {
  const { random } = context;
  const count = 1 + random.int(depth === 0 ? 5 : 3);
  let out = '';
  for (let i = 0; i < count; i++) {
    if (i > 0 && random.chance(0.8)) {
      out += ' ';
    }
    out += inlineAtom(context, depth);
  }
  return out;
}

function textLine(context: Context): string {
  return inlineText(context, 0);
}

// Block content. Every generator appends lines to `out`.

function blankLine(random: Random): string {
  return random.chance(0.8) ? '' : random.pick(['  ', ' ', '\t', '    ']);
}

function paragraph(context: Context, out: string[]): void {
  const { random } = context;
  const count = 1 + random.int(3);
  for (let i = 0; i < count; i++) {
    let line = (i === 0 ? spaces(random, 3) : spaces(random, 6)) + textLine(context);
    if (random.chance(0.2)) {
      line += random.pick(
        context.on.inline ? [' ', '  ', '   ', '\t', '\\'] : [' ', '  ', '   ', '\t'],
      );
    }
    out.push(line);
  }
}

function atxHeading(context: Context, out: string[]): void {
  const { random } = context;
  let line = spaces(random, 3) + repeat('#', 1 + random.int(7));
  line += random.pick([' ', ' ', ' ', '  ', '\t', '']);
  if (!random.chance(0.1)) {
    line += textLine(context);
  }
  if (random.chance(0.3)) {
    line += random.pick([' ', '  ']) + repeat('#', 1 + random.int(4));
  }
  if (random.chance(0.2)) {
    line += random.pick(SPACES);
  }
  out.push(line);
}

function setextHeading(context: Context, out: string[]): void {
  const { random } = context;
  paragraph(context, out);
  out.push(
    spaces(random, 3) + repeat(random.pick(['=', '-']), 1 + random.int(5)) + random.pick(SPACES),
  );
}

function thematicBreak(context: Context, out: string[]): void {
  const { random } = context;
  const mark = random.pick(['*', '-', '_']);
  const count = 2 + random.int(5);
  let line = spaces(random, 3);
  for (let i = 0; i < count; i++) {
    line += mark + (random.chance(0.3) ? random.pick([' ', '  ', '\t']) : '');
  }
  if (random.chance(0.1)) {
    line += 'x';
  }
  out.push(line);
}

function indentedCode(context: Context, out: string[]): void {
  const { random } = context;
  const count = 1 + random.int(3);
  for (let i = 0; i < count; i++) {
    out.push(
      i > 0 && random.chance(0.2)
        ? blankLine(random)
        : random.pick(['    ', '\t', '     ']) + word(random),
    );
  }
}

function fencedCode(context: Context, out: string[]): void {
  const { random } = context;
  const mark = random.pick(['`', '~']);
  const length = 3 + random.int(3);
  const indent = spaces(random, 3);
  const info = random.chance(0.4) ? random.pick(['js', ' ts x', 'a`b', '{x}']) : '';
  out.push(indent + repeat(mark, length) + info);
  const count = random.int(4);
  for (let i = 0; i < count; i++) {
    out.push(random.chance(0.2) ? blankLine(random) : spaces(random, 5) + word(random));
  }
  if (random.chance(0.8)) {
    out.push(spaces(random, 4) + repeat(mark, length + random.int(2)) + random.pick(SPACES));
  }
}

function htmlBlock(context: Context, out: string[]): void {
  const { random } = context;
  const start = random.pick([
    '<div>',
    '<pre>',
    '<!-- a',
    '<?php',
    '<![CDATA[',
    '<!DOCTYPE html>',
    '<span>',
    '<a href="x">',
    '</div>',
    '<script>',
  ]);
  out.push(spaces(random, 3) + start);
  const count = random.int(3);
  for (let i = 0; i < count; i++) {
    out.push(random.pick([word(random), '', '-->', '?>', ']]>', '</pre>', '</script>']));
  }
}

function definition(context: Context, out: string[]): void {
  const { random } = context;
  const label = random.pick(['foo', 'Foo Bar', 'bar', 'a']);
  const dest = random.pick(['/url', '<a b>', '<>', 'x', '/a(b)c']);
  const title = random.pick(['', ' "t"', " 't'", ' (t)', '\n  "t"']);
  out.push(`${spaces(random, 3)}[${label}]:${random.pick([' ', '\n ', '  '])}${dest}${title}`);
}

function table(context: Context, out: string[]): void {
  const { random } = context;
  const columns = 1 + random.int(3);
  const cells = (make: (i: number) => string): string => {
    const parts: string[] = [];
    for (let i = 0; i < columns; i++) {
      parts.push(make(i));
    }
    const lead = random.chance(0.6) ? '| ' : '';
    const trail = random.chance(0.6) ? ' |' : '';
    return lead + parts.join(' | ') + trail;
  };
  out.push(cells(() => textLine(context)));
  out.push(cells(() => random.pick(['---', ':--', '--:', ':-:', '-', '----'])));
  const rows = random.int(3);
  for (let i = 0; i < rows; i++) {
    out.push(cells(() => (random.chance(0.2) ? '' : word(random))));
  }
}

function footnoteDefinition(context: Context, out: string[]): void {
  const { random } = context;
  out.push(`[^${random.pick(['1', 'a', 'big note'])}]: ${textLine(context)}`);
  if (random.chance(0.4)) {
    out.push(`    ${textLine(context)}`);
  }
}

function blockquote(context: Context, out: string[], depth: number): void {
  const { random } = context;
  const inner: string[] = [];
  blocks(context, depth + 1, inner);
  const prefix = random.pick(['> ', '> ', '>', '>  ', ' > ', '>\t']);
  for (const line of inner) {
    // A line without the prefix is a lazy continuation, or ends the quote.
    out.push(line !== '' && random.chance(0.08) ? line : prefix + line);
  }
}

function list(context: Context, out: string[], depth: number): void {
  const { random, on } = context;
  const ordered = random.chance(0.4);
  const bullet = random.pick(['-', '*', '+']);
  const delimiter = random.pick(['.', ')']);
  let number = random.chance(0.7) ? 1 : random.int(1000);
  const count = 1 + random.int(3);
  for (let i = 0; i < count; i++) {
    const marker = ordered ? String(number) + delimiter : bullet;
    number++;
    const gap = random.chance(0.8) ? 1 : 1 + random.int(5);
    const inner: string[] = [];
    if (on.taskList && random.chance(0.3)) {
      inner.push(random.pick(['[ ] ', '[x] ', '[X] ', '[] ']) + textLine(context));
      if (random.chance(0.4)) {
        blocks(context, depth + 1, inner);
      }
    } else if (random.chance(0.1)) {
      // An empty item.
    } else {
      blocks(context, depth + 1, inner);
    }
    const indent = repeat(' ', marker.length + gap - (random.chance(0.1) ? 1 : 0));
    const lead = spaces(random, 3);
    for (let j = 0; j < inner.length; j++) {
      const line = inner[j];
      if (j === 0) {
        out.push(lead + marker + repeat(' ', gap) + line);
      } else {
        out.push(line === '' ? line : indent + line);
      }
    }
    if (inner.length === 0) {
      out.push(lead + marker);
    }
    if (i + 1 < count && random.chance(0.3)) {
      out.push('');
    }
  }
}

type Maker = (context: Context, out: string[], depth: number) => void;

function blocks(context: Context, depth: number, out: string[]): void {
  const { random, on } = context;
  const makers: Maker[] = [paragraph, paragraph];
  if (on.atx) {
    makers.push(atxHeading, atxHeading);
  }
  if (on.thematicBreak) {
    makers.push(thematicBreak);
  }
  if (on.setext) {
    makers.push(setextHeading);
  }
  if (on.code) {
    makers.push(indentedCode, fencedCode);
  }
  if (on.html) {
    makers.push(htmlBlock);
  }
  if (on.definition) {
    makers.push(definition);
  }
  if (on.table) {
    makers.push(table);
  }
  if (on.footnote) {
    makers.push(footnoteDefinition);
  }
  if (depth < 3) {
    if (on.blockquote) {
      makers.push(blockquote);
    }
    if (on.list) {
      makers.push(list);
    }
  }
  const count = 1 + random.int(depth === 0 ? 5 : 3);
  for (let i = 0; i < count; i++) {
    if (i > 0 && random.chance(0.5)) {
      out.push(blankLine(random));
    }
    random.pick(makers)(context, out, depth);
  }
}

/** Joins lines with one kind of line ending, or a mix, and adds odd bytes now and then. */
export function assemble(random: Random, lines: string[]): string {
  const tabs = random.chance(0.15);
  const mode = random.pick(['\n', '\n', '\n', '\n', '\r\n', '\r', 'mixed']);
  let out = '';
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (tabs && line.startsWith('    ')) {
      line = `\t${line.slice(4)}`;
    }
    out += line;
    if (i + 1 < lines.length) {
      out += mode === 'mixed' ? random.pick(['\n', '\r\n', '\r']) : mode;
    }
  }
  if (random.chance(0.8)) {
    out += mode === 'mixed' ? '\n' : mode;
  }
  if (random.chance(0.02)) {
    out = `﻿${out}`;
  }
  if (random.chance(0.02) && out.length > 0) {
    const at = random.int(out.length);
    out = `${out.slice(0, at)}\0${out.slice(at)}`;
  }
  return out;
}

/** One random document from the grammar of the features that are on. */
export function generateDocument(random: Random, on: Features): string {
  const lines: string[] = [];
  blocks({ random, on }, 0, lines);
  return assemble(random, lines);
}

/** Inputs that stress nesting and long delimiter runs. */
export function generatePathological(random: Random): string {
  const n = random.pick([10, 100, 300, 1000]) + random.int(50);
  switch (random.int(18)) {
    case 0:
      return repeat('>', n);
    case 1:
      return `${repeat('> ', n)}a`;
    case 2:
      return repeat('*', n);
    case 3:
      return repeat('[', n);
    case 4:
      return `${repeat('[a](', n)}b`;
    case 5:
      return `${repeat('- ', n)}a`;
    case 6:
      return repeat('`', n);
    case 7:
      return repeat('<', n);
    case 8:
      return repeat('* ', n);
    case 9:
      return repeat('_a', n);
    case 10:
      return repeat('#', n);
    case 11:
      return repeat('\n', n);
    case 12:
      return repeat(' ', n);
    case 13:
      return repeat('a\n', n);
    case 14:
      return repeat('\t', n);
    case 15:
      return `${repeat('*a ', n)}${repeat('a* ', n)}`;
    case 16:
      return repeat('\\', n);
    default:
      return repeat('![', n) + repeat(']', n);
  }
}

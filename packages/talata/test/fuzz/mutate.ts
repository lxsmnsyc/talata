import type { Random } from './random';

const TOKENS = [
  '\n',
  '\n\n',
  '\r\n',
  '\r',
  '\t',
  ' ',
  '  ',
  '    ',
  '> ',
  '>',
  '- ',
  '* ',
  '+ ',
  '1. ',
  '# ',
  '## ',
  '---',
  '===',
  '***',
  '___',
  '```',
  '~~~',
  '*',
  '**',
  '_',
  '`',
  '[',
  ']',
  '](',
  ')',
  '![',
  '<',
  '>',
  '<!--',
  '&amp;',
  '\\',
  '|',
  ':',
  '~~',
  '[^1]',
  '[x]: /u',
  '\0',
  '﻿',
  '日',
  '😀',
];

/** Applies a few random edits: delete, duplicate, insert a token, replace, swap. */
export function mutate(random: Random, value: string): string {
  let out = value;
  const edits = 1 + random.int(4);
  for (let i = 0; i < edits; i++) {
    const length = out.length;
    const at = random.int(length + 1);
    const span = 1 + random.int(Math.min(20, length + 1));
    switch (random.int(5)) {
      case 0:
        out = out.slice(0, at) + out.slice(at + span);
        break;
      case 1:
        out = out.slice(0, at) + out.slice(at, at + span) + out.slice(at);
        break;
      case 2:
        out = out.slice(0, at) + random.pick(TOKENS) + out.slice(at);
        break;
      case 3:
        out = out.slice(0, at) + random.pick(TOKENS) + out.slice(at + 1);
        break;
      default: {
        const other = random.int(length + 1);
        out = out.slice(0, at) + out.slice(other, other + span) + out.slice(at);
        break;
      }
    }
  }
  return out;
}

/** A random run of whole lines from a longer text, so big corpus files give small cases. */
export function sliceLines(random: Random, value: string, maxLines: number): string {
  const starts: number[] = [0];
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) === 10) {
      starts.push(i + 1);
    }
  }
  const first = random.int(starts.length);
  const last = Math.min(starts.length, first + 1 + random.int(maxLines));
  return value.slice(starts[first], last < starts.length ? starts[last] : value.length);
}

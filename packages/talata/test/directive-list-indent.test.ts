import { isDeepStrictEqual } from 'node:util';
import { describe, expect, test } from 'vitest';
import { parseReference, parseTalata } from './parsers';

// A container directive in a list item, followed by a line that does not
// continue the item and starts a container at 4 columns or more. With MDX,
// micromark has no indented code, so a container starts there and the
// directive's content keeps its last line ending, as it does below 4 columns.

type Names = NonNullable<Parameters<typeof parseTalata>[2]>;

const sets: Names[] = [
  ['directive'],
  ['directive', 'mdx'],
  ['frontmatter', 'math', 'directive', 'mdx'],
];

/** Lists whose items hold directives, as [first line prefix, continuation indent]. */
const items: [string, string][] = [
  ['40.  ', '     '],
  ['1. ', '   '],
  ['1)    ', '      '],
  ['- ', '  '],
  ['*     ', '      '],
  ['10. ', '    '],
];

/** Last lines, at an indent under the item's. */
const lasts = ['>', '> b', '- b', '1. b', '[^a]: b', 'b', '', ':::'];

/** The lines of an item that holds `depth` nested directives. */
function makeBody(first: string, rest: string, depth: number): string {
  let body = first + ':::a\n';
  for (let level = 1; level < depth; level++) {
    body += rest + ':::b' + level + '\n';
  }
  return body;
}

function makeInputs(): string[] {
  const inputs = ['40.  :::a\n     :::c\n    >'];
  for (const [first, rest] of items) {
    for (let indent = 0; indent < rest.length; indent++) {
      const pad = ' '.repeat(indent);
      for (const last of lasts) {
        for (const depth of [1, 2, 3]) {
          const body = makeBody(first, rest, depth);
          inputs.push(body + pad + last, body + pad + last + '\n');
        }
        // Two levels in a block quote, and with text in the inner directive.
        const body = makeBody(first, rest, 2);
        const quoted = body.replaceAll(/^/gm, '> ').slice(0, -2);
        inputs.push(quoted + '> ' + pad + last, body + rest + 'x\n' + pad + last);
      }
    }
  }
  return inputs;
}

describe('container directive in a list item, then a container at a smaller indent', () => {
  const inputs = makeInputs();
  for (const names of sets) {
    for (const gfm of [false, true]) {
      test(`${names.join(', ')}, gfm ${gfm}`, () => {
        const failures: string[] = [];
        for (const input of inputs) {
          if (
            !isDeepStrictEqual(parseTalata(input, gfm, names), parseReference(input, gfm, names))
          ) {
            failures.push(input);
          }
        }
        expect(failures).toEqual([]);
      });
    }
  }
});

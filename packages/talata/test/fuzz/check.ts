import type { Root } from 'mdast';
import { parseReference, parseTalata } from '../parsers';
import { describeDiff, firstDiff } from '../tree-diff';
import type { Features } from './features';

export type Outcome =
  | { kind: 'equal' }
  | { kind: 'skip'; reason: string }
  | { kind: 'throw'; message: string }
  | { kind: 'diff'; message: string };

interface Node {
  type: string;
  checked?: boolean | null;
  position?: { start: { offset?: number } };
  children?: Node[];
}

const alwaysOn: Record<string, true> = {
  root: true,
  paragraph: true,
  text: true,
  break: true,
};

const typeFeature: Record<string, keyof Features> = {
  thematicBreak: 'thematicBreak',
  code: 'code',
  blockquote: 'blockquote',
  list: 'list',
  listItem: 'list',
  html: 'html',
  definition: 'definition',
  inlineCode: 'inline',
  emphasis: 'inline',
  strong: 'inline',
  link: 'inline',
  image: 'inline',
  linkReference: 'inline',
  imageReference: 'inline',
  delete: 'strikethrough',
  table: 'table',
  tableRow: 'table',
  tableCell: 'table',
  footnoteDefinition: 'footnote',
  footnoteReference: 'footnote',
};

function isBlank(code: number): boolean {
  return code === 32 || code === 9;
}

// True when the heading starts with a valid ATX opening sequence.
function isAtx(value: string, offset: number): boolean {
  let i = offset;
  while (isBlank(value.charCodeAt(i))) {
    i++;
  }
  let marks = 0;
  while (value.charCodeAt(i) === 35) {
    i++;
    marks++;
  }
  if (marks === 0 || marks > 6) {
    return false;
  }
  const code = value.charCodeAt(i);
  return Number.isNaN(code) || isBlank(code) || code === 10 || code === 13;
}

function nodeReason(node: Node, value: string, on: Features): string | undefined {
  const { type } = node;
  if (type in alwaysOn) {
    return undefined;
  }
  const offset = node.position?.start.offset ?? 0;
  if (type === 'heading') {
    if (isAtx(value, offset)) {
      return on.atx ? undefined : 'atx';
    }
    return on.setext ? undefined : 'setext';
  }
  if (type === 'link') {
    // A link that does not start with `[` or `<` is a GFM literal autolink.
    const code = value.charCodeAt(offset);
    if (code !== 91 && code !== 60 && !on.autolinkLiteral) {
      return 'autolinkLiteral';
    }
  }
  if (type === 'listItem' && node.checked != null && !on.taskList) {
    return 'taskList';
  }
  if (!(type in typeFeature)) {
    return `type ${type}`;
  }
  const feature = typeFeature[type];
  return on[feature] ? undefined : feature;
}

/**
 * Why a document is outside what talata supports now, or undefined. Walks the
 * reference tree without recursion, since the tree can be thousands deep.
 */
export function unsupportedReason(tree: Root, value: string, on: Features): string | undefined {
  if (!on.inline && (value.includes('\\') || value.includes('&'))) {
    return 'inline';
  }
  const stack: Node[] = [tree];
  while (stack.length > 0) {
    const node = stack.pop()!;
    const reason = nodeReason(node, value, on);
    if (reason !== undefined) {
      return reason;
    }
    if (node.children) {
      for (const child of node.children) {
        stack.push(child);
      }
    }
  }
  return undefined;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/** Runs both parsers on one document. A talata throw is always a failure. */
export function check(value: string, useGfm: boolean, on: Features): Outcome {
  let actual: Root;
  try {
    actual = parseTalata(value, useGfm);
  } catch (error) {
    return { kind: 'throw', message: messageOf(error) };
  }
  let expected: Root;
  try {
    expected = parseReference(value, useGfm);
  } catch {
    return { kind: 'skip', reason: 'reference threw' };
  }
  const reason = unsupportedReason(expected, value, on);
  if (reason !== undefined) {
    return { kind: 'skip', reason };
  }
  const message = describeDiff(firstDiff(expected, actual));
  return message === undefined ? { kind: 'equal' } : { kind: 'diff', message };
}

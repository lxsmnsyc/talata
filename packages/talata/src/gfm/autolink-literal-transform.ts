import type { Link, Nodes, PhrasingContent, Root, Text } from 'mdast';
import type { Transform } from '../core/transform';
import { OTHER, classifyCharacter, isAsciiAlphanumeric } from '../inline/classify';
import { workSteps } from '../inline/lines';
import { releaseAutolinkMemos } from './autolink-literal';

// The literal autolinks micromark's tokenizer misses (inside an open `[`,
// after `"` or `-`, after an escape), found the way mdast-util-gfm does:
// findAndReplace over every text node outside links and link references,
// first URLs, then emails. Every node it makes has no position, the text
// around a link included.

const DOT = 46;
const SLASH = 47;
const COLON = 58;
const LEFT_PAREN = 40;
const RIGHT_PAREN = 41;
const UNDERSCORE = 95;
const DASH = 45;
const PLUS = 43;

function lower(code: number): number {
  return code >= 65 && code <= 90 ? code + 32 : code;
}

/** `\w` of a regular expression without the `u` flag. */
function isWord(code: number): boolean {
  return code === UNDERSCORE || isAsciiAlphanumeric(code);
}

/** `[-.\w]` */
function isDomain(code: number): boolean {
  return code === DASH || code === DOT || isWord(code);
}

/** `[-.\w+]` */
function isAtext(code: number): boolean {
  return code === PLUS || isDomain(code);
}

/** `[-\w]` */
function isLabel(code: number): boolean {
  return code === DASH || isWord(code);
}

/** Characters the reference strips from the end of a URL. */
function isUrlTrail(code: number): boolean {
  return (
    code === 33 || // !
    code === 34 || // "
    code === 38 || // &
    code === 39 || // '
    code === RIGHT_PAREN ||
    code === 44 || // ,
    code === DOT ||
    code === COLON ||
    code === 59 || // ;
    code === 60 || // <
    code === 62 || // >
    code === 63 || // ?
    code === 93 || // ]
    code === 125 // }
  );
}

function add(nodes: PhrasingContent[], node: PhrasingContent): void {
  const previous = nodes.length > 0 ? nodes[nodes.length - 1] : undefined;
  if (previous?.type === 'text' && node.type === 'text') {
    previous.value += node.value;
  } else {
    nodes.push(node);
  }
}

function link(url: string, value: string): Link {
  return { type: 'link', title: null, url, children: [{ type: 'text', value }] };
}

/** The reference's `previous`: start, whitespace or punctuation before `index`. */
function previousOk(value: string, index: number): boolean {
  return index === 0 || classifyCharacter(value.charCodeAt(index - 1)) !== OTHER;
}

// The last domain checked in the current text: its end, the dot before its
// last two segments (a later start up to it checks the same segments), and
// the result. `replaceUrls` resets it.
let checkedEnd = -1;
let checkedBefore = -1;
let checkedResult = false;

/** The reference's `isCorrectDomain` for `value[from, to)`. */
function isCorrectDomain(value: string, from: number, to: number): boolean {
  if (checkedEnd === to && from <= checkedBefore) {
    return checkedResult;
  }
  let last = -1;
  for (let i = to - 1; i >= from; i--) {
    if (__TALATA_TEST__) {
      workSteps.count++;
    }
    if (value.charCodeAt(i) === DOT) {
      last = i;
      break;
    }
  }
  if (last === -1) {
    return false;
  }
  let before = from - 1;
  for (let i = last - 1; i >= from; i--) {
    if (__TALATA_TEST__) {
      workSteps.count++;
    }
    if (value.charCodeAt(i) === DOT) {
      before = i;
      break;
    }
  }
  checkedEnd = to;
  checkedBefore = before;
  checkedResult = isSegmentOk(value, last + 1, to) && isSegmentOk(value, before + 1, last);
  return checkedResult;
}

/** An empty segment passes; else it needs an alphanumeric and no `_`. */
function isSegmentOk(value: string, from: number, to: number): boolean {
  if (from === to) {
    return true;
  }
  let alphanumeric = false;
  for (let i = from; i < to; i++) {
    const code = value.charCodeAt(i);
    if (code === UNDERSCORE) {
      return false;
    }
    if (isAsciiAlphanumeric(code)) {
      alphanumeric = true;
    }
  }
  return alphanumeric;
}

/** The reference's `splitUrl`: end of the URL in `value[from, to)`; the rest is trail. */
function splitUrl(value: string, from: number, to: number): number {
  let end = to;
  while (end > from && isUrlTrail(value.charCodeAt(end - 1))) {
    end--;
  }
  if (end === to) {
    return to;
  }
  let opening = 0;
  let closing = 0;
  for (let i = from; i < end; i++) {
    const code = value.charCodeAt(i);
    if (code === LEFT_PAREN) {
      opening++;
    } else if (code === RIGHT_PAREN) {
      closing++;
    }
  }
  // Closing parens in the trail go back into the URL while it has more
  // opening parens.
  let paren = value.indexOf(')', end);
  while (paren !== -1 && paren < to && opening > closing) {
    end = paren + 1;
    paren = value.indexOf(')', end);
    closing++;
  }
  return end;
}

/** Length of `http://` or `https://` at `index` (any case) followed by a domain character, or 0. */
function protocolAt(value: string, index: number): number {
  if (
    lower(value.charCodeAt(index + 1)) !== 116 ||
    lower(value.charCodeAt(index + 2)) !== 116 ||
    lower(value.charCodeAt(index + 3)) !== 112
  ) {
    return 0;
  }
  let at = index + 4;
  if (lower(value.charCodeAt(at)) === 115) {
    at++;
  }
  if (
    value.charCodeAt(at) !== COLON ||
    value.charCodeAt(at + 1) !== SLASH ||
    value.charCodeAt(at + 2) !== SLASH ||
    !isDomain(value.charCodeAt(at + 3))
  ) {
    return 0;
  }
  return at + 3 - index;
}

/**
 * `/(https?:\/\/|www(?=\.))([-.\w]+)([^ \t\r\n]*)/gi` with the reference's
 * `findUrl`. Undefined when nothing changes.
 */
function replaceUrls(value: string): PhrasingContent[] | undefined {
  let nodes: PhrasingContent[] | undefined;
  let start = 0;
  let index = 0;
  let domainEnd = 0;
  checkedEnd = -1;
  let pathEnd = 0;
  const length = value.length;
  while (index < length) {
    const code = lower(value.charCodeAt(index));
    let domainStart = -1;
    let www = false;
    if (code === 104) {
      const protocol = protocolAt(value, index);
      if (protocol > 0) {
        domainStart = index + protocol;
      }
    } else if (
      code === 119 &&
      lower(value.charCodeAt(index + 1)) === 119 &&
      lower(value.charCodeAt(index + 2)) === 119 &&
      value.charCodeAt(index + 3) === DOT
    ) {
      www = true;
      domainStart = index;
    }
    if (domainStart === -1) {
      index++;
      continue;
    }
    // A candidate inside the last one's runs ends where they did.
    if (domainStart >= domainEnd) {
      domainEnd = domainStart;
      while (domainEnd < length && isDomain(value.charCodeAt(domainEnd))) {
        if (__TALATA_TEST__) {
          workSteps.count++;
        }
        domainEnd++;
      }
    }
    if (domainEnd >= pathEnd) {
      pathEnd = domainEnd;
      while (pathEnd < length) {
        const next = value.charCodeAt(pathEnd);
        if (next === 32 || next === 9 || next === 13 || next === 10) {
          break;
        }
        if (__TALATA_TEST__) {
          workSteps.count++;
        }
        pathEnd++;
      }
    }
    if (!previousOk(value, index) || !isCorrectDomain(value, domainStart, domainEnd)) {
      index++;
      continue;
    }
    const urlEnd = splitUrl(value, domainStart, pathEnd);
    if (urlEnd === domainStart) {
      index++;
      continue;
    }
    nodes ??= [];
    if (start !== index) {
      add(nodes, { type: 'text', value: value.slice(start, index) });
    }
    const text = value.slice(index, urlEnd);
    add(nodes, link(www ? 'http://' + text : text, text));
    if (urlEnd < pathEnd) {
      add(nodes, { type: 'text', value: value.slice(urlEnd, pathEnd) });
    }
    start = pathEnd;
    index = pathEnd;
  }
  if (nodes !== undefined && start < length) {
    add(nodes, { type: 'text', value: value.slice(start) });
  }
  return nodes;
}

/** End of `[-\w]+(?:\.[-\w]+)+` at `index`, or -1. */
function labelEnd(value: string, index: number): number {
  const length = value.length;
  let end = index;
  while (end < length && isLabel(value.charCodeAt(end))) {
    end++;
  }
  if (end === index) {
    return -1;
  }
  let segments = 0;
  while (end + 1 < length && value.charCodeAt(end) === DOT && isLabel(value.charCodeAt(end + 1))) {
    end += 2;
    while (end < length && isLabel(value.charCodeAt(end))) {
      end++;
    }
    segments++;
  }
  return segments > 0 ? end : -1;
}

/**
 * `/(?<=^|\s|\p{P}|\p{S})([-.\w+]+)@([-\w]+(?:\.[-\w]+)+)/gu` with the
 * reference's `findEmail`. Undefined when nothing changes.
 */
function replaceEmails(value: string): PhrasingContent[] | undefined {
  let nodes: PhrasingContent[] | undefined;
  let start = 0;
  let last = 0;
  let at = value.indexOf('@');
  while (at !== -1) {
    let run = at;
    while (run > 0 && isAtext(value.charCodeAt(run - 1))) {
      run--;
    }
    const end = run < at ? labelEnd(value, at + 1) : -1;
    const final = end === -1 ? 0 : value.charCodeAt(end - 1);
    if (end !== -1 && final !== DASH && final !== UNDERSCORE && !(final >= 48 && final <= 57)) {
      // The first start in the run that the character before allows.
      let from = run < last ? last : run;
      while (
        from < at &&
        !(previousOk(value, from) && (from === 0 || value.charCodeAt(from - 1) !== SLASH))
      ) {
        from++;
      }
      if (from < at) {
        nodes ??= [];
        if (start !== from) {
          add(nodes, { type: 'text', value: value.slice(start, from) });
        }
        const text = value.slice(from, end);
        add(nodes, link('mailto:' + text, text));
        start = end;
        last = end;
        at = value.indexOf('@', end);
        continue;
      }
    }
    at = value.indexOf('@', at + 1);
  }
  if (nodes !== undefined && start < value.length) {
    add(nodes, { type: 'text', value: value.slice(start) });
  }
  return nodes;
}

/**
 * Whether `value` can hold a URL match: `://`, or `www.` in any case. A
 * cheap check before `replaceUrls`.
 */
function mayHoldUrl(value: string): boolean {
  if (value.includes('://')) {
    return true;
  }
  let dot = value.indexOf('.', 3);
  while (dot !== -1) {
    if (
      lower(value.charCodeAt(dot - 1)) === 119 &&
      lower(value.charCodeAt(dot - 2)) === 119 &&
      lower(value.charCodeAt(dot - 3)) === 119
    ) {
      return true;
    }
    dot = value.indexOf('.', dot + 1);
  }
  return false;
}

/** Replacement nodes for `node`, or undefined when it stays. */
function replaceText(node: Text): PhrasingContent[] | undefined {
  const value = node.value;
  // Both patterns need a dot; emails need `@`.
  if (!value.includes('.')) {
    return undefined;
  }
  const urls = mayHoldUrl(value) ? replaceUrls(value) : undefined;
  if (urls === undefined) {
    return value.includes('@') ? replaceEmails(value) : undefined;
  }
  const result: PhrasingContent[] = [];
  for (const piece of urls) {
    const emails =
      piece.type === 'text' && piece.value.includes('@') ? replaceEmails(piece.value) : undefined;
    if (emails === undefined) {
      result.push(piece);
    } else {
      for (const email of emails) {
        result.push(email);
      }
    }
  }
  return result;
}

function transformAutolinkLiterals(tree: Root): void {
  releaseAutolinkMemos();
  const stack: Nodes[] = [tree];
  while (stack.length > 0) {
    const parent = stack.pop()!;
    if (!('children' in parent)) {
      continue;
    }
    const children: Nodes[] = parent.children;
    // The new children, built only once a text node is replaced. One pass,
    // no spread: a paragraph can get many thousands of new nodes.
    let rebuilt: Nodes[] | undefined;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const replacement = child.type === 'text' ? replaceText(child) : undefined;
      if (replacement !== undefined) {
        rebuilt ??= children.slice(0, i);
        for (const node of replacement) {
          rebuilt.push(node);
        }
        continue;
      }
      if ('children' in child && child.type !== 'link' && child.type !== 'linkReference') {
        stack.push(child);
      }
      rebuilt?.push(child);
    }
    if (rebuilt !== undefined) {
      children.length = 0;
      for (const node of rebuilt) {
        children.push(node);
      }
    }
  }
}

const autolinkLiteralTransform: Transform = {
  name: 'autolinkLiteral',
  gfm: true,
  transform: transformAutolinkLiterals,
};

export default autolinkLiteralTransform;

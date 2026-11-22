import type { Point, Source } from '../../core/source';
import { point } from '../../core/source';
import { MdxError } from './error';

// The JS parser side of MDX, as `micromark-util-events-to-acorn` 2.0.3,
// `micromark-factory-mdx-expression` 2.0.3 (`mdxExpressionParse`) and
// `micromark-extension-mdxjs-esm` 3.0.0 call acorn. The caller passes acorn
// in; it is typed by shape, so talata's types do not import it.

/** Options passed to acorn, such as `ecmaVersion` and `sourceType`. */
export interface AcornOptions {
  ecmaVersion?: number | 'latest';
  sourceType?: string;
  [key: string]: unknown;
}

/**
 * What talata calls of acorn: `acorn.Parser.extend(acornJsx())` for JSX in
 * expressions, or `acorn` itself. The options are typed `never` so that
 * acorn's own signatures, with acorn's option types, fit; talata passes the
 * merged `AcornOptions`.
 */
export interface Acorn {
  parse(input: string, options: never): unknown;
  parseExpressionAt(input: string, pos: number, options: never): unknown;
}

/** The acorn of one `mdx({ acorn })` extension, with its options merged. */
export interface Js {
  acorn: Acorn;
  options: AcornOptions;
}

interface Node {
  type: string;
  start: number;
  end: number;
  expression?: Node;
  properties?: Node[];
  body?: Node[];
  specifiers?: { local: { name: string } }[];
}

interface AcornError {
  pos: number;
  raisedAt: number;
  message: string;
}

function isAcornError(error: unknown): error is AcornError {
  return error instanceof Error && 'pos' in error && typeof error.pos === 'number';
}

/** Merges options as the reference: defaults, then the caller's, then `locations`. */
export function createJs(acorn: Acorn, options: AcornOptions | null | undefined): Js {
  return {
    acorn,
    options: Object.assign({ ecmaVersion: 2024, sourceType: 'module' }, options, {
      locations: true,
    }),
  };
}

// The acorn of the parse in progress: rules bind it to their source before
// they scan, and `Scanner.begin` reads it. Parses are not reentrant, so one
// pair is enough; an MDX parse without acorn never binds.
let boundSource: Source | undefined;
let boundJs: Js | undefined;

export function bindJs(source: Source, js: Js): void {
  boundSource = source;
  boundJs = js;
}

/** The acorn bound to `source`, or undefined (`mdx()` without acorn). */
export function jsOf(source: Source): Js | undefined {
  return source === boundSource ? boundJs : undefined;
}

/** Whether `code` is in the `\s` class of regular expressions. */
function isSpace(code: number): boolean {
  return (
    (code >= 9 && code <= 13) ||
    code === 32 ||
    code === 0xa0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000 ||
    code === 0xfeff
  );
}

/**
 * Whether `value` holds only whitespace and comments, as the reference's
 * `empty`. A line comment needs a line ending after it.
 */
function isEmpty(value: string): boolean {
  // Nothing before the first non-whitespace character can be a comment that
  // takes it, unless it starts one: then the regular expressions decide.
  // Called at each `}`, so a long expression must not be read whole.
  let first = 0;
  while (first < value.length && isSpace(value.charCodeAt(first))) {
    first++;
  }
  if (first === value.length) {
    return true;
  }
  if (value.charCodeAt(first) !== 47) {
    return false;
  }
  return /^\s*$/.test(
    value.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\r\n]*(\r\n|\n|\r)/g, ''),
  );
}

/**
 * Code handed to acorn, with `stops`: flat pairs of an offset in `value` and
 * the source offset it came from, one pair per chunk or line ending, as
 * `collect` makes them. `start` is the offset to use when there are none.
 */
export interface Code {
  value: string;
  stops: number[];
  start: number;
}

/** The source point of offset `at` in `prefix + code.value`. */
function placeOf(source: Source, code: Code, prefix: number, at: number): Point {
  return point(source, offsetOf(code, prefix, at));
}

/** The source offset of offset `at` in `prefix + code.value` (`relativeToPoint`). */
function offsetOf(code: Code, prefix: number, at: number): number {
  let relative = at - prefix;
  if (relative < 0) {
    relative = 0;
  } else if (relative > code.value.length) {
    relative = code.value.length;
  }
  // The number of stops at or before `relative`: they are sorted by their
  // offset in the code, and of equal ones the last wins.
  const stops = code.stops;
  let low = 0;
  let high = stops.length >> 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (stops[middle * 2] <= relative) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  if (low === 0) {
    return code.start;
  }
  return stops[low * 2 - 1] + relative - stops[low * 2 - 2];
}

/** An acorn node, token or comment, as `estree-util-visit` walks it. */
type EsNode = Record<string, unknown> & { type: unknown; start: number; end: number };

/** An ESTree `Program`, as `data.estree` holds it. */
export type Estree = Record<string, unknown>;

/** What acorn collects during one parse: comments, and tokens when the caller asks for them. */
interface Collected {
  comments: EsNode[];
  tokens: EsNode[] | undefined;
}

function collect(js: Js): Collected {
  return { comments: [], tokens: js.options.onToken ? [] : undefined };
}

function config(js: Js, collected: Collected): never {
  const result: Record<string, unknown> = Object.assign({}, js.options, {
    onComment: collected.comments,
    preserveParens: true,
  });
  if (collected.tokens !== undefined) {
    result.onToken = collected.tokens;
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- acorn's options, see `Acorn`
  return result as never;
}

function isNodeLike(value: unknown): value is EsNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string' &&
    value.type.length > 0
  );
}

/** Maps the offsets of `node` to the source and sets `loc` and `range` (`fixPosition`). */
function fixPosition(source: Source, code: Code, prefix: number, node: EsNode): void {
  const startOffset = offsetOf(code, prefix, node.start);
  const endOffset = offsetOf(code, prefix, node.end);
  const start = point(source, startOffset);
  const end = point(source, endOffset);
  node.start = startOffset;
  node.end = endOffset;
  node.loc = {
    start: { line: start.line, column: start.column - 1, offset: startOffset },
    end: { line: end.line, column: end.column - 1, offset: endOffset },
  };
  node.range = [startOffset, endOffset];
}

/** A caller's `onComment` or `onToken` function. */
function isCallback(value: unknown): value is (...values: unknown[]) => unknown {
  return typeof value === 'function';
}

/**
 * Walks `node` as `estree-util-visit` 2.0.0 does with the visitor of
 * `eventsToAcorn`: a `ParenthesizedExpression` is replaced by its expression
 * in its parent, then the node gets its places fixed. A node reached twice
 * (acorn shares `local` and `imported` in `import {a} from 'b'`) is fixed
 * twice, as there. `parents` is the path, the parent last.
 */
function visit(
  source: Source,
  code: Code,
  prefix: number,
  node: EsNode,
  key: string | undefined,
  index: number,
  parents: EsNode[],
): void {
  if (node.type === 'ParenthesizedExpression' && parents.length > 0 && key) {
    const context = parents[parents.length - 1];
    if (index === -1) {
      context[key] = node.expression;
    } else {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an array field, as `index` says
      (context[key] as unknown[])[index] = node.expression;
    }
  }
  fixPosition(source, code, prefix, node);
  parents.push(node);
  // Own keys in `for in` order; the walk only replaces values, so a list
  // taken first sees the same keys.
  for (const field of Object.keys(node)) {
    const value = node[field];
    if (!value || typeof value !== 'object' || field === 'data' || field === 'position') {
      continue;
    }
    if (Array.isArray(value)) {
      const nodes: unknown[] = value;
      for (let i = 0; i < nodes.length; i++) {
        const child = nodes[i];
        if (isNodeLike(child)) {
          visit(source, code, prefix, child, field, i, parents);
        }
      }
    } else if (isNodeLike(value)) {
      visit(source, code, prefix, value, field, -1, parents);
    }
  }
  parents.pop();
}

/**
 * Fixes the places of a program that parsed and adds its comments, as
 * `eventsToAcorn` does when a parse succeeds. Returns what hands its
 * comments and tokens to the caller's `onComment` and `onToken`, after
 * running it once: flow that interrupts a paragraph runs it again.
 */
function finish(
  js: Js,
  source: Source,
  code: Code,
  prefix: number,
  program: EsNode,
  collected: Collected,
): () => void {
  program.comments = collected.comments;
  visit(source, code, prefix, program, undefined, -1, []);
  const comments = collected.comments;
  const tokens: EsNode[] = [];
  if (collected.tokens !== undefined) {
    for (const token of collected.tokens) {
      // Tokens that end in the prefix or start in the suffix are left out.
      if (token.end <= prefix || token.start - prefix >= code.value.length) {
        continue;
      }
      fixPosition(source, code, prefix, token);
      tokens.push(token);
    }
  }
  const report = (): void => {
    reportComments(js, comments);
    reportTokens(js, tokens);
  };
  report();
  return report;
}

function reportComments(js: Js, comments: EsNode[]): void {
  const onComment = js.options.onComment;
  if (Array.isArray(onComment)) {
    for (const comment of comments) {
      onComment.push(comment);
    }
  } else if (isCallback(onComment)) {
    for (const comment of comments) {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- set by `fixPosition`
      const loc = comment.loc as { start: unknown; end: unknown };
      onComment(
        comment.type === 'Block',
        comment.value,
        comment.start,
        comment.end,
        loc.start,
        loc.end,
      );
    }
  }
}

function reportTokens(js: Js, tokens: EsNode[]): void {
  const onToken = js.options.onToken;
  for (const token of tokens) {
    if (Array.isArray(onToken)) {
      onToken.push(token);
    } else if (isCallback(onToken)) {
      onToken(token);
    }
  }
}

/** Drops the `ParenthesizedExpression` that `preserveParens` keeps, as the reference does. */
function unwrap(node: Node | undefined): Node | undefined {
  let result = node;
  while (result?.type === 'ParenthesizedExpression') {
    result = result.expression;
  }
  return result;
}

// What an expression is part of (`Scanner.expressionKind`).
const ATTRIBUTE = 1;
const VALUE = 2;

const acornReason = 'Could not parse expression with acorn';

/** The error of a spread attribute that is not one object spread, or undefined. */
function spreadError(source: Source, code: Code, prefix: number, tree: Node): MdxError | undefined {
  const object = unwrap(tree);
  if (object?.type !== 'ObjectExpression') {
    return new MdxError(
      'Unexpected `ExpressionStatement` in code: expected an object spread (`{...spread}`)',
      placeOf(source, code, prefix, 0),
    );
  }
  const properties = object.properties!;
  if (properties.length > 1) {
    return new MdxError(
      'Unexpected extra content in spread: only a single spread is supported',
      placeOf(source, code, prefix, properties[1].start),
    );
  }
  if (properties[0].type !== 'SpreadElement') {
    return new MdxError(
      'Unexpected `' + properties[0].type + '` in code: only spread elements are supported',
      placeOf(source, code, prefix, properties[0].start),
    );
  }
  return undefined;
}

/**
 * Parses an expression at its `}` (`mdxExpressionParse`). Returns the
 * program (`data.estree`) when it parses, or the error to keep as the last
 * crash: the `}` is then data and the expression goes on. Throws the errors
 * the reference throws at once: an empty attribute expression, and a spread
 * that is not one. `kind` is 0 (an expression of its own), 1 (`<a {...b}>`)
 * or 2 (`<a b={c}>`). `replay` gets what calls `onComment` and `onToken`
 * again for the program.
 */
export function parseExpression(
  js: Js,
  source: Source,
  code: Code,
  kind: number,
  replay?: (() => void)[],
): MdxError | Estree {
  const spread = kind === ATTRIBUTE;
  const prefix = spread ? '({' : '';
  const suffix = spread ? '})' : '';
  const empty = isEmpty(code.value);
  if (empty && (kind === ATTRIBUTE || kind === VALUE)) {
    throw new MdxError('Unexpected empty expression', placeOf(source, code, 0, 0));
  }
  const value = prefix + code.value + suffix;
  const collected = collect(js);
  let tree: Node | undefined;
  try {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- acorn returns its own node shape
    tree = (
      empty
        ? js.acorn.parse(value, config(js, collected))
        : js.acorn.parseExpressionAt(value, 0, config(js, collected))
    ) as Node;
  } catch (error) {
    if (!isAcornError(error)) {
      throw error;
    }
    return new MdxError(acornReason, placeOf(source, code, prefix.length, error.pos));
  }
  if (empty) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- acorn's program
    const program = tree as unknown as EsNode;
    const report = finish(js, source, code, 0, program, collected);
    replay?.push(report);
    return program;
  }
  if (!isEmpty(value.slice(tree.end, value.length - suffix.length))) {
    return new MdxError(acornReason, placeOf(source, code, prefix.length, tree.end));
  }
  // The spread check reads acorn's offsets, so it runs before they are
  // fixed; the reference throws after `onComment` is called.
  const error = spread ? spreadError(source, code, prefix.length, tree) : undefined;
  const end = prefix.length + code.value.length;
  const program: EsNode = {
    type: 'Program',
    start: 0,
    end,
    body: [{ type: 'ExpressionStatement', expression: tree, start: 0, end }],
    sourceType: 'module',
    comments: [],
  };
  const report = finish(js, source, code, prefix.length, program, collected);
  replay?.push(report);
  if (error !== undefined) {
    throw error;
  }
  return program;
}

const allowed = new Set([
  'ExportAllDeclaration',
  'ExportDefaultDeclaration',
  'ExportNamedDeclaration',
  'ImportDeclaration',
]);

/** The result of parsing ESM: ok with the names it imports, or an error. */
export interface EsmResult {
  error: MdxError | undefined;
  /** True: the error could go away with more text (acorn failed at the end). */
  swallow: boolean;
  /** Local names of the imports, when it parsed. */
  defined: string[];
  /** The program (`data.estree`), when it parsed. */
  estree?: Estree;
}

/**
 * Parses import and export statements (`atEnd` of the ESM construct).
 * `defined` are the names imported before, declared first so they cannot be
 * imported again. Throws when a statement is not an import or export.
 */
export function parseEsm(js: Js, source: Source, code: Code, defined: string[]): EsmResult {
  const prefix = defined.length > 0 ? 'var ' + defined.join(',') + '\n' : '';
  const collected = collect(js);
  let tree: Node;
  try {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- acorn returns its own node shape
    tree = js.acorn.parse(prefix + code.value, config(js, collected)) as Node;
  } catch (error) {
    if (!isAcornError(error)) {
      throw error;
    }
    const message = error.message.replace(/ \(\d+:\d+\)$/, '');
    return {
      error: new MdxError(
        'Could not parse import/exports with acorn',
        placeOf(source, code, prefix.length, error.pos),
      ),
      swallow:
        error.raisedAt >= prefix.length + code.value.length || message === 'Unterminated comment',
      defined: [],
    };
  }
  // The statements are checked on acorn's offsets, before they are fixed;
  // the reference throws after `onComment` is called.
  const body = tree.body!;
  const names: string[] = [];
  let error: MdxError | undefined;
  for (let i = prefix === '' ? 0 : 1; i < body.length; i++) {
    const node = body[i];
    if (!allowed.has(node.type)) {
      error = new MdxError(
        'Unexpected `' + node.type + '` in code: only import/exports are supported',
        {
          start: placeOf(source, code, prefix.length, node.start),
          end: placeOf(source, code, prefix.length, node.end),
        },
      );
      break;
    }
    if (node.type === 'ImportDeclaration') {
      for (const specifier of node.specifiers!) {
        names.push(specifier.local.name);
      }
    }
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- acorn's program
  const program = tree as unknown as EsNode;
  finish(js, source, code, prefix.length, program, collected);
  if (error !== undefined) {
    throw error;
  }
  // The declaration of the names imported before goes.
  if (prefix !== '') {
    body.shift();
  }
  return { error: undefined, swallow: false, defined: names, estree: program };
}

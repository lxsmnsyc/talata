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
  let relative = at - prefix;
  if (relative < 0) {
    relative = 0;
  } else if (relative > code.value.length) {
    relative = code.value.length;
  }
  const stops = code.stops;
  let index = 0;
  while (index < stops.length && stops[index] <= relative) {
    index += 2;
  }
  if (index === 0) {
    return point(source, code.start);
  }
  return point(source, stops[index - 1] + relative - stops[index - 2]);
}

function config(js: Js): never {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- acorn's options, see `Acorn`
  return Object.assign({}, js.options, { onComment: [], preserveParens: true }) as never;
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

/**
 * Parses an expression at its `}` (`mdxExpressionParse`). Returns undefined
 * when it parses, or the error to keep as the last crash: the `}` is then
 * data and the expression goes on. Throws the errors the reference throws
 * at once: an empty attribute expression, and a spread that is not one.
 * `kind` is 0 (an expression of its own), 1 (`<a {...b}>`) or 2 (`<a b={c}>`).
 */
export function parseExpression(
  js: Js,
  source: Source,
  code: Code,
  kind: number,
): MdxError | undefined {
  const spread = kind === ATTRIBUTE;
  const prefix = spread ? '({' : '';
  const suffix = spread ? '})' : '';
  const empty = isEmpty(code.value);
  if (empty && (kind === ATTRIBUTE || kind === VALUE)) {
    throw new MdxError('Unexpected empty expression', placeOf(source, code, 0, 0));
  }
  const value = prefix + code.value + suffix;
  let tree: Node | undefined;
  try {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- acorn returns its own node shape
    tree = (
      empty ? js.acorn.parse(value, config(js)) : js.acorn.parseExpressionAt(value, 0, config(js))
    ) as Node;
  } catch (error) {
    if (!isAcornError(error)) {
      throw error;
    }
    return new MdxError(acornReason, placeOf(source, code, prefix.length, error.pos));
  }
  if (empty) {
    return undefined;
  }
  if (!isEmpty(value.slice(tree.end, value.length - suffix.length))) {
    return new MdxError(acornReason, placeOf(source, code, prefix.length, tree.end));
  }
  if (spread) {
    const object = unwrap(tree);
    if (object?.type !== 'ObjectExpression') {
      throw new MdxError(
        'Unexpected `ExpressionStatement` in code: expected an object spread (`{...spread}`)',
        placeOf(source, code, prefix.length, 0),
      );
    }
    const properties = object.properties!;
    if (properties.length > 1) {
      throw new MdxError(
        'Unexpected extra content in spread: only a single spread is supported',
        placeOf(source, code, prefix.length, properties[1].start),
      );
    }
    if (properties[0].type !== 'SpreadElement') {
      throw new MdxError(
        'Unexpected `' + properties[0].type + '` in code: only spread elements are supported',
        placeOf(source, code, prefix.length, properties[0].start),
      );
    }
  }
  return undefined;
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
}

/**
 * Parses import and export statements (`atEnd` of the ESM construct).
 * `defined` are the names imported before, declared first so they cannot be
 * imported again. Throws when a statement is not an import or export.
 */
export function parseEsm(js: Js, source: Source, code: Code, defined: string[]): EsmResult {
  const prefix = defined.length > 0 ? 'var ' + defined.join(',') + '\n' : '';
  let tree: Node;
  try {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- acorn returns its own node shape
    tree = js.acorn.parse(prefix + code.value, config(js)) as Node;
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
  const body = tree.body!;
  const names: string[] = [];
  for (let i = prefix === '' ? 0 : 1; i < body.length; i++) {
    const node = body[i];
    if (!allowed.has(node.type)) {
      throw new MdxError(
        'Unexpected `' + node.type + '` in code: only import/exports are supported',
        {
          start: placeOf(source, code, prefix.length, node.start),
          end: placeOf(source, code, prefix.length, node.end),
        },
      );
    }
    if (node.type === 'ImportDeclaration') {
      for (const specifier of node.specifiers!) {
        names.push(specifier.local.name);
      }
    }
  }
  return { error: undefined, swallow: false, defined: names };
}

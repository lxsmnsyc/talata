import { isAsciiAlphanumeric } from '../../inline/classify';
import decodeNamed from '../../inline/entities';

// Character references in a quoted attribute value, as `mdast-util-mdx-jsx`
// decodes them: `parse-entities` 4 with `{ nonTerminated: false }`. Only a
// reference that ends in `;` is decoded. An unknown name that starts with a
// legacy name (`&ampx;`) decodes that legacy name and keeps the rest.

const LEGACY = new Set(
  'AElig AMP Aacute Acirc Agrave Aring Atilde Auml COPY Ccedil ETH Eacute Ecirc Egrave Euml GT Iacute Icirc Igrave Iuml LT Ntilde Oacute Ocirc Ograve Oslash Otilde Ouml QUOT REG THORN Uacute Ucirc Ugrave Uuml Yacute aacute acirc acute aelig agrave amp aring atilde auml brvbar ccedil cedil cent copy curren deg divide eacute ecirc egrave eth euml frac12 frac14 frac34 gt iacute icirc iexcl igrave iquest iuml laquo lt macr micro middot nbsp not ntilde oacute ocirc ograve ordf ordm oslash otilde ouml para plusmn pound quot raquo reg sect shy sup1 sup2 sup3 szlig thorn times uacute ucirc ugrave uml uuml yacute yen yuml'.split(
    ' ',
  ),
);

// Windows-1252 replacements for the C1 range, and NUL (`character-reference-invalid`).
const INVALID = new Map<number, string>([
  [0, '�'],
  [128, '€'],
  [130, '‚'],
  [131, 'ƒ'],
  [132, '„'],
  [133, '…'],
  [134, '†'],
  [135, '‡'],
  [136, 'ˆ'],
  [137, '‰'],
  [138, 'Š'],
  [139, '‹'],
  [140, 'Œ'],
  [142, 'Ž'],
  [145, '‘'],
  [146, '’'],
  [147, '“'],
  [148, '”'],
  [149, '•'],
  [150, '–'],
  [151, '—'],
  [152, '˜'],
  [153, '™'],
  [154, 'š'],
  [155, '›'],
  [156, 'œ'],
  [158, 'ž'],
  [159, 'Ÿ'],
]);

const AMPERSAND = 38;
const NUMBER_SIGN = 35;
const SEMICOLON = 59;

function isDecimal(code: number): boolean {
  return code >= 48 && code <= 57;
}

function isHexadecimal(code: number): boolean {
  return isDecimal(code) || (code >= 65 && code <= 70) || (code >= 97 && code <= 102);
}

function isReferenceCharacter(kind: number, code: number): boolean {
  if (kind === 0) {
    return isAsciiAlphanumeric(code);
  }
  return kind === 1 ? isDecimal(code) : isHexadecimal(code);
}

function numeric(code: number): string {
  if ((code >= 0xd800 && code <= 0xdfff) || code > 0x10ffff) {
    return '�';
  }
  return INVALID.get(code) ?? String.fromCodePoint(code);
}

/** Decodes the terminated character references in `value`. */
export default function decodeLiteral(value: string): string {
  let index = value.indexOf('&');
  if (index === -1) {
    return value;
  }
  const length = value.length;
  let result = '';
  let run = 0;
  while (index !== -1) {
    const following = value.charCodeAt(index + 1);
    // Tab, line feed, form feed, space, `&`, `<` and the end are not references.
    if (
      following === 9 ||
      following === 10 ||
      following === 12 ||
      following === 32 ||
      following === AMPERSAND ||
      following === 60 ||
      index + 1 >= length
    ) {
      index = value.indexOf('&', index + 1);
      continue;
    }
    let begin = index + 1;
    let kind = 0; // 0 named, 1 decimal, 2 hexadecimal
    if (following === NUMBER_SIGN) {
      begin++;
      const x = value.charCodeAt(begin);
      if (x === 88 || x === 120) {
        kind = 2;
        begin++;
      } else {
        kind = 1;
      }
    }
    let end = begin;
    let legacy = '';
    while (end < length && isReferenceCharacter(kind, value.charCodeAt(end))) {
      end++;
      if (kind === 0) {
        const name = value.slice(begin, end);
        if (LEGACY.has(name)) {
          legacy = name;
        }
      }
    }
    const characters = value.slice(begin, end);
    let reference = '';
    if (value.charCodeAt(end) === SEMICOLON && characters !== '') {
      end++;
      if (kind === 0) {
        const named = decodeNamed(characters);
        if (named !== undefined) {
          reference = named;
        } else if (legacy !== '') {
          reference = decodeNamed(legacy) ?? '';
          end = begin + legacy.length;
        }
      } else {
        reference = numeric(kind === 2 ? Number('0x' + characters) : Number(characters));
      }
    }
    if (reference === '') {
      index = value.indexOf('&', Math.max(end, index + 1));
      continue;
    }
    result += value.slice(run, index) + reference;
    run = end;
    index = value.indexOf('&', end);
  }
  return run === 0 ? value : result + value.slice(run);
}

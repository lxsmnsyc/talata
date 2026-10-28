// Backslash escapes and character references in string content (fenced
// code info, definitions), decoded as micromark does.

const NUMBER_SIGN = 35;
const AMPERSAND = 38;
const SEMICOLON = 59;
const BACKSLASH = 92;

function isAsciiPunctuation(code: number): boolean {
  return (
    (code >= 33 && code <= 47) ||
    (code >= 58 && code <= 64) ||
    (code >= 91 && code <= 96) ||
    (code >= 123 && code <= 126)
  );
}

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

function isHexDigit(code: number): boolean {
  return isDigit(code) || (code >= 65 && code <= 70) || (code >= 97 && code <= 102);
}

/** Decodes a numeric character reference as micromark does: invalid code points become U+FFFD. */
function decodeNumeric(digits: string, base: number): string {
  const code = Number.parseInt(digits, base);
  if (
    code < 9 ||
    code === 11 ||
    (code > 13 && code < 32) ||
    (code > 126 && code < 160) ||
    (code > 55_295 && code < 57_344) ||
    (code > 64_975 && code < 65_008) ||
    (code & 65_535) === 65_535 ||
    (code & 65_535) === 65_534 ||
    code > 1_114_111
  ) {
    return '�';
  }
  return String.fromCodePoint(code);
}

/**
 * Length of a numeric character reference (`&#123;`, `&#x1F;`) at `start`,
 * or 0. Named references are not decoded yet: they need the entity table that
 * inline-core adds in `src/inline/entities.ts`.
 */
function numericReferenceEnd(value: string, start: number): number {
  let i = start + 1;
  if (value.charCodeAt(i) !== NUMBER_SIGN) {
    return 0;
  }
  i++;
  const hex = value.charCodeAt(i) === 120 || value.charCodeAt(i) === 88; // x X
  if (hex) {
    i++;
  }
  const digitsStart = i;
  const max = hex ? 6 : 7;
  while (
    i - digitsStart < max &&
    (hex ? isHexDigit(value.charCodeAt(i)) : isDigit(value.charCodeAt(i)))
  ) {
    i++;
  }
  if (i === digitsStart || value.charCodeAt(i) !== SEMICOLON) {
    return 0;
  }
  return i + 1;
}

/**
 * Decodes backslash escapes and character references in a string, as
 * micromark's string content does (fenced code info, definitions).
 */
export default function decodeString(value: string): string {
  let result = '';
  let run = 0;
  const length = value.length;
  for (let i = 0; i < length; i++) {
    const code = value.charCodeAt(i);
    if (code === BACKSLASH && i + 1 < length && isAsciiPunctuation(value.charCodeAt(i + 1))) {
      result += value.slice(run, i);
      run = i + 1;
      i++;
    } else if (code === AMPERSAND) {
      const end = numericReferenceEnd(value, i);
      if (end > 0) {
        const hex = value.charCodeAt(i + 2) === 120 || value.charCodeAt(i + 2) === 88;
        result +=
          value.slice(run, i) +
          decodeNumeric(value.slice(i + (hex ? 3 : 2), end - 1), hex ? 16 : 10);
        run = end;
        i = end - 1;
      }
    }
  }
  return run === 0 ? value : result + value.slice(run);
}

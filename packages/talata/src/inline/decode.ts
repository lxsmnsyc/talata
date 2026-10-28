import { isAsciiAlphanumeric, isAsciiPunctuation } from './classify';
import decodeNamed from './entities';

const AMPERSAND = 38;
const NUMBER_SIGN = 35;
const SEMICOLON = 59;
const BACKSLASH = 92;

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

function isHexDigit(code: number): boolean {
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 70) || (code >= 97 && code <= 102);
}

/** As micromark-util-decode-numeric-character-reference. */
function decodeNumeric(code: number): string {
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
    return '\uFFFD';
  }
  return String.fromCodePoint(code);
}

/** The decoded value of the last reference `parseCharacterReference` matched. */
export const reference: { value: string } = { value: '' };

/**
 * Matches a character reference at `pos` (on `&`) before `end`: a known name
 * of up to 31 characters, up to 7 decimal digits or up to 6 hex digits, then
 * `;`. Returns the offset after it and sets `reference.value`, or returns -1.
 */
export function parseCharacterReference(text: string, pos: number, end: number): number {
  let index = pos + 1;
  if (index < end && text.charCodeAt(index) === NUMBER_SIGN) {
    index++;
    let hex = false;
    if (index < end) {
      const code = text.charCodeAt(index);
      if (code === 88 || code === 120) {
        hex = true;
        index++;
      }
    }
    const digits = index;
    const max = hex ? 6 : 7;
    while (index < end && index - digits < max) {
      const code = text.charCodeAt(index);
      if (hex ? !isHexDigit(code) : !isDigit(code)) {
        break;
      }
      index++;
    }
    if (index === digits || index >= end || text.charCodeAt(index) !== SEMICOLON) {
      return -1;
    }
    const digitsText = text.slice(digits, index);
    reference.value = decodeNumeric(
      hex ? Number.parseInt(digitsText, 16) : Number.parseInt(digitsText, 10),
    );
    return index + 1;
  }
  const name = index;
  while (index < end && index - name < 31 && isAsciiAlphanumeric(text.charCodeAt(index))) {
    index++;
  }
  if (index === name || index >= end || text.charCodeAt(index) !== SEMICOLON) {
    return -1;
  }
  const value = decodeNamed(text.slice(name, index));
  if (value === undefined) {
    return -1;
  }
  reference.value = value;
  return index + 1;
}

/**
 * Decodes backslash escapes and character references in a destination,
 * title or label, as micromark-util-decode-string does.
 */
export function decodeString(value: string): string {
  let result = '';
  let run = 0;
  const length = value.length;
  for (let i = 0; i < length; i++) {
    const code = value.charCodeAt(i);
    if (code === BACKSLASH) {
      if (i + 1 < length && isAsciiPunctuation(value.charCodeAt(i + 1))) {
        result += value.slice(run, i);
        // The escaped character starts the next run.
        run = i + 1;
        i++;
      }
    } else if (code === AMPERSAND) {
      const end = parseCharacterReference(value, i, length);
      if (end !== -1) {
        result += value.slice(run, i) + reference.value;
        run = end;
        i = end - 1;
      }
    }
  }
  return run === 0 ? value : result + value.slice(run);
}

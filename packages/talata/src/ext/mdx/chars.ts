// Character classes of the JSX tag syntax, as `estree-util-is-identifier-name`
// and `micromark-util-character` define them. micromark reads one UTF-16 code
// unit at a time, so a surrogate half is never a name character.

export const TAB = 9;
export const LF = 10;
export const CR = 13;
export const SPACE = 32;
export const QUOTE = 34;
export const DOLLAR = 36;
export const APOSTROPHE = 39;
export const DASH = 45;
export const DOT = 46;
export const SLASH = 47;
export const COLON = 58;
export const LESS_THAN = 60;
export const EQUALS = 61;
export const GREATER_THAN = 62;
export const UNDERSCORE = 95;
export const LEFT_BRACE = 123;
export const RIGHT_BRACE = 125;

// Only for code units above ASCII, which are rare in tag names. These are the
// reference's own expressions; a table of ID_Start and ID_Continue would add
// kilobytes. micromark passes one code unit (`charCodeAt`) to
// `String.fromCodePoint`, so a surrogate half matches neither, as here.
const startRe = /[$_\p{ID_Start}]/u;
const contRe = /[-$_\u{200C}\u{200D}\p{ID_Continue}]/u;

function isAsciiLetter(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

/** A character that can start a JS identifier. */
export function isIdStart(code: number): boolean {
  if (code < 128) {
    return isAsciiLetter(code) || code === DOLLAR || code === UNDERSCORE;
  }
  return startRe.test(String.fromCharCode(code));
}

/** A character that can continue a JSX identifier (`-` included). */
export function isIdContinue(code: number): boolean {
  if (code < 128) {
    return (
      isAsciiLetter(code) ||
      (code >= 48 && code <= 57) ||
      code === DOLLAR ||
      code === UNDERSCORE ||
      code === DASH
    );
  }
  return contRe.test(String.fromCharCode(code));
}

/** JavaScript's `\s` for one code unit, as micromark's `unicodeWhitespace`. */
export function isUnicodeWhitespace(code: number): boolean {
  if (code < 128) {
    return code === SPACE || (code >= 9 && code <= 13);
  }
  return (
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

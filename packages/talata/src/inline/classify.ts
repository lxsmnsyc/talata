// Character classes used by inline rules, matching micromark-util-character.
// micromark classifies one UTF-16 code unit at a time, so a surrogate half is
// neither whitespace nor punctuation.

export const OTHER = 0;
export const WHITESPACE = 1;
export const PUNCTUATION = 2;

/** `!` to `/`, `:` to `@`, `[` to `` ` ``, `{` to `~`. */
export function isAsciiPunctuation(code: number): boolean {
  return (
    (code >= 33 && code <= 47) ||
    (code >= 58 && code <= 64) ||
    (code >= 91 && code <= 96) ||
    (code >= 123 && code <= 126)
  );
}

export function isAsciiAlphanumeric(code: number): boolean {
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

export function isAsciiAlpha(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

// Only for code units above ASCII, which are rare next to delimiters.
const unicodePunctuation = /\p{P}|\p{S}/u;

/** Whitespace, punctuation or other, as micromark-util-classify-character does. */
export function classifyCharacter(code: number): number {
  if (code < 128) {
    if (code === 32 || (code >= 9 && code <= 13)) {
      return WHITESPACE;
    }
    return isAsciiPunctuation(code) ? PUNCTUATION : OTHER;
  }
  // The non-ASCII characters of JavaScript's `\s`.
  if (
    code === 0xa0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000 ||
    code === 0xfeff
  ) {
    return WHITESPACE;
  }
  return unicodePunctuation.test(String.fromCharCode(code)) ? PUNCTUATION : OTHER;
}

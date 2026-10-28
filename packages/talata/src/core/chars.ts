// Character codes used across the parser.
export const TAB = 9;
export const LF = 10;
export const CR = 13;
export const SPACE = 32;
export const NUMBER_SIGN = 35; // #
export const ASTERISK = 42; // *
export const DASH = 45; // -
export const UNDERSCORE = 95; // _
export const BOM = 0xfeff;

export function isSpaceOrTab(code: number): boolean {
  return code === SPACE || code === TAB;
}

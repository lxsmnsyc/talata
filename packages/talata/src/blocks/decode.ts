// Backslash escapes and character references in string content (fenced
// code info, definitions), decoded as micromark does. Shared with the inline
// rules, which own the named character reference table.
import { decodeString } from '../inline/decode';

export default decodeString;

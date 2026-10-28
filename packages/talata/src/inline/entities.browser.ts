/// <reference lib="dom" />

// The `browser` build uses the DOM to decode named references and ships no
// table, as decode-named-character-reference/index.dom.js does.
let element: HTMLElement | undefined;

/** The characters for a named reference (without `&` and `;`), or undefined. */
export default function decodeNamed(name: string): string | undefined {
  element ??= document.createElement('i');
  const reference = '&' + name + ';';
  element.innerHTML = reference;
  const characters = element.textContent;
  // A name that is not on the list decodes to itself, or to a legacy
  // reference without its semicolon followed by text and the semicolon.
  if (
    characters === reference ||
    (characters.charCodeAt(characters.length - 1) === 59 && name !== 'semi')
  ) {
    return undefined;
  }
  return characters;
}

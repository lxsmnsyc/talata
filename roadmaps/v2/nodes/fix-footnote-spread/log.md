# Log: fix-footnote-spread

- Reproduced on main: `[^a]:>7.\n    >\n    >` gives item `spread: false`, reference `true`. Same for `>- a`, `>>7.`, `7. b`.
- Cause: the reference's `prepareList` walks back from the list's end over line prefixes and quote prefixes, and stops at the footnote definition's indent token. When the item's last line carries that indent, no line ending is found, so a blank line earlier in the item (`firstBlankLineIndex`) marks it spread. Talata handled this only when the item was closed by a later line (`nextLineStart`), not when it ended on the indent line itself.
- Fix in `src/blocks/list-item.ts` `close`: when `indentEnd` is the item's end, the item is spread if that line is 2 or more lines after the last child.
- Cousins added to `test/fix-footnote-spread.test.ts`. Patch changeset added.

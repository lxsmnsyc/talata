---
'talata': patch
---

Fix GFM task list checks that span a line ending. In `- [\n ] a` the space before `]` makes it plain text, as in the reference, instead of an unchecked task.

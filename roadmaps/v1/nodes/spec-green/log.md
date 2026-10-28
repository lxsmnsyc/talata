# Log: spec-green

## 2026-10-28 start

- Branch `feat/spec-green`. The isolation hook refuses `git` (rtk rewrites it to `rtk git`, which the hook cannot read); `/usr/bin/git` from the worktree works.
- Flags on (`ready.commonmark`, `ready.corpus`, CommonMark fuzz features). First full test run: every CommonMark spec example passes without GFM. Failures: 5 spec examples with GFM (602, 606, 608, 611, 612: autolink literals) and 23 corpus files, which `corpus.test.ts` parses with GFM. Every corpus file matches the reference without GFM (checked with `test/diff.ts --no-gfm`).
- Fuzz, 5000 documents, all CommonMark features: 331 failures. Classes:
  - kind 7 HTML on a lazy line that interrupts a paragraph (`> a\n<x>\n`). micromark: kind 7 in interrupt mode has no early `ok`, so its check reads into the next line. The paragraph's content token is still open when the document tokenizer looks for a token spanning the lazy line's start, so the containers are not exited and continue on later lines (`> a\n<x>\n> c` gives html `<x>\nc` inside the quote). At end of file with no line ending the check resolves and the html lands outside (`> a\n<x>`).
  - indented code that starts on a line where an open container did not match (micromark's lazy line, no new container) is one line long: `furtherStart` checks `lazy[now().line]` at that line's line ending (`>\n    a\n    b` gives two code blocks).
  - list item end when its last child kept the line ending (fenced code, HTML 1 to 5): prepareList walks back from the next item prefix or the list exit and finds no line ending, so the item ends at that event: after the next marker and its whitespace (`- ```\n  a\n- b` ends at 3:3), or at the end of the text (`- ```\n ` ends at 2:2).
  - `tip` (`    a\n-`).
  - CR line endings in fenced code and indented code (`\ta\r*`).

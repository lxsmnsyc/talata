# Log: ext-directive

- The reference test inputs come from `test/index.js` of micromark-extension-directive and `test.js` of mdast-util-directive. A stub `micromark` and `fromMarkdown` recorded the first argument of every call: 260 distinct inputs. All 260 match with and without GFM.
- micromark classifies a tab as neither whitespace nor punctuation (it is the code -2), so a tab can be part of a directive name or attribute name (`::a\t`, `{c\t=d}`). `kindOf` in `syntax.ts` handles it.
- Attribute values use `parse-entities` with `attribute: true`: numeric references need no semicolon, legacy names (`&amp`) need none unless `=` or an alphanumeric follows. `entities.ts` copies that, with the legacy list and the C1 table.
- Label trailing spaces and tabs are kept by the reference (`:a[b  ]` has the text `b  `). The inline parser drops them at the end of a range, so a fix puts them back (`restoreTrailing`).
- Text directive labels are parsed after all leaves, in a transform. Parsing them inside the rule loses the module state of the link, strikethrough and literal autolink rules for the outer leaf. Image `alt` text is filled from a marker afterwards. The GFM literal autolink pass is run on the labels by hand, skipping links as it does.
- A definition or footnote definition inside a container directive is hidden from text that micromark reads in the same or an earlier pass (`scopes.ts`). Depth D is known to text at depth T when D <= T, or D == T + 1 and the text is after the directive's opening line.
- Container content is parsed as its own document, so blocks inside end before the closing fence line, and before an empty last line. `continue` closes them itself through the parser's `closeTo`. The directive closes itself on the fence line so the next line is not an unmatched-container line.
- A directive is not a container for `closeKeepsLineEnding`: `isContainer` answers false on the first read (`attach`).
- Indented code and kind 7 HTML after a directive that did not match need wrapper rules, because the parser still sees the directive's paragraph as lazy.
- The spread of a list item around a directive with a blank line inside comes from the tree in a transform (`fixes.ts`), as the core does for footnote definitions.
- Fuzz: seed 8303, many failures at first came from the pieces above. The tab cases in quotes were the last ones.

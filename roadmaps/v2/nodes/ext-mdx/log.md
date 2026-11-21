# Log: ext-mdx

- 2026-11-21: branch feat/ext-mdx reset to batch/v2. src/mdx.ts did not exist; built from scratch. Scanner ports factoryTag and factoryMdxExpression as a line-fed state machine; flow rule is a concrete leaf; a transform builds elements from tag markers like mdast-util-mdx-jsx.
- 2026-11-21: fuzz rounds with 4 parallel seeds of 100k-150k (seeds 1-94) found error order across micromark passes, flow constructs that fail on a later line (paragraph re-reads), image labels, lazy lines; each class fixed and added to test/mdx.test.ts.
- 2026-11-21: 1M runs seeds 20261121-27 found 1-4 classes each (lazy points, directive heads in re-reads, table header HTML); fixed. Seed 20261128 clean. Full check done.
- 2026-11-21: review fixes (definitions in re-reads, unclosed container directives, footnote lazy points, linear joins, failAt removed). 1M seed 20261201 clean. Full check done.

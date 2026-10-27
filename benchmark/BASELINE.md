# Baseline

Numbers measured on 2026-10-27 before talata existed, on an Apple M2 with Node 26.12.1. Another process was building at the time, so absolute times are noisy; the interleaved ratios are reliable.

## Spec tests (CommonMark 0.31.2, 652 examples)

| Parser      | Passed  |
| ----------- | ------- |
| micromark   | 652/652 |
| markdown-it | 652/652 |
| marked      | 557/652 |

## Speed (interleaved, median of 15 rounds)

| Pipeline                                    | readmes | fs.md  | CHANGELOG_V22 |
| ------------------------------------------- | ------- | ------ | ------------- |
| micromark to HTML                           | 450 ms  | 173 ms | 499 ms        |
| micromark to HTML + GFM                     | 552 ms  | 209 ms | 581 ms        |
| mdast                                       | 427 ms  | 169 ms | 491 ms        |
| mdast + GFM (remark-parse + remark-gfm)     | 591 ms  | 223 ms | 611 ms        |
| markdown-it to HTML (tables, strikethrough) | 68 ms   | 38 ms  | 96 ms         |
| marked to HTML (GFM)                        | 49 ms   | 21 ms  | 66 ms         |

mdast + GFM is 6x to 9x slower than markdown-it. The gap is widest on many small files.

## Profile (mdast + GFM, READMEs plus fs.md, 20 passes)

| Area                                                             | Self time |
| ---------------------------------------------------------------- | --------- |
| Tokenizer state machine (`create-tokenizer.js`)                  | about 23% |
| Re-tokenizing nested content (`subtokenize`, edit map, `splice`) | about 22% |
| Building mdast from the event list (`mdast-util-from-markdown`)  | about 9%  |
| Garbage collection                                               | about 9%  |
| GFM autolink literal (regex plus tree walk)                      | about 5%  |
| GFM tables                                                       | about 2%  |

---
goal: Decide whether talata adds an HTML output identical to micromark(value, {extensions: [gfm()], htmlExtensions: [gfmHtml()]}), or keeps HTML as a non-goal
date: 2026-10-28
rounds: 1 of 1
status: approved        # the user delegated the decision to the orchestrator
roadmap: roadmaps/v1
supersedes: none
decision: roadmaps/v1/GOAL.md, Decisions, 2026-10-28
---

# Debate: HTML output identical to micromark

Short debate: one round, claims written by the orchestrator, no subagents. The user asked for the decision to be made without them.

## Settled structure

- HTML output stays a non-goal for 0.1 (P3). talata replaces `mdast-util-from-markdown`, which is how almost all of micromark's installs are used (J3, J4).
- The release README documents HTML through the existing path, `mdast-util-to-hast` then `hast-util-to-html`. It is 6.5x to 7.5x faster than micromark's HTML (J1), and its HTML is not byte-identical to micromark's (J2).
- An outline node `html-output`, priority `later`, holds the byte-identical `talata/html` entry. It is revisited only when users ask for it after 0.1. If it is built, the spec harness and an HTML mode of the fuzzer are its tests (P2, O4).

## Budget

- time: no change to 0.1. A byte-identical renderer would cost about one L node (O1).
- device: none for 0.1. If built later, it goes in a separate `talata/html` entry so the main bundle does not grow (O2).
- tokens: this debate, about 15k.
- scope: talata's contract stays "same mdast as mdast-util-from-markdown". HTML-only extensions stay out of the extension plan (O3).

## Rejected

- P1, a byte-identical `talata/html` in 0.1: at most 3% of micromark's reach is direct use (J3), the origin of the idea defines the target as the same mdast (J4), and HTML users already get 6.5x to 7.5x through to-hast (J1), so the L-sized cost (O1) is not worth it before 0.1.

## Prior art

- `~/Documents/GitHub/micromark-baseline/README.md`: the idea is a rewrite of micromark and mdast-util-from-markdown that produces the same mdast; HTML is only a baseline row (J4).
- npm weekly downloads: micromark 58.1M, mdast-util-from-markdown 56.5M, remark-parse 50.8M (J3).

## Open risks

- Direct micromark HTML users ask for exact output (O3, J2): accepted. The outline node exists, and the README states that the to-hast HTML differs.

## Answers from the user

- "Using the goal-debate, please decide this on your own."

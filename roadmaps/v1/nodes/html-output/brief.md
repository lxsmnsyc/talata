---
id: html-output
title: HTML output identical to micromark
status: todo
priority: later
type: feature
outline: true
milestone: m4-extensions
target:
from:
size: L
spike: false
verify:
exclusive: []
fulfilled_by:
gate: false
added: 2026-10-28
owns: []
shared: []
reserves: []
provides: []
depends_on:
  - on: release
    kind: hard
    why: revisited only when users ask for it after 0.1
---

# HTML output identical to micromark

## Goal

A separate `talata/html` entry whose `toHtml(value, { gfm })` returns the same string as `micromark(value, { extensions: [gfm()], htmlExtensions: [gfmHtml()] })`.

## Notes

Outline, parked. See `roadmaps/v1/debate-html/debate.md`. Tests: the spec harness compares HTML, and the fuzzer needs an HTML mode, because spec examples are normalized and callers depend on exact bytes.

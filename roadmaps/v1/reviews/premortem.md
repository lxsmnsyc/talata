# Premortem

It is some weeks from now and talata 0.1 has not shipped. Why?

1. **Positions never matched.** The reference counts columns and offsets in ways the spec does not define (tabs inside container prefixes, `\r\n`, positions of lists that end in blank lines). Change: core-skeleton tests positions against the reference from its first step, and every acceptance criterion compares whole trees with positions.
2. **The block parser frame did not fit lists.** core-skeleton designs the container stack before blocks-container meets the hard cases. Change: core-skeleton is a gate, and blocks-container writes a change request instead of reshaping the core on its own.
3. **The speed target was missed after everything was correct.** A frame that builds strings or objects per character stays slow. Change: core-skeleton measures paragraphs-only input early, and the project rules forbid line strings and regular expressions in hot paths. perf-pass has a fixed, measurable target.
4. **GFM autolink literals took far longer than planned.** The reference finds them in a tree pass with many special cases. Change: gfm-inline is separate from tables and footnotes, so the rest of GFM is not blocked.
5. **The fuzzer found rare differences late.** Change: differential-fuzz is built in wave 2, so it runs as soon as spec-green flips `READY`.

# Log: bundle-size

- Nothing existed yet (no `size` script, no `benchmark/size/`). Started from scratch.
- First measure (esbuild, minified, GFM): talata 34.7 KB gzip against 35.9 KB in Node; 34.7 against 23.8 KB in the browser (reference uses the DOM there). The entity table is 11.1 KB of the gzip total.
- Tried encodings on the table (gzip, in isolation): current 11.1 KB; front-coded names plus values in one stream 9.5 KB; the same sorted case-insensitively 10.4 KB (worse); sort by value 10.1 KB (worse). Took front coding with no separators.
- Dead end, not done: computing the fraktur/script/double-struck families (about 133 astral entries) would save maybe 0.3 KB gzip and cost code.
- The `fjlig` value "fj" has ASCII letters, so it is set in code, not in the table.
- Browser build: tsdown second config with an import swap for `./entities`. Works; `dist/browser/` keeps through repeated builds.
- Open: DOM decoder untested in a browser.

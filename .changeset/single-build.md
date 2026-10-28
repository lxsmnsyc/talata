---
'talata': patch
---

Ship one build for every runtime. The `browser` export condition and the DOM-based entity decoder are gone, so bundlers for workers, edge runtimes and server rendering no longer need special conditions. Browser bundles grow by about 10 KB gzip.

---
'talata': patch
---

Make deeply nested container directives in `talata/directive` parse faster. Each line read every directive around each open directive again, so a chain of 800 nested directives took over 4 seconds; it now takes about 60 ms. The tree does not change.

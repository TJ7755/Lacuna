# Dashboard study priority

The built app's seeded Welcome course reproduces #665 at a 1366×600 browser viewport:
the forecast and weekly summary push the first Study button entirely below the fold.
Moving the existing queue before the forecast makes that action visible without scrolling.

- [Before, 1366×600](before-1366.png).
- [After, 1366×600](after-1366.png).
- [After, 390×844 with 200% text](after-390-large-text.png).

Captured in Chromium with reduced motion. The browser regression checks the complete button
bounds, horizontal overflow, and opening Session preview through pointer or keyboard activation.
Desktop/mobile runs at 100% and 200% text all pass. These are local fixture screenshots,
not a production-data or packaged-desktop claim.

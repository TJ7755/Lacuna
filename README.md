# Toast layout and entrance hit-area evidence for #826 / PR #832

Final candidate: `486a83ff4797024299a7469e040178ec6b0fdaae`. Previous candidate: `c7a3caad331369ee2ac263bd1c83e19388e0b621`.
All images and samples contain synthetic fixtures. No application source is included in this evidence branch.
[Earlier recitation diagnosis and original issue evidence](round3-evidence.md) remain retained as historical evidence.

## Action and persistent controls throughout entrance

The existing entrance animation scales a toast from 0.96 to 1. A 44px control therefore presents a
42.24px target initially. Both action and persistent-dismiss controls now use the existing 48px
spacing token, presenting at least 46.08px at scale 0.96. Surrounding padding is reduced so the outer
controlled toast stays at 54px. The decorative countdown ignores pointer events to retain the bottom
edge of the action's hit area. The surrounding toast still handles hover pause.

The new geometry test renders the actual ToastProvider/Toast component with the generated production
stylesheet and existing LazyMotion features. An in-memory test bundle is necessary because persistent
dismissal has no current production caller. No production test API, dependency or abstraction is added.
The component fixture blocks service workers only in its own browser contexts so its request routes
remain under test control; application workflow tests keep their existing configuration.

Samples begin at the initial 0.96 frame and continue on every animation frame until after scale 1.
Tests measure both dimensions and verify DOM hit testing at the four ends of a 44px diameter within
each rounded control. They retain the 56px toast-height and 24px bottom-gap ceilings and then activate
the real Undo or Dismiss button. Action, persistent action and persistent dismissal are all sampled.

| Width and type | Before minimum height | Final minimum height | Final minimum width | Maximum toast height | Maximum bottom gap | Final samples |
| --- | --- | --- | --- | --- | --- | --- |
| 1280px action | [Before: 42.24px](round4/before/action-1280-geometry.json) | 46.08px | 57.10px | 54.00px | 17.08px | [Geometry](round4/final/action-1280-geometry.json), [image](round4/final/action-1280.png) |
| 1280px persistent | [Before: 42.24px](round4/before/persistent-1280-geometry.json) | 46.08px | 46.08px | 54.00px | 17.08px | [Geometry](round4/final/persistent-1280-geometry.json), [image](round4/final/persistent-1280.png) |
| 390px action | [Before: 42.24px](round4/before/action-390-geometry.json) | 46.08px | 57.11px | 54.00px | 17.08px | [Geometry](round4/final/action-390-geometry.json), [image](round4/final/action-390.png) |
| 390px persistent | [Before: 42.24px](round4/before/persistent-390-geometry.json) | 46.08px | 46.08px | 54.00px | 17.08px | [Geometry](round4/final/persistent-390-geometry.json), [image](round4/final/persistent-390.png) |

All four old-geometry cases fail at 42.24px against 44px. All four final cases pass, including every
sample's hit tests. Screenshots show the settled toast; the linked JSON records entrance geometry.
The animation, duration, easing, timer, hover/focus pause and callbacks are unchanged.

## Import-toast layout

The original import fixture still adds 63 cards, then applies five updates and 58 removals. It retains
the exact update sentence, balanced wrapping, first-line icon alignment, comfortable padding and an
inset countdown. The short-message obstruction correction is retained.

| Width and theme | Original update | Final update | Final short |
| --- | --- | --- | --- |
| 1440px light | [Base](before/1440-light-update-toast-detail.png) | [Final](round4/final/1440-light-update-toast-detail.png) | [Short](round4/final/1440-light-short-toast.png) |
| 1440px dark | [Base](before/1440-dark-update-toast-detail.png) | [Final](round4/final/1440-dark-update-toast-detail.png) | [Short](round4/final/1440-dark-short-toast.png) |
| 390px light | [Base](before/390-light-update-toast-detail.png) | [Final](round4/final/390-light-update-toast-detail.png) | [Short](round4/final/390-light-short-toast.png) |
| 390px dark | [Base](before/390-dark-update-toast-detail.png) | [Final](round4/final/390-dark-update-toast-detail.png) | [Short](round4/final/390-dark-short-toast.png) |
| 320px light | [Base](before/320-light-update-toast-detail.png) | [Final](round4/final/320-light-update-toast-detail.png) | [Short](round4/final/320-light-short-toast.png) |
| 320px dark | [Base](before/320-dark-update-toast-detail.png) | [Final](round4/final/320-dark-update-toast-detail.png) | [Short](round4/final/320-dark-short-toast.png) |

## Commands and results

- `PLAYWRIGHT_WEB_PORT=4426 bun run verify:browser -- --project=chromium tests/e2e/toast-control-geometry.spec.ts --workers=1`: previous source, four failures at 42.24px; final source, four passes.
- `PLAYWRIGHT_WEB_PORT=4426 bun run verify:browser -- --project=chromium tests/e2e/recitation.spec.ts tests/e2e/dashboard-course-actions.spec.ts tests/e2e/toast-layout.spec.ts tests/e2e/toast-control-geometry.spec.ts tests/e2e/study-card-fit.spec.ts --workers=1 --grep 'cumulative recitation|toast layout|throughout entrance|course actions|Sidebar ordering|feedback'`: **22 passes**. This includes all 18 previous focused cases and the four entrance cases, with touch study at both 1280px and 390px. Existing 44px, 56px and 24px bottom-gap assertions remain intact.
- `bun run test -- src/components/ui/Toast.test.tsx --maxWorkers=1`: 13 passes.
- `bun run typecheck`, `bun run lint`, `bun run docs:check`, `bun run changelog:check`: pass.
- `git diff --check`: pass; final working tree clean.

The frozen browser source subsequently committed as `486a83ff4797024299a7469e040178ec6b0fdaae` has patch SHA-256
`84cc0c1bdf4ff3be1603027b5eaf5042c86090f7d9f0a66457b8ec4a1cbd1f85` from `c7a3caad331369ee2ac263bd1c83e19388e0b621`. It matches the committed patch.

Platform coverage is Chromium web on macOS, including real normal-motion entrance samples at 1280px
and 390px and the existing reduced-motion import layouts. Native Windows/Linux/macOS runtime/package
checks, WebKit and physical mobile devices were not rerun locally. Fresh independent Standards/Spec
reviews and full CI are required for this SHA. No assertions, animation or gates were weakened.

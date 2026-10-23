# Toast layout evidence for #826 / PR #832

All screenshots contain synthetic fixture content. Chromium on macOS, 900px height, reduced motion.

- Base: `acec3ef9540d8e8a27f0bdefbcb251a4c4ee7a46` (`before/`).
- Initial reviewed candidate: `09e7f632f3c9f5de0aeadcd722cee3805b87a629` (`after/`).
- Corrected candidate: `7ec49d5a45f42767ea966723448c7545b20308ed` (`corrected/`).

The real course-file import adds 63 cards, then updates five and removes 58 to emit the exact
reported message. Captures show the destination course page after SharedCourseImport completes.
The final candidate retains balanced wrapping, padding, first-line icon alignment and the inset
countdown track in all six width/theme combinations.

| Viewport and theme | Base update | Corrected update | Corrected short |
| --- | --- | --- | --- |
| 1440px light | [Base](before/1440-light-update-toast-detail.png) | [Corrected](corrected/1440-light-update-toast-detail.png) | [Short](corrected/1440-light-short-toast.png) |
| 1440px dark | [Base](before/1440-dark-update-toast-detail.png) | [Corrected](corrected/1440-dark-update-toast-detail.png) | [Short](corrected/1440-dark-short-toast.png) |
| 390px light | [Base](before/390-light-update-toast-detail.png) | [Corrected](corrected/390-light-update-toast-detail.png) | [Short](corrected/390-light-short-toast.png) |
| 390px dark | [Base](before/390-dark-update-toast-detail.png) | [Corrected](corrected/390-dark-update-toast-detail.png) | [Short](corrected/390-dark-short-toast.png) |
| 320px light | [Base](before/320-light-update-toast-detail.png) | [Corrected](corrected/320-light-update-toast-detail.png) | [Short](corrected/320-light-short-toast.png) |
| 320px dark | [Base](before/320-dark-update-toast-detail.png) | [Corrected](corrected/320-dark-update-toast-detail.png) | [Short](corrected/320-dark-short-toast.png) |

Full-viewport update captures are retained beside the detail captures as `*-update-toast.png`.
Original before/after screenshots remain available for the initial reviewed candidate.

## CI regression and correction

[Failed CI job](https://github.com/TJ7755/Lacuna/actions/runs/39980796154/job/120508695387):
`dashboard-course-actions.spec.ts:58` measured 86px against the unchanged 56px compact-toast
limit at 390px and 1440px, on both original attempts and retries. This is deterministic,
not an infrastructure flake. A single-line toast with one notification reproduced it locally.

The separate countdown row and uniform 12px vertical padding added height around the 44px action
button: 44 + 24 + 12 + 4 + 2 = 86px. The correction keeps action/persistent toasts compact,
centres the icon/message group beside their controls and uses an absolutely inset 2px track.
Message-only toasts keep their roomier layout. Timers, pause handling, actions, live-region
attributes and existing assertions are unchanged.

| Width | Base source | Reviewed candidate (86px failure) | Corrected candidate |
| --- | --- | --- | --- |
| 390px | [Base](ci-diagnosis/baseline/390-dashboard.png) | [Reviewed](ci-diagnosis/reviewed-candidate/390-dashboard.png) | [Corrected](ci-diagnosis/corrected/390-dashboard.png) |
| 1440px | [Base](ci-diagnosis/baseline/1440-dashboard.png) | [Reviewed](ci-diagnosis/reviewed-candidate/1440-dashboard.png) | [Corrected](ci-diagnosis/corrected/1440-dashboard.png) |

Commands and results:

- `PLAYWRIGHT_WEB_PORT=4426 bun run verify:browser -- --project=chromium tests/e2e/dashboard-course-actions.spec.ts --workers=1`: reviewed candidate 2 failures (86px), 3 passes.
- `PLAYWRIGHT_WEB_PORT=4426 bun run verify:browser -- --project=chromium tests/e2e/dashboard-course-actions.spec.ts --workers=1 --grep 'Today course actions preserve keyboard focus'`: exact base source 2 passes. The bound branch stayed in place; the entire working source matched the base, proved by an empty base diff and reverse-patch fingerprint `045c35cb5219de442db9aac7b82bf2f22bf1fb735734bacac16f09028b9dd286`.
- `PLAYWRIGHT_WEB_PORT=4426 bun run verify:browser -- --project=chromium tests/e2e/dashboard-course-actions.spec.ts tests/e2e/toast-layout.spec.ts --workers=1`: corrected candidate 11 passes, including the unchanged 56px compact-height and 44px Undo-target assertions, keyboard focus, actual Undo and all six update-toast layouts.
- `bun run test -- src/components/ui/Toast.test.tsx --maxWorkers=1`: corrected candidate 13 passes, including timer, hover/focus pause, announcements, persistence and callback coverage.
- `bun run typecheck`, `bun run lint`, `bun run docs:check`, `bun run changelog:check`: passed.

The corrected browser run verified frozen source subsequently committed as `7ec49d5a45f42767ea966723448c7545b20308ed`.
Its patch SHA-256 from the reviewed candidate is `5f2e209c2aef9a4cd705f5da40a7f9591b6651c23c9623f4910a9677dfb208f8`;
this matches the committed patch. No assertions were loosened. Native platforms and WebKit
were not rerun locally; fresh independent review and the full CI gates are required for the new SHA.

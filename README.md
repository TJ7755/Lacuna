# Toast layout evidence for #826

All captures contain synthetic course content from `tests/e2e/toast-layout.spec.ts`.
Chromium, 900px viewport height, reduced motion, light and dark themes.
The course-file import uses the real SharedCourseImport caller: revision 1 adds 63 cards;
revision 2 updates five and removes 58, emitting the exact reported message.
Captures show the destination course page after import.

Base: `acec3ef9540d8e8a27f0bdefbcb251a4c4ee7a46`. Candidate: `09e7f632f3c9f5de0aeadcd722cee3805b87a629`.
The after run verified the frozen local source subsequently committed as the candidate;
its patch SHA-256 is `4496284e4a86354aba808585fb8a187b8332d216f01d27dec95679bed33b69aa`.

Command: `PLAYWRIGHT_WEB_PORT=4426 bun run verify:browser -- --project=chromium tests/e2e/toast-layout.spec.ts --workers=1`.
Before: six failures, all showing only 5px above the wrapped message against the required 12px minimum.
After: six passes, checking balanced two-line wrapping, padding, first-line icon alignment,
inset countdown track, viewport containment, overflow and the polite announcement region.
The final spec also waits for a partly elapsed countdown before the long-message capture.
Short-message captures precede automatic dismissal; the long toast is held by hover for capture.

| Viewport and theme | Before update | After update | Before short | After short |
| --- | --- | --- | --- | --- |
| 1440px light | [Before](before/1440-light-update-toast-detail.png) | [After](after/1440-light-update-toast-detail.png) | [Before](before/1440-light-short-toast.png) | [After](after/1440-light-short-toast.png) |
| 1440px dark | [Before](before/1440-dark-update-toast-detail.png) | [After](after/1440-dark-update-toast-detail.png) | [Before](before/1440-dark-short-toast.png) | [After](after/1440-dark-short-toast.png) |
| 390px light | [Before](before/390-light-update-toast-detail.png) | [After](after/390-light-update-toast-detail.png) | [Before](before/390-light-short-toast.png) | [After](after/390-light-short-toast.png) |
| 390px dark | [Before](before/390-dark-update-toast-detail.png) | [After](after/390-dark-update-toast-detail.png) | [Before](before/390-dark-short-toast.png) | [After](after/390-dark-short-toast.png) |
| 320px light | [Before](before/320-light-update-toast-detail.png) | [After](after/320-light-update-toast-detail.png) | [Before](before/320-light-short-toast.png) | [After](after/320-light-short-toast.png) |
| 320px dark | [Before](before/320-dark-update-toast-detail.png) | [After](after/320-dark-update-toast-detail.png) | [Before](before/320-dark-short-toast.png) | [After](after/320-dark-short-toast.png) |

Full-viewport update captures are retained beside each detail as `*-update-toast.png`.

# Session report directions

Throwaway design comparison on `design/session-report-directions`. No production screen has changed.

Run `bun run dev`, then open `/design/session-report/index.html?variant=A`.
Use the bottom arrows or keyboard left/right to compare; the appearance button switches light/dark.

- **A — Path:** the closest match to PR #296. A completed path leads into the goal, with two essential figures and a quiet progress line.
- **B — Quiet finish:** a centred endpoint with the result as the focal point. Best for the simplest first-pass sessions.
- **C — Session receipt:** a large closing message paired with one contained results card. More room for a fuller report.

All three use Lacuna's existing font and colour tokens, completion marker and action treatment. Timing, focus and the distraction explanation are available under Session details. The supplied screenshot is the data source: one card, 100% accuracy, 0% to 100% progress, 122.9s mean correct response and 97% focus.

This separate preview follows the existing `design/` convention because the report is a transient, full-screen endpoint, requiring a completed session to access. It imports the actual application stylesheet but does not initialise the application or write study data. Buttons show local preview feedback only. The comparison script is development-only and is not an application build entry.

Question: which information hierarchy should the real session report use? No direction has been selected. Once selected, implement against real SessionSummary props and cover all completion/limit states with regression tests. This visual prototype does not change runtime behaviour and is checked through browser inspection rather than production regression tests.

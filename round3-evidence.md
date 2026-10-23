# Toast layout evidence for #826 / PR #832

Final candidate: `c7a3caad331369ee2ac263bd1c83e19388e0b621`. Base: `acec3ef9540d8e8a27f0bdefbcb251a4c4ee7a46`.
All screenshots contain synthetic fixture content. Chromium, 900px height for import layout captures;
the recitation geometry replay uses CI's 1280 by 720 viewport.

[Earlier compact-action correction and initial issue evidence](round2-evidence.md) remains retained.
That page describes the earlier reviewed `7ec49d5a45f42767ea966723448c7545b20308ed` candidate, not the final candidate.

## Final import-toast layout

The real course-file import adds 63 cards, then updates five and removes 58, producing the exact
reported update message. Final screenshots retain balanced two-line wrapping, 12px vertical padding,
first-line icon alignment and an inset countdown track. Single-line notifications stay compact.

| Width and theme | Original update | Final update | Final short |
| --- | --- | --- | --- |
| 1440px light | [Base](before/1440-light-update-toast-detail.png) | [Final](round3/1440-light-update-toast-detail.png) | [Short](round3/1440-light-short-toast.png) |
| 1440px dark | [Base](before/1440-dark-update-toast-detail.png) | [Final](round3/1440-dark-update-toast-detail.png) | [Short](round3/1440-dark-short-toast.png) |
| 390px light | [Base](before/390-light-update-toast-detail.png) | [Final](round3/390-light-update-toast-detail.png) | [Short](round3/390-light-short-toast.png) |
| 390px dark | [Base](before/390-dark-update-toast-detail.png) | [Final](round3/390-dark-update-toast-detail.png) | [Short](round3/390-dark-short-toast.png) |
| 320px light | [Base](before/320-light-update-toast-detail.png) | [Final](round3/320-light-update-toast-detail.png) | [Short](round3/320-light-short-toast.png) |
| 320px dark | [Base](before/320-dark-update-toast-detail.png) | [Final](round3/320-dark-update-toast-detail.png) | [Short](round3/320-dark-short-toast.png) |

Full-viewport update captures are retained as `round3/*-update-toast.png`.

## Corrected shard-6 diagnosis

[Exact failed job](https://github.com/TJ7755/Lacuna/actions/runs/39982533438/job/120514112183)
tested the merge of `7ec49d5a45f42767ea966723448c7545b20308ed` into `acec3ef9540d8e8a27f0bdefbcb251a4c4ee7a46`. Both attempts timed out at
`recitation.spec.ts:48`, clicking Study Poems: the Sequence added toast intercepted pointer events.
The retained trace repeatedly targets y=645 while the toast occupies y=642 through 704.
[CI failure screenshot](round3/ci-shard6-failure.png).

A normal local run and five repeated runs with two workers passed. Rather than calling this a flake,
a temporary diagnostic test replayed the stable CI click geometry at y=645, normalising only the
horizontal font metrics. It uses the real sequence-creation and study flow, with an ordinary click;
no forced click, timer change, pause removal or weakened assertion.

| Application source | Toast height and top | Replay result | Screenshot |
| --- | --- | --- | --- |
| Exact base application source | 44px, y=660 | Pass | [Base](round3/base-ci-geometry.png) |
| Reviewed `7ec49d5a` | 62px, y=642 | Click intercepted | [Reviewed](round3/reviewed-ci-geometry.png) |
| Final `c7a3caad` | 46px, y=658 | Pass | [Final](round3/fixed-ci-geometry.png) |

The base application source matched the base commit with an empty diff excluding the temporary
replay test. The replay normalises the trigger centre to 16px inside the toast's left edge, while
retaining CI's y=645 click point. The correction keeps the reviewed width and changes only height:
placing the track inside existing padding removes the extra countdown row. The temporary replay
was removed from the source tree after verification; local diagnostic evidence retains its source,
patch, geometry attachments and traces. The permanent toast-layout spec now asserts short toasts
remain at most 56px. It failed on the reviewed source at 62px before this correction.

## Commands and results

- `PLAYWRIGHT_WEB_PORT=4426 bun run verify:browser -- --project=chromium tests/e2e/recitation.spec.ts --workers=1`: reviewed source, one pass.
- `CI=true PLAYWRIGHT_WEB_PORT=4426 bun run verify:browser -- --project=chromium tests/e2e/recitation.spec.ts --repeat-each=5 --workers=2`: reviewed source, five passes; local timing alone does not reproduce CI.
- `PLAYWRIGHT_WEB_PORT=4426 bun run verify:browser -- --project=chromium tests/e2e/toast-recitation-ci-replay.spec.ts --workers=1`: reviewed source fails on toast interception; final source passes. This was a temporary diagnostic test.
- `PLAYWRIGHT_WEB_PORT=4426 bun run verify:browser -- --project=chromium tests/e2e/recitation.spec.ts tests/e2e/toast-recitation-ci-replay.spec.ts --workers=1`: exact base application source, two passes.
- `PLAYWRIGHT_WEB_PORT=4426 bun run verify:browser -- --project=chromium tests/e2e/toast-layout.spec.ts --workers=1 --grep 'toast layout at 1440px in light'`: reviewed source with the strengthened regression, fails at 62px against the unchanged compact-toast limit of 56px.
- `PLAYWRIGHT_WEB_PORT=4426 bun run verify:browser -- --project=chromium tests/e2e/recitation.spec.ts tests/e2e/dashboard-course-actions.spec.ts tests/e2e/toast-layout.spec.ts tests/e2e/study-card-fit.spec.ts --workers=1 --grep 'cumulative recitation|toast layout|course actions|Sidebar ordering|feedback'`: final source, 16 passes and two failures. All six toast cases, recitation, all five dashboard cases, keyboard study-feedback and typed study-feedback pass, including the original 56px height, 44px target and 24px bottom-gap assertions. Two touch-study measurements fail as described below.
- `bun run test -- src/components/ui/Toast.test.tsx --maxWorkers=1`: 13 passes.
- `bun run typecheck`, `bun run lint`, `bun run docs:check`, `bun run changelog:check`: pass.

The two extra local touch-study checks measured Undo slightly below 44px during the existing entrance
scaling (43.99px and 43.97px). A controlled comparison using
`PLAYWRIGHT_WEB_PORT=4426 bun run verify:browser -- --project=chromium tests/e2e/study-card-fit.spec.ts --workers=1 --repeat-each=2 --grep 'beneath feedback in touch'`
produced the same three failures and one pass on both reviewed and final application source.
Retained snapshots show the unchanged entrance scale still below one. These failures are reported,
not hidden or claimed as passing. No animation or target-size assertion was changed in this fix.

The final browser run verified frozen source subsequently committed as `c7a3caad331369ee2ac263bd1c83e19388e0b621`.
The patch SHA-256 from the reviewed candidate is `0bde8d76e736a3ee1e91ec573bf5c88d2d77db0252e46fb1400645d9a140195e` and matches
the committed patch. Fresh independent review and a fresh full CI pass are required for the final SHA.
Native platforms and WebKit were not rerun locally.

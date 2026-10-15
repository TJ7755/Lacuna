# Direction C preparation

Reviewed 15 October 2026. This records preparation evidence, not product acceptance or permission
to merge the redesign. The prompter has explicitly reserved that decision.

## Integration scope

The preparation branch starts at redesign commit `a17ddac6` and integrates master commit
`a9c80ed7`. The initial histories had 367 redesign-only commits and 94 master-only commits.
The integration resolves conflicts in 19 files while retaining the redesigned layout,
self-hosted fonts, editor validation and recitation feedback. It carries over master's
persistence, sync, author-mode enforcement, dependency and release fixes.

CI and Security both cover pull requests into `redesign/**`. All workflow Bun pins follow
the root's Bun 1.4.3 contract, including the manual Electron and newly integrated release jobs.
Local validation runs sequentially; full gates run on hosted Actions to respect laptop memory.

## Verification evidence

[Draft PR #536](https://github.com/TJ7755/Lacuna/pull/536) targets the redesign branch;
its [checks](https://github.com/TJ7755/Lacuna/pull/536/checks) identify the latest tested head.
No auto-merge is enabled. Both parent branches remain unchanged by this preparation.

Local focused verification passed 90 tests across the Card editor, Question editor, Pomodoro
and sync settings suites. Nine other conflict-focused suites passed in the preceding run.
The first local run exposed the missing locked-editor disabled state, a miswired timer bound
and an obsolete sync-panel assertion; the corrected suites passed without weakening the
locking or persistence assertions. A Card editor worker-start timeout passed on its rerun.

Red-to-green verification used an independent physical dependency copy in a disposable
worktree at the actual merge-base `a17ddac6`. These unchanged assertions failed there and
passed on preparation commit `8186ea5d`:

- `QuestionEditor.test.tsx`: blocks adding Concepts from a locked Question editor.
- `PomodoroSection.test.tsx`: keeps Short break within the timer maximum.
- `PomodoroSection.test.tsx`: keeps Long break within the timer maximum.

The focused command was `bunx vitest run src/pages/settings/PomodoroSection.test.tsx
src/pages/QuestionEditor.test.tsx --maxWorkers=1 --testNamePattern='blocks adding Concepts|keeps.*within the timer maximum'`.
The baseline failed exactly those three assertions; the head passed all three. The workflow
Bun consistency assertion also passed, and `node scripts/changelog.mjs --check` accepted all
172 fragments at that checkpoint. The disposable worktree has been archived.

Hosted source verification for `294fde18` is retained in
[CI](https://github.com/TJ7755/Lacuna/actions/runs/38698053805),
[Security](https://github.com/TJ7755/Lacuna/actions/runs/38698053776) and
[the native/package matrix](https://github.com/TJ7755/Lacuna/actions/runs/38698046952).
Consult those run conclusions and the current PR checks; dispatching a run alone is not a pass.
Later documentation commits do not change the packaged source tested at this revision.

The first native runs identified runner sandbox ownership and obsolete measurement controls.
Linux now configures `chrome-sandbox` ownership/mode on the isolated runner and retains the
application sandbox. The existing interaction suite opens Quick search with Ctrl/Cmd+K and
the course through its real link, recognising the current course title. This measures a
keyboard search gesture, so its timing is not directly comparable with the old button gesture.

## Published baseline

GitHub's published beta is `v0.2.14`, released on 14 October 2026 at 19:45 UTC. The official
release contains Windows installer/portable and Linux AppImage/DEB assets, updater metadata
and `SHA256SUMS-github.txt`; it has no macOS artefact.

The inherited installed-upgrade gate pins `v0.2.13` by installer digest and tests its automatic
upgrade to this branch's `0.2.14` build. That provides historical-profile evidence. It cannot
certify an automatic upgrade from the already published `v0.2.14` to the next release: that
requires a higher target version and a freshly pinned baseline during release preparation.
No version bump, release notes, tag or publication is authorised by this preparation task.

## Remaining acceptance boundaries

- Full CI covers automated migration/recovery, fixture-backed two-profile sync, browser and
  mobile WebKit workflows, Windows installed upgrades, and a packaged macOS smoke test.
- The manual Electron workflow builds Windows, Linux and macOS packages and runs the existing
  packaged-interaction suite, as well as native AI transport on Windows and macOS. Its AI harness
  does not prove a real model-authored conversation or managed-device policy compatibility.
- Fixture-backed sync proves client conflict handling; it does not prove real hosted-relay
  convergence between physical devices or network-filtered school installations.
- Signing, notarisation, physical touch, screen-reader checks and the clean managed-account
  matrix remain prerequisites where required by the rollout policy.
- The prompter must accept the remaining redesign work before PR #389 can merge. This
  preparation does not change that boundary or widen the rollout ring.

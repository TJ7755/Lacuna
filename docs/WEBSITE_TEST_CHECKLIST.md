# Human release verification

Use one frozen candidate and disposable profiles. Record commit/version, device, OS/browser, input
method, theme, app text size, native zoom and motion preference. Attach observations and original
captures to the owning release/issue. Automated check results come from that candidate's CI;
this checklist covers evidence those checks cannot supply.

## Human checks

- [ ] On a physical phone, study, reveal/mark, swipe, correct an answer and leave/resume work.
  Check deliberate pacing, gesture cancellation, sticky controls and keyboard occlusion.
- [ ] Use a real keyboard for repeated Card, Question and Sequence entry; correct invalid input,
  move backwards and retain drafts. Verify composition with a native IME.
- [ ] Use a screen reader through first use, navigation, an editor, study, errors/retry and a
  confirmation. Check names, context, focus hand-off and useful announcements without timer noise.
- [ ] At actual browser zoom and enlarged app text, inspect long content, dialogs, marking and
  error states. Confirm focused fields and actions remain visible; viewport resizing alone is insufficient.
- [ ] Inspect populated, empty, loading and error states in light/dark, supported accents and
  normal/reduced motion. Judge hierarchy, legibility, contrast, readable text during expansion,
  interruptions and rapid reopen/reversal. Screenshots cannot establish motion quality.
- [ ] Exercise real file selection, microphone recording, audio playback, camera/QR permission
  and device pairing. Verify permission denial and cancellation without losing entered work.
- [ ] Check real relay/provider availability and offline recovery on the target network.
  Intercepted service fixtures do not establish a live service or school-network policy.
- [ ] Recover disposable study data from a full backup and a historical profile using the intended
  platform procedure. Record exactly what survived and any manual intervention.
- [ ] For desktop releases, complete the [native, update and signing gates](maintenance/release.md).

## Novice tasks

Give outcomes without naming the controls: make a first Card and another; start recommended study;
create/attempt/self-mark a Question Set; find known material and return; recover a prepared failure
without losing work. Record completion without help, time, interventions, hesitation/backtracking
and readiness for the next item. Keep raw observations separate from interpretation. Comparative
usability claims require an equivalent named baseline and recorded task order/learning effects.

## Sign-off

Record passes, failures and untested items separately, with an owner for each outstanding item.
A browser assertion is engineering evidence; it is not physical-device, accessibility or novice
sign-off. Keep unresolved redesign gates in [#456](https://github.com/TJ7755/Lacuna/issues/456).

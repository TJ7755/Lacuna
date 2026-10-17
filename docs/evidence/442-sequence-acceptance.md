# Sequence acceptance after PR #389

Verified 17 October 2026 against merged master `a4971b29` and the authoring focus change
in `dd62bae2ca478dd02b84fe599b332dff9c36da65`. Scope: issue #442, SequenceEditor and
its outline rows, sequence recitation, focused tests, specification and evidence.

## Delivered baseline and the residual fix

The merged editor already uses **Enter to add/split an item** and **Ctrl/Cmd+Enter to
save the whole sequence**. These are the accepted shortcuts for this audit. The issue's
Ctrl/Cmd+Enter-to-add wording is obsolete.

Parent acceptance resolution, 17 October 2026: the delivered outline also supersedes
the historical per-empty-row invalidation and script paste-replacement warning criteria.
Blank scaffolding is omitted from preview, generated cards and save; an all-empty form
must still validate and remain unsaved. Paste inserts at the current selection while
preserving surrounding items, so a whole-script replacement warning is not applicable.
These safer delivered behaviours preserve the fast item loop. Do not restore the old
dialog or invalidate harmless blank scaffolding.

`93ce819f` already fixes the narrow/enlarged action dock. `bb599586` already assigns
leading speaker cues to the next learner line's chunk, trims later cues from unlocked
prefixes, presents the new learner line, and keeps focus in view through reflow. Both
are ancestors of `a4971b29`. This PR does not change or claim authorship of those fixes.

One residual defect reproduced in the browser: after three ordinary items, forward Tab
from Item 3 content focused **Add item**, rather than **Add sequence**. The outline
rebuild had lost the last-item hand-off. The fix passes the existing editor save ref
through the outline to its last content field, using the same successful-focus guard
as MarkdownEditor. Earlier items, backward Tab and disabled save targets retain native
navigation. Tab focuses without saving; the save chords remain unchanged.

## Automated evidence

Before the fix, with only the new regression tests applied to `a4971b29`:

```sh
bun run test src/pages/SequenceEditor.test.tsx --maxWorkers=1 -t 'Tabs from|leaves backward'
```

Result: **3 failed, 1 passed, 31 skipped**. Ordered list, Poetry / verse and Script /
dialogue each failed `expect(Add sequence).toHaveFocus()`; the final content field
retained focus in Happy DOM, which does not perform native Tab traversal. The live
browser independently established that native traversal went to Add item.

After the fix the same four tests passed. The final suite additionally covers a locked
course's disabled save target and both Control and Meta save chords:

```sh
bun run test src/pages/SequenceEditor.test.tsx src/pages/learn/recitation/SequenceRecitation.test.tsx src/pages/learn/recitation/recitationFlow.test.ts src/components/sequences/sequenceOutline.test.ts src/db/sequenceGeneration.test.ts src/db/sequencePresets.test.ts src/db/sequenceRepository.test.ts --maxWorkers=1
bun run typecheck:web
bun run changelog:check
git diff --check
```

Initial result: **134 tests passed in 7 files**, no web type errors, **280 valid changelog
fragments**, and no whitespace errors. Bun **1.4.3**; dependencies installed with
`bun install --frozen-lockfile`. No lint was run: the parent task owns serial lint.

### Independent review correction: legacy IME composition

Independent review of `86565eba` found that a last-row Tab with `keyCode: 229` and
`isComposing: false` moved focus to Save and prevented the default. The row only checked
the modern composition flag, unlike MarkdownEditor and useEditorKeys. The row guard now
also returns for legacy key-code 229 before any focus hand-off or outline gesture.

With only the new regression applied to `86565eba`:

```sh
bun run test src/pages/SequenceEditor.test.tsx --maxWorkers=1 -t 'composition Tab'
```

Result: **1 failed, 1 passed, 37 skipped**. The legacy case failed both assertions:
focus moved from Item 2 content to Add sequence, and `defaultPrevented` was true. The
modern composition case already passed. After the guard: **2 passed, 37 skipped**;
both cases retain item focus, leave the event unprevented and do not save.

Final follow-up result: the full seven-file command above passed **136 tests** with one
worker. Web typecheck again found no errors in 1,729 files across three projects.
Changelog and whitespace checks passed. Existing tests still cover Enter-add, both
Control/Meta save chords, earlier-row Tab, Shift+Tab and disabled-save fallback. No
existing assertion was weakened. No lint, browser or other computer-use tools were run
for this follow-up; the browser evidence below remains the original audit, not a rerun.

## Browser reproduction and results

Only built-in T3 `preview_*` tools were used for browser interactions, DOM measurements
and screenshots, against `bun run dev --host 0.0.0.0 --port 5442 --strictPort`.

- **Setup:** a new editor focuses Name and contains one blank row. From Name, ordinary
  content needs two Tabs; Poetry needs Tab, Right, Tab; Script needs Tab, Right, Right,
  Tab to Speaker, then Tab to content. These counts exclude typing the name. No
  historical pre-#389 runtime keystroke comparison was performed.
- **Repeated entry:** three consecutive items were entered for ordinary, poem and script
  types with Enter. Ordinary and poem saves persisted all three values. Script input
  parsed `NAME: line` on Enter and focused the next content field. Both Control+Enter
  and Meta+Enter saved in the browser; neither added a row. Forward Tab focused the
  save action for ordinary, poem and script, including a trailing blank row.
- **Correction:** splitting after the first ordinary item inserted beside the working
  position. Alt+Down moved the inserted item while keeping focus on it. Pointer Delete
  removed it; the second item was corrected before save. Existing focused tests also
  cover arrow navigation, Backspace joining, section breaks and multiline paste.
- **Validation:** an empty name returned focus to Name. A named empty sequence displayed
  “Add your first item to make cards.” A script without Your part displayed “Choose
  your part before saving.” and focused the first part choice. Choosing Bob allowed
  saving; trailing blank scaffolding was omitted. There is no per-blank-row save error
  in the delivered outline; it deliberately omits empty rows.
- **Disclosure and preview:** Options exposed description, cue-window, Learn in and
  label-card settings. Preview showed three poem fronts/backs using the live values.
  The script explanation kept other speakers as cues and required the learner's part.
- **320px / Larger:** selected the actual Larger setting in Settings, then measured
  `20.8px` root text, a 320px main client width and 320px scroll width. The dock extended
  from x=0 to x=320. Add sequence used `white-space: nowrap`, approximately 164.5px by
  57.2px, and the blank-content error remained visible. At 390px, client and scroll
  widths were both 390px and Tab focused Add sequence.
- **Long typed script:** authored twelve alternating lines: six Alice/Charlie cues and
  six long Bob replies. Bob was the selected part, with the default four learner lines
  per chunk. At 320px with Larger text, completed chunk rounds 1/2/3/4, then 1/2, then
  the six-line join. The second chunk presented Alice's Cue 5 and Reply 5, with no Cue 6
  in the presentation. No explicit scrolling workaround was used during progression.
  All **54 settled focus samples** had the active control entirely inside the viewport;
  see [the measurements](442-sequence-focus.json). Join line 3 remained visible after
  more than 15 seconds: an intentionally long evaluation hit the tool's 15-second
  timeout, and the subsequent DOM measurement passed. This is a delayed sample, not
  a continuous 15-second viewport assertion.
- **Manual marks:** matching text still revealed All correct without recording a mark.
  Pressing 1 marked the first line missed and Try again returned to that same recall.
  Deliberately different text could still be confirmed correct. Marking line 3 missed
  in the final join returned to the first four-line chunk; completing that retry and
  the rejoin reached Goal reached. The six generated learner cards each had one review:
  the first had grade 1, the other five grade 3; retry did not duplicate reviews. Cue
  lines had no generated cards.
- **Aloud:** selected Recite poems and scripts aloud in Settings and studied a fresh
  script with one cue and two learner lines. There were no textboxes. Reveal, number-key
  wrong marking, retry and manual confirmation reached Goal reached. No microphone or
  speech-recognition claim is made.

## Original captures

These are unmodified T3 exports, copied byte-for-byte; no resizing or upscaling.

| Capture | CSS viewport | Exported PNG |
| --- | --- | --- |
| [Last-item Tab to save](../screenshots/442-sequence/mobile-tab-save.png) | 390 × 844 | **780 × 1688** |
| [Blank validation and dock](../screenshots/442-sequence/320-larger-validation.png) | 320 × 800 | 640 × 1600 |
| [Second chunk's own cue and new line](../screenshots/442-sequence/second-chunk-presentation.png) | 1920 × 1080 | 1280 × 720 |
| [Join line 3 focus](../screenshots/442-sequence/join-line-3-focus.png) | 320 × 800 | 640 × 1600 |
| [Aloud manual marking](../screenshots/442-sequence/aloud-manual-marking.png) | 1280 × 800 | 1280 × 800 |

Desktop exports remain capped; the 1920px viewport is not a 1920px screenshot. Mobile
exports retain the native 2× pixels. `sips -g pixelWidth -g pixelHeight` verified the
dimensions; the capture files were not transformed.

## Acceptance outcome and external verification limits

Issue #442's implementation acceptance is met under the parent-approved current workflow:
Enter adds, Ctrl/Cmd+Enter saves, harmless blank scaffolding is omitted, all-empty content
still validates, and paste inserts at the selection. The residual last-item Tab-to-save
defect is fixed with red-to-green evidence. Historical wording no longer defers closure.
PR #567 can close #442 when the user reviews and merges it.

No further application defect was reproduced in the exercised paths. This evidence
does not establish real phone touch input, an on-screen keyboard, OS zoom, OS reduced
motion, screen-reader operation, Windows Electron, Linux or macOS packages. The focus
change adds no animation; existing reduced-motion and motion-speed code is unchanged.
It measures focused-control bounds, not operating-system caret geometry.

External human, accessibility and native-platform gates are owned by
[#456](https://github.com/TJ7755/Lacuna/issues/456), not deferred #442 implementation
acceptance. User review and merge remain human actions. Keep PR #567 open on its current
base until the parent confirms master has advanced after the non-redesign #564/#568 merge
sequence; only then rebase and inspect CI. The parent acceptance clarification changed
documentation only; the independent-review correction adds the legacy composition guard
and its regression coverage. No schema, backup/import,
wire format, permission, scheduling or generated-card/history ownership code changes.

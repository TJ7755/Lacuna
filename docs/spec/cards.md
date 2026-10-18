# Authoring and generated Cards

[CardEditor](../../src/pages/CardEditor.tsx), [QuestionEditor](../../src/pages/QuestionEditor.tsx)
and [QuestionSetEditor](../../src/pages/QuestionSetEditor.tsx) own their fields and shortcuts.
Use their tests for exact entry/repeat-save behaviour rather than maintaining a second UI manual.

Editing a recall presentation is not a reason to reset its memory state. Sequence and Occlusion
regeneration updates surviving presentations in their owning repository transactions; generated
Cards are edited through their source entity. Removing a source item is a deliberate removal,
not an ordinary front/back edit. Cloze parsing is owned by [cloze](../../src/utils/cloze.ts).

Crash drafts begin after an author change, not merely after mounting seeded content. An unresolved
recovery choice must not be overwritten by autosave. Flush pending drafts when leaving without
committing invalid content. Repeated entry preserves the chosen context but validates the new
prompt and returns focus to the meaningful next field.

Specialised Card entry retains its existing secondary controls. Numeric and Working use
Question -> Expected answer / Scheme source -> enabled repeat-save; backward Tab returns to
Question. Invalid drafts retain native traversal. Suggestions consume completion keys before save
shortcuts, and composition remains with the input method. Numeric answer focus survives check-mode
animation; validation still selects the first invalid accepted answer or tolerance.

Audio creation and repeat entry start at Choose file without requesting the microphone. Attaching
or explicitly stopping a recording focuses an empty Prompt, otherwise Answer, unless the learner
has moved elsewhere. Prompt -> Answer -> enabled repeat-save is the main Tab flow; backward Tab
from Answer returns to Prompt. Repeat-save clears audio content; Working also clears test answers,
verdicts, source and fixtures. Save permits one outstanding write, focuses and explains invalid
fields, retains failed drafts for retry, and guards successful departure through confirmation.
Unfamiliar types show a short outcome/example; the default Front / back needs no extra help.

New Questions require an explicit Primary skill practised Concept, even when the Course already
has Concepts. Edit/restore retains the stored choice; repeat entry retains the choice just saved.
Validation preserves inputs and focuses the first invalid field in page order. Numeric validation
uses the shared answer editor's input ref after state commits and across answer-mode transitions,
centring the invalid accepted answer or tolerance above sticky controls. Missing answers focus the
answer input. Generated-family integer bounds and root relationships validate before metadata;
correction clears the accessible error without replacing the input.

A Question's answer mode, scheme and passing fixture define its semantics. Changing them is not
a cosmetic edit. Known structured payloads share validation across authoring and imports;
unknown versions retain a read-only fallback rather than gaining a grading path.
See [structured verification](learn-mode.md#structured-item-verification).

A Question Set composer separates reusable set content from personal attempts. Scheme allocations
retain identity through edits; a group stem has no scored answer of its own. Automatic totals
and explicit manual totals remain distinguishable through the existing marks fields.

Lists may virtualise rendered rows, but surrounding layout changes must still update the measured
range. Later Lessons cannot materialise their whole Card collection merely because the learner
has not scrolled yet. Linked Cards are visibly distinct from owned, destructively selectable rows.

[Specification index](../SPEC.md)

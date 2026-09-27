# Quizlet comparison prototypes

Design exploration on `prototype/quizlet-comparison`. **A is the selected direction.**
Further iterations apply to A; B and C remain available as earlier alternatives.

Run `bun run dev`, then open `http://localhost:5173/#/prototype/quizlet?variant=A`.
The floating bar and left/right arrow keys cycle between the designs. Text inputs,
radio controls and screenshot dialogues retain their normal keyboard behaviour.

- **A — The product story:** exam-day headline alongside a recall forecast, then
  the product tour, practice, comparison, access, migration and FAQs.
- **B — The decision guide:** editorial exam-date headline, compact forecast and
  scheduling explanation, with a persistent chapter index.
- **C — The interactive explorer:** exam-day recall forecast first, followed by
  selectable study priorities, practice examples and the full comparison.

Every hero explains the exam objective. A now builds example review histories using
`applyReview`, plots the real forgetting curve between review events, and separates
history from the projection after today. The other variants' example forecast calls the existing
`rAtExam` and `rAtExamIfReviewedNow` functions with default FSRS parameters and three
illustrative memory states. The date selector changes the horizon; topic buttons
change the displayed card. Values describe predicted card recall, not exam marks.
No learner data is read or saved. The model assumptions are available in a disclosure.

Each design includes twelve filterable comparison rows with expandable detail, four
real product captures, five practice examples, online/offline and scheduling examples,
a text-transfer preview using Lacuna's existing parser, cost, choice guidance and FAQs.
Quizlet source links accompany claims. See `comparison-research.md` for the factual
basis and `captures/README.md` for screenshot provenance.

Practice examples are illustrative. The hero forecast uses the real memory model
with example cards; it is not a learner’s personalised revision plan. No results are saved.
The existing theme and accent apply to page components; screenshots retain the
appearance of the app at capture time. Reduced motion and a pause control are supported.
The route and its assets are development-only and excluded from production bundles.

Round one is preserved at commit `ed63e3aa`. Round two supersedes it. No public page
has been selected or published. Keep the prototype branch as the design record and
implement the selected direction separately from the discarded alternatives.

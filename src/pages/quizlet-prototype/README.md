# Quizlet comparison prototypes

Throwaway design exploration on `prototype/quizlet-comparison`. Decision pending:
which complete page best explains the differences with visual evidence, useful
interactions and minimal prose within each section?

Run `bun run dev`, then open `http://localhost:5173/#/prototype/quizlet?variant=A`.
The floating bar and left/right arrow keys cycle between the designs. Text inputs,
radio controls and screenshot dialogues retain their normal keyboard behaviour.

- **A — The product story:** oversized product reveal, real screen tour, scheduling
  and practice chapters, comparison, access, migration, candid trade-offs and FAQs.
- **B — The decision guide:** persistent chapter index, concise verdict and comparison
  first, followed by product evidence and practical details in an editorial layout.
- **C — The interactive explorer:** choose a study priority to change the opening
  product view, try five practice formats and explore the full comparison below.

Each design includes twelve filterable comparison rows with expandable detail, four
real product captures, five practice examples, online/offline and scheduling examples,
a text-transfer preview using Lacuna's existing parser, cost, choice guidance and FAQs.
Quizlet source links accompany claims. See `comparison-research.md` for the factual
basis and `captures/README.md` for screenshot provenance.

Examples are illustrative, not scheduler predictions. No study results are saved.
The existing theme and accent apply to page components; screenshots retain the
appearance of the app at capture time. Reduced motion and a pause control are supported.
The route and its assets are development-only and excluded from production bundles.

Round one is preserved at commit `ed63e3aa`. Round two supersedes it. No public page
has been selected or published. Keep the prototype branch as the design record and
implement the selected direction separately from the discarded alternatives.

# Quizlet comparison prototypes

Throwaway design exploration on `prototype/quizlet-comparison`. Decision pending: which
composition best explains Lacuna with minimal prose, animated graphics and a comparison table?

Run `bun run dev`, then open `http://localhost:5173/#/prototype/quizlet?variant=A`.
The floating bar and left/right arrow keys cycle through all three versions:

- **A — The countdown:** exam-led split hero, interactive calendar illustration and table.
- **B — Side by side:** shared flashcard foundations beside a connected course diagram.
- **C — The bigger picture:** interactive notes, recall, application and review walkthrough.

Graphics use HTML, CSS and SVG. Examples are illustrative, not live learner data or
scheduler predictions. Interactions remain in memory. Existing theme and accent tokens
apply; reduced motion and a pause control are supported. The route is development-only.

The comparison acknowledges Quizlet's spaced repetition, documented at
https://help.quizlet.com/hc/en-au/articles/48324742264077-Studying-with-Spaced-Repetition.
Learn and offline claims link directly to Quizlet's help pages in the table.
Sources checked 27 September 2026. This is not published SEO content.

Select a direction before implementing the public page. Preserve this branch as the
prototype record; do not merge the discarded variants into production.

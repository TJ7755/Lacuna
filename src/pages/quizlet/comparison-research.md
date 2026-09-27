# Comparison page design research — 27 September 2026

Evidence for the public comparison. Recheck linked product documentation when
changing claims, especially plan availability and study modes.

## Product claims

Quizlet primary sources:

- [Folders](https://help.quizlet.com/hc/en-ca/articles/360030986151-Organizing-study-content-with-folders): groups study content, supports tags and can be added to classes. The structure diagram must not imply that Quizlet only has isolated sets.

- [Spaced repetition](https://help.quizlet.com/hc/en-au/articles/48324742264077-Studying-with-Spaced-Repetition): recall ratings, scheduled returns, website availability.
- [Learn](https://help.quizlet.com/hc/en-au/articles/360030986971-Studying-with-Learn): personalised paths, question types, account requirement, subscription and classroom exceptions.
- [Study modes](https://help.quizlet.com/hc/en-au/articles/360030841732-Studying-on-Quizlet): flashcards, diagrams, AI practice tests, Study Guides, Expert Solutions and classroom games.
- [Offline](https://help.quizlet.com/hc/en-us/articles/360030565412-Studying-offline-with-Quizlet-mobile-apps): iOS/Android Flashcards and Match; material must be saved first.
- [Subscriptions](https://help.quizlet.com/hc/en-au/articles/360041181691-Subscribing-to-Quizlet): free account, Plus, Plus Unlimited, teacher and family plans. No fixed regional price quoted.
- [Export](https://help.quizlet.com/hc/en-us/articles/360034345672-Exporting-your-sets): own sets only, website, text terms/definitions; no images or copied sets.

Lacuna evidence: README.md, docs/spec/portability.md, src/db/import.ts,
src/components/landing/LandingFaq.tsx, src/db/seed.ts and the running application.
Core revision is free without an account; hosted AI is separate beta access. Optional
sync/sharing needs the network. Offline study needs downloaded app assets/material.
No automatic Quizlet URL import or transfer of Quizlet review history is promised.

## Course continuity and teacher sharing

The page illustrates course-wide lesson and review tracking, verified against
`src/pages/CourseAnalytics.tsx` and `src/state/useCourseData.ts`. It does not claim
that Quizlet has no memory tracking or no way to study multiple sets.

Teacher sharing follows `src/shareLinks/publish.ts`, `src/pages/SharePage.tsx`,
`src/db/share.ts` and `src/db/mergeImport.ts`: links and QR codes distribute course
material, excluding personal scheduling/history. Republishing reuses the link;
updates to retained cards preserve student review state. Large payloads use course
files. Sharing does not provide a teacher gradebook.

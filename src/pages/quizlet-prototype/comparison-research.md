# Comparison page design research — 27 September 2026

The first prototypes lacked enough evidence and depth to support a decision. This
round explores three complete journeys, keeping copy short within each section.

## Claims used in the prototypes

Quizlet primary sources:

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

## Three new directions

A: Product story — full-width product reveal, capability chapters, interactive recall
and application, comparison, migration, candid trade-offs, FAQ.
B: Decision guide — editorial two-column layout, sticky chapter index, comparison-led
hierarchy, product evidence, practical switching information.
C: Interactive field guide — choose a study priority, explore the relevant product
view, experiment with recall formats and a live import preview, then inspect evidence.

All three use the same verified facts, with different layouts and content ordering.
Screenshots show the current running app's built-in example course, without fabricated
review outcomes. Other diagrams are labelled illustrations, not predictions.

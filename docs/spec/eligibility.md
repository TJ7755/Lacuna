# 9. Eligibility & study pool (`src/fsrs/eligibility.ts`)

The single rule set that keeps the scheduler and the progress denominator in agreement
when cards are withheld.

- `isAvailable(card)` — not `suspended` and not currently `buried` (`buriedUntil > now`).
  Suspended/buried cards are excluded **entirely**: from the study pool _and_ from the
  progress/objective denominator while excluded.
- `newCardsIntroducedToday` — cards whose first-ever review timestamp is today.
- `studyPool(cards, deck)` — returns **empty for an archived deck** (withdrawn from
  study while its cards are retained in the progress denominator), otherwise available
  cards with brand-new (`state 0`) cards rationed by the deck's `newCardsPerDay` cap:
  ```
  budget    = max(cap - newCardsIntroducedToday, 0)
  newAllowed = oldest-first new cards, sliced to budget
  pool       = available cards where state != 0 OR id in newAllowed
  ```
  An undefined/zero cap means unlimited. The cap only rations **today's** study pool;
  it does **not** change the dashboard denominator, so the deck's exam-day trajectory
  stays honest while a session paces new material.

Course-path study applies two additional, explicit pools:

- **Lesson pool:** cards included in that lesson through either `primaryLessonId` or
  `LessonCardLink`, deduplicated by card id, for which no `(lessonId, cardId)` exposure
  exists. FSRS `state` is irrelevant here: a card may be scheduled elsewhere but still be
  unseen in this lesson.
- **Practice pool:** available cards belonging to at least one reached (`available` or
  `completed`) lesson, again including links and deduplicating by card id, which have been
  exposed in at least one lesson (unless **Learn first** is disabled) and whose predicted retrievability at their per-card
  scheduling horizon is below `MASTERY_R`. The exposure requirement prevents Practice from
  leaking unseen material. A link affects reachability but not horizon resolution, which
  remains anchored to the card's primary lesson and single shared FSRS memory state.

The existing `isDue`/`dueCards` helpers retain their narrower timestamp-based job for
"due today" display counts. They do not define Practice eligibility.


[Specification index](../SPEC.md)

# Eligibility and study pools

[eligibility](../../src/fsrs/eligibility.ts) owns availability; the [course path](../../src/course/path.ts)
and [session selection](../../src/fsrs/session.ts) apply it to their workflows.

Suspended and currently buried Cards leave both the study pool and the objective denominator.
Daily new-Card limits pace today's work without removing the withheld material from the readiness
denominator. Archiving withdraws active study without erasing historical evidence.

Lesson study uses membership plus Lesson-specific exposure, not the Card's FSRS state: material
reviewed elsewhere may still be unseen in this Lesson. Linked Cards are deduplicated by identity.

Practice draws from reached Lessons, respects Learn first exposure policy and uses the mastery
criterion at each Card's horizon. Due-only review has its narrower timestamp definition; due
counts must not silently become Practice eligibility. Question practice has its own pool and
must not borrow Card evidence or scheduling.

[Specification index](../SPEC.md)

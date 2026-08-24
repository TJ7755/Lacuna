# Lacuna domain language

This glossary defines the canonical terms for the learning content that Cards and Questions share.
Use these terms consistently in code, product copy and documentation.

## Language

**Concept**

A stable, course-scoped identity for one piece of knowledge. Cards present a Concept for direct
recall; Questions may practise it as their primary Concept or depend on it as a prerequisite.

_Avoid:_ atomic concept, topic, knowledge component. Use “skill” only in the learner-facing
“Primary skill practised” label.

**Card**

A direct-recall presentation of one Concept. Alternate presentations may share a Concept while
retaining independent Card scheduling evidence.

_Avoid:_ Question, problem, exercise.

**Question**

An application problem with exactly one primary Concept and any number of prerequisite Concepts.
A Question has evidence and a schedule that are independent of every Card.

_Avoid:_ Card, flashcard, Practice node.

**Question family**

A built-in generator configuration whose resolved variants share one Question identity and
schedule. Each variant is preserved in its Attempt.

_Avoid:_ Question template, generated Card, generator script.

**Attempt**

The immutable record of one presented Question or Question-family variant. It preserves the first
submission and may hold a separate correction without rewriting the original evidence.

_Avoid:_ Card review, answer record, mutable response.

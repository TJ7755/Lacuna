# Lacuna domain language

This glossary defines the canonical terms for the learning content that Cards and Questions share.
Use these terms consistently in code, product copy and documentation.

## Language

**Concept**

A stable identity for one piece of knowledge. New Concepts are course-scoped: Cards present them
for direct recall, while Questions may practise one as their primary Concept or depend on others as
prerequisites. Migrated Cards outside a Course retain compatibility-only Concepts scoped to their
legacy scheduling unit; Questions cannot target those Concepts.

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

The lifecycle evidence record for one presented Question or Question-family variant. Its
presentation receipt is immutable; the first submission and optional correction become separately
immutable when recorded, while lifecycle metadata may record answering, abandonment and a later
undo.

_Avoid:_ Card review, answer record, mutable response.

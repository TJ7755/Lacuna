# Portable Question banks

A bank is inert JSON, validated against [schema.json](schema.json). Examples:
[static multipart](examples/static-multipart.json) and [numeric family](examples/numeric-family.json).
The schema version is 1; unknown fields and unsupported versions are rejected. Bank IDs, set IDs,
family IDs, course codes and Concept IDs are stable author-chosen identifiers. Increment `bankVersion`
when publishing changes. A bank targets one course code; the application maps its Concepts into the
selected Course. Every criterion has exactly one primary Concept. Prerequisites are explicit.
Existing QuestionSet, QuestionAnswer and MarkAllocation shapes are reused, including multipart
Questions, per-criterion marks and assessment dimensions. A parent with children cannot also score.

Each static set and family carries a source title, reference, author and licence, plus a blueprint
with skill, type, difficulty and context. Record references accurately: a licence string is a
provenance assertion, not a grant of rights by the application.

A family has a stable ID and positive integer version. Its parameter map defines a finite Cartesian
product of distinct integer values, ordered by sorted parameter names and authored value order.
Each domain has at most 100 integers in [-1000000, 1000000]; the product is limited to 1000 variants.
The `derived` list evaluates in authored order. Each operand is an integer literal or the name of an
already available parameter or result. Supported operators are `+`, `-`, `*`, `/` and `^`; powers
require an integer exponent between 0 and 8. Division by zero, unknown names, duplicate variable
names, non-finite results and absolute results above 1000000000000 are errors. Families contain no
JavaScript and never use eval, dynamic imports, network access or arbitrary executable expressions.

Templates substitute `{{name}}` in titles, prompts, criteria, explanations and multiple-choice
option content. Unknown or malformed substitutions are errors. IDs and Concept links are never
templated. Numeric worked answers belong in the existing criterion/explanation fields; the family
example keeps all masses, volumes and answers coherent. Each variant must present distinct Question
content. Duplicate presentations are rejected rather than counting towards novelty.

The file-only materialise command expands all variants explicitly. Application import stores each
family once, using variant zero as its representative and retaining the original family configuration.
Practice resolves a requested index lazily without persisting thousands of authored copies. Family
capacity is the Cartesian product size; the bound applies separately to each family. A bank may
contain up to 100 families and 1000 static sets, including multipart sets with many answerable parts.

Materialisation produces ordinary QuestionSets with deterministic stable identities, a content
fingerprint and optional `bank` metadata: bankId, bankVersion, courseCode, setId, source, blueprint,
referenced Concept definitions and, for families, the original authored family plus variant index and parameters.
The fingerprint covers rendered authored content; it is an identity checksum, not a signature.
Unreferenced Concept definitions are retained on the first row so export stays lossless, while each
remaining row stores only Concepts it references. Local Concept mapping retains source IDs and source
order. Shared course import remaps the local identities inside retained family templates too.
Imported rows retain their original createdAt, increment contentVersion on change and receive a new
contentRevisionId. Reimporting identical content is a no-op. Removed bank sets are retained;
existing Attempts and their immutable presentation receipts are never rewritten or deleted.
Import is a single transaction across existing stores. An unrelated identity collision aborts it.
Export reconstructs static authored content and retains original family configurations.

Commands run from the application worktree with the repository's Bun version:

```sh
bun scripts/question-bank.ts validate bank.json
bun scripts/question-bank.ts materialise bank.json materialised.json
```

The CLI reads and writes files only. Learner IndexedDB belongs to the running application: use its
bank import action to call `importQuestionBank(value, courseId)` and its bank export action to call
`exportQuestionBank(courseId, bankId)`. `parseQuestionBank(value)` validates without writing.
`materialiseQuestionBank(value, courseId)` resolves deterministic content without database access.
`resolveFamilyVariant(set, index)` resolves one stored family without changing its authored identity;
`declarativeFamilyCapacity(set.bank.family)` reports the finite number of available variants.

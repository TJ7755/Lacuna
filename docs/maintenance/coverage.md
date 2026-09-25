# Risk coverage gate

CI runs `bun run test:coverage:risk` alongside the existing critical-domain and
recovery gates. Each source file has its own threshold in
`tests/config/vitest.risk.config.ts`; the combined percentage is informational.

The following baseline was measured on commit `31fe0872` with the risk suite's
19 test files and 266 passing tests. Values are statements, branches, functions
and lines, in that order. The floors sit below the measured values to tolerate
small instrumentation differences while catching missing tests.

| Source file                                   | Measured baseline             | Gate floor        |
| --------------------------------------------- | ----------------------------- | ----------------- |
| `src/db/schema.ts`                            | 74.27 / 62.04 / 67.85 / 77.13 | 72 / 60 / 66 / 75 |
| `src/db/preMigrationSnapshots.ts`             | 85.71 / 0 / 75 / 85.71        | 82 / — / 70 / 82  |
| `src/db/cardRepository.ts`                    | 84.57 / 71.96 / 89.83 / 86.55 | 82 / 70 / 87 / 84 |
| `src/db/lessonRepository.ts`                  | 89.56 / 79.31 / 83.67 / 91.35 | 87 / 77 / 81 / 89 |
| `src/db/noteRepository.ts`                    | 69.69 / 75 / 53.84 / 67.74    | 67 / 72 / 51 / 65 |
| `src/pages/learn/useLearnSession.ts`          | 85.64 / 70.25 / 83.96 / 90.11 | 83 / 68 / 81 / 88 |
| `src/pages/learn/simpleSessionPersistence.ts` | 98.03 / 93.44 / 100 / 100     | 96 / 91 / 98 / 98 |

The pre-migration snapshot module's only uncovered branch is the best-effort
folder-mirror failure handler. Its measured branch coverage is zero, so a branch
floor would provide no protection; statements, functions and lines are gated.
Raise the floors when tests cover more behaviour.

To check that the gate notices a missing relevant test file, run:

```sh
bunx vitest run --config tests/config/vitest.risk.config.ts --coverage --maxWorkers=1 --exclude src/pages/LearnMode.test.tsx
```

On the baseline, all remaining 220 tests pass but the command exits with a
coverage failure: `useLearnSession.ts` statements fall from 85.64% to 64.46%,
below its 83% floor. Its branch, function and line floors fail too.

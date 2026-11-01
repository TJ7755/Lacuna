import { createHash } from 'node:crypto';
import type { JevAllocationInput } from '../../apps/web/src/jev/protocol';

// Original evaluation material. Never import this module into practice or provider prompts.
const questions = [
  {
    prompt:
      'An enzyme in a laundry solution removes protein stains at 35 °C. After ten minutes at 90 °C, it removes far less protein even when cooled back to 35 °C. Explain why cooling does not restore its activity.',
    criterion: 'Heat has changed the active site so that the protein substrate no longer fits.',
    explanation:
      'Award one mark only for linking a lasting change in active-site shape to reduced substrate binding. Naming denaturation without this link earns zero.',
    maxMarks: 1,
    answers: [
      'Heating denatures the enzyme, changing the active site permanently, so the protein substrate can no longer bind even after cooling.',
      'The enzyme is denatured and its active site has changed.',
      'The enzyme is killed, but cooling makes the substrate fit better so activity is fully restored.',
      '',
      'The washing machine uses electricity to turn its drum.',
      'Its shape changes, so it stops. I mean the stain, or possibly the enzyme.',
    ],
  },
  {
    prompt:
      'A technician moves an enzyme from its optimum pH to a much more acidic solution, keeping temperature and substrate concentration constant. Explain why less product forms each minute.',
    criterion:
      'Connect altered active-site shape to fewer enzyme–substrate complexes and slower product formation.',
    explanation:
      'One mark for acidic conditions altering active-site shape; a second mark for explicitly linking poorer substrate fit to fewer enzyme–substrate complexes and slower product formation. Either mark may be earned independently.',
    maxMarks: 2,
    answers: [
      'The acidic conditions alter the active-site shape. Substrates fit less well, so fewer enzyme–substrate complexes form and less product is made each minute.',
      'The acidic conditions alter the active-site shape. There is less product.',
      'Acid makes enzyme active sites identical to every substrate, so more complexes form and the rate increases.',
      '',
      'A technician should wear goggles and label all bottles.',
      'It changes the site and fewer things happen, unless the acid was already optimal.',
    ],
  },
  {
    prompt:
      'An enzyme in a laboratory sensor produces a coloured product. Colour develops more slowly at 12 °C than at 28 °C. Both temperatures are below the optimum; pH and all concentrations are unchanged. Explain the faster reaction at 28 °C.',
    criterion:
      'Warming increases molecular movement and successful collisions between enzyme and substrate per second.',
    explanation:
      'Award one mark for linking increased kinetic energy or faster molecular movement to more frequent successful enzyme–substrate collisions. Warming alone, or an unsupported claim of more enzyme, earns zero.',
    maxMarks: 1,
    answers: [
      'At 28 °C the molecules have more kinetic energy, so enzymes and substrates collide successfully more often per second and product forms faster.',
      'Enzymes have active sites and substrates bind there. The warmer sensor makes more product, but I cannot explain why.',
      'At 28 °C all enzymes are denatured and their active sites disappear, which speeds up the reaction.',
      '',
      'A coloured sensor is easier to find on a laboratory shelf.',
      'They move more, although I mean the sensors rather than any molecules.',
    ],
  },
  {
    prompt:
      'An enzyme used in a medical assay reacts slowly after chilling to 5 °C but regains its original rate at 25 °C. Another sample heated to 85 °C remains slow after returning to 25 °C. Explain the different recovery of the two samples.',
    criterion:
      'Chilling slows molecular movement without denaturing the enzyme; strong heating changes active-site shape and reduces substrate binding after cooling.',
    explanation:
      'One mark for linking reversible cold inhibition to slower molecular movement or fewer successful collisions without denaturation. One independent mark for linking heat-induced lasting active-site shape change to poorer substrate binding after cooling.',
    maxMarks: 2,
    answers: [
      'Chilling slows molecules and successful collisions without denaturing the enzyme, so warming restores the rate. Strong heating permanently alters active-site shape, so substrate binds less well even after cooling.',
      'The cold enzyme is not denatured, and the hot enzyme is denatured. Both samples react slowly.',
      'Chilling permanently destroys active sites, but boiling always makes them fit the substrate better.',
      '',
      'The assay should be labelled with the date and patient reference.',
      'One changes back and the other does not, but I cannot tell which sample or what changed.',
    ],
  },
] as const;

export const strata = ['strong', 'partial', 'wrong', 'blank', 'off-topic', 'ambiguous'] as const;
export type EvaluationCase = {
  id: string;
  questionId: string;
  answerType: 'short-answer' | 'multi-mark';
  stratum: (typeof strata)[number];
  request: JevAllocationInput;
};
export const cases: EvaluationCase[] = questions
  .flatMap(({ answers, ...question }, index) =>
    answers.map((answer, variant) => ({
      id: createHash('sha256')
        .update(`4BI1-evaluation-v1:${index}:${variant}`)
        .digest('hex')
        .slice(0, 16),
      questionId: `enzyme-${index + 1}`,
      answerType: question.maxMarks === 1 ? 'short-answer' : 'multi-mark',
      stratum: strata[variant],
      request: {
        ...question,
        answer,
        diagnostic: {
          taxonomyId: 'science-explanations',
          taxonomyVersion: 1,
          techniqueIds: ['causal-link'],
        },
      } satisfies JevAllocationInput,
    })),
  )
  .sort((a, b) => a.id.localeCompare(b.id));

export const policy = {
  version: 4,
  scope: 'Original typed 4BI1 enzyme explanations; evaluation-written answers, never learner data.',
  provenance:
    'Agent-authored original material; independent reference marking pending. No private practice pool was read.',
  diagnosticDefinition:
    'An explicit relevant false scientific claim establishes a knowledge gap even alongside correct facts. An application gap requires separately demonstrated misapplication, not double-counting that same false claim.',
  semanticConventions:
    'Failure to fit an active site can express failed binding in context. Accept equivalent meaning without supplying absent mechanisms. Where literal and metaphorical readings remain plausible, affected diagnostic categories have insufficient evidence.',
  maximumRequests: 24,
  retries: 0,
  timeoutMs: 30_000,
  minimumCasesPerAnswerType: 100,
  minimumQuestionsPerAnswerType: 20,
  minimumPositiveAndNegativePerCategory: 30,
  minimumMarkAgreementLower95: 0.9,
  maximumConfidentErrorUpper95: 0.05,
  maximumAbstentionUpper95: 0.2,
  maximumObservedAbstention: 0.05,
  minimumCategoryPrecisionRecallLower95: 0.9,
  unsupported: [
    'handwriting',
    'typed-recall',
    'extended-response',
    'allocations above two marks',
    'other subjects',
  ],
  uncertainty:
    'Wilson 95% intervals are descriptive at case level; shared-question dependence prevents population or transfer claims.',
} as const;

import { createHash } from 'node:crypto';
import type { JevAllocationInput } from '../../src/jev/protocol';

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
      'Two identical tubes contain the same amount of an enzyme at its optimum temperature and pH. Tube P has a low substrate concentration. Tube Q has a higher substrate concentration, below saturation. Explain why Q initially produces product faster.',
    criterion:
      'More substrate causes more frequent successful collisions with active sites, producing more enzyme–substrate complexes per second.',
    explanation:
      'Award one mark only when greater substrate concentration is causally connected to more frequent successful collisions or enzyme–substrate complex formation per second. More substrate by itself earns zero.',
    maxMarks: 1,
    answers: [
      'Q has more substrate molecules per unit volume, so they collide successfully with active sites more often and more enzyme–substrate complexes form per second.',
      'Enzymes have active sites where substrates bind to make complexes. Q has more substrate. P makes product faster.',
      'Q has a higher temperature, so its enzymes replicate and make product faster.',
      '',
      'Tube Q is the seventeenth letter of the alphabet.',
      'There are more collisions, but I cannot say whether this is in P or Q or whether any involve an enzyme.',
    ],
  },
  {
    prompt:
      'A factory fixes the amount of an enzyme in a reactor. At a very high substrate concentration, adding still more substrate does not increase the initial reaction rate. Explain this plateau.',
    criterion:
      'All active sites are occupied; available enzyme limits further complex formation and product rate.',
    explanation:
      'One mark for stating that all enzyme active sites are occupied at the high substrate concentration. One further independent mark for linking limited enzyme availability to no further increase in complexes or product made per second.',
    maxMarks: 2,
    answers: [
      'All enzyme active sites are occupied. The amount of enzyme now limits how many complexes can process substrate per second, so extra substrate cannot increase product rate.',
      'All the active sites are occupied. The graph is flat.',
      'All active sites are empty because substrate destroys enzymes at any concentration.',
      '',
      'Factories should use recyclable packaging.',
      'They are all full, so nothing changes. By they I might mean the substrate containers.',
    ],
  },
] as const;

export const strata = ['strong', 'partial', 'wrong', 'blank', 'off-topic', 'ambiguous'] as const;
export const cases = questions
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
  version: 1,
  scope: 'Original typed 4BI1 enzyme explanations; evaluation-written answers, never learner data.',
  provenance:
    'Agent-authored original material; independent human content review and labels pending. No private practice pool was read.',
  maximumRequests: 24,
  retries: 0,
  timeoutMs: 30_000,
  minimumCasesPerAnswerType: 100,
  minimumQuestionsPerAnswerType: 20,
  minimumPositiveAndNegativePerCategory: 30,
  minimumMarkAgreementLower95: 0.9,
  maximumConfidentErrorUpper95: 0.05,
  maximumAbstentionUpper95: 0.2,
  minimumCategoryPrecisionRecallLower95: 0.9,
  unsupported: ['handwriting', 'typed-recall', 'extended-response', 'other subjects'],
  uncertainty:
    'Wilson 95% intervals are descriptive at case level; shared-question dependence prevents population or transfer claims.',
} as const;

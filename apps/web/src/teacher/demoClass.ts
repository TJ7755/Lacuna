import type { DailyEvidence, DailyEvidenceEvent } from '../insights/evidence';

const pupils = [
  {
    label: 'Ada Bennett',
    answer: 'Water moves from a concentrated solution to a dilute solution.',
    earned: 0,
    activeTransport: 1,
  },
  {
    label: 'Ben Carter',
    answer: 'Water moves from a concentrated solution to a dilute solution.',
    earned: 0,
    activeTransport: 1,
  },
  {
    label: 'Chloe Evans',
    answer: 'Water moves from a concentrated solution to a dilute solution.',
    earned: 0,
    activeTransport: 2,
  },
  {
    label: 'Dylan Hughes',
    answer: 'Water moves into the cell through its membrane.',
    earned: 1,
    activeTransport: 2,
  },
  {
    label: 'Esme Patel',
    answer:
      'Water moves from a dilute solution to a concentrated solution through a partially permeable membrane.',
    earned: 2,
    activeTransport: 2,
  },
  {
    label: 'Finn Wilson',
    answer: 'I am unsure which way the water moves.',
    earned: null,
    activeTransport: 1,
  },
];

/** Fictional evidence only: no connection, credentials or unlocked class session. */
export function createDemoReports(): DailyEvidence[] {
  const day = '2026-10-19';
  const start = Date.parse(`${day}T10:00:00Z`);
  return pupils.map((pupil, index) => {
    const questions: Pick<
      DailyEvidenceEvent,
      'itemId' | 'prompt' | 'answer' | 'earned' | 'marking'
    >[] = [
      {
        itemId: 'demo-osmosis',
        prompt: 'Explain osmosis.',
        answer: pupil.answer,
        earned: pupil.earned,
        marking: 'self',
      },
      {
        itemId: 'demo-diffusion',
        prompt: 'In which direction do particles move by diffusion?',
        answer: 'From a higher concentration to a lower concentration.',
        earned: 2,
        marking: 'automatic',
      },
      {
        itemId: 'demo-active-transport',
        prompt: 'How does active transport differ from diffusion?',
        answer:
          pupil.activeTransport === 2
            ? 'It uses energy to move substances against their concentration gradient.'
            : 'It needs energy to move substances.',
        earned: pupil.activeTransport,
        marking: 'self',
      },
    ];
    return {
      v: 1,
      shareId: '0'.repeat(32),
      day,
      pupil: { id: (index + 1).toString(16).padStart(32, '0'), label: pupil.label },
      events: questions.map((question, questionIndex) => ({
        ...question,
        id: `${question.itemId}-${index}`,
        kind: 'question',
        at: start + index * 60_000 + questionIndex * 10_000,
        conceptIds: [],
        available: 2,
        retained: null,
        criteria: [],
        disputed: false,
        shortened: false,
      })),
      omitted: 0,
    };
  });
}

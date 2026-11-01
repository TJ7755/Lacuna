type CardVerdict = 'correct' | 'error' | 'ambiguous' | 'duplicate' | 'insufficient_evidence';

interface BenchmarkCard {
  cardId: string;
  front: string;
  back: string;
}

export interface AuditFixture {
  id: string;
  split: 'calibration' | 'holdout';
  source: string;
  cards: BenchmarkCard[];
  gold: Array<{ cardId: string; status: CardVerdict; correctionIncludes?: string }>;
  tools?: boolean;
}

export const AUDIT_FIXTURES: AuditFixture[] = [
  {
    id: 'biology-mixed',
    split: 'calibration',
    source:
      'Mitosis produces two genetically identical daughter cells. Meiosis produces four genetically different haploid cells. The nucleus contains the chromosomes. Ribosomes are the site of protein synthesis.',
    cards: [
      {
        cardId: 'B1',
        front: 'What does mitosis produce?',
        back: 'Two genetically identical daughter cells.',
      },
      {
        cardId: 'B2',
        front: 'What does meiosis produce?',
        back: 'Two genetically identical diploid cells.',
      },
      { cardId: 'B3', front: 'Where are chromosomes contained?', back: 'The nucleus.' },
      { cardId: 'B4', front: 'Where does protein synthesis occur?', back: 'The mitochondria.' },
    ],
    gold: [
      { cardId: 'B1', status: 'correct' },
      { cardId: 'B2', status: 'error', correctionIncludes: 'haploid' },
      { cardId: 'B3', status: 'correct' },
      { cardId: 'B4', status: 'error', correctionIncludes: 'ribosome' },
    ],
  },
  {
    id: 'history-quality',
    split: 'calibration',
    source:
      'The First World War began in 1914. The armistice took effect on 11 November 1918. The Treaty of Versailles was signed in 1919. The League of Nations began work in 1920.',
    cards: [
      { cardId: 'H1', front: 'When was the Treaty of Versailles signed?', back: '1919.' },
      { cardId: 'H2', front: 'In what year was the Treaty of Versailles signed?', back: '1919.' },
      { cardId: 'H3', front: 'When did it begin?', back: '1920.' },
      { cardId: 'H4', front: 'When did the armistice take effect?', back: '11 November 1919.' },
    ],
    gold: [
      { cardId: 'H1', status: 'correct' },
      { cardId: 'H2', status: 'duplicate' },
      { cardId: 'H3', status: 'ambiguous' },
      { cardId: 'H4', status: 'error', correctionIncludes: '1918' },
    ],
  },
  {
    id: 'evidence-boundary',
    split: 'holdout',
    source:
      'In this synthetic course, the Aurora experiment used a blue lamp and measured temperature every five minutes. Its control group received no light. No outcome or number of participants is recorded.',
    cards: [
      { cardId: 'E1', front: 'Which lamp did Aurora use?', back: 'A blue lamp.' },
      { cardId: 'E2', front: 'How often was temperature measured?', back: 'Every ten minutes.' },
      { cardId: 'E3', front: 'How many participants took part?', back: 'Forty.' },
      {
        cardId: 'E4',
        front: 'Did Aurora prove that blue light increases temperature?',
        back: 'Yes.',
      },
    ],
    gold: [
      { cardId: 'E1', status: 'correct' },
      { cardId: 'E2', status: 'error', correctionIncludes: 'five' },
      { cardId: 'E3', status: 'insufficient_evidence' },
      { cardId: 'E4', status: 'insufficient_evidence' },
    ],
  },
  {
    id: 'paginated-course-audit',
    split: 'holdout',
    tools: true,
    source:
      'In this synthetic course, the Lumen trial used three groups. Group A received water, Group B received salt solution, and Group C received sugar solution. All groups were measured after twelve hours.',
    cards: [
      { cardId: 'T1', front: 'How many groups were used?', back: 'Three.' },
      { cardId: 'T2', front: 'What did Group B receive?', back: 'Sugar solution.' },
      { cardId: 'T3', front: 'When were the groups measured?', back: 'After twelve hours.' },
      { cardId: 'T4', front: 'What did Group C receive?', back: 'Salt solution.' },
    ],
    gold: [
      { cardId: 'T1', status: 'correct' },
      { cardId: 'T2', status: 'error', correctionIncludes: 'salt' },
      { cardId: 'T3', status: 'correct' },
      { cardId: 'T4', status: 'error', correctionIncludes: 'sugar' },
    ],
  },
];

export function auditPrompt(fixture: AuditFixture): string {
  return `Audit these synthetic revision cards against ONLY the supplied source. Do not edit anything or use outside knowledge.\nSource: ${fixture.source}\n${
    fixture.tools
      ? 'Find the course named Lumen, then read ALL of its cards with the available Lacuna tools. Follow pagination; the course has four cards.'
      : `Cards: ${JSON.stringify(fixture.cards)}`
  }\nReturn only JSON: {"cards":[{"cardId":"...","status":"correct|error|ambiguous|duplicate|insufficient_evidence","evidence":"exact supporting quotation from the source or card","correction":"suggested correction, or empty if none"}]}.\nReturn exactly one verdict per card. A fact contradicted by the source is error; a claim the source cannot establish is insufficient_evidence. A question with an unidentified referent is ambiguous. Mark the later equivalent question as duplicate, retaining the earliest card. Prioritise ambiguity or duplication over factual correctness. Keep each evidence quotation and correction brief.`;
}

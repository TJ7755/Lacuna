export interface LibraryCourse {
  id: string;
  subject: string;
  qualification: string;
  code: string;
  summary: string;
  topics: readonly string[];
  shareUrl: string | null;
  reviewStatus: 'in-progress' | 'reviewed' | 'not-reviewed';
  stats?: {
    cards: number;
    notes: number;
    practiceSets: number;
    practiceMarks: number;
  };
}

/** Topic headings follow the official board specifications for these courses. */
export const libraryCourses: readonly LibraryCourse[] = [
  {
    id: 'biology4bi1',
    subject: 'Biology',
    qualification: 'Pearson Edexcel International GCSE',
    code: '4BI1',
    summary: 'Cells, organisms and the processes that keep them alive.',
    topics: [
      'The nature and variety of living organisms',
      'Structures and functions in living organisms',
      'Reproduction and inheritance',
      'Ecology and the environment',
      'Use of biological resources',
    ],
    shareUrl: 'https://getlacuna.app/#/s/b70862112bb460441bee556d6233fc03',
    reviewStatus: 'in-progress',
    stats: { cards: 1308, notes: 163, practiceSets: 164, practiceMarks: 1269 },
  },
  {
    id: 'chemistry4ch1',
    subject: 'Chemistry',
    qualification: 'Pearson Edexcel International GCSE',
    code: '4CH1',
    summary: 'Particles, reactions and the chemistry of everyday materials.',
    topics: [
      'Principles of chemistry',
      'Inorganic chemistry',
      'Physical chemistry',
      'Organic chemistry',
    ],
    shareUrl: 'https://getlacuna.app/#/s/dae0b77f89538747f2ff6be3e9e94ff2',
    reviewStatus: 'in-progress',
    stats: { cards: 908, notes: 146, practiceSets: 147, practiceMarks: 1227 },
  },
  {
    id: 'physics0972',
    subject: 'Physics',
    qualification: 'Cambridge IGCSE (9–1)',
    code: '0972',
    summary: 'Forces, energy, waves and electricity.',
    topics: [
      'Motion, forces and energy',
      'Thermal physics',
      'Waves',
      'Electricity and magnetism',
      'Nuclear physics',
      'Space physics',
    ],
    shareUrl: 'https://getlacuna.app/#/s/48a155196a8e72bb6737affc063daf43',
    reviewStatus: 'in-progress',
    stats: { cards: 1024, notes: 150, practiceSets: 151, practiceMarks: 1640 },
  },
  {
    id: 'history0977',
    subject: 'History',
    qualification: 'Cambridge IGCSE (9–1)',
    code: '0977',
    summary: 'The twentieth-century world and Germany, 1918–45.',
    topics: [
      'Option B: Was the Treaty of Versailles fair?',
      'Option B: To what extent was the League of Nations a success?',
      'Option B: Hitler’s foreign policy and the outbreak of war in Europe',
      'Option B: Who was to blame for the Cold War?',
      'Option B: How effectively did the United States contain communism?',
      'Depth study B: Germany, 1918–45',
    ],
    shareUrl: 'https://getlacuna.app/#/s/2a768569a7b0a8987b3ef8a12947aae5',
    reviewStatus: 'in-progress',
    stats: { cards: 697, notes: 109, practiceSets: 110, practiceMarks: 1638 },
  },
];

const SHARE_ROUTE_RE = /^#\/s\/[0-9a-f]{32}$/;
const SHARE_ORIGIN = 'https://getlacuna.app/';

/** Return a canonical Lacuna share URL only for the app's published share route. */
export function resolveCourseShareUrl(value: string | null): string | null {
  if (value === null || value.trim() !== value || value.includes('?')) return null;

  const authority = value.match(/^https:\/\/([^/?#]*)/i)?.[1];
  if (authority !== 'getlacuna.app') return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'getlacuna.app' ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    !SHARE_ROUTE_RE.test(url.hash)
  ) {
    return null;
  }

  return `${SHARE_ORIGIN}${url.hash}`;
}

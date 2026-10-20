export interface LibraryCourse {
  id: string;
  subject: string;
  /** Awarding body, used to filter the library. */
  board: string;
  qualification: string;
  code: string;
  alternativeCodes?: readonly string[];
  summary: string;
  topics: readonly string[];
  shareUrl: string | null;
  author?: string;
  publisher?: string;
  revision?: number;
  /** Publication date for this revision, in YYYY-MM-DD format; omit when unknown. */
  revisionDate?: string;
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
    author: 'Lacuna',
    publisher: 'Lacuna',
    revision: 17,
    subject: 'Biology',
    board: 'Pearson Edexcel',
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
    shareUrl: 'https://getlacuna.app/#/s/6fb10671c70197caeff8616f80697ac5',
    stats: { cards: 1322, notes: 164, practiceSets: 165, practiceMarks: 1289 },
  },
  {
    id: 'chemistry4ch1',
    author: 'Lacuna',
    publisher: 'Lacuna',
    revision: 12,
    subject: 'Chemistry',
    board: 'Pearson Edexcel',
    qualification: 'Pearson Edexcel International GCSE',
    code: '4CH1',
    summary: 'Particles, reactions and the chemistry of everyday materials.',
    topics: [
      'Principles of chemistry',
      'Inorganic chemistry',
      'Physical chemistry',
      'Organic chemistry',
    ],
    shareUrl: 'https://getlacuna.app/#/s/daf16de2b88b97fa236948559ede6c4c',
    stats: { cards: 918, notes: 147, practiceSets: 152, practiceMarks: 1272 },
  },
  {
    id: 'physics0972',
    author: 'Lacuna',
    publisher: 'Lacuna',
    revision: 11,
    subject: 'Physics',
    board: 'Cambridge',
    qualification: 'Cambridge IGCSE',
    code: '0972',
    alternativeCodes: ['0625'],
    summary: 'Forces, energy, waves and electricity.',
    topics: [
      'Motion, forces and energy',
      'Thermal physics',
      'Waves',
      'Electricity and magnetism',
      'Nuclear physics',
      'Space physics',
    ],
    shareUrl: 'https://getlacuna.app/#/s/52fe58acd2fcece40c1d10ffbf08276f',
    stats: { cards: 1039, notes: 152, practiceSets: 153, practiceMarks: 1726 },
  },
  {
    id: 'history0977',
    author: 'Lacuna',
    publisher: 'Lacuna',
    revision: 11,
    subject: 'History',
    board: 'Cambridge',
    qualification: 'Cambridge IGCSE',
    code: '0977',
    alternativeCodes: ['0470'],
    summary: 'The twentieth-century world and Germany, 1918–45.',
    topics: [
      'Option B: Was the Treaty of Versailles fair?',
      'Option B: To what extent was the League of Nations a success?',
      'Option B: Hitler’s foreign policy and the outbreak of war in Europe',
      'Option B: Who was to blame for the Cold War?',
      'Option B: How effectively did the United States contain communism?',
      'Depth study B: Germany, 1918–45',
    ],
    shareUrl: 'https://getlacuna.app/#/s/31178fee8489ffcf1748c1dc5c570be5',
    stats: { cards: 708, notes: 111, practiceSets: 112, practiceMarks: 1718 },
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

export function courseCodes(course: LibraryCourse): string {
  return [course.code, ...(course.alternativeCodes ?? [])].join(' / ');
}

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

/** Topic previews describe the published selection, not complete syllabus coverage. */
export const libraryCourses: readonly LibraryCourse[] = [
  {
    id: 'biology4bi1',
    author: 'Lacuna',
    publisher: 'Lacuna',
    revision: 28,
    subject: 'Biology',
    board: 'Pearson Edexcel',
    qualification: 'Pearson Edexcel International GCSE',
    code: '4BI1',
    summary: 'Biology concepts and original practice across selected International GCSE topics.',
    topics: [
      'The nature and variety of living organisms',
      'Structures and functions in living organisms',
      'Reproduction and inheritance',
      'Ecology and the environment',
      'Use of biological resources',
    ],
    shareUrl: 'https://getlacuna.app/#/s/6fb10671c70197caeff8616f80697ac5',
    stats: { cards: 1465, notes: 164, practiceSets: 165, practiceMarks: 1506 },
  },
  {
    id: 'chemistry4ch1',
    author: 'Lacuna',
    publisher: 'Lacuna',
    revision: 21,
    subject: 'Chemistry',
    board: 'Pearson Edexcel',
    qualification: 'Pearson Edexcel International GCSE',
    code: '4CH1',
    summary: 'Chemistry concepts and original practice across selected International GCSE topics.',
    topics: [
      'Principles of chemistry',
      'Inorganic chemistry',
      'Physical chemistry',
      'Organic chemistry',
    ],
    shareUrl: 'https://getlacuna.app/#/s/daf16de2b88b97fa236948559ede6c4c',
    stats: { cards: 1057, notes: 147, practiceSets: 154, practiceMarks: 1417 },
  },
  {
    id: 'physics0972',
    author: 'Lacuna',
    publisher: 'Lacuna',
    revision: 19,
    subject: 'Physics',
    board: 'Cambridge',
    qualification: 'Cambridge IGCSE (9–1)',
    code: '0972',
    summary: 'Physics concepts and original practice across selected International GCSE topics.',
    topics: [
      'Motion, forces and energy',
      'Thermal physics',
      'Waves',
      'Electricity and magnetism',
      'Nuclear physics',
      'Space physics',
    ],
    shareUrl: 'https://getlacuna.app/#/s/52fe58acd2fcece40c1d10ffbf08276f',
    stats: { cards: 1310, notes: 152, practiceSets: 153, practiceMarks: 1968 },
  },
  {
    id: 'history0977',
    author: 'Lacuna',
    publisher: 'Lacuna',
    revision: 13,
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
    stats: { cards: 708, notes: 111, practiceSets: 112, practiceMarks: 1738 },
  },
  {
    id: 'religiousstudies8062',
    author: 'Lacuna',
    publisher: 'Lacuna',
    revision: 11,
    subject: 'Religious Studies',
    board: 'AQA',
    qualification: 'AQA GCSE',
    code: '8062',
    summary:
      'Christianity and Islam: beliefs, teachings and practices, with optional Themes A–F modules to choose from. Short lesson-level practice uses 1, 1, 4 and 6-mark question styles.',
    topics: [
      'Christian monotheism and the Trinity',
      'Christian prayer',
      'Tawhid',
      'Hajj actions',
      'The purpose of marriage',
      'Abortion ethics',
      'The design argument',
      'Pacifism',
      'Aims of punishment',
      'Human rights and responsibilities',
    ],
    shareUrl: 'https://getlacuna.app/#/s/e85fc39e709074d58669c2d8bfd723bb',
    stats: { cards: 1218, notes: 115, practiceSets: 115, practiceMarks: 1380 },
  },
  {
    id: 'biology8461',
    author: 'Lacuna',
    publisher: 'Lacuna',
    revision: 6,
    subject: 'Biology',
    board: 'AQA',
    qualification: 'AQA GCSE',
    code: '8461',
    summary:
      'Selected AQA Biology topics and original practice. Some board requirements remain outside this selection.',
    topics: ['Selected biology topics', 'Original topic practice'],
    shareUrl: 'https://getlacuna.app/#/s/9a44358aa0d59d1f1fbd02b30c38b746',
    stats: { cards: 1328, notes: 152, practiceSets: 152, practiceMarks: 1371 },
  },
  {
    id: 'chemistry8462',
    author: 'Lacuna',
    publisher: 'Lacuna',
    revision: 4,
    subject: 'Chemistry',
    board: 'AQA',
    qualification: 'AQA GCSE',
    code: '8462',
    summary:
      'Selected AQA Chemistry topics and original practice. Some board requirements remain outside this selection.',
    topics: ['Selected chemistry topics', 'Original topic practice'],
    shareUrl: 'https://getlacuna.app/#/s/40aab20ad7ab21811e1059b47522cc3a',
    stats: { cards: 980, notes: 139, practiceSets: 145, practiceMarks: 1293 },
  },
  {
    id: 'physics8463',
    author: 'Lacuna',
    publisher: 'Lacuna',
    revision: 4,
    subject: 'Physics',
    board: 'AQA',
    qualification: 'AQA GCSE',
    code: '8463',
    summary:
      'Selected AQA Physics topics and original practice. Some board requirements remain outside this selection.',
    topics: ['Selected physics topics', 'Original topic practice'],
    shareUrl: 'https://getlacuna.app/#/s/e0da40253700207827f2b26455bd9ed6',
    stats: { cards: 1164, notes: 140, practiceSets: 141, practiceMarks: 1698 },
  },
  {
    id: 'biology0610',
    author: 'Lacuna',
    publisher: 'Lacuna',
    revision: 5,
    subject: 'Biology',
    board: 'Cambridge',
    qualification: 'Cambridge IGCSE',
    code: '0610',
    summary:
      'Selected Cambridge Biology topics and original practice. Some board requirements remain outside this selection.',
    topics: ['Selected biology topics', 'Original topic practice'],
    shareUrl: 'https://getlacuna.app/#/s/819c37db9ae88c45631f51348b7b44f2',
    stats: { cards: 1398, notes: 155, practiceSets: 155, practiceMarks: 1414 },
  },
  {
    id: 'chemistry0620',
    author: 'Lacuna',
    publisher: 'Lacuna',
    revision: 4,
    subject: 'Chemistry',
    board: 'Cambridge',
    qualification: 'Cambridge IGCSE',
    code: '0620',
    summary:
      'Selected Cambridge Chemistry topics and original practice. Some board requirements remain outside this selection.',
    topics: ['Selected chemistry topics', 'Original topic practice'],
    shareUrl: 'https://getlacuna.app/#/s/40d06cbdd6fc0170da1faa1e1192e3fb',
    stats: { cards: 990, notes: 137, practiceSets: 143, practiceMarks: 1278 },
  },
  {
    id: 'physics0625',
    author: 'Lacuna',
    publisher: 'Lacuna',
    revision: 4,
    subject: 'Physics',
    board: 'Cambridge',
    qualification: 'Cambridge IGCSE',
    code: '0625',
    summary:
      'Selected Cambridge Physics topics and original practice. Some board requirements remain outside this selection.',
    topics: ['Selected physics topics', 'Original topic practice'],
    shareUrl: 'https://getlacuna.app/#/s/6f78a8e5f86fd26bf5be39ff96a13733',
    stats: { cards: 1228, notes: 150, practiceSets: 151, practiceMarks: 1827 },
  },
  {
    id: 'biology0970',
    author: 'Lacuna',
    publisher: 'Lacuna',
    revision: 5,
    subject: 'Biology',
    board: 'Cambridge',
    qualification: 'Cambridge IGCSE (9–1)',
    code: '0970',
    summary:
      'Selected Cambridge Biology topics and original practice. Some board requirements remain outside this selection.',
    topics: ['Selected biology topics', 'Original topic practice'],
    shareUrl: 'https://getlacuna.app/#/s/4e756f914aea44bfe8312b2e9cb83843',
    stats: { cards: 1398, notes: 155, practiceSets: 155, practiceMarks: 1414 },
  },
  {
    id: 'chemistry0971',
    author: 'Lacuna',
    publisher: 'Lacuna',
    revision: 4,
    subject: 'Chemistry',
    board: 'Cambridge',
    qualification: 'Cambridge IGCSE (9–1)',
    code: '0971',
    summary:
      'Selected Cambridge Chemistry topics and original practice. Some board requirements remain outside this selection.',
    topics: ['Selected chemistry topics', 'Original topic practice'],
    shareUrl: 'https://getlacuna.app/#/s/6d31d711f32f4c3ee59884e86d2a7d7f',
    stats: { cards: 990, notes: 137, practiceSets: 143, practiceMarks: 1278 },
  },
  {
    id: 'biology1bi0',
    author: 'Lacuna',
    publisher: 'Lacuna',
    revision: 6,
    subject: 'Biology',
    board: 'Pearson Edexcel',
    qualification: 'Pearson Edexcel GCSE',
    code: '1BI0',
    summary:
      'Selected Pearson Edexcel Biology topics and original practice. Some board requirements remain outside this selection.',
    topics: ['Selected biology topics', 'Original topic practice'],
    shareUrl: 'https://getlacuna.app/#/s/f59cf55a906edfede13902ca7bfda358',
    stats: { cards: 1304, notes: 147, practiceSets: 148, practiceMarks: 1350 },
  },
  {
    id: 'chemistry1ch0',
    author: 'Lacuna',
    publisher: 'Lacuna',
    revision: 4,
    subject: 'Chemistry',
    board: 'Pearson Edexcel',
    qualification: 'Pearson Edexcel GCSE',
    code: '1CH0',
    summary:
      'Selected Pearson Edexcel Chemistry topics and original practice. Some board requirements remain outside this selection.',
    topics: ['Selected chemistry topics', 'Original topic practice'],
    shareUrl: 'https://getlacuna.app/#/s/79c53406f469e40ec6949746d6879167',
    stats: { cards: 985, notes: 140, practiceSets: 146, practiceMarks: 1305 },
  },
  {
    id: 'physics1ph0',
    author: 'Lacuna',
    publisher: 'Lacuna',
    revision: 4,
    subject: 'Physics',
    board: 'Pearson Edexcel',
    qualification: 'Pearson Edexcel GCSE',
    code: '1PH0',
    summary:
      'Selected Pearson Edexcel Physics topics and original practice. Some board requirements remain outside this selection.',
    topics: ['Selected physics topics', 'Original topic practice'],
    shareUrl: 'https://getlacuna.app/#/s/6ab9bb362064a8f661737b11b634b6d1',
    stats: { cards: 1160, notes: 140, practiceSets: 141, practiceMarks: 1702 },
  },
  {
    id: 'biologyj247',
    author: 'Lacuna',
    publisher: 'Lacuna',
    revision: 6,
    subject: 'Biology',
    board: 'OCR',
    qualification: 'OCR GCSE',
    code: 'J247',
    summary:
      'Selected OCR Biology topics and original practice. Some board requirements remain outside this selection.',
    topics: ['Selected biology topics', 'Original topic practice'],
    shareUrl: 'https://getlacuna.app/#/s/b9079bf89fcc37a4dfaa4f665c8ea236',
    stats: { cards: 1311, notes: 149, practiceSets: 149, practiceMarks: 1344 },
  },
  {
    id: 'chemistryj248',
    author: 'Lacuna',
    publisher: 'Lacuna',
    revision: 4,
    subject: 'Chemistry',
    board: 'OCR',
    qualification: 'OCR GCSE',
    code: 'J248',
    summary:
      'Selected OCR Chemistry topics and original practice. Some board requirements remain outside this selection.',
    topics: ['Selected chemistry topics', 'Original topic practice'],
    shareUrl: 'https://getlacuna.app/#/s/96fbd96735ce0d4efe7d05675eb6cb72',
    stats: { cards: 972, notes: 136, practiceSets: 142, practiceMarks: 1276 },
  },
  {
    id: 'physicsj249',
    author: 'Lacuna',
    publisher: 'Lacuna',
    revision: 4,
    subject: 'Physics',
    board: 'OCR',
    qualification: 'OCR GCSE',
    code: 'J249',
    summary:
      'Selected OCR Physics topics and original practice. Some board requirements remain outside this selection.',
    topics: ['Selected physics topics', 'Original topic practice'],
    shareUrl: 'https://getlacuna.app/#/s/c93779cc47d65de9af9fd421914b06bb',
    stats: { cards: 1170, notes: 141, practiceSets: 142, practiceMarks: 1709 },
  },
  {
    id: 'biologyj257',
    author: 'Lacuna',
    publisher: 'Lacuna',
    revision: 6,
    subject: 'Biology',
    board: 'OCR',
    qualification: 'OCR GCSE',
    code: 'J257',
    summary:
      'Selected OCR Biology topics and original practice. Some board requirements remain outside this selection.',
    topics: ['Selected biology topics', 'Original topic practice'],
    shareUrl: 'https://getlacuna.app/#/s/405b448b4804d48c3bd80a4d3ccfd85d',
    stats: { cards: 1287, notes: 147, practiceSets: 147, practiceMarks: 1326 },
  },
  {
    id: 'chemistryj258',
    author: 'Lacuna',
    publisher: 'Lacuna',
    revision: 4,
    subject: 'Chemistry',
    board: 'OCR',
    qualification: 'OCR GCSE',
    code: 'J258',
    summary:
      'Selected OCR Chemistry topics and original practice. Some board requirements remain outside this selection.',
    topics: ['Selected chemistry topics', 'Original topic practice'],
    shareUrl: 'https://getlacuna.app/#/s/ae447daf5e1b587fd7e725dd1db8ec27',
    stats: { cards: 972, notes: 136, practiceSets: 142, practiceMarks: 1276 },
  },
  {
    id: 'physicsj259',
    author: 'Lacuna',
    publisher: 'Lacuna',
    revision: 4,
    subject: 'Physics',
    board: 'OCR',
    qualification: 'OCR GCSE',
    code: 'J259',
    summary:
      'Selected OCR Physics topics and original practice. Some board requirements remain outside this selection.',
    topics: ['Selected physics topics', 'Original topic practice'],
    shareUrl: 'https://getlacuna.app/#/s/e8bdbfc18b3270faa77cc341e876bf26',
    stats: { cards: 1154, notes: 140, practiceSets: 141, practiceMarks: 1700 },
  },
  {
    id: 'physics4ph1',
    author: 'Lacuna',
    publisher: 'Lacuna',
    revision: 4,
    subject: 'Physics',
    board: 'Pearson Edexcel',
    qualification: 'Pearson Edexcel International GCSE',
    code: '4PH1',
    summary:
      'Selected Pearson Edexcel Physics topics and original practice. Some board requirements remain outside this selection.',
    topics: ['Selected physics topics', 'Original topic practice'],
    shareUrl: 'https://getlacuna.app/#/s/b01c1050191588212cff4cc28131fa10',
    stats: { cards: 1118, notes: 132, practiceSets: 133, practiceMarks: 1623 },
  },
  {
    id: 'combinedscience8464',
    author: 'Lacuna',
    publisher: 'Lacuna',
    revision: 9,
    subject: 'Combined Science',
    board: 'AQA',
    qualification: 'AQA GCSE',
    code: '8464',
    summary:
      'A Higher-tier selection of biology, chemistry and physics for AQA Trilogy, including shared Foundation content, required practicals and labelled diagrams.',
    topics: [
      'Cell biology',
      'Infection and response',
      'Bioenergetics',
      'Inheritance, variation and evolution',
      'Bonding, structure and properties of matter',
      'Chemical changes',
      'Rate and extent of chemical change',
      'Energy',
      'Electricity',
      'Forces',
      'Waves',
    ],
    shareUrl: 'https://getlacuna.app/#/s/91edc6fda3742ffe8ce963c3ae848e41',
    stats: { cards: 3760, notes: 447, practiceSets: 429, practiceMarks: 4192 },
  },
  {
    id: 'combinedscience1sc0',
    author: 'Lacuna',
    publisher: 'Lacuna',
    revision: 3,
    subject: 'Combined Science',
    board: 'Pearson Edexcel',
    qualification: 'Pearson Edexcel GCSE',
    code: '1SC0',
    summary:
      'A Higher-tier selection of biology, chemistry and physics for Edexcel Combined Science, including shared Foundation content, core practicals and labelled diagrams.',
    topics: [
      'Cells and control',
      'Genetics',
      'Health, disease and the development of medicines',
      'Exchange and transport in animals',
      'States of matter and mixtures',
      'Chemical changes',
      'Groups in the periodic table',
      'Motion and forces',
      'Waves',
      'Electricity and circuits',
      'Radioactivity',
    ],
    shareUrl: 'https://getlacuna.app/#/s/5459ed1b6b0ca5ac7e646b68f17d1732',
    stats: { cards: 4310, notes: 445, practiceSets: 449, practiceMarks: 4634 },
  },
  {
    id: 'combinedsciencej250',
    author: 'Lacuna',
    publisher: 'Lacuna',
    revision: 2,
    subject: 'Combined Science',
    board: 'OCR',
    qualification: 'OCR GCSE',
    code: 'J250',
    summary:
      'A Higher-tier selection of biology, chemistry and physics for OCR Gateway Combined Science A, including shared Foundation content, practical activities and labelled diagrams.',
    topics: [
      'Cell level systems',
      'Scaling up',
      'Organism level systems',
      'Community level systems',
      'Genes, inheritance and selection',
      'Particles',
      'Chemical reactions',
      'Monitoring and controlling chemical reactions',
      'Forces',
      'Electricity and magnetism',
      'Waves in matter',
      'Radioactivity',
    ],
    shareUrl: 'https://getlacuna.app/#/s/3fa2fa48f570b5bfdd6e859a9df25e47',
    stats: { cards: 4478, notes: 476, practiceSets: 479, practiceMarks: 5064 },
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

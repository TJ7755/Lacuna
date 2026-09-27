export const sources = {
  repetition: {
    label: 'Spaced repetition',
    url: 'https://help.quizlet.com/hc/en-au/articles/48324742264077-Studying-with-Spaced-Repetition',
  },
  learn: {
    label: 'Learn',
    url: 'https://help.quizlet.com/hc/en-au/articles/360030986971-Studying-with-Learn',
  },
  modes: {
    label: 'Study modes',
    url: 'https://help.quizlet.com/hc/en-au/articles/360030841732-Studying-on-Quizlet',
  },
  offline: {
    label: 'Offline study',
    url: 'https://help.quizlet.com/hc/en-us/articles/360030565412-Studying-offline-with-Quizlet-mobile-apps',
  },
  plans: {
    label: 'Subscriptions',
    url: 'https://help.quizlet.com/hc/en-au/articles/360041181691-Subscribing-to-Quizlet',
  },
  export: {
    label: 'Exporting sets',
    url: 'https://help.quizlet.com/hc/en-us/articles/360034345672-Exporting-your-sets',
  },
} as const;
export type SourceKey = keyof typeof sources;
export const categories = ['Everything', 'Learning', 'Access', 'Moving over'] as const;
export type Category = (typeof categories)[number];
export const comparisonRows: {
  feature: string;
  category: Category;
  lacuna: string;
  quizlet: string;
  note: string;
  source: SourceKey;
}[] = [
  {
    feature: 'Spaced repetition',
    category: 'Learning',
    lacuna: 'FSRS-6 scheduled reviews',
    quizlet: 'Recall-based scheduling on the web',
    note: 'Both schedule repeat practice. Lacuna also supports an exam-focused scheduling mode.',
    source: 'repetition',
  },
  {
    feature: 'Study direction',
    category: 'Learning',
    lacuna: 'Exam dates or steady retention',
    quizlet: 'Personalised paths in Learn',
    note: 'Lacuna lets you work towards an assessment or continue without a deadline. These are different workflows, not a claim that Quizlet cannot help with exams.',
    source: 'learn',
  },
  {
    feature: 'Organising material',
    category: 'Learning',
    lacuna: 'Courses, lessons, notes and cards',
    quizlet: 'Sets, classes and Study Guides',
    note: 'In Lacuna, explanations and recall material live inside the same course structure.',
    source: 'modes',
  },
  {
    feature: 'Recall formats',
    category: 'Learning',
    lacuna: 'Basic, reversed, cloze, sequences, occlusion',
    quizlet: 'Term/definition and diagram sets',
    note: 'Lacuna supports optional typed recall. Quizlet offers several ways to practise sets, including written answers in Learn.',
    source: 'modes',
  },
  {
    feature: 'Application practice',
    category: 'Learning',
    lacuna: 'Questions with separate progress',
    quizlet: 'Test and AI Practice Tests',
    note: 'Lacuna has fixed questions and generated question families with worked explanations. Quizlet Practice Tests use uploaded material or sets.',
    source: 'modes',
  },
  {
    feature: 'Classroom activities',
    category: 'Learning',
    lacuna: 'Share a course for individual study',
    quizlet: 'Live, Match and other games',
    note: 'Choose Quizlet if a live classroom game is central to your lesson. Lacuna currently focuses on individual practice.',
    source: 'modes',
  },
  {
    feature: 'Getting started',
    category: 'Access',
    lacuna: 'No account needed',
    quizlet: 'Account for Learn',
    note: 'Lacuna stores study data on your device. Backups matter, especially before clearing browser storage.',
    source: 'learn',
  },
  {
    feature: 'Core study access',
    category: 'Access',
    lacuna: 'Free, no subscription',
    quizlet: 'Free tier and paid subscriptions',
    note: 'Lacuna’s built-in AI has separate beta access. Quizlet features and allowances vary by plan; check its current subscription details.',
    source: 'plans',
  },
  {
    feature: 'Offline study',
    category: 'Access',
    lacuna: 'Browser and desktop',
    quizlet: 'iOS and Android apps',
    note: 'Download the app assets and material first. Online videos, hosted AI, sharing and sync still need a connection.',
    source: 'offline',
  },
  {
    feature: 'Ready-made material',
    category: 'Access',
    lacuna: 'Create, import or receive a course',
    quizlet: 'Searchable public sets and solutions',
    note: 'Lacuna does not offer an equivalent public library or catalogue of expert textbook solutions.',
    source: 'modes',
  },
  {
    feature: 'Bringing your sets',
    category: 'Moving over',
    lacuna: 'Paste or upload text and spreadsheets',
    quizlet: 'Export your own terms and definitions',
    note: 'Quizlet export is on the website, for sets you created. Images and copied sets are excluded. This is a text transfer, not an account sync.',
    source: 'export',
  },
  {
    feature: 'Review history',
    category: 'Moving over',
    lacuna: 'New schedule for imported text cards',
    quizlet: 'Text export does not carry review history',
    note: 'Your previous Quizlet review progress is not transferred through a text export. Keep your original material while checking the imported cards.',
    source: 'export',
  },
];
export const faqs = [
  [
    'Is Lacuna free?',
    'Core revision is free and open source, with no subscription. Built-in AI currently requires a separate beta access code; it is optional. You can create, import and study without it.',
  ],
  [
    'Does Quizlet have spaced repetition?',
    'Yes. Quizlet documents recall-based spaced repetition on its website. Lacuna uses FSRS-6 and offers exam-focused scheduling as well as steady retention.',
  ],
  [
    'Can I move my Quizlet sets?',
    'You can export terms and definitions from sets you created on the Quizlet website, then paste the text into Lacuna. Images, copied sets and review history are not included in that transfer.',
  ],
  [
    'Will it work without Wi-Fi?',
    'After the app assets and material have loaded, local study works offline. Embedded online content, hosted AI, course sharing and device sync require an internet connection.',
  ],
  [
    'Do I have to set an exam date?',
    'No. Choose steady retention for ongoing study, or set an assessment date when you have a deadline.',
  ],
  [
    'Where does my study data live?',
    'On your device, in local browser storage or the desktop app. Optional device sync uses encrypted relay payloads. Export a full backup before clearing browser data or changing devices.',
  ],
  [
    'Is Lacuna finished?',
    'Lacuna is in beta. Expect an evolving product, and keep backups of important study material. It does not have Quizlet’s public set library, classroom games or expert textbook catalogue.',
  ],
] as const;

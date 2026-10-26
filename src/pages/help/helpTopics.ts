export const HELP_GROUPS = [
  'Getting started',
  'Studying',
  'Cards and content',
  'Progress',
  'Your data',
] as const;

export interface HelpTopic {
  id: string;
  group: (typeof HELP_GROUPS)[number];
  question: string;
  answer: string;
  keywords: string[];
  action?: { label: string; to: string };
}

export const helpTopics: readonly HelpTopic[] = [
  {
    id: 'create-course',
    group: 'Getting started',
    question: 'How do I create a course and lessons?',
    answer:
      'Choose New course on Today, then add lessons from the course path or course settings under Lessons. Switch to Edit and use Add on the course path to add another lesson.',
    keywords: ['new', 'subject', 'add', 'start'],
  },
  {
    id: 'course-model',
    group: 'Getting started',
    question: 'What are the course path, checkpoints and Card practice?',
    answer:
      'The path organises your lessons; Card practice brings back due cards from lessons you have studied. Checkpoints mark assessment dates and let you start revision without blocking your progress. Every course opens on its lesson path. Select a lesson to open its workspace.',
    keywords: ['course', 'path', 'lessons', 'exam'],
  },
  {
    id: 'add-content',
    group: 'Getting started',
    question: 'Where do I add notes and cards?',
    answer:
      'Add and edit notes directly on a lesson page. Create cards there or in the course’s Cards tab, where you can also search, edit and manage cards together.',
    keywords: ['write', 'markdown', 'bulk', 'content'],
  },
  {
    id: 'study-modes',
    group: 'Studying',
    question: 'How do I start studying?',
    answer:
      'Choose Study on Today or a course page, then Start session. The normal session follows your course path and reviews due cards, with your exam date helping set priorities. Open Other ways in the same sheet for alternatives.',
    keywords: ['begin', 'normal', 'session', 'review'],
  },
  {
    id: 'simple-learn',
    group: 'Studying',
    question: 'When should I use Simple learn?',
    answer:
      'Use Simple learn for a first pass through the course’s cards. Incorrect cards return later until you have answered every card correctly; your answers also start review scheduling. Turn off Learn first in course settings to go straight to spaced repetition.',
    keywords: ['first', 'new', 'normal', 'session'],
  },
  {
    id: 'assessment-revision',
    group: 'Studying',
    question: 'How do I revise before an exam?',
    answer:
      'Choose Assessment revision from a relevant Card practice stop, checkpoint or Study sheet. Set your available time to revise material you have already studied. You can leave and resume the plan later.',
    keywords: ['assessment', 'exam', 'time', 'budget', 'checkpoint'],
  },
  {
    id: 'filtered-modes',
    group: 'Studying',
    question: 'Can I study only due, new or flagged cards?',
    answer:
      'Use filtered study to choose due, new, flagged, leech or suspended cards. Filters combine: due and flagged shows only cards that match both. Suspended cards stay out of normal sessions.',
    keywords: ['filters', 'only', 'leech', 'suspended', 'backlog'],
  },
  {
    id: 'how-to-study',
    group: 'Studying',
    question: 'How should I grade an answer?',
    answer:
      'Try to recall the answer before revealing it, then grade honestly: if you were not sure, mark it wrong. Silent grading uses Yes or No and your response time; manual grading lets you choose Again, Hard, Good or Easy. Change grading mode in Settings under Study behaviour.',
    keywords: ['correct', 'incorrect', 'silent', 'manual', 'reveal'],
    action: { label: 'Study settings', to: '/settings#settings-study' },
  },
  {
    id: 'card-actions',
    group: 'Studying',
    question: 'Can I edit, flag, bury, suspend or undo during a session?',
    answer:
      'Use the card menu to edit, flag for attention, bury until tomorrow or suspend from normal study. Editing pauses the timer. Undo reverses your last answer if you pressed the wrong control.',
    keywords: ['mistake', 'session', 'remove', 'hide'],
  },
  {
    id: 'keyboard-shortcuts',
    group: 'Studying',
    question: 'How do I see or customise keyboard shortcuts?',
    answer:
      'Your current shortcuts are listed below and in the in-session shortcuts sheet. Change study bindings in Settings under Keyboard shortcuts.',
    keywords: ['keys', 'bindings', 'keyboard', 'controls'],
    action: { label: 'Customise shortcuts', to: '/settings#settings-shortcuts' },
  },
  {
    id: 'touch-gestures',
    group: 'Studying',
    question: 'How do I study with touch gestures?',
    answer:
      'In touch mode, tap the card to reveal or hide the answer. With the answer showing, swipe right for Yes or left for No.',
    keywords: ['swipe', 'tap', 'phone', 'touch', 'gestures'],
  },
  {
    id: 'pomodoro',
    group: 'Studying',
    question: 'How do I change the Pomodoro timer?',
    answer:
      'Use the Pomodoro timer for focused study with short breaks. Customise work and break durations in Settings under Pomodoro timer.',
    keywords: ['focus', 'break', 'time', 'timer'],
    action: { label: 'Timer settings', to: '/settings#settings-pomodoro' },
  },
  {
    id: 'card-types',
    group: 'Cards and content',
    question: 'Which card type should I use?',
    answer:
      'Use Basic for a front-and-back question, Reversed to practise both directions, or Typing-answer to type before revealing. Cloze hides words in a sentence; Audio plays a clip for you to answer. Diagram cards cover labels on a picture.',
    keywords: ['basic', 'reversed', 'typing', 'cloze', 'audio', 'diagram', 'flashcards'],
  },
  {
    id: 'sequences',
    group: 'Cards and content',
    question: 'How do I learn a sequence of steps or facts?',
    answer:
      'Write a sequence once and Lacuna creates cards that cue each next item from the preceding items. Split long lists into named chunks to keep them manageable. Edit the sequence itself to update its cards.',
    keywords: ['ordered', 'list', 'steps', 'sequence', 'chunks'],
  },
  {
    id: 'recitation',
    group: 'Cards and content',
    question: 'Can I recite a poem, speech or script?',
    answer:
      'Simple learn teaches recitation line by line, typed or aloud, with you marking any lines you got wrong. After each chunk, recite everything from the top. Later reviews ask you to recite a due line from the start of its chunk.',
    keywords: ['poem', 'poetry', 'script', 'speech', 'reciting'],
  },
  {
    id: 'occlusions',
    group: 'Cards and content',
    question: 'How do I make diagram cards?',
    answer:
      'Upload a labelled diagram and draw boxes over its labels to create cards. Pair a feature box with its label to test a part of the drawing. Edit the diagram to update its cards; replacing the image regenerates them, so Lacuna warns you first.',
    keywords: ['image', 'picture', 'occlusion', 'labels', 'boxes'],
  },
  {
    id: 'share-diagram',
    group: 'Cards and content',
    question: 'How do I share a diagram with its image?',
    answer:
      'Use Share → Other ways → Course file to preserve the diagram and its image when moving a course. Share codes cannot carry image or audio files. A full backup also moves every course and its study history.',
    keywords: ['sharing', 'picture', 'media', 'export', 'audio'],
    action: { label: 'Share a course', to: '/share' },
  },
  {
    id: 'questions',
    group: 'Cards and content',
    question: 'Where do I practise exam-style questions?',
    answer:
      'Open the course’s Questions tab to write or practise problems with mark schemes. A question set can also appear as Practice questions on the path. Questions stay separate from card sessions, Card practice and assessment revision.',
    keywords: ['questions', 'problems', 'mark', 'practice', 'exam'],
  },
  {
    id: 'leeches',
    group: 'Cards and content',
    question: 'How do I fix a card I keep failing?',
    answer:
      'Repeatedly failed cards are called leeches; use the leech filter to find them. Reword the prompt, add a memory aid or split the card into smaller facts. Each card should test one thing.',
    keywords: ['leech', 'wrong', 'difficult', 'forget', 'failing'],
  },
  {
    id: 'exam-date',
    group: 'Progress',
    question: 'How do I set an exam date?',
    answer:
      'Set the date and time in course settings. Lacuna then prioritises the reviews predicted to help most on exam day. Without an exam date, it uses a rolling study horizon.',
    keywords: ['exam', 'date', 'assessment', 'deadline', 'time'],
  },
  {
    id: 'progress',
    group: 'Progress',
    question: 'What does the progress bar mean?',
    answer:
      'It estimates exam-day readiness for your chosen objective. Secure topics shows the fraction of cards with at least a 90% predicted chance of recall; Best overall recall shows the average predicted chance across all cards.',
    keywords: ['progress', 'readiness', 'secured', 'marks', 'percentage'],
    action: { label: 'View progress', to: '/analytics' },
  },
  {
    id: 'scheduling',
    group: 'Progress',
    question: 'How does review scheduling work?',
    answer:
      'Lacuna adapts review intervals to your answers, bringing difficult cards back sooner and easy cards less often.',
    keywords: ['fsrs', 'algorithm', 'spaced', 'repetition', 'schedule'],
    action: { label: 'Read about scheduling', to: '/method' },
  },
  {
    id: 'optimisation',
    group: 'Progress',
    question: 'How do I optimise scheduling for me?',
    answer:
      'Run Scheduling optimisation in course settings to fit scheduling to your review history. You can also enable automatic optimisation in Settings under Course defaults → Advanced scheduling → Optimise scheduling.',
    keywords: ['optimise', 'weights', 'personal', 'fsrs', 'automatic'],
    action: { label: 'Course defaults', to: '/settings#settings-course-defaults' },
  },
  {
    id: 'backups',
    group: 'Your data',
    question: 'How do I back up or restore my data?',
    answer:
      'Your study data lives locally on your device. Export a full backup or use automatic backups in Settings to keep a safe copy of your courses and study history.',
    keywords: ['backup', 'restore', 'recovery', 'export', 'save'],
    action: { label: 'Backups and recovery', to: '/settings#settings-backups' },
  },
  {
    id: 'sync',
    group: 'Your data',
    question: 'How do I sync between devices?',
    answer:
      'Open Your data in Settings, then Another device to set up sync and pair another device. Keep a separate backup for recovery.',
    keywords: ['sync', 'synchronise', 'phone', 'computer', 'pair'],
    action: { label: 'Device sync', to: '/settings#settings-sync' },
  },
  {
    id: 'move-data',
    group: 'Your data',
    question: 'How do I move a course to another device?',
    answer:
      'Save a course through Share → Other ways → Course file, then import the file on the other device. Use a full backup from Settings to move every course and its study history.',
    keywords: ['transfer', 'import', 'export', 'move', 'device'],
    action: { label: 'Import a course', to: '/import' },
  },
];

export const HELP_ALIASES: Readonly<Record<string, string>> = {
  tips: 'exam-date',
  'help-group-studying': 'study-modes',
  'help-group-shortcuts': 'keyboard-shortcuts',
  'help-group-content': 'card-types',
};

// The single source of truth for the keyboard shortcuts shown in the help overlay (?).
// The handlers live in the relevant components (AppShell, LearnMode); this registry only
// describes them so the cheatsheet can never drift out of date.

interface Shortcut {
  keys: string[];
  description: string;
}

export interface ShortcutGroup {
  title: string;
  shortcuts: Shortcut[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Anywhere',
    shortcuts: [
      { keys: ['Ctrl/Cmd', 'K'], description: 'Open quick search' },
      { keys: ['/'], description: 'Open Search content' },
      { keys: ['?'], description: 'Show this help' },
    ],
  },
  {
    title: 'Pages',
    shortcuts: [
      { keys: ['S'], description: 'Study (Today, course and lesson pages)' },
      { keys: ['N'], description: 'New card (Cards page, lesson in edit mode)' },
      { keys: ['/'], description: 'Search cards (Cards page)' },
    ],
  },
  {
    title: 'Dialogs and editors',
    shortcuts: [
      { keys: ['Ctrl/Cmd', 'Enter'], description: 'Save or submit' },
      { keys: ['Enter'], description: 'Submit a single-line form' },
      { keys: ['Esc'], description: 'Cancel and close' },
    ],
  },
  {
    title: 'Studying',
    shortcuts: [
      { keys: ['Space'], description: 'Show the answer' },
      { keys: ['Down'], description: 'Hide the answer' },
      { keys: ['Y'], description: 'Mark correct (silent mode)' },
      { keys: ['N'], description: 'Mark incorrect (silent mode)' },
      { keys: ['1'], description: 'Again (manual mode)' },
      { keys: ['2'], description: 'Hard (manual mode)' },
      { keys: ['3'], description: 'Good (manual mode)' },
      { keys: ['4'], description: 'Easy (manual mode)' },
      { keys: ['E'], description: 'Edit the current card' },
      { keys: ['F'], description: 'Toggle focus mode' },
      { keys: ['U'], description: 'Undo the last answer' },
    ],
  },
];

import { describe, expect, it, vi } from 'vitest';
import type { HelpTopic } from './helpTopics';
import { helpTopics } from './helpTopics';
import { searchHelp } from './searchHelp';

vi.mock('./helpTopics', () => ({
  helpTopics: [
    {
      id: 'answer',
      group: 'Your data',
      question: 'How do I move my data?',
      keywords: [],
      answer: 'Save a backup.',
    },
    {
      id: 'keyword',
      group: 'Your data',
      question: 'How do I recover my data?',
      keywords: ['save', 'backup'],
      answer: 'Import the saved file.',
    },
    {
      id: 'question',
      group: 'Your data',
      question: 'How do I save a backup?',
      keywords: [],
      answer: 'Open Settings.',
    },
    {
      id: 'z-tie',
      group: 'Studying',
      question: 'Spaced practice with repetition',
      keywords: [],
      answer: 'Review after a delay.',
    },
    {
      id: 'a-tie',
      group: 'Studying',
      question: 'Spaced study before repetition',
      keywords: [],
      answer: 'Return to the material later.',
    },
    {
      id: 'phrase',
      group: 'Studying',
      question: 'Spaced repetition',
      keywords: [],
      answer: 'Practise over time.',
    },
    {
      id: 'split-fields',
      group: 'Your data',
      question: 'How do I send an image?',
      keywords: ['picture'],
      answer: 'Use course sharing.',
    },
  ] satisfies readonly HelpTopic[],
}));

describe('searchHelp ranking with controlled topics', () => {
  it('prefers a question match over a keyword match, then an answer-only match', () => {
    expect(searchHelp('save backup').map((topic) => topic.id)).toEqual([
      'question',
      'keyword',
      'answer',
    ]);
  });

  it('prefers a complete question phrase and keeps source order for equally relevant topics', () => {
    expect(searchHelp('spaced repetition').map((topic) => topic.id)).toEqual([
      'phrase',
      'z-tie',
      'a-tie',
    ]);
  });

  it('ignores case and normalises whitespace within a multi-word query', () => {
    expect(searchHelp('  SPACED \t REPETITION\n ')).toEqual(searchHelp('spaced repetition'));
  });

  it('finds every word across fields and excludes topics missing any word', () => {
    expect(searchHelp('picture sharing').map((topic) => topic.id)).toEqual(['split-fields']);
    expect(searchHelp('picture nonexistent')).toEqual([]);
  });

  it('returns all topics in source order for a whitespace-only query', () => {
    expect(searchHelp(' \t\n ')).toEqual(helpTopics);
  });
});

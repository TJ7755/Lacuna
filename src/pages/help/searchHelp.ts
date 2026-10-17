import { helpTopics, type HelpTopic } from './helpTopics';

/** Require every word, preferring questions, then keywords, then answer-only matches. */
export function searchHelp(query: string): readonly HelpTopic[] {
  const phrase = query.toLowerCase().trim().replace(/\s+/g, ' ');
  if (!phrase) return helpTopics;
  const words = phrase.split(' ');
  return helpTopics
    .map((topic, index) => {
      const question = topic.question.toLowerCase();
      const keywords = topic.keywords.join(' ').toLowerCase();
      const answer = topic.answer.toLowerCase();
      const scores = words.map((word) =>
        question.includes(word) ? 3 : keywords.includes(word) ? 2 : answer.includes(word) ? 1 : 0,
      );
      const score = scores.includes(0)
        ? 0
        : scores.reduce<number>((sum, value) => sum + value, 0) +
          (question.includes(phrase) ? 3 : 0);
      return { topic, score, index };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ topic }) => topic);
}

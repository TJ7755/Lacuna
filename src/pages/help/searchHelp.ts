import { helpTopics, type HelpTopic } from './helpTopics';

/** All words must occur somewhere in the topic, regardless of their order. */
export function searchHelp(query: string): readonly HelpTopic[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return helpTopics.filter((topic) => {
    const text = [topic.question, topic.answer, ...topic.keywords].join(' ').toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

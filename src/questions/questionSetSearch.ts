import { plainPreview } from '../db/search';
import { flattenQuestionSet } from './questionSetAuthoring';
import { referencedQuestionSetConceptIds, type QuestionSet } from './questionSets';

export interface QuestionSetSearchContext {
  lessons?: readonly { id: string; name: string }[];
  concepts?: readonly { id: string; name: string }[];
}

/** Retain authored labels and image descriptions, never link destinations or asset identities. */
function searchableText(source: string): string {
  return plainPreview(
    source
      .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1')
      .replace(/^\s*(?:`{3,}|~{3,}).*$/gm, '')
      .replace(/^\s*(?:[-=]{2,}|(?:\*\s*){3,})\s*$/gm, '')
      .replace(/^\s*\[[^\]]+\]:.*$/gm, '')
      .replace(/!?\[([^\]]*)\]\[[^\]]*\]/g, '$1')
      .replace(/!?\[([^\]]*)\]\((?:\\.|[^\\)])*\)/g, '$1')
      .replace(/<img\b[^>]*\balt=["']([^"']*)["'][^>]*>/gi, '$1')
      .replace(/<[^>]*>/g, ' ')
      .replace(/(?:https?:\/\/|asset:|data:|blob:)[^\s)]+/g, '')
      .replace(/^\s*(?:[-+]|\d+\.)\s+/gm, '')
      .replace(/[[\]{}|\\]/g, ' '),
    Number.MAX_SAFE_INTEGER,
  );
}

function normalise(text: string): string {
  return text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function questionSetSearchContext(
  set: QuestionSet,
  context: QuestionSetSearchContext,
): string {
  const lessons = new Map(context.lessons?.map((lesson) => [lesson.id, lesson.name]));
  const concepts = new Map(context.concepts?.map((concept) => [concept.id, concept.name]));
  return [
    ...set.lessonIds.flatMap((id) => lessons.get(id) ?? []),
    ...referencedQuestionSetConceptIds(set).flatMap((id) => concepts.get(id) ?? []),
  ]
    .map(searchableText)
    .join(' · ');
}

/** AND across words/fields; best location covers most words, then the whole phrase.
 * Ties retain field order and input set order. Callers own course scope and draft visibility.
 * Only prompts, option wording and named context are indexed; marking is deliberately excluded.
 */
export function searchQuestionSets<T extends QuestionSet>(
  sets: readonly T[],
  query: string,
  context: QuestionSetSearchContext = {},
): { content: T; location: string; excerpt: string }[] {
  const phrase = normalise(query);
  const words = [...new Set(phrase.split(' ').filter(Boolean))];
  const seen = new Set<string>();
  return sets.flatMap((content) => {
    if (seen.has(content.id)) return [];
    seen.add(content.id);
    const fields = [
      { location: 'Title', text: content.title },
      { location: 'Lesson / Concept', text: questionSetSearchContext(content, context) },
    ];
    const addQuestions = (set: QuestionSet, prefix = '') => {
      const nodes = flattenQuestionSet(set);
      const labels = new Map(nodes.map((row) => [row.id, row.label]));
      for (const row of nodes) {
        const location =
          prefix +
          [...row.parentIds.map((id) => labels.get(id)), row.label]
            .join('')
            .replace(/^Q/, 'Question ');
        fields.push({ location, text: row.node.prompt });
        if (row.node.answer?.response.kind === 'multiple-choice') {
          row.node.answer.response.options.forEach((option) =>
            fields.push({ location: `${location} option`, text: option.content }),
          );
        }
      }
    };
    addQuestions(content);
    if (content.bank) {
      fields.push({
        location: 'Bank',
        text: [
          ...Object.values(content.bank.blueprint),
          ...Object.values(content.bank.source),
          ...content.bank.concepts.map((concept) => concept.name),
        ].join(' · '),
      });
      if (content.bank.family) {
        fields.push({ location: 'Template title', text: content.bank.family.template.title });
        addQuestions({ ...content, ...content.bank.family.template }, 'Template: ');
      }
    }
    const prepared = fields.map((field) => {
      const text = searchableText(field.text);
      const normal = normalise(text);
      return {
        ...field,
        text,
        normal,
        score:
          words.filter((word) => normal.includes(word)).length * 2 +
          (phrase && normal.includes(phrase) ? 1 : 0),
      };
    });
    if (!words.every((word) => prepared.some((field) => field.normal.includes(word)))) return [];
    const best = prepared.reduce((a, b) => (b.score > a.score ? b : a));
    // Centre long excerpts near a matching word, preserving original punctuation and case.
    const tokens = [...best.text.matchAll(/[\p{L}\p{N}]+/gu)];
    const first = tokens.find((token) => words.some((word) => normalise(token[0]).includes(word)));
    const start = Math.max(0, (first?.index ?? 0) - 50);
    const excerpt = best.text.slice(start, start + 180).trim();
    return [
      {
        content,
        location: best.location,
        excerpt: `${start ? '…' : ''}${excerpt}${best.text.length > start + 180 ? '…' : ''}`,
      },
    ];
  });
}

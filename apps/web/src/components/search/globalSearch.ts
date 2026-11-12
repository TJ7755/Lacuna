import {
  plainPreview,
  searchCardsInScope,
  searchCourseContent,
  searchQuestionsInScope,
  type CardFilter,
} from '@lacuna/core/db/search';
import { searchHelp } from '../../pages/help/searchHelp';
import { flattenQuestionSet } from '../../questions/questionSetAuthoring';
import type { SearchData } from '../../state/useSearchData';
import { searchQuestionSetHits } from './searchQuestionSetHits';
import { cardMedia, type SearchHit } from './searchPresentation';

function normalise(text: string): string {
  return plainPreview(text, Infinity)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function primaryText(hit: SearchHit): string[] {
  switch (hit.kind) {
    case 'help':
      return [hit.topic.question];
    case 'course':
      return [hit.course.name];
    case 'lesson':
      return [hit.lesson.name];
    case 'note':
      return [hit.note.name];
    case 'card':
      return [plainPreview(hit.card.front, Infinity) || cardMedia(hit.card.front)?.label || ''];
    case 'question':
      return hit.question.kind === 'fixed'
        ? [hit.question.name, hit.question.prompt]
        : [hit.question.name];
    case 'question-set':
      return [
        hit.questionSet.title,
        ...flattenQuestionSet(hit.questionSet).map(({ node }) => node.prompt),
      ];
  }
}

/** Share relevance across global surfaces; ties retain each searcher's existing order. */
export function globalSearch(
  query: string,
  data: SearchData | undefined,
  filters: CardFilter[] = [],
): SearchHit[] {
  const courses = data?.courses ?? [];
  const lessons = data?.lessons ?? [];
  const scope = { courses, lessons, cards: data?.cards ?? [] };
  // Structured filters narrow only Cards; discovery still owns visibility and ownership.
  const results: SearchHit[] = [
    ...(query.trim()
      ? searchHelp(query)
          .slice(0, 3)
          .map((topic): SearchHit => ({ kind: 'help', topic }))
      : []),
    ...searchCourseContent(query, courses, lessons, data?.notes ?? []),
    ...searchQuestionSetHits(query, data),
    ...searchQuestionsInScope(query, { ...scope, questions: data?.questions ?? [] }),
    ...searchCardsInScope(query, scope, { filters }),
  ];
  const phrase = normalise(query);
  if (!phrase) return results;
  const relevance = (hit: SearchHit) =>
    Math.max(
      ...primaryText(hit).map((text) => {
        const value = normalise(text);
        return value === phrase ? 3 : value.startsWith(phrase) ? 2 : value.includes(phrase) ? 1 : 0;
      }),
    );
  return results
    .map((hit, index) => ({ hit, index, score: relevance(hit) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ hit }) => hit);
}

import { searchQuestionSets } from '../../questions/questionSetSearch';
import type { SearchData } from '../../state/useSearchData';
import type { QuestionSetHit } from './searchPresentation';

export function searchQuestionSetHits(
  query: string,
  data: SearchData | undefined,
): QuestionSetHit[] {
  if (!data?.questionSets?.length || !/[\p{L}\p{N}]/u.test(query.normalize('NFKD'))) return [];

  const courses = new Map(data.courses.map((course) => [course.id, course]));
  const results = searchQuestionSets(data.questionSets, query, { lessons: data.lessons });
  return results.flatMap<QuestionSetHit>(({ content, excerpt }) => {
    const course = courses.get(content.courseId);
    return course ? [{ kind: 'question-set', questionSet: content, course, excerpt }] : [];
  });
}

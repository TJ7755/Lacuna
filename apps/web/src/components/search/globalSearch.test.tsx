import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createCourse, createCourseCard } from '../../db/repository';
import type { QuestionSetRecord } from '@lacuna/core/questions/questionSetCodec';
import type { SearchData } from '../../state/useSearchData';
import { globalSearch } from './globalSearch';
import { hitKey } from './searchPresentation';
import { SearchResultContent } from './SearchResultContent';

function questionSet(courseId: string, title: string): QuestionSetRecord {
  return {
    id: 'set-search',
    courseId,
    title,
    lessonIds: [],
    assessmentIds: [],
    contentVersion: 1,
    contentRevisionId: 'revision',
    createdAt: 1,
    updatedAt: 1,
    questions: [{ id: 'q1', prompt: 'Explain osmosis.', parts: [] }],
  };
}

function searchData(data: Partial<SearchData>): SearchData {
  return {
    cards: [],
    courses: [],
    lessons: [],
    notes: [],
    questions: [],
    questionSets: [],
    ...data,
  };
}

describe('global search relevance', () => {
  it('orders exact primary text, prefixes, substrings and incidental matches, retaining ties', async () => {
    const course = await createCourse('A membrane course');
    const incidental = await createCourseCard(
      course.id,
      'front_back',
      'Different prompt',
      'Answer',
    );
    const prefix = await createCourseCard(course.id, 'front_back', 'Membrane transport', 'Answer');
    const exact = await createCourseCard(course.id, 'front_back', '**Mémbrane**', 'Answer');
    const tied = { ...exact, id: 'exact-tie' };
    const set = questionSet(course.id, 'Membrane practice');
    const data = searchData({
      courses: [course],
      cards: [incidental, prefix, exact, tied],
      questionSets: [set],
    });
    expect(globalSearch('MEMBRANE', data).map(hitKey)).toEqual([
      `card-${exact.id}`,
      'card-exact-tie',
      `question-set-${set.id}`,
      `card-${prefix.id}`,
      `course-${course.id}`,
      `card-${incidental.id}`,
    ]);
    expect(globalSearch('membrane', data, ['flagged']).map(hitKey)).toEqual([
      `question-set-${set.id}`,
      `course-${course.id}`,
    ]);
    expect(globalSearch('', data, ['new']).map(hitKey)).toEqual([
      `card-${exact.id}`,
      'card-exact-tie',
      `card-${incidental.id}`,
      `card-${prefix.id}`,
    ]);
  });

  it('ranks nested published prompts without admitting orphan sets or punctuation-only queries', async () => {
    const course = await createCourse('Biology');
    const set = questionSet(course.id, 'Cell practice');
    set.questions[0].parts = [
      {
        id: 'part',
        prompt: 'Consider a membrane.',
        subparts: [{ id: 'subpart', prompt: 'Osmosis' }],
      },
    ];
    const data = searchData({
      courses: [{ ...course, name: 'Osmosis course' }],
      questionSets: [set, { ...set, id: 'orphan', courseId: 'missing' }],
    });
    expect(globalSearch('osmosis', data).map(hitKey)).toEqual([
      `question-set-${set.id}`,
      `course-${course.id}`,
    ]);
    expect(globalSearch('!!!', data)).toEqual([]);
    expect(globalSearch('import', undefined).some((hit) => hit.kind === 'help')).toBe(true);
  });
});

it.each([
  [`![audio](lacuna-asset://${'a'.repeat(64)})`, 'Audio clip'],
  ['![Cell diagram](lacuna-asset://image)', 'Cell diagram'],
  ['![](lacuna-asset://image)', 'Image'],
  ['Read this\n\n![Cell diagram](lacuna-asset://image)', 'Read this'],
])('ranks and labels media fronts with an SVG: %s', async (front, label) => {
  const course = await createCourse('Media');
  const card = await createCourseCard(course.id, 'front_back', front, 'Searchable answer');
  expect(
    globalSearch(
      label,
      searchData({
        courses: [{ ...course, name: `${label} course` }],
        cards: [card],
      }),
    )
      .slice(0, 2)
      .map(hitKey),
  ).toEqual([`card-${card.id}`, `course-${course.id}`]);
  const [hit] = globalSearch('Searchable answer', searchData({ courses: [course], cards: [card] }));
  const { container, rerender } = render(
    <SearchResultContent hit={hit} query="Searchable answer" compact />,
  );
  for (const compact of [true, false]) {
    rerender(<SearchResultContent hit={hit} query="Searchable answer" compact={compact} />);
    expect(screen.getByText(label)).toBeVisible();
    expect(screen.queryByText('(empty front)')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('img, audio')).toBeNull();
  }
});

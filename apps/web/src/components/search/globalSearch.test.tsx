import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createCourse, createCourseCard } from '../../db/repository';
import type { QuestionSetRecord } from '@lacuna/core/questions/questionSetCodec';
import { globalSearch } from './globalSearch';
import { hitPath } from './searchPresentation';
import { SearchResultContent } from './SearchResultContent';

function questionSet(courseId: string): QuestionSetRecord {
  return {
    id: 'set-search',
    courseId,
    title: 'Cell practice',
    lessonIds: [],
    assessmentIds: [],
    contentVersion: 1,
    contentRevisionId: 'revision',
    createdAt: 1,
    updatedAt: 1,
    questions: [
      {
        id: 'q1',
        prompt: 'Explain osmosis.',
        parts: [
          {
            id: 'part',
            prompt: 'Consider a membrane.',
            subparts: [{ id: 'subpart', prompt: 'Describe selective permeability.' }],
          },
        ],
      },
    ],
  };
}

describe('globalSearch', () => {
  it('finds modern set titles and nested prompts with an owned overview route, excluding orphan sets', async () => {
    const course = await createCourse('Biology');
    const set = questionSet(course.id);
    const data = {
      courses: [course],
      questionSets: [set, { ...set, id: 'orphan', courseId: 'missing' }],
    };
    for (const query of ['Cell practice', 'osmosis', 'membrane', 'selective permeability']) {
      const hits = globalSearch(query, data).filter((hit) => hit.kind === 'question-set');
      expect(hits).toHaveLength(1);
      expect(hitPath(hits[0])).toBe(`/course/${course.id}/question-sets/${set.id}`);
    }
    const [hit] = globalSearch('selective permeability', data);
    render(<SearchResultContent hit={hit} query="selective permeability" compact />);
    expect(screen.getByText('Cell practice')).toBeVisible();
    expect(screen.getByText('Biology · Question set')).toBeVisible();
    expect(screen.getByText('selective permeability', { selector: 'mark' })).toBeVisible();
  });

  it('ranks exact prompts and titles ahead of incidental ownership matches while keeping help', async () => {
    const course = await createCourse('How do I import cards?');
    const card = await createCourseCard(course.id, 'front_back', 'import', 'Exact prompt');
    const incidental = await createCourseCard(
      course.id,
      'front_back',
      'Different prompt',
      'Answer',
    );
    const set = { ...questionSet(course.id), title: 'Import practice' };
    const hits = globalSearch('import', {
      courses: [course],
      cards: [incidental, card],
      questionSets: [set],
    });
    expect(hits[0]).toMatchObject({ kind: 'card', card: { id: card.id } });
    expect(hits[1]).toMatchObject({ kind: 'question-set', questionSet: { id: set.id } });
    expect(hits.some((hit) => hit.kind === 'help')).toBe(true);
    expect(
      hits.findIndex((hit) => hit.kind === 'card' && hit.card.id === incidental.id),
    ).toBeGreaterThan(1);
    const accented = { ...card, front: 'Mémoire' };
    expect(globalSearch('MEMOIRE', { courses: [course], cards: [accented] })[0]).toMatchObject({
      kind: 'card',
    });
  });

  it.each([
    ['front_back', `![audio](lacuna-asset://${'a'.repeat(64)})`, 'Audio clip'],
    ['front_back', '![Cell diagram](lacuna-asset://image)', 'Cell diagram'],
    ['front_back', '![](lacuna-asset://image)', 'Image'],
  ] as const)(
    'gives %s media-only results a meaningful label and SVG',
    async (type, front, label) => {
      const course = await createCourse('Media');
      const card = await createCourseCard(course.id, type, front, 'Searchable answer');
      const [hit] = globalSearch('Searchable answer', { courses: [course], cards: [card] });
      const { container } = render(
        <SearchResultContent hit={hit} query="Searchable answer" compact />,
      );
      expect(screen.getByText(label)).toBeVisible();
      expect(screen.queryByText('(empty front)')).not.toBeInTheDocument();
      expect(container.querySelector('svg')).not.toBeNull();
    },
  );
});

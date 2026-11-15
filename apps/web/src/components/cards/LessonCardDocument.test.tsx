import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';
import type { Card, Course, ItemPayload } from '@lacuna/core/db/types';
import { LessonCardDocument } from './LessonCardDocument';

it.each<{ payload: ItemPayload; expected: string[] }>([
  {
    payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '1871.' } },
    expected: ['1871.'],
  },
  {
    payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '2*3*4' } },
    expected: ['2*3*4'],
  },
  {
    payload: { v: 1, kind: 'numeric', answer: { kind: 'within', value: '2*3*4', tolerance: 0.01 } },
    expected: ['2*3*4', '0.01'],
  },
  {
    payload: { v: 1, kind: 'numeric', answer: { kind: 'matches-one-of', values: ['2*3*4', '-2'] } },
    expected: ['2*3*4; -2'],
  },
  {
    payload: {
      v: 1,
      kind: 'working',
      scheme: [{ kind: 'waypoint', marks: 1, label: 'Rearrange', expression: 'x=4' }],
    },
    expected: ['Rearrange', 'x=4'],
  },
])('shows the full $payload.kind answer without requiring editing', ({ payload, expected }) => {
  const card = {
    id: 'c1',
    type: 'front_back',
    front: 'Question',
    back: '',
    payload,
    lastReviewed: null,
    due: null,
  } as Card;
  render(
    <MemoryRouter>
      <LessonCardDocument
        card={card}
        course={{ id: 'course' } as Course}
        lessonId="lesson"
        position={1}
        count={1}
        editable={false}
        sequences={[]}
        occlusions={[]}
      />
    </MemoryRouter>,
  );
  const answer = within(screen.getByRole('region', { name: 'Back' }));
  for (const text of expected)
    expect(
      answer.getByText(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))),
    ).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
});

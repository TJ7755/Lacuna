import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
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

it.each([
  { name: 'ordinary', extra: {}, linked: false, selectable: true },
  { name: 'sequence', extra: { sequenceItemId: 'item' }, linked: false, selectable: false },
  { name: 'occlusion', extra: { occlusionRegionId: 'region' }, linked: false, selectable: false },
  { name: 'linked', extra: {}, linked: true, selectable: false },
])('preserves bulk-action ownership for $name cards', ({ extra, linked, selectable }) => {
  const card = {
    id: 'c1',
    type: 'front_back',
    front: 'Question',
    back: 'Answer',
    lastReviewed: null,
    due: null,
    ...extra,
  } as Card;
  const onToggle = vi.fn();
  const onUnlinkCard = vi.fn();
  render(
    <MemoryRouter>
      <LessonCardDocument
        card={card}
        course={{ id: 'course' } as Course}
        lessonId="lesson"
        position={1}
        count={1}
        editable
        sequences={[]}
        occlusions={[]}
        selection={{
          selectMode: true,
          selected: new Set(),
          onToggle,
          linkedCardIds: new Set(linked ? [card.id] : []),
          onUnlinkCard,
        }}
      />
    </MemoryRouter>,
  );
  if (selectable) {
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select card: Question' }));
    expect(onToggle).toHaveBeenCalledWith(card.id);
  } else {
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(onToggle).not.toHaveBeenCalled();
  }
  if (linked) {
    fireEvent.click(screen.getByRole('button', { name: 'Remove from lesson' }));
    expect(onUnlinkCard).toHaveBeenCalledWith(card);
  } else {
    expect(screen.queryByRole('button', { name: 'Remove from lesson' })).not.toBeInTheDocument();
  }
});

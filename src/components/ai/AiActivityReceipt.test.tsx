import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiActionReceipt } from '../../ai/protocol';
import { AiActivityReceipt } from './AiActivityReceipt';

const availability = vi.hoisted(() => ({ targets: [true] as boolean[] }));

vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => availability.targets }));

const receipt: AiActionReceipt = {
  receiptId: 'receipt-1',
  callId: 'call-1',
  toolName: 'lacuna.create_course',
  summary: 'Created Mechanics',
  createdAt: Date.UTC(2026, 7, 28, 14, 35),
  targets: [{ kind: 'course', id: 'course-1', label: 'Mechanics' }],
};

describe('AiActivityReceipt', () => {
  beforeEach(() => {
    availability.targets = [true];
  });

  it('shows the action summary, tool name and local time', () => {
    render(<AiActivityReceipt receipt={receipt} />);

    expect(screen.getByText('Created Mechanics')).toBeInTheDocument();
    expect(screen.getByText('lacuna.create_course')).toBeInTheDocument();
    expect(
      screen.getByText(
        new Date(receipt.createdAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
      ),
    ).toBeInTheDocument();
  });

  it('links a course target to its existing route', () => {
    render(<AiActivityReceipt receipt={receipt} />);

    expect(screen.getByRole('link', { name: 'Open course Mechanics' })).toHaveAttribute(
      'href',
      '#/course/course-1',
    );
  });

  it('does not invent a Course route for a global memory scope', () => {
    render(
      <AiActivityReceipt
        receipt={{
          ...receipt,
          toolName: 'lacuna.create_memory',
          summary: 'Completed lacuna.create_memory',
          targets: [{ kind: 'course', id: '__global__', label: 'All Lacuna data' }],
        }}
      />,
    );

    expect(screen.getByText('All Lacuna data')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /All Lacuna data/ })).not.toBeInTheDocument();
  });

  it('marks a remotely deleted target unavailable instead of retaining a stale link', () => {
    availability.targets = [false];
    render(<AiActivityReceipt receipt={receipt} />);

    expect(screen.queryByRole('link', { name: 'Open course Mechanics' })).not.toBeInTheDocument();
    expect(screen.getByText('Mechanics · Unavailable')).toBeInTheDocument();
  });

  it('links a lesson target through its owning course route', () => {
    render(
      <AiActivityReceipt
        receipt={{
          ...receipt,
          targets: [
            {
              kind: 'lesson',
              id: 'lesson-1',
              courseId: 'course-1',
              label: 'Newton’s laws',
            },
          ],
        }}
      />,
    );

    expect(screen.getByRole('link', { name: 'Open lesson Newton’s laws' })).toHaveAttribute(
      'href',
      '#/course/course-1/lesson/lesson-1',
    );
  });

  it('links a card target to its editor', () => {
    render(
      <AiActivityReceipt
        receipt={{
          ...receipt,
          targets: [
            {
              kind: 'card',
              id: 'card-1',
              courseId: 'course-1',
              label: 'What is force?',
            },
          ],
        }}
      />,
    );

    expect(screen.getByRole('link', { name: 'Open card What is force?' })).toHaveAttribute(
      'href',
      '#/course/course-1/cards/card-1/edit',
    );
  });

  it('links a Question target to its editor', () => {
    render(
      <AiActivityReceipt
        receipt={{
          ...receipt,
          targets: [
            {
              kind: 'question',
              id: 'question-1',
              courseId: 'course-1',
              label: 'Linear equation application',
            },
          ],
        }}
      />,
    );

    expect(
      screen.getByRole('link', { name: 'Open question Linear equation application' }),
    ).toHaveAttribute('href', '#/course/course-1/questions/question-1/edit');
  });

  it('links an assessment target to the course assessment settings', () => {
    render(
      <AiActivityReceipt
        receipt={{
          ...receipt,
          targets: [
            {
              kind: 'assessment',
              id: 'assessment-1',
              courseId: 'course-1',
              label: 'Algebra checkpoint',
            },
          ],
        }}
      />,
    );

    expect(
      screen.getByRole('link', { name: 'Open assessment Algebra checkpoint' }),
    ).toHaveAttribute('href', '#/course/course-1/settings#course-settings-assessments');
  });

  it('gives the receipt and target meaningful accessible names', () => {
    render(<AiActivityReceipt receipt={receipt} />);

    expect(
      screen.getByRole('article', { name: 'Completed action: Created Mechanics' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open course Mechanics' })).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AiActionReceipt } from '../../ai/protocol';
import { AiActivityReceipt } from './AiActivityReceipt';

const receipt: AiActionReceipt = {
  receiptId: 'receipt-1',
  callId: 'call-1',
  toolName: 'lacuna.create_course',
  summary: 'Created Mechanics',
  createdAt: Date.UTC(2026, 7, 28, 14, 35),
  targets: [{ kind: 'course', id: 'course-1', label: 'Mechanics' }],
};

describe('AiActivityReceipt', () => {
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

  it('keeps targets without an honest route as labelled non-links', () => {
    render(
      <AiActivityReceipt
        receipt={{
          ...receipt,
          targets: [{ kind: 'lesson', id: 'lesson-1', label: 'Newton’s laws' }],
        }}
      />,
    );

    expect(screen.queryByRole('link', { name: 'Newton’s laws' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('lesson target: Newton’s laws (unavailable)')).toBeInTheDocument();
  });

  it('gives the receipt and target meaningful accessible names', () => {
    render(<AiActivityReceipt receipt={receipt} />);

    expect(
      screen.getByRole('article', { name: 'Completed action: Created Mechanics' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open course Mechanics' })).toBeInTheDocument();
  });
});

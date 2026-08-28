import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AiConversationItem } from '../../ai/session/types';
import { AiConversation } from './AiConversation';

describe('AiConversation', () => {
  it('describes the current terminal chat without promising Lacuna actions', () => {
    render(<AiConversation items={[]} />);

    expect(screen.getByText('Chat with your connected terminal agent.')).toBeInTheDocument();
    expect(screen.queryByText(/build course material|change something in Lacuna/i)).toBeNull();
  });

  it('links courses but does not invent a route for lessons without course context', () => {
    const items: AiConversationItem[] = [
      {
        kind: 'assistant',
        id: 'assistant-1',
        content: 'These sources are relevant.',
        createdAt: 1,
        sources: [
          { kind: 'course', id: 'course-1', label: 'Mechanics' },
          { kind: 'lesson', id: 'lesson-1', label: 'Newton’s laws' },
        ],
      },
    ];

    render(<AiConversation items={items} />);

    const courseLink = screen.getByRole('link', { name: 'Mechanics' });
    expect(courseLink).toHaveAttribute('href', '#/course/course-1');
    expect(courseLink).toHaveClass('min-h-11');
    expect(screen.queryByRole('link', { name: 'Newton’s laws' })).not.toBeInTheDocument();
    expect(screen.getByText('Newton’s laws')).toBeInTheDocument();
  });

  it('scrolls the conversation log only when an item is appended', () => {
    const firstItem: AiConversationItem = {
      kind: 'assistant',
      id: 'assistant-1',
      content: 'Ready.',
      createdAt: 1,
      sources: [],
    };
    const appendedItems: AiConversationItem[] = [
      {
        kind: 'user',
        id: 'user-1',
        content: 'Create the course.',
        createdAt: 2,
        delivery: 'claimed',
      },
      {
        kind: 'assistant',
        id: 'assistant-2',
        content: 'I need approval first.',
        createdAt: 3,
        sources: [],
      },
      {
        kind: 'receipt',
        id: 'receipt-1',
        receipt: {
          receiptId: 'receipt-1',
          callId: 'call-1',
          toolName: 'lacuna.create_course',
          summary: 'Created Mechanics',
          createdAt: 4,
          targets: [],
        },
      },
      {
        kind: 'error',
        id: 'error-1',
        error: { kind: 'internal', message: 'The terminal stopped responding.' },
        createdAt: 5,
      },
    ];
    const items: AiConversationItem[] = [firstItem];
    const { rerender } = render(<AiConversation items={items} />);
    const log = screen.getByRole('log');
    Object.defineProperty(log, 'scrollHeight', { configurable: true, value: 640 });

    for (const item of appendedItems) {
      log.scrollTop = 0;
      items.push(item);
      rerender(<AiConversation items={[...items]} />);
      expect(log.scrollTop).toBe(640);
    }

    log.scrollTop = 180;
    rerender(<AiConversation items={[...items]} />);
    expect(log.scrollTop).toBe(180);
  });
});

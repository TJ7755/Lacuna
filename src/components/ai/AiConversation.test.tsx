import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AiConversationItem } from '../../ai/session/types';
import { AiConversation } from './AiConversation';

describe('AiConversation', () => {
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

    expect(screen.getByRole('link', { name: 'Mechanics' })).toHaveAttribute(
      'href',
      '#/course/course-1',
    );
    expect(screen.queryByRole('link', { name: 'Newton’s laws' })).not.toBeInTheDocument();
    expect(screen.getByText('Newton’s laws')).toBeInTheDocument();
  });
});

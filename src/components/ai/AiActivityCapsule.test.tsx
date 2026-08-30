import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AiSession, AiSessionSnapshot } from '../../ai/session/types';
import { AiActivityCapsule } from './AiActivityCapsule';

function sessionWith(patch: Partial<AiSessionSnapshot> = {}): AiSession {
  const snapshot: AiSessionSnapshot = {
    revision: 0,
    connection: { status: 'disconnected' },
    conversationId: null,
    items: [],
    run: null,
    activity: null,
    approval: null,
    draft: '',
    queuedFollowUp: null,
    ...patch,
  };

  return {
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
    activate: vi.fn(),
    dispose: vi.fn(),
    pair: vi.fn(),
    send: vi.fn().mockResolvedValue({ ok: true, data: { messageId: 'message-1' } }),
    stop: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    decide: vi.fn(),
    resetConnection: vi.fn(),
  };
}

describe('AiActivityCapsule', () => {
  it('shows current activity and stops the explicit active run', () => {
    const session = sessionWith({
      run: {
        runId: 'run-17',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        claimedAt: 1,
        leaseExpiresAt: 10_000,
        status: 'active',
      },
      activity: {
        runId: 'run-17',
        status: 'working',
        summary: 'Comparing recent answers',
        updatedAt: 2,
      },
    });

    render(
      <AiActivityCapsule session={session} canOpenConversation onOpenConversation={vi.fn()} />,
    );

    expect(screen.getByText('Working')).toBeVisible();
    expect(screen.getByText('Comparing recent answers')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(session.stop).toHaveBeenCalledWith('run-17');
  });

  it('does not repeat a generic activity summary that matches its status', () => {
    render(
      <AiActivityCapsule
        session={sessionWith({
          run: {
            runId: 'run-generic',
            conversationId: 'conversation-1',
            messageId: 'message-1',
            claimedAt: 1,
            leaseExpiresAt: 10_000,
            status: 'active',
          },
          activity: {
            runId: 'run-generic',
            status: 'working',
            summary: 'Working',
            updatedAt: 2,
          },
        })}
        canOpenConversation
        onOpenConversation={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Working')).toHaveLength(1);
    expect(screen.getByText('AI is responding')).toBeVisible();
  });

  it('opens compact details with the latest reply and queued follow-up', () => {
    const onOpenConversation = vi.fn();
    const session = sessionWith({
      items: [
        {
          kind: 'assistant',
          id: 'assistant-1',
          content: 'An older reply.',
          createdAt: 1,
          sources: [],
        },
        {
          kind: 'assistant',
          id: 'assistant-2',
          content: 'The latest reply compares both theories.',
          createdAt: 3,
          sources: [],
        },
      ],
      activity: {
        runId: 'run-17',
        status: 'awaiting_approval',
        summary: 'Waiting for approval',
        detail: 'Create a transfer question',
        updatedAt: 4,
      },
      queuedFollowUp: 'Use a concrete example next.',
    });

    render(
      <AiActivityCapsule
        session={session}
        canOpenConversation
        onOpenConversation={onOpenConversation}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'View AI activity' }));

    const details = screen.getByRole('dialog', { name: 'AI activity details' });
    expect(details).toHaveTextContent('Create a transfer question');
    expect(details).toHaveTextContent('The latest reply compares both theories.');
    expect(screen.getByRole('textbox', { name: 'Queued follow-up' })).toHaveValue(
      'Use a concrete example next.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open conversation' }));
    expect(onOpenConversation).toHaveBeenCalledOnce();
  });

  it.each([
    ['Escape', () => fireEvent.keyDown(window, { key: 'Escape' })],
    ['an outside click', () => fireEvent.pointerDown(document.body)],
  ])('closes details with %s and restores focus to the capsule', (_reason, dismiss) => {
    render(
      <AiActivityCapsule
        session={sessionWith({
          activity: {
            runId: 'run-17',
            status: 'completed',
            summary: 'Comparison complete',
            updatedAt: 4,
          },
        })}
        canOpenConversation
        onOpenConversation={vi.fn()}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'View AI activity' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'AI activity details' })).toBeInTheDocument();

    dismiss();

    expect(screen.queryByRole('dialog', { name: 'AI activity details' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('replaces the queued follow-up through the session seam', async () => {
    const session = sessionWith({
      connection: {
        status: 'connected',
        connectionId: 'connection-1',
        client: { name: 'Terminal agent' },
        lastActivityAt: 1,
      },
      activity: {
        runId: 'run-17',
        status: 'working',
        summary: 'Building an explanation',
        updatedAt: 4,
      },
      queuedFollowUp: 'Use the original example.',
    });
    render(
      <AiActivityCapsule session={session} canOpenConversation onOpenConversation={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'View AI activity' }));

    const followUp = screen.getByRole('textbox', { name: 'Queued follow-up' });
    fireEvent.change(followUp, { target: { value: 'Compare it with a counterexample.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update follow-up' }));

    await waitFor(() =>
      expect(session.send).toHaveBeenCalledWith('Compare it with a counterexample.'),
    );
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Queued follow-up' })).toHaveValue(
        'Compare it with a counterexample.',
      ),
    );
  });
});

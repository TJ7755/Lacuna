import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AiSession, AiSessionSnapshot } from '../../ai/session/types';
import { AiPanel } from './AiPanel';

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
    pair: vi.fn().mockResolvedValue({
      ok: true,
      data: { code: 'ABCD-EFGH-JKMN-PQRS-TVWZ', expiresAt: Date.now() + 60_000 },
    }),
    send: vi.fn().mockResolvedValue({ ok: true, data: { messageId: 'message-1' } }),
    stop: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    decide: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    resetConnection: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  };
}

describe('AiPanel', () => {
  it('starts pairing from the disconnected state and prevents messages', async () => {
    const session = sessionWith();
    render(<AiPanel session={session} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect terminal' }));
    await waitFor(() => expect(session.pair).toHaveBeenCalledOnce());
    expect(screen.getByRole('textbox', { name: 'Message AI' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });

  it('keeps completed messages visible when the terminal disconnects', () => {
    render(
      <AiPanel
        session={sessionWith({
          connection: { status: 'disconnected', reason: 'Terminal disconnected' },
          conversationId: 'conversation-1',
          items: [
            {
              kind: 'user',
              id: 'message-1',
              content: 'Explain the testing effect.',
              createdAt: 1,
              delivery: 'completed',
            },
            {
              kind: 'assistant',
              id: 'assistant-1',
              content: 'Retrieval strengthens later access more than passive rereading.',
              createdAt: 2,
              sources: [],
            },
          ],
        })}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Explain the testing effect.', { exact: true })).toBeVisible();
    expect(
      screen.getByText('Retrieval strengthens later access more than passive rereading.', {
        exact: true,
      }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Connect terminal' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Message AI' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });

  it('shows the short-lived code while pairing', () => {
    render(
      <AiPanel
        session={sessionWith({
          connection: {
            status: 'pairing',
            code: 'ABCD-EFGH-JKMN-PQRS-TVWZ',
            expiresAt: Date.now() + 60_000,
          },
        })}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('ABCD-EFGH-JKMN-PQRS-TVWZ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy instruction' })).toHaveFocus();
    expect(screen.getByRole('textbox', { name: 'Message AI' })).toBeDisabled();
  });

  it('sends a message from the composer and clears it', async () => {
    const session = sessionWith({
      connection: {
        status: 'connected',
        connectionId: 'connection-1',
        client: { name: 'OpenCode' },
        lastActivityAt: 1,
      },
      conversationId: 'conversation-1',
    });
    render(<AiPanel session={session} onClose={vi.fn()} />);

    const composer = screen.getByRole('textbox', { name: 'Message AI' });
    fireEvent.change(composer, { target: { value: 'Make a transfer question.' } });
    fireEvent.keyDown(composer, { key: 'Enter' });

    await waitFor(() => {
      expect(session.send).toHaveBeenCalledWith('Make a transfer question.');
      expect(composer).toHaveValue('');
    });
  });

  it('keeps the conversation visible while working and stops the explicit run', () => {
    const session = sessionWith({
      connection: {
        status: 'connected',
        connectionId: 'connection-1',
        client: { name: 'Terminal agent' },
        lastActivityAt: 1,
      },
      conversationId: 'conversation-1',
      items: [
        {
          kind: 'assistant',
          id: 'assistant-1',
          content: 'Your current weak point is distinguishing stability from difficulty.',
          createdAt: 2,
          sources: [],
        },
      ],
      activity: {
        runId: 'run-1',
        status: 'working',
        summary: 'Comparing your recent answers',
        updatedAt: 3,
      },
    });
    render(<AiPanel session={session} onClose={vi.fn()} />);

    expect(screen.getByText(/Your current weak point/)).toBeInTheDocument();
    expect(screen.getAllByText('Comparing your recent answers')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(session.stop).toHaveBeenCalledWith('run-1');
  });

  it('lets the user clear a connected terminal without hiding Stop or close', async () => {
    const session = sessionWith({
      connection: {
        status: 'connected',
        connectionId: 'connection-1',
        client: { name: 'Terminal agent' },
        lastActivityAt: 1,
      },
      activity: {
        runId: 'run-1',
        status: 'working',
        summary: 'Waiting for the terminal',
        updatedAt: 2,
      },
    });
    const onClose = vi.fn();
    render(<AiPanel session={session} onClose={onClose} />);

    expect(screen.getByRole('button', { name: 'Stop' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Close AI' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect terminal' }));

    await waitFor(() => expect(session.resetConnection).toHaveBeenCalledOnce());
    expect(session.stop).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('explains the boundary of a completed Stop request', () => {
    render(
      <AiPanel
        session={sessionWith({
          connection: {
            status: 'connected',
            connectionId: 'connection-1',
            client: { name: 'Terminal agent' },
            lastActivityAt: 1,
          },
          activity: {
            runId: 'run-1',
            status: 'completed',
            summary: 'Stopped',
            detail: 'Further AI bridge actions are blocked. Completed changes remain.',
            updatedAt: 3,
          },
        })}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByText('Further AI bridge actions are blocked. Completed changes remain.'),
    ).toBeVisible();
  });

  it('presents the exact pending approval as the initial focus target', async () => {
    const session = sessionWith({
      connection: {
        status: 'connected',
        connectionId: 'connection-1',
        client: { name: 'Terminal agent' },
        lastActivityAt: 1,
      },
      approval: {
        approvalId: 'approval-1',
        kind: 'destructive_call',
        toolName: 'lacuna.delete_course',
        targetLabel: 'Mechanics',
        summary: 'Delete the Mechanics course and its learning content.',
        requestedAt: 2,
        status: 'pending',
      },
    });
    render(<AiPanel session={session} onClose={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Approve this action?' })).toBeInTheDocument();
    expect(screen.getByText('lacuna.delete_course')).toBeInTheDocument();
    expect(screen.getByText('Mechanics')).toBeInTheDocument();
    const reject = screen.getByRole('button', { name: 'Reject' });
    await waitFor(() => expect(reject).toHaveFocus());
    fireEvent.click(reject);
    expect(session.decide).toHaveBeenCalledWith('approval-1', false);
  });
});

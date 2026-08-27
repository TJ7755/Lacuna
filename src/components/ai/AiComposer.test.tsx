import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AiSession } from '../../ai/session/types';
import { AiComposer } from './AiComposer';

function session(): AiSession {
  return {
    subscribe: () => () => {},
    getSnapshot: vi.fn(),
    dispose: vi.fn(),
    pair: vi.fn(),
    send: vi.fn().mockResolvedValue({ ok: true, data: { messageId: 'message-1' } }),
    stop: vi.fn(),
    decide: vi.fn(),
    resetConnection: vi.fn(),
  };
}

describe('AiComposer', () => {
  it('uses an honest chat prompt while connected', () => {
    render(
      <AiComposer
        session={session()}
        disabled={false}
        initialDraft=""
        queuedFollowUp={null}
        autoFocus={false}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Message AI' })).toHaveAttribute(
      'placeholder',
      'Message AI…',
    );
  });

  it('restores a changed session draft when the composer is untouched', () => {
    const aiSession = session();
    const { rerender } = render(
      <AiComposer
        session={aiSession}
        disabled={false}
        initialDraft=""
        queuedFollowUp={null}
        autoFocus={false}
      />,
    );

    rerender(
      <AiComposer
        session={aiSession}
        disabled={false}
        initialDraft="Change direction and compare both theories."
        queuedFollowUp={null}
        autoFocus={false}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Message AI' })).toHaveValue(
      'Change direction and compare both theories.',
    );
  });

  it('does not overwrite an active local edit when the session draft changes', () => {
    const aiSession = session();
    const { rerender } = render(
      <AiComposer
        session={aiSession}
        disabled={false}
        initialDraft=""
        queuedFollowUp={null}
        autoFocus={false}
      />,
    );
    const composer = screen.getByRole('textbox', { name: 'Message AI' });
    fireEvent.change(composer, { target: { value: 'My unfinished edit' } });

    rerender(
      <AiComposer
        session={aiSession}
        disabled={false}
        initialDraft="Recovered session draft"
        queuedFollowUp={null}
        autoFocus={false}
      />,
    );

    expect(composer).toHaveValue('My unfinished edit');
  });

  it('loads a queued follow-up for editing and sends its replacement', async () => {
    const aiSession = session();
    render(
      <AiComposer
        session={aiSession}
        disabled={false}
        initialDraft=""
        queuedFollowUp="Compare both theories."
        autoFocus={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit queued follow-up' }));
    const composer = screen.getByRole('textbox', { name: 'Message AI' });
    expect(composer).toHaveValue('Compare both theories.');
    expect(composer).toHaveFocus();

    fireEvent.change(composer, { target: { value: 'Compare both theories with an example.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(aiSession.send).toHaveBeenCalledWith('Compare both theories with an example.');
    });
  });

  it('provides a 44 by 44 pixel minimum Send target', () => {
    render(
      <AiComposer
        session={session()}
        disabled={false}
        initialDraft="Ready to send"
        queuedFollowUp={null}
        autoFocus={false}
      />,
    );

    expect(screen.getByRole('button', { name: 'Send message' })).toHaveClass(
      'min-h-11',
      'min-w-11',
    );
  });

  it('keeps the draft usable when the session rejects a send', async () => {
    const aiSession = session();
    vi.mocked(aiSession.send).mockRejectedValueOnce(new Error('Connection closed'));
    render(
      <AiComposer
        session={aiSession}
        disabled={false}
        initialDraft="Keep this draft"
        queuedFollowUp={null}
        autoFocus={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled());
    expect(screen.getByRole('textbox', { name: 'Message AI' })).toHaveValue('Keep this draft');
  });
});

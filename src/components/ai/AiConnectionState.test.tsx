import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiConnectionState } from './AiConnectionState';

const writeText = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
});

describe('AiConnectionState', () => {
  it('offers one focused primary action while disconnected', () => {
    const onStartPairing = vi.fn();
    render(
      <AiConnectionState
        pairing={null}
        busy={false}
        error={null}
        onStartPairing={onStartPairing}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Connect a terminal' })).toBeInTheDocument();
    const connect = screen.getByRole('button', { name: 'Connect terminal' });
    expect(connect).toHaveFocus();
    expect(connect).toHaveClass('min-h-11');
    expect(screen.getAllByRole('button')).toHaveLength(1);

    fireEvent.click(connect);
    expect(onStartPairing).toHaveBeenCalledOnce();
    expect(screen.getByText(/MCP/)).toBeInTheDocument();
  });

  it('presents a short-lived pairing code and copies the terminal instruction', async () => {
    const onCancel = vi.fn();
    const expiresAt = Date.now() + 90_000;
    const instruction =
      'Connect to Lacuna with code A7K9-Q2. If lacuna.wait_for_message is unavailable, read https://github.com/TJ7755/Lacuna#optional-desktop-ai-chat and help me set up the Lacuna terminal companion; tell me when I must restart this terminal before continuing. If it is available, keep calling lacuna.wait_for_message, and honour the returned versioned instructions for each claimed message, including permission and Stop rules, until I ask you to disconnect.';

    render(
      <AiConnectionState
        pairing={{ code: 'A7K9-Q2', expiresAt }}
        busy={false}
        error={null}
        onStartPairing={vi.fn()}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText('A7K9-Q2')).toHaveClass('font-mono', 'whitespace-nowrap', 'text-xl');
    expect(screen.getByRole('textbox', { name: 'Terminal instruction' })).toHaveValue(instruction);
    expect(screen.getByRole('link', { name: 'Set up the terminal companion' })).toHaveAttribute(
      'href',
      'https://github.com/TJ7755/Lacuna#optional-desktop-ai-chat',
    );
    expect(screen.getByText(/^Expires /)).toHaveAttribute(
      'datetime',
      new Date(expiresAt).toISOString(),
    );

    const copy = screen.getByRole('button', { name: 'Copy instruction' });
    expect(copy).toHaveFocus();
    expect(copy).toHaveClass('min-h-11');
    fireEvent.click(copy);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(instruction));
    expect(screen.getByRole('status')).toHaveTextContent('Instruction copied');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('exposes pairing progress and an actionable connection error', () => {
    render(
      <AiConnectionState
        pairing={null}
        busy
        error="Pairing could not start. Check the terminal setup and try again."
        onStartPairing={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const region = screen.getByRole('heading', { name: 'Connect a terminal' }).closest('section');
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Connecting…' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Pairing could not start. Check the terminal setup and try again.',
    );
  });
});

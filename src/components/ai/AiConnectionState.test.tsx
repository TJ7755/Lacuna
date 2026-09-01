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
  it('shows a copyable native companion instruction without offering relay pairing', async () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        isElectron: true,
        mcp: {
          getStatus: vi.fn().mockResolvedValue({
            running: true,
            toolCount: 1,
            toolSurfaceVersion: 1,
            aiRenderer: { status: 'ready' },
            aiCompanion: {
              command: 'C:\\Program Files\\Lacuna\\Lacuna.exe',
              env: { ELECTRON_RUN_AS_NODE: '1' },
              args: [
                '--ai-companion',
                '--user-data-dir=C:\\Users\\student\\AppData\\Roaming\\Lacuna isolated',
              ],
            },
          }),
        },
      },
    });
    const onStartPairing = vi.fn();

    render(
      <AiConnectionState
        pairing={null}
        busy={false}
        error={null}
        local
        onStartPairing={onStartPairing}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Connect AI client' })).not.toBeInTheDocument();
    expect(screen.queryByText('Pairing code')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Connect an AI client' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'The desktop app connects locally. No pairing code or internet connection is needed.',
      ),
    ).toBeVisible();
    expect(await screen.findByText('AI runtime ready')).toBeVisible();

    const setupPrompt = await screen.findByRole('textbox', { name: 'AI client setup prompt' });
    const setupPromptValue = (setupPrompt as HTMLTextAreaElement).value;
    expect(setupPromptValue).toContain(
      'using exactly {"command":"C:\\\\Program Files\\\\Lacuna\\\\Lacuna.exe","args":["--ai-companion","--user-data-dir=C:\\\\Users\\\\student\\\\AppData\\\\Roaming\\\\Lacuna isolated"],"env":{"ELECTRON_RUN_AS_NODE":"1"}}',
    );
    expect(setupPromptValue).toContain(
      'preserve every argument, including --user-data-dir when present',
    );
    expect(setupPromptValue).toContain(
      'Use conversation --ai-companion, never data --mcp-companion.',
    );
    expect(setupPromptValue).toContain(
      'never launch another Lacuna app, run the command manually or inspect source to test setup',
    );
    expect(setupPromptValue).toContain(
      'Success means this task exposes lacuna.connect and lacuna.wait_for_message and lacuna.connect succeeds, not merely that registration says connected.',
    );
    expect(setupPromptValue).toContain(
      'Codex app/extension: Save then Restart; CLI: codex mcp list then /mcp.',
    );
    expect(setupPromptValue).toContain(
      'If connect says the AI runtime is not ready, keep Lacuna open with AI enabled, select Restart AI runtime, then retry.',
    );
    expect(setupPromptValue).toContain('Next, keep calling lacuna.wait_for_message.');
    expect(setupPromptValue).toContain(
      'reply with fresh authored text via lacuna.reply; never use canned test text',
    );
    expect(setupPromptValue.length).toBeGreaterThanOrEqual(850);
    expect(setupPromptValue.length).toBeLessThanOrEqual(1_250);

    fireEvent.click(screen.getByRole('button', { name: 'Copy setup prompt' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(setupPromptValue));
    expect(onStartPairing).not.toHaveBeenCalled();
  });

  it('reports a stuck native runtime and offers a targeted restart', async () => {
    const requestRestart = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        isElectron: true,
        ai: { requestRestart },
        mcp: {
          getStatus: vi.fn().mockResolvedValue({
            running: true,
            toolCount: 1,
            toolSurfaceVersion: 1,
            aiRenderer: { status: 'waiting' },
            aiCompanion: {
              command: 'C:\\Program Files\\Lacuna\\Lacuna.exe',
              args: ['--ai-companion'],
            },
          }),
        },
      },
    });

    render(
      <AiConnectionState
        pairing={null}
        busy={false}
        error={null}
        local
        onStartPairing={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(await screen.findByText('AI runtime is still starting')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Restart AI runtime' }));

    await waitFor(() => expect(requestRestart).toHaveBeenCalledOnce());
  });

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

    expect(screen.getByRole('heading', { name: 'Connect an AI client' })).toBeInTheDocument();
    const connect = screen.getByRole('button', { name: 'Connect AI client' });
    expect(connect).toHaveFocus();
    expect(connect).toHaveClass('min-h-11');
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByText('Before connecting')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open AI client setup instructions' })).toHaveAttribute(
      'href',
      'https://github.com/TJ7755/Lacuna#optional-desktop-ai-chat',
    );

    fireEvent.click(connect);
    expect(onStartPairing).toHaveBeenCalledOnce();
  });

  it('presents a short-lived pairing code and copies the terminal instruction', async () => {
    const onCancel = vi.fn();
    const expiresAt = Date.now() + 90_000;
    const instruction =
      "Connect to Lacuna with code A7K9-Q2. First verify this active AI client exposes lacuna.wait_for_message. If it does not, use the client's normal MCP registration flow, read https://github.com/TJ7755/Lacuna#optional-desktop-ai-chat for client-specific reload steps, and continue only after this task exposes the tool; do not run Lacuna or its companion directly for diagnostics. Then keep calling lacuna.wait_for_message. For every claimed message, this same live task must follow the returned versioned instructions, perform the permitted work and send a fresh authored response with lacuna.reply; never substitute canned transport-test text. Continue until I ask you to disconnect.";

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
    expect(screen.getByRole('textbox', { name: 'AI client instruction' })).toHaveValue(instruction);
    expect(screen.getByRole('link', { name: 'Set up the AI client companion' })).toHaveAttribute(
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

    const region = screen.getByRole('heading', { name: 'Connect an AI client' }).closest('section');
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Connecting…' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Pairing could not start. Check the terminal setup and try again.',
    );
  });
});

import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button';

const TERMINAL_SETUP_URL = 'https://github.com/TJ7755/Lacuna#optional-desktop-ai-chat';

export interface AiPairingState {
  code: string;
  expiresAt: number;
}

export interface AiConnectionStateProps {
  pairing: AiPairingState | null;
  busy: boolean;
  error: string | null;
  local?: boolean;
  compact?: boolean;
  onStartPairing: () => void;
  onCancel: () => void;
}

function TerminalSetupGuide() {
  return (
    <div className="mt-4 border-t border-line pt-4 text-sm text-ink-soft">
      <p className="font-medium text-ink">Before connecting</p>
      <p className="mt-1 text-xs leading-5 text-ink-faint">
        Install Lacuna&apos;s MCP companion in your terminal, then return here to create a pairing
        code.
      </p>
      <a
        href={TERMINAL_SETUP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-2"
      >
        Open terminal setup instructions
      </a>
    </div>
  );
}

export function AiConnectionState({
  pairing,
  busy,
  error,
  local = false,
  compact = false,
  onStartPairing,
  onCancel,
}: AiConnectionStateProps) {
  const connectRef = useRef<HTMLButtonElement>(null);
  const copyRef = useRef<HTMLButtonElement>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [localInstruction, setLocalInstruction] = useState<string | null>(null);
  const [localSetupError, setLocalSetupError] = useState<string | null>(null);
  const pairingCode = pairing?.code ?? null;
  const relayInstruction = pairingCode
    ? `Connect to Lacuna with code ${pairingCode}. If lacuna.wait_for_message is unavailable, read ${TERMINAL_SETUP_URL} and help me set up the Lacuna terminal companion; tell me when I must restart this terminal before continuing. If it is available, keep calling lacuna.wait_for_message, and honour the returned versioned instructions for each claimed message, including permission and Stop rules, until I ask you to disconnect.`
    : '';
  const instruction = local ? (localInstruction ?? '') : relayInstruction;

  useEffect(() => {
    if (!local) return;

    let cancelled = false;
    setLocalSetupError(null);
    void window.electronAPI?.mcp
      ?.getStatus()
      .then((status) => {
        if (cancelled) return;
        const companion = status.aiCompanion;
        if (!companion) throw new Error('The local AI companion is unavailable.');
        const command = JSON.stringify({ command: companion.command, args: companion.args });
        setLocalInstruction(
          `Set up Lacuna's desktop AI companion as an MCP server named lacuna using ${command}. If you need client-specific steps, read ${TERMINAL_SETUP_URL}. Restart this terminal session if required, call lacuna.connect, then keep calling lacuna.wait_for_message and honour the returned versioned instructions, permission checks and Stop rules until I ask you to disconnect.`,
        );
      })
      .catch(() => {
        if (!cancelled) {
          setLocalSetupError('Lacuna could not read its packaged companion command.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [local]);

  useEffect(() => {
    setCopyStatus('idle');
    if (pairingCode || (local && localInstruction)) copyRef.current?.focus();
    else connectRef.current?.focus();
  }, [local, localInstruction, pairingCode]);

  async function copyInstruction() {
    if (!instruction) return;
    try {
      await navigator.clipboard.writeText(instruction);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  }

  if (local) {
    return (
      <section
        aria-labelledby="ai-connect-title"
        aria-busy={!localInstruction}
        className="flex flex-1 flex-col overflow-y-auto p-5"
      >
        <div className="my-auto">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent">
            Connection
          </p>
          <h2 id="ai-connect-title" className="mt-2 font-display text-2xl text-ink">
            Connect a terminal
          </h2>
          <p className="mt-3 max-w-sm text-sm leading-6 text-ink-soft">
            The desktop app connects locally. No pairing code or internet connection is needed.
          </p>

          <label
            htmlFor="ai-terminal-setup-prompt"
            className="mt-5 block text-xs font-medium text-ink-soft"
          >
            Terminal setup prompt
          </label>
          <textarea
            id="ai-terminal-setup-prompt"
            readOnly
            rows={7}
            value={localInstruction ?? 'Reading the packaged companion command…'}
            onFocus={(event) => event.currentTarget.select()}
            className="mt-2 w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs leading-5 text-ink outline-none focus-visible:border-accent/60 focus-visible:ring-2 focus-visible:ring-accent/20"
          />

          {(error || localSetupError) && (
            <p
              role="alert"
              className="mt-3 rounded-xl border border-negative/30 bg-negative/5 p-3 text-sm text-negative"
            >
              {error ?? localSetupError}
            </p>
          )}

          <Button
            ref={copyRef}
            variant="primary"
            className="mt-3 w-full"
            aria-label="Copy setup prompt"
            disabled={!localInstruction}
            onClick={() => void copyInstruction()}
          >
            {copyStatus === 'copied' ? 'Copied' : 'Copy setup prompt'}
          </Button>
          <a
            href={TERMINAL_SETUP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex min-h-11 items-center text-xs font-medium text-accent underline underline-offset-2"
          >
            Open terminal setup instructions
          </a>
          <p role="status" aria-live="polite" className="min-h-5 text-xs text-ink-soft">
            {copyStatus === 'copied'
              ? 'Setup prompt copied'
              : copyStatus === 'failed'
                ? 'Copy failed. Select the prompt and copy it manually.'
                : ''}
          </p>
        </div>
      </section>
    );
  }

  if (compact && !pairing) {
    return (
      <section
        aria-label="AI connection"
        aria-busy={busy}
        className="border-b border-line bg-surface px-5 py-3"
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">Terminal disconnected</p>
            {error && error !== 'Terminal disconnected' && (
              <p role="alert" className="mt-1 text-xs leading-5 text-negative">
                {error}
              </p>
            )}
          </div>
          <Button
            ref={connectRef}
            size="sm"
            variant="primary"
            disabled={busy}
            onClick={onStartPairing}
          >
            {busy ? 'Connecting…' : 'Connect terminal'}
          </Button>
        </div>
      </section>
    );
  }

  if (pairing) {
    const expiry = new Date(pairing.expiresAt);

    return (
      <section
        aria-labelledby="ai-pair-title"
        aria-busy={busy}
        className="flex flex-1 flex-col overflow-y-auto p-5"
      >
        <div className="my-auto">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent">
            Connection
          </p>
          <h2 id="ai-pair-title" className="mt-2 font-display text-2xl text-ink">
            Pair your terminal
          </h2>

          <div className="mt-5 rounded-xl border border-line-strong bg-surface-raised px-4 py-5 text-center shadow-sm">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-faint">
              Pairing code
            </p>
            <p className="mt-2 whitespace-nowrap font-mono text-xl font-semibold tracking-[0.06em] text-ink">
              {pairing.code}
            </p>
            <time dateTime={expiry.toISOString()} className="mt-2 block text-xs text-ink-faint">
              Expires {expiry.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </time>
          </div>

          <label
            htmlFor="ai-terminal-instruction"
            className="mt-5 block text-xs font-medium text-ink-soft"
          >
            Terminal instruction
          </label>
          <textarea
            id="ai-terminal-instruction"
            readOnly
            rows={4}
            value={instruction}
            onFocus={(event) => event.currentTarget.select()}
            className="mt-2 w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs leading-5 text-ink outline-none focus-visible:border-accent/60 focus-visible:ring-2 focus-visible:ring-accent/20"
          />
          <p className="mt-2 text-xs text-ink-soft">
            Need to set it up first?{' '}
            <a
              href={TERMINAL_SETUP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent underline underline-offset-2"
            >
              Set up the terminal companion
            </a>
          </p>

          {error && (
            <p
              role="alert"
              className="mt-3 rounded-xl border border-negative/30 bg-negative/5 p-3 text-sm text-negative"
            >
              {error}
            </p>
          )}

          <div className="mt-3 flex gap-2">
            <Button
              ref={copyRef}
              variant="primary"
              className="flex-1"
              aria-label="Copy instruction"
              onClick={() => void copyInstruction()}
            >
              {copyStatus === 'copied' ? 'Copied' : 'Copy'}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={onCancel}>
              Cancel
            </Button>
          </div>
          <p role="status" aria-live="polite" className="mt-2 min-h-5 text-xs text-ink-soft">
            {copyStatus === 'copied'
              ? 'Instruction copied'
              : copyStatus === 'failed'
                ? 'Copy failed. Select the instruction and copy it manually.'
                : ''}
          </p>

        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="ai-connect-title"
      aria-busy={busy}
      className="flex flex-1 flex-col p-5"
    >
      <div className="my-auto">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent">
          Connection
        </p>
        <h2 id="ai-connect-title" className="mt-2 font-display text-2xl text-ink">
          Connect a terminal
        </h2>
        <p className="mt-3 max-w-sm text-sm leading-6 text-ink-soft">
          Pair this Lacuna tab with a terminal session to begin.
        </p>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-negative/30 bg-negative/5 p-3 text-sm text-negative"
          >
            {error}
          </p>
        )}

        <Button
          ref={connectRef}
          variant="primary"
          className="mt-5 w-full"
          disabled={busy}
          onClick={onStartPairing}
        >
          {busy ? 'Connecting…' : 'Connect terminal'}
        </Button>

        <TerminalSetupGuide />
      </div>
    </section>
  );
}

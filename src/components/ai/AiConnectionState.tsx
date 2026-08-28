import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button';

export interface AiPairingState {
  code: string;
  expiresAt: number;
}

export interface AiConnectionStateProps {
  pairing: AiPairingState | null;
  busy: boolean;
  error: string | null;
  compact?: boolean;
  onStartPairing: () => void;
  onCancel: () => void;
}

function TerminalSetupDisclosure() {
  return (
    <details className="mt-4 border-t border-line text-sm text-ink-soft">
      <summary className="flex min-h-11 cursor-pointer items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
        Terminal setup
      </summary>
      <p className="pb-2 text-xs leading-5 text-ink-faint">
        Use a terminal harness that can connect to Lacuna through MCP and keep waiting for work.
      </p>
    </details>
  );
}

export function AiConnectionState({
  pairing,
  busy,
  error,
  compact = false,
  onStartPairing,
  onCancel,
}: AiConnectionStateProps) {
  const connectRef = useRef<HTMLButtonElement>(null);
  const copyRef = useRef<HTMLButtonElement>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const pairingCode = pairing?.code ?? null;
  const instruction = pairingCode
    ? `Connect to Lacuna with code ${pairingCode}, then wait for messages until I ask you to disconnect.`
    : '';

  useEffect(() => {
    setCopyStatus('idle');
    if (pairingCode) copyRef.current?.focus();
    else connectRef.current?.focus();
  }, [pairingCode]);

  async function copyInstruction() {
    try {
      await navigator.clipboard.writeText(instruction);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
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

          <TerminalSetupDisclosure />
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

        <TerminalSetupDisclosure />
      </div>
    </section>
  );
}

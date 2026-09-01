import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button';

const TERMINAL_SETUP_URL = 'https://github.com/TJ7755/Lacuna#optional-desktop-ai-chat';
const RENDERER_STATUS_POLL_MS = 1_000;
type AiRendererStatus = 'ready' | 'waiting' | 'unavailable';

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

function AiClientSetupGuide() {
  return (
    <div className="mt-4 border-t border-line pt-4 text-sm text-ink-soft">
      <p className="font-medium text-ink">Before connecting</p>
      <p className="mt-1 text-xs leading-5 text-ink-faint">
        Install Lacuna&apos;s MCP companion in your AI client, then return here to create a pairing
        code.
      </p>
      <a
        href={TERMINAL_SETUP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-2"
      >
        Open AI client setup instructions
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
  const [rendererStatus, setRendererStatus] = useState<AiRendererStatus | null>(null);
  const [rendererRestarting, setRendererRestarting] = useState(false);
  const pairingCode = pairing?.code ?? null;
  const relayInstruction = pairingCode
    ? `Connect to Lacuna with code ${pairingCode}. First verify this active AI client exposes lacuna.wait_for_message. If it does not, use the client's normal MCP registration flow, read ${TERMINAL_SETUP_URL} for client-specific reload steps, and continue only after this task exposes the tool; do not run Lacuna or its companion directly for diagnostics. Then keep calling lacuna.wait_for_message. For every claimed message, this same live task must follow the returned versioned instructions, perform the permitted work and send a fresh authored response with lacuna.reply; never substitute canned transport-test text. Continue until I ask you to disconnect.`
    : '';
  const instruction = local ? (localInstruction ?? '') : relayInstruction;

  useEffect(() => {
    if (!local) return;

    let cancelled = false;
    let statusTimer: number | undefined;
    let commandLoaded = false;
    setLocalSetupError(null);
    const mcp = window.electronAPI?.mcp;
    if (!mcp) {
      setLocalSetupError('Desktop integration failed to load. Restart Lacuna.');
      return;
    }
    const refreshStatus = async () => {
      try {
        const status = await mcp.getStatus();
        if (cancelled) return;
        const companion = status.aiCompanion;
        if (!companion) throw new Error('The local AI companion is unavailable.');
        if (!commandLoaded) {
          commandLoaded = true;
          const command = JSON.stringify({ command: companion.command, args: companion.args });
          setLocalInstruction(
            `Configure this AI client with an stdio MCP server named lacuna using exactly ${command}; preserve every argument, including --user-data-dir when present. Use conversation --ai-companion, never data --mcp-companion. Let the client spawn it; never launch another Lacuna app, run the command manually or inspect source to test setup. Save, restart or reload the client, and start a fresh task if tools are task-scoped. Success means this task exposes lacuna.connect and lacuna.wait_for_message and lacuna.connect succeeds, not merely that registration says connected. Codex app/extension: Save then Restart; CLI: codex mcp list then /mcp. Other clients: ${TERMINAL_SETUP_URL}. If connect says the AI runtime is not ready, keep Lacuna open with AI enabled, select Restart AI runtime, then retry. Next, keep calling lacuna.wait_for_message. For each claimed message, follow its versioned instructions, do the permitted work and reply with fresh authored text via lacuna.reply; never use canned test text. Continue until I ask you to disconnect.`,
          );
        }
        const nextRendererStatus = status.aiRenderer?.status ?? null;
        setRendererStatus(nextRendererStatus);
        if (nextRendererStatus && nextRendererStatus !== 'ready') {
          statusTimer = window.setTimeout(() => void refreshStatus(), RENDERER_STATUS_POLL_MS);
        }
      } catch {
        if (!cancelled && !commandLoaded) {
          setLocalSetupError('Lacuna could not read its packaged companion command.');
        }
      }
    };
    void refreshStatus();

    return () => {
      cancelled = true;
      if (statusTimer !== undefined) window.clearTimeout(statusTimer);
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

  async function restartRenderer() {
    const ai = window.electronAPI?.ai;
    if (!ai?.requestRestart) {
      setLocalSetupError('The AI runtime cannot be restarted. Restart Lacuna instead.');
      return;
    }
    setRendererRestarting(true);
    setLocalSetupError(null);
    try {
      await ai.requestRestart();
      setRendererStatus('waiting');
    } catch {
      setLocalSetupError('The AI runtime could not restart. Restart Lacuna and try again.');
    } finally {
      setRendererRestarting(false);
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
            Connect an AI client
          </h2>
          <p className="mt-3 max-w-sm text-sm leading-6 text-ink-soft">
            The desktop app connects locally. No pairing code or internet connection is needed.
          </p>

          {rendererStatus && (
            <div
              role="status"
              aria-live="polite"
              className="mt-4 flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2"
            >
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  rendererStatus === 'ready'
                    ? 'bg-positive'
                    : rendererStatus === 'waiting'
                      ? 'bg-warning'
                      : 'bg-negative'
                }`}
              />
              <span className="min-w-0 flex-1 text-xs text-ink-soft">
                {rendererStatus === 'ready'
                  ? 'AI runtime ready'
                  : rendererStatus === 'waiting'
                    ? 'AI runtime is still starting'
                    : 'AI runtime unavailable'}
              </span>
              {rendererStatus !== 'ready' && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={rendererRestarting}
                  onClick={() => void restartRenderer()}
                >
                  {rendererRestarting ? 'Restarting' : 'Restart AI runtime'}
                </Button>
              )}
            </div>
          )}

          <label
            htmlFor="ai-client-setup-prompt"
            className="mt-5 block text-xs font-medium text-ink-soft"
          >
            AI client setup prompt
          </label>
          <textarea
            id="ai-client-setup-prompt"
            readOnly
            rows={9}
            value={
              localInstruction ??
              (localSetupError
                ? 'The packaged companion command is unavailable.'
                : 'Reading the packaged companion command…')
            }
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
            Open AI client setup instructions
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
            <p className="text-sm font-medium text-ink">AI client disconnected</p>
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
            {busy ? 'Connecting…' : 'Connect AI client'}
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
            Pair your AI client
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
            AI client instruction
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
              Set up the AI client companion
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
          Connect an AI client
        </h2>
        <p className="mt-3 max-w-sm text-sm leading-6 text-ink-soft">
          Pair this Lacuna tab with an AI client to begin.
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
          {busy ? 'Connecting…' : 'Connect AI client'}
        </Button>

        <AiClientSetupGuide />
      </div>
    </section>
  );
}

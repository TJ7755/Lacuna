import { Component, createRef, type ErrorInfo, type ReactNode } from 'react';
import { m as motion } from 'motion/react';
import { Button } from '../ui/Button';
import {
  buildDiagnostics,
  formatDiagnostics,
  gatherCounts,
  gatherContentSample,
  type DiagnosticBundle,
} from '../../db/diagnostics';
import { getMotionMultiplier } from '../../state/motionSpeed';

interface Props {
  children: ReactNode;
  /** Where the boundary sits, shown in the fallback for context. */
  label?: string;
  /** Optional reset handler, e.g. to navigate away from a broken route. */
  onReset?: () => void;
  /** A local fallback for surfaces that must not replace the current page. */
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string | null;
  counts: DiagnosticBundle['data'] | null;
  includeContent: boolean;
  copied: boolean;
  copyFailed: boolean;
}

/**
 * Catches render-time errors so a fault in one area (the Learn session especially)
 * never tears down the whole application or loses persisted data. The fallback
 * offers a local-only diagnostic bundle (copy or download) so an otherwise
 * invisible fault in a no-telemetry app can still be reported.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    error: null,
    componentStack: null,
    counts: null,
    includeContent: false,
    copied: false,
    copyFailed: false,
  };

  private _mounted = false;
  private heading = createRef<HTMLHeadingElement>();

  componentDidUpdate(_: Props, previous: State) {
    // Arriving at the error moves focus to its explanation, so the recovery action is next.
    if (this.state.error && !previous.error) this.heading.current?.focus({ preventScroll: true });
  }

  componentDidMount() {
    this._mounted = true;
    if (this.state.error) this.heading.current?.focus({ preventScroll: true });
  }

  componentWillUnmount() {
    this._mounted = false;
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error('Lacuna error boundary caught an error:', error, info);
    }
    this.setState({ componentStack: info.componentStack ?? null });
    // Gather non-sensitive counts for the diagnostic bundle (best-effort).
    gatherCounts()
      .then((counts) => {
        if (this._mounted) this.setState({ counts });
      })
      .catch(() => {});
  }

  handleReset = () => {
    if (!this.props.onReset) {
      // React.lazy retains a rejected module promise. Reloading is the only
      // reliable retry when the boundary has no narrower reset scope.
      window.location.reload();
      return;
    }
    this.setState({
      error: null,
      componentStack: null,
      counts: null,
      includeContent: false,
      copied: false,
      copyFailed: false,
    });
    this.props.onReset();
  };

  private async buildBundle(): Promise<DiagnosticBundle> {
    const { error, componentStack, counts, includeContent } = this.state;
    const contentSample = includeContent
      ? await gatherContentSample().catch(() => undefined)
      : undefined;
    return buildDiagnostics({
      location: this.props.label ?? 'the application',
      error: error
        ? { name: error.name, message: error.message, stack: error.stack ?? null }
        : { message: 'Unknown error' },
      componentStack,
      counts: counts ?? { decks: 0, cards: 0, reviews: 0, backups: 0 },
      contentSample,
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
    });
  }

  handleCopy = async () => {
    const text = formatDiagnostics(await this.buildBundle());
    try {
      await navigator.clipboard.writeText(text);
      this.setState({ copied: true, copyFailed: false });
      window.setTimeout(() => this._mounted && this.setState({ copied: false }), 2000);
    } catch {
      // Clipboard may be unavailable; say so, and the download path remains.
      this.setState({ copied: false, copyFailed: true });
    }
  };

  handleDownload = async () => {
    const bundle = await this.buildBundle();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lacuna-diagnostics-${new Date(bundle.capturedAt)
      .toISOString()
      .slice(0, 19)
      .replace(/[:T]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  render() {
    const m = getMotionMultiplier();
    if (this.state.error) {
      if (this.props.fallback !== undefined) return this.props.fallback;
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.24 * m }}
          className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center"
        >
          <motion.div
            initial={m > 0 ? { scale: 0.9, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            transition={
              m > 0 ? { type: 'spring', stiffness: 320, damping: 24, delay: 0.05 * m } : undefined
            }
            className="mb-2 grid h-16 w-16 place-items-center rounded-2xl bg-negative/10 text-negative"
          >
            <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </motion.div>

          <h2 ref={this.heading} tabIndex={-1} className="font-display text-2xl outline-none">
            Something went wrong
          </h2>
          <p className="max-w-md text-ink-soft">
            {this.props.label
              ? `An error occurred in ${this.props.label}.`
              : 'An unexpected error occurred.'}{' '}
            Your data is saved locally and is safe.
          </p>
          <Button variant="primary" onClick={this.handleReset}>
            Try again
          </Button>

          {/* Diagnostics are for a bug report, so they wait behind the recovery action. */}
          <details className="w-full max-w-md text-left">
            <summary className="mx-auto flex min-h-11 w-fit cursor-pointer items-center rounded-full px-3 text-sm text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink">
              Technical details
            </summary>
            <div className="mt-2 flex flex-col items-center gap-3 text-center">
              <pre className="w-full overflow-x-auto rounded-lg border border-line bg-ink/5 px-3 py-2 text-left text-xs text-ink-faint">
                {this.state.error.message}
              </pre>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button variant="secondary" onClick={this.handleCopy}>
                  {this.state.copied ? 'Copied' : 'Copy diagnostic details'}
                </Button>
                <Button variant="secondary" onClick={this.handleDownload}>
                  Download diagnostic bundle
                </Button>
              </div>
              <p role="status" className="text-xs text-ink-soft empty:hidden">
                {this.state.copied
                  ? 'Diagnostic details copied.'
                  : this.state.copyFailed
                    ? 'Could not copy. Download the bundle instead.'
                    : ''}
              </p>
              <label className="flex items-center gap-2 text-xs text-ink-faint">
                <input
                  type="checkbox"
                  checked={this.state.includeContent}
                  onChange={(e) => this.setState({ includeContent: e.target.checked })}
                  className="accent-accent"
                />
                Include a small sample of card content (only if needed to reproduce the fault)
              </label>
              <p className="text-xs text-ink-faint">
                Diagnostics stay on your device. Nothing is sent anywhere; the bundle is yours
                to share in a bug report.
              </p>
            </div>
          </details>
        </motion.div>
      );
    }
    return this.props.children;
  }
}

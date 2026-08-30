import { Component, type ReactNode } from 'react';
import { CloseIcon, SparklesIcon } from '../ui/icons';

interface Props {
  children: ReactNode;
  onClose: () => void;
}

export class AiPanelLoadBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <aside
        aria-label="AI conversation unavailable"
        className="flex h-full w-[400px] shrink-0 flex-col border-r border-line bg-paper"
      >
        <header className="border-b border-line bg-surface px-4 py-3">
          <div className="flex min-h-11 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line bg-paper text-accent">
              <SparklesIcon width={17} height={17} />
            </span>
            <h1 className="min-w-0 flex-1 font-display text-lg text-ink">AI</h1>
            <button
              type="button"
              autoFocus
              onClick={this.props.onClose}
              aria-label="Close AI"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
            >
              <CloseIcon width={18} height={18} />
            </button>
          </div>
        </header>
        <div role="alert" className="flex flex-1 flex-col justify-center px-8 text-center">
          <h2 className="font-display text-xl text-ink">AI could not load</h2>
          <p className="mt-2 text-sm leading-6 text-ink-soft">
            The workspace could not be downloaded. The rest of Lacuna is still available.
          </p>
        </div>
      </aside>
    );
  }
}

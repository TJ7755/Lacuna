import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '../ui/Button';

interface Props {
  children: ReactNode;
  /** Where the boundary sits, shown in the fallback for context. */
  label?: string;
  /** Optional reset handler, e.g. to navigate away from a broken route. */
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time errors so a fault in one area (the Learn session especially)
 * never tears down the whole application or loses persisted data.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface during development; data itself is safe in IndexedDB.
    console.error('Lacuna error boundary caught an error:', error, info);
  }

  handleReset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
          <h2 className="text-2xl">Something went wrong</h2>
          <p className="max-w-md text-ink-soft">
            {this.props.label
              ? `An error occurred in ${this.props.label}.`
              : 'An unexpected error occurred.'}{' '}
            Your data is saved locally and is safe.
          </p>
          <pre className="max-w-md overflow-x-auto rounded-lg border border-line bg-ink/5 px-3 py-2 text-left text-xs text-ink-faint">
            {this.state.error.message}
          </pre>
          <Button variant="primary" onClick={this.handleReset}>
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

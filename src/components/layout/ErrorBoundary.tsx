import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { UI } from '../../ui-strings';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[lacuna] Unhandled render error:', error);
    console.error('[lacuna] Component stack:', info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
          <p>{UI.common.error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ marginTop: '1rem' }}
          >
            {UI.common.reload}
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}

'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = { hasError: false };

  public static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  public override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled application error', error, info.componentStack);
  }

  public override render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="centered-state" role="alert">
        <span className="eyebrow">BestAirbnb operations</span>
        <h1>Something went off track</h1>
        <p>Reload the workspace to recover the latest operational state.</p>
        <button
          className="button button-primary"
          type="button"
          onClick={() => window.location.reload()}
        >
          Reload workspace
        </button>
      </main>
    );
  }
}

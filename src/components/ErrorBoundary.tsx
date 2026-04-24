import { Component, type ErrorInfo, type ReactNode } from 'react';

// Root-level React error boundary. A single uncaught render-time error won't
// blank the app — instead we show a recovery screen with a reload button.
// Only catches render errors; async errors are handled locally (toasts).

type State = { error: Error | null };

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log for dev; in prod we'd forward to an error tracker.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background p-margin-main text-center">
          <div className="mb-stack-lg flex h-16 w-16 items-center justify-center rounded-full bg-error-container text-on-error-container">
            <span className="material-symbols-outlined text-4xl">error</span>
          </div>
          <h1 className="mb-stack-sm text-headline-md font-bold text-on-surface">
            Etwas ist schiefgelaufen.
          </h1>
          <p className="mb-stack-lg max-w-sm text-body-md text-on-surface-variant">
            Die App hatte einen unerwarteten Fehler. Die App neu laden, um weiterzumachen.
          </p>
          <pre className="mb-stack-lg max-w-sm overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-lowest p-3 text-left text-[11px] text-on-surface-variant">
            {this.state.error.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="touch-safe flex items-center gap-2 rounded-lg bg-primary px-6 text-on-primary shadow-lg active:scale-95"
          >
            <span className="material-symbols-outlined">refresh</span>
            <span className="font-semibold uppercase tracking-widest">Neu laden</span>
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

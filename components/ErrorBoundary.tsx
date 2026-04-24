import { Component, ErrorInfo, ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
};

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    // Fire-and-forget server log. If this itself errors, don't surface it.
    try {
      const path = typeof window !== 'undefined' ? window.location.pathname : '';
      fetch('/api/log-client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          path,
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // swallow
    }
  }

  reset = () => this.setState({ hasError: false, error: null, errorInfo: null });

  render() {
    if (!this.state.hasError) return this.props.children;
    const { error, errorInfo } = this.state;
    const message = error?.message ?? 'Unknown error';
    const stack = error?.stack ?? '';
    const componentStack = errorInfo?.componentStack ?? '';
    return (
      <div className="min-h-screen bg-cream text-ink flex items-center justify-center px-6 py-12">
        <div className="max-w-lg w-full bg-cream border border-rule rounded-lg p-8">
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">Something broke</div>
          <h1 className="font-display text-3xl tracking-tightest mb-3">Something went wrong on this page.</h1>
          <p className="text-sm text-ink-muted mb-6">
            Try refreshing, or head back to the dashboard. We&apos;ve logged the error.
          </p>
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              type="button"
              onClick={() => { if (typeof window !== 'undefined') window.location.reload(); }}
              className="btn-primary text-xs"
            >
              Refresh page
            </button>
            <a href="/app" className="btn-ghost text-xs">
              Go to dashboard
            </a>
          </div>
          <details className="text-2xs text-ink-soft">
            <summary className="cursor-pointer hover:text-ink">Technical details</summary>
            <div className="mt-2 space-y-2 font-mono whitespace-pre-wrap break-words">
              <div><strong>Error:</strong> {message}</div>
              {stack && <div><strong>Stack:</strong>{'\n'}{stack}</div>}
              {componentStack && <div><strong>Component stack:</strong>{componentStack}</div>}
            </div>
          </details>
        </div>
      </div>
    );
  }
}

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

type Props = { children: ReactNode };
type State = { error: Error | null; info: ErrorInfo | null };

// Without this, any uncaught render-time exception anywhere in the tree unmounts the
// entire app with no visible trace - a silent blank white/cream screen and nothing in
// the UI to diagnose it from. This turns that into a visible error with the actual
// message/stack, and a way to recover (reload) instead of being stuck.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uncaught render error:', error, info);
    this.setState({ info });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error, info } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg p-4 text-text sm:p-6" role="alert">
        <div className="flex w-full max-w-[480px] flex-col gap-4 rounded-xl border border-border bg-surface p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-danger-soft text-danger" aria-hidden="true">
              <AlertTriangle className="size-5" />
            </span>
            <div className="flex flex-col gap-1">
              <h1 className="text-title font-semibold text-text">Something went wrong</h1>
              <p className="text-body-sm text-text-2">
                The app hit an error it couldn't recover from. Reloading usually fixes it - if it
                keeps happening, share this message with support.
              </p>
            </div>
          </div>
          <details className="rounded-md border border-border bg-surface-2">
            <summary className="flex min-h-11 cursor-pointer items-center px-3 text-body-sm font-medium text-primary">
              Error details
            </summary>
            <pre className="max-h-60 overflow-y-auto border-t border-border px-3 py-2.5 text-caption break-words whitespace-pre-wrap text-danger">
              {error.message}
              {'\n\n'}
              {error.stack}
              {info?.componentStack ? `\n\nComponent stack:${info.componentStack}` : ''}
            </pre>
          </details>
          <button
            type="button"
            onClick={this.handleReload}
            className="inline-flex h-13 w-full items-center justify-center gap-2 rounded-md bg-primary text-body font-semibold text-on-primary hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <RotateCw className="size-5" aria-hidden="true" />
            Reload
          </button>
        </div>
      </div>
    );
  }
}

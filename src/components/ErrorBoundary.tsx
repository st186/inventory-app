import { Component, type ErrorInfo, type ReactNode } from 'react';

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
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: '#FFF8F0',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        <div style={{
          maxWidth: '480px',
          width: '100%',
          background: '#fff',
          borderRadius: '16px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
          padding: '24px',
        }}>
          <h1 style={{ fontSize: '18px', color: '#111', marginBottom: '8px' }}>Something went wrong</h1>
          <p style={{ fontSize: '14px', color: '#555', marginBottom: '16px' }}>
            The app hit an error it couldn't recover from. Reloading usually fixes it - if it
            keeps happening, share this message with support.
          </p>
          <details style={{ marginBottom: '16px' }}>
            <summary style={{ fontSize: '13px', color: '#c2410c', cursor: 'pointer' }}>Error details</summary>
            <pre style={{
              fontSize: '11px',
              color: '#991b1b',
              background: '#fef2f2',
              padding: '10px',
              borderRadius: '8px',
              marginTop: '8px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '240px',
              overflowY: 'auto',
            }}>
              {error.message}
              {'\n\n'}
              {error.stack}
              {info?.componentStack ? `\n\nComponent stack:${info.componentStack}` : ''}
            </pre>
          </details>
          <button
            onClick={this.handleReload}
            style={{
              width: '100%',
              padding: '12px',
              background: '#ea580c',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}

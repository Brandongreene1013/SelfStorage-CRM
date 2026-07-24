import { Component } from 'react';

// App-wide safety net: catches render/lifecycle errors in the subtree so a
// single broken component shows a recovery panel instead of white-screening
// the whole CRM. Used at the top level (main.jsx) and around the main view
// area (App.jsx), where a `resetKey` tied to the active view auto-recovers the
// boundary when the broker switches tabs.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    // Keep the details in the console for diagnosis; there is no remote logger.
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  componentDidUpdate(prevProps) {
    // Auto-reset when the caller signals a context change (e.g. view switch),
    // so navigating away from a broken tab clears the error.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const scope = this.props.label ? ` in ${this.props.label}` : '';
    return (
      <div className="flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-slate-900 border border-red-900/50 rounded-2xl p-6 text-center">
          <div className="text-3xl mb-2">⚠️</div>
          <h2 className="text-lg font-bold text-white">Something went wrong{scope}</h2>
          <p className="text-sm text-slate-400 mt-2">
            The app hit an unexpected error and stopped this view to protect your data. Your saved work in Supabase is unaffected.
          </p>
          {error?.message && (
            <pre className="mt-3 text-left text-[11px] text-red-300 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2 overflow-x-auto whitespace-pre-wrap break-words">
              {String(error.message)}
            </pre>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-bold px-4 py-2 rounded-lg text-sm transition-all"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold px-4 py-2 rounded-lg text-sm transition-all"
            >
              Reload app
            </button>
          </div>
        </div>
      </div>
    );
  }
}

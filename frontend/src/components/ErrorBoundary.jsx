import React from 'react';

/**
 * Generic React Error Boundary.
 *
 * Catches JavaScript errors in child component trees and renders a fallback UI
 * instead of crashing the entire application.
 *
 * Usage:
 *   <ErrorBoundary fallback={<p>Something went wrong</p>}>
 *     <MyComponent />
 *   </ErrorBoundary>
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Errors are logged to console. Add an error reporting service
    // (e.g. Sentry) here for production visibility.
    console.error('[ErrorBoundary] Uncaught error:', error, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-[#050a0e] text-[#d0d8e0]">
          <div className="max-w-lg rounded-2xl border border-red-500/25 bg-[#091018] p-8 text-center shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-300">
              Rendering Error
            </p>
            <p className="mt-3 text-xl font-semibold text-[#e8c547]">
              Something went wrong
            </p>
            <p className="mt-3 text-sm text-[#8a9aa8]">
              An unexpected error prevented this page from rendering. Try
              refreshing the page.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-5 rounded-lg border border-[#e8c547]/30 bg-[#e8c547]/10 px-5 py-2 text-sm font-semibold text-[#e8c547] transition hover:bg-[#e8c547]/20"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

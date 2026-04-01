import React, { useState, useCallback, useEffect, useRef } from 'react';

const WORLDMONITOR_URL = process.env.REACT_APP_WORLDMONITOR_URL;
const IFRAME_LOAD_TIMEOUT_MS = 30000; // 30 seconds

/**
 * World Monitor View
 *
 * Embeds the worldmonitor-bayesian intelligence dashboard
 * (https://github.com/swatfa/worldmonitor-bayesian) as the World Monitor view.
 * The full source is available in the /worldmonitor directory.
 *
 * Set REACT_APP_WORLDMONITOR_URL in your .env to point at the running
 * worldmonitor instance (e.g. http://localhost:3000 for local dev,
 * or your deployed URL for production).
 */
export default function OverlayMapView() {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const timeoutRef = useRef(null);

  const handleLoad = useCallback(() => {
    setIsLoading(false);
    setHasError(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const handleError = useCallback(() => {
    setIsLoading(false);
    setHasError(true);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Timeout fallback: if iframe hasn't loaded within the threshold, show error.
  // WORLDMONITOR_URL and IFRAME_LOAD_TIMEOUT_MS are module-level constants that
  // never change, so the empty dependency array is intentional (run once on mount).
  useEffect(() => {
    if (!WORLDMONITOR_URL) return;
    timeoutRef.current = setTimeout(() => {
      setIsLoading((loading) => {
        if (loading) {
          setHasError(true);
          return false;
        }
        return loading;
      });
    }, IFRAME_LOAD_TIMEOUT_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- module-level constants, not reactive state
  }, []);

  if (!WORLDMONITOR_URL) {
    return (
      <div className="flex h-full w-full items-center justify-center" style={{ background: '#050a14' }}>
        <div
          className="max-w-lg rounded-lg border p-8 text-center"
          style={{
            borderColor: 'rgba(255,215,0,0.3)',
            background: 'rgba(0,0,0,0.8)',
          }}
        >
          <div className="mb-4 text-4xl">🌐</div>
          <h2 className="mb-3 text-lg font-bold" style={{ color: '#FFD700' }}>
            World Monitor Not Configured
          </h2>
          <p className="mb-4 text-sm text-gray-400">
            The World Monitor view requires the dashboard to be running.
            Set the <code className="rounded bg-gray-800 px-1.5 py-0.5 text-xs" style={{ color: '#FFD700' }}>REACT_APP_WORLDMONITOR_URL</code> environment
            variable in your frontend <code className="rounded bg-gray-800 px-1.5 py-0.5 text-xs text-gray-300">.env</code> file.
          </p>
          <div
            className="rounded border p-3 text-left text-xs"
            style={{
              borderColor: 'rgba(255,215,0,0.2)',
              background: 'rgba(255,215,0,0.05)',
              color: '#e2e8f0',
              fontFamily: 'monospace',
            }}
          >
            <div className="mb-1 text-gray-500"># frontend/.env</div>
            <div><span style={{ color: '#FFD700' }}>REACT_APP_WORLDMONITOR_URL</span>=http://localhost:3000</div>
            <div className="mt-2 text-gray-500"># Then start the worldmonitor dev server:</div>
            <div>cd worldmonitor &amp;&amp; npm install &amp;&amp; npm run dev</div>
          </div>
          <p className="mt-4 text-xs text-gray-500">
            See <code className="text-gray-400">worldmonitor/README.md</code> and the
            project README for full setup instructions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full" style={{ background: '#050a14' }}>
      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center" style={{ background: '#050a14' }}>
          <div className="flex flex-col items-center gap-3">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: 'rgba(255,215,0,0.3)', borderTopColor: 'transparent' }}
            />
            <span className="text-xs text-gray-500">Loading World Monitor…</span>
          </div>
        </div>
      )}

      {/* Error state */}
      {hasError && !isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center" style={{ background: '#050a14' }}>
          <div className="text-center p-6">
            <div className="mb-3 text-3xl">⚠️</div>
            <p className="text-sm font-medium" style={{ color: '#FFD700' }}>
              Failed to load World Monitor
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Check that the dashboard is running at{' '}
              <code className="rounded bg-gray-800 px-1 py-0.5 text-gray-400">{WORLDMONITOR_URL}</code>
            </p>
          </div>
        </div>
      )}

      <iframe
        src={WORLDMONITOR_URL}
        title="World Monitor — Intelligence Dashboard"
        className="h-full w-full border-0"
        allow="fullscreen"
        allowFullScreen
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        loading="eager"
        onLoad={handleLoad}
        onError={handleError}
        style={{
          background: '#0a0f0a',
          colorScheme: 'dark',
        }}
      />
    </div>
  );
}

import React from 'react';

const WORLDMONITOR_URL = process.env.REACT_APP_WORLDMONITOR_URL;

/**
 * Overlay Map View — World Monitor [Black Swan Edition]
 *
 * Embeds the worldmonitor-bayesian intelligence dashboard
 * (https://github.com/swatfa/worldmonitor-bayesian) as the overlay view.
 * The full source is available in the /worldmonitor directory.
 *
 * Set REACT_APP_WORLDMONITOR_URL in your .env to point at the running
 * worldmonitor instance (e.g. http://localhost:3000 for local dev,
 * or your deployed URL for production).
 */
export default function OverlayMapView() {
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
            The Intelligence Overlay requires the World Monitor dashboard to be running.
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
      <iframe
        src={WORLDMONITOR_URL}
        title="World Monitor — Intelligence Overlay"
        className="h-full w-full border-0"
        allow="fullscreen"
        loading="eager"
        style={{
          background: '#0a0f0a',
          colorScheme: 'dark',
        }}
      />
    </div>
  );
}

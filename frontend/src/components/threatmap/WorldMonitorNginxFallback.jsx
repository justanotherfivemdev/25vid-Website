import React from 'react';

/**
 * Defensive fallback shown when Nginx is misconfigured and serves the React SPA
 * at /worldmonitor/ instead of the standalone World Monitor Vite app.
 * In a correct deployment this route is never reached.
 */
export default function WorldMonitorNginxFallback() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#050a14',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{
        maxWidth: 520,
        padding: 32,
        borderRadius: 12,
        border: '1px solid rgba(255,215,0,0.3)',
        background: 'rgba(0,0,0,0.8)',
        textAlign: 'center',
      }}>
        <div aria-hidden="true" style={{ fontSize: 48, marginBottom: 16 }}>🌐</div>
        <h2 style={{ color: '#FFD700', fontSize: 18, marginBottom: 12 }}>
          World Monitor — Nginx Configuration Required
        </h2>
        <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
          The World Monitor is a standalone app that must be served by Nginx at{' '}
          <code style={{ color: '#FFD700', background: '#1e293b', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>/worldmonitor/</code>.
          This page is showing because Nginx is serving the React app instead.
        </p>
        <div style={{
          textAlign: 'left',
          background: 'rgba(255,215,0,0.05)',
          border: '1px solid rgba(255,215,0,0.15)',
          borderRadius: 8,
          padding: 16,
          fontSize: 12,
          fontFamily: 'monospace',
          color: '#e2e8f0',
          lineHeight: 1.7,
        }}>
          <div style={{ color: '#64748b', marginBottom: 4 }}># 1. Build the World Monitor app</div>
          <div>cd worldmonitor && npm run build</div>
          <div style={{ color: '#64748b', marginTop: 8, marginBottom: 4 }}># 2. Copy build output to Nginx root</div>
          <div>cp -r dist/* $NGINX_ROOT/worldmonitor/</div>
          <div style={{ color: '#64748b', marginTop: 8, marginBottom: 4 }}># 3. Add to nginx config (before the catch-all location /)</div>
          <div style={{ color: '#FFD700' }}>location /worldmonitor/ {'{'}</div>
          <div>&nbsp;&nbsp;try_files $uri $uri/ /worldmonitor/index.html;</div>
          <div style={{ color: '#FFD700' }}>{'}'}</div>
        </div>
        <p style={{ color: '#64748b', fontSize: 11, marginTop: 16 }}>
          See <code style={{ color: '#94a3b8' }}>nginx-production.conf</code> and{' '}
          <code style={{ color: '#94a3b8' }}>docs/WORLDMONITOR_INTEGRATION.md</code> for details.
        </p>
      </div>
    </div>
  );
}

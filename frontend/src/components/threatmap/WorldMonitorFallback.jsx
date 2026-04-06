import React from 'react';

/**
 * WorldMonitorFallback — lightweight placeholder shown on devices that
 * cannot handle the full World Monitor (heavy JS execution, many concurrent
 * WebSocket connections, large DOM surface).
 *
 * Displayed when device.shouldReduceComplexity is true.
 * Offers a "Load anyway" opt-in via the parent AdaptiveLoader.
 */
export default function WorldMonitorFallback() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        minHeight: '100dvh',
        background: '#050a0e',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      <div
        style={{
          maxWidth: 440,
          padding: 32,
          border: '1px solid rgba(201,162,39,0.2)',
          background: 'rgba(12,17,23,0.9)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            border: '2px solid rgba(201,162,39,0.3)',
            margin: '0 auto 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
          }}
          aria-hidden="true"
        >
          🌐
        </div>

        <h2
          style={{
            color: '#e8c547',
            fontSize: 16,
            letterSpacing: '0.15em',
            marginBottom: 12,
            fontFamily: "'Share Tech', sans-serif",
            textTransform: 'uppercase',
          }}
        >
          World Monitor
        </h2>

        <p
          style={{
            color: '#8a9aa8',
            fontSize: 12,
            lineHeight: 1.7,
            marginBottom: 20,
          }}
        >
          The World Monitor requires significant processing power to render
          live global intelligence feeds, real-time maps, and market data.
          Your device may experience slow performance.
        </p>

        <p
          style={{
            color: '#4a6070',
            fontSize: 10,
            lineHeight: 1.6,
          }}
        >
          Use the "Load full version" button below to load it anyway,
          or access this page from a more powerful device.
        </p>
      </div>
    </div>
  );
}

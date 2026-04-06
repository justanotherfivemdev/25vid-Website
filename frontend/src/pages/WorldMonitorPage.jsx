import React, { lazy } from 'react';
import AdaptiveLoader from '@/components/AdaptiveLoader';
import WorldMonitorFallback from '@/components/threatmap/WorldMonitorFallback';

const WorldMonitorEmbed = lazy(() => import('@/components/threatmap/WorldMonitorEmbed'));

/**
 * WorldMonitorPage — React wrapper for the vanilla TypeScript World Monitor app.
 *
 * Uses AdaptiveLoader to check device capabilities before loading the heavy
 * World Monitor bundle. Low-capability devices see a fallback with an opt-in.
 */
export default function WorldMonitorPage() {
  return (
    <div style={{ width: '100vw', height: '100dvh', background: '#050a0e', position: 'relative' }}>
      <AdaptiveLoader
        heavy={WorldMonitorEmbed}
        fallback={<WorldMonitorFallback />}
        requires="fast-network"
        forceLabel="Load World Monitor"
        loadingUI={
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100dvh',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 40,
                height: 40,
                border: '2px solid #e8c547',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 16px',
              }} />
              <p style={{
                color: '#e8c547',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 12,
                letterSpacing: '0.2em',
                opacity: 0.6,
              }}>
                LOADING WORLD MONITOR
              </p>
            </div>
          </div>
        }
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

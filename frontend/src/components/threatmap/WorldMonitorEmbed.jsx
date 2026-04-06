import React, { useEffect, useRef, useState } from 'react';

/**
 * WorldMonitorEmbed — wraps the vanilla TS World Monitor mount/unmount cycle.
 * Separated from WorldMonitorPage so it can be used with React.lazy().
 */
export default function WorldMonitorEmbed() {
  const destroyRef = useRef(null);
  const [status, setStatus] = useState('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function mount() {
      try {
        const { mountWorldMonitor } = await import('@/features/worldmonitor/main');
        if (cancelled) return;
        const cleanup = await mountWorldMonitor('worldmonitor-root');
        if (cancelled) {
          cleanup();
          return;
        }
        destroyRef.current = cleanup;
        setStatus('ready');
      } catch (err) {
        console.error('[WorldMonitorEmbed] Failed to mount:', err);
        if (!cancelled) {
          setErrorMsg(err?.message || 'Unknown error');
          setStatus('error');
        }
      }
    }

    mount();

    return () => {
      cancelled = true;
      if (destroyRef.current) {
        destroyRef.current();
        destroyRef.current = null;
      }
    };
  }, []);

  return (
    <>
      {status === 'loading' && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
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
              INITIALIZING WORLD MONITOR
            </p>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
        }}>
          <div style={{
            maxWidth: 480,
            padding: 32,
            borderRadius: 12,
            border: '1px solid rgba(255,68,68,0.4)',
            background: 'rgba(0,0,0,0.9)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ color: '#ff4444', fontSize: 16, marginBottom: 8 }}>
              World Monitor Failed to Load
            </h2>
            <p style={{ color: '#8a9aa8', fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
              {errorMsg || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 24px',
                background: '#e8c547',
                color: '#000',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      )}

      <div
        id="worldmonitor-root"
        ref={null}
        style={{
          width: '100%',
          height: '100%',
          visibility: status === 'ready' ? 'visible' : 'hidden',
        }}
      />
    </>
  );
}

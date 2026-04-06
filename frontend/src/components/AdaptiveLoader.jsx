import React, { Suspense, useState, useCallback } from 'react';
import { device } from '@/utils/deviceCapability';

/**
 * AdaptiveLoader — Wraps heavy components with capability-aware fallback.
 *
 * If the device can handle the heavy component (WebGL, enough memory, etc.),
 * it renders normally via React.lazy. Otherwise it renders <fallback>.
 *
 * Users can always opt-in to the full experience by clicking "Load anyway".
 *
 * Props:
 *   heavy      — React.lazy(() => import('./HeavyComponent'))
 *   fallback   — JSX to render on low-capability devices
 *   loadingUI  — JSX shown while the heavy chunk is loading (Suspense)
 *   requires   — 'webgl' | 'gpu-mid' | 'gpu-high' | 'fast-network'
 *   forceLabel — Label for the "load anyway" button (default: "Load full version")
 *
 * Example:
 *   <AdaptiveLoader
 *     heavy={React.lazy(() => import('@/components/Globe3D'))}
 *     fallback={<StaticMapImage />}
 *     requires="webgl"
 *     loadingUI={<Spinner />}
 *   />
 */

function meetsRequirement(requirement) {
  switch (requirement) {
    case 'webgl':
      return device.canRender3D;
    case 'gpu-mid':
      return device.canRender3D && device.gpuTier !== 'low';
    case 'gpu-high':
      return device.gpuTier === 'high';
    case 'fast-network':
      return device.network !== 'slow';
    default:
      return !device.shouldReduceComplexity;
  }
}

export default function AdaptiveLoader({
  heavy: Heavy,
  fallback,
  loadingUI,
  requires = 'webgl',
  forceLabel = 'Load full version',
  ...passthrough
}) {
  const capable = meetsRequirement(requires);
  const [forceLoad, setForceLoad] = useState(false);

  const handleForceLoad = useCallback(() => {
    setForceLoad(true);
  }, []);

  // Capable device or user opted in → render the heavy component
  if (capable || forceLoad) {
    return (
      <Suspense
        fallback={
          loadingUI || (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                minHeight: 200,
                color: '#8a9aa8',
                fontFamily: 'system-ui, sans-serif',
              }}
            >
              Loading…
            </div>
          )
        }
      >
        <Heavy {...passthrough} />
      </Suspense>
    );
  }

  // Low-capability device → render fallback with opt-in
  return (
    <div style={{ position: 'relative' }}>
      {fallback}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          zIndex: 10,
        }}
      >
        <button
          onClick={handleForceLoad}
          style={{
            padding: '8px 16px',
            fontSize: 13,
            fontFamily: 'system-ui, sans-serif',
            background: 'rgba(201, 162, 39, 0.15)',
            color: '#e8c547',
            border: '1px solid rgba(201, 162, 39, 0.3)',
            borderRadius: 6,
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
          }}
        >
          {forceLabel}
        </button>
      </div>
    </div>
  );
}

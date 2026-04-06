import React from 'react';

/**
 * GlobeFallback — lightweight static placeholder shown on devices that
 * cannot render the full WebGL-powered Mapbox globe (software GPU,
 * low memory, slow network, or user prefers-reduced-data).
 *
 * Shows a styled placeholder with a link to try loading the full version.
 */
export default function GlobeFallback() {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 300,
        background: 'radial-gradient(ellipse at 50% 50%, #0c1a2e 0%, #050a0e 70%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {/* Decorative grid lines */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(201,162,39,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(201,162,39,0.04) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
          pointerEvents: 'none',
        }}
      />

      {/* Earth circle */}
      <div
        style={{
          width: 'min(50vw, 280px)',
          height: 'min(50vw, 280px)',
          borderRadius: '50%',
          border: '2px solid rgba(201,162,39,0.2)',
          background: 'radial-gradient(circle at 35% 35%, #0f1e2e, #050a0e)',
          boxShadow: '0 0 60px rgba(201,162,39,0.08), inset 0 0 40px rgba(0,170,255,0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 12,
          position: 'relative',
        }}
      >
        {/* Latitude lines */}
        {[30, 60].map((deg) => (
          <div
            key={deg}
            style={{
              position: 'absolute',
              width: `${100 - deg}%`,
              height: '1px',
              background: 'rgba(201,162,39,0.1)',
              top: `${20 + deg * 0.5}%`,
            }}
          />
        ))}

        <span
          style={{
            color: '#e8c547',
            fontFamily: "'Share Tech', 'Oswald', sans-serif",
            fontSize: 14,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            textAlign: 'center',
            padding: '0 20px',
          }}
        >
          Global Threat Map
        </span>
        <span
          style={{
            color: '#4a6070',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            letterSpacing: '0.1em',
            textAlign: 'center',
            padding: '0 20px',
          }}
        >
          3D Globe unavailable on this device
        </span>
      </div>
    </div>
  );
}

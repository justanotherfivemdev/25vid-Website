import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Globe, Map as MapIcon } from 'lucide-react';

/**
 * MapViewToggle — switches between Global Threat Map (Globe) and World Monitor.
 *
 * Uses route-based navigation. Pass `basePath` to control the root path
 * (defaults to "/hub/threat-map" for member hub; partners use "/partner/threat-map").
 */
export default function MapViewToggle({ basePath = '/hub/threat-map' }) {
  const location = useLocation();
  const isWorldMonitor = location.pathname.replace(/\/+$/, '').endsWith('/world-monitor');

  return (
    <div className="flex items-center rounded-lg overflow-hidden border"
      style={{
        borderColor: 'rgba(255,215,0,0.4)',
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <Link
        to={basePath}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
          !isWorldMonitor
            ? 'bg-tropic-gold text-black'
            : 'text-tropic-gold-light hover:bg-tropic-gold/10'
        }`}
        title="Global Threat Map — 3D Globe view"
      >
        <Globe className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Globe</span>
      </Link>
      <div className="w-px h-5" style={{ background: 'rgba(255,215,0,0.3)' }} />
      <Link
        to={`${basePath}/world-monitor`}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
          isWorldMonitor
            ? 'bg-tropic-gold text-black'
            : 'text-tropic-gold-light hover:bg-tropic-gold/10'
        }`}
        title="World Monitor — Real-time intelligence dashboard"
      >
        <MapIcon className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">World Monitor</span>
      </Link>
    </div>
  );
}

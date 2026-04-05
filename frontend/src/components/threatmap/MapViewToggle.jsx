import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, Map as MapIcon } from 'lucide-react';

/**
 * MapViewToggle — switches between Global Threat Map (Globe) and World Monitor.
 *
 * Both views are part of the same React frontend.  World Monitor is served at
 * /worldmonitor via React Router (no separate Nginx app required).
 */
export default function MapViewToggle() {
  const navigate = useNavigate();

  const handleWorldMonitorClick = useCallback(() => {
    navigate('/worldmonitor');
  }, [navigate]);

  return (
    <div className="flex items-center rounded-lg overflow-hidden border"
      style={{
        borderColor: 'rgba(255,215,0,0.4)',
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Globe is always active when inside the React app */}
      <span
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-tropic-gold text-black"
        title="Global Threat Map — 3D Globe view"
      >
        <Globe className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Globe</span>
      </span>
      <div className="w-px h-5" style={{ background: 'rgba(255,215,0,0.3)' }} />
      <button
        onClick={handleWorldMonitorClick}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all duration-200 text-tropic-gold-light hover:bg-tropic-gold/10"
        title="World Monitor — Real-time intelligence dashboard"
        type="button"
      >
        <MapIcon className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">World Monitor</span>
      </button>
    </div>
  );
}

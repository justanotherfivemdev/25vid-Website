import React from 'react';
import { useMapStore } from '@/stores/threatMapStore';
import { Globe, Map as MapIcon } from 'lucide-react';

export default function MapViewToggle() {
  const { mapViewMode, setMapViewMode } = useMapStore();

  return (
    <div className="flex items-center rounded-lg overflow-hidden border"
      style={{
        borderColor: 'rgba(255,215,0,0.4)',
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <button
        onClick={() => setMapViewMode('globe')}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
          mapViewMode === 'globe'
            ? 'bg-tropic-gold text-black'
            : 'text-tropic-gold-light hover:bg-tropic-gold/10'
        }`}
        title="Globe View — 3D Mapbox projection"
      >
        <Globe className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Globe</span>
      </button>
      <div className="w-px h-5" style={{ background: 'rgba(255,215,0,0.3)' }} />
      <button
        onClick={() => setMapViewMode('overlay')}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
          mapViewMode === 'overlay'
            ? 'bg-tropic-gold text-black'
            : 'text-tropic-gold-light hover:bg-tropic-gold/10'
        }`}
        title="World Monitor — Real-time intelligence overlay"
      >
        <MapIcon className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Overlay</span>
      </button>
    </div>
  );
}

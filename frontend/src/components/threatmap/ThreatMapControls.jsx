import React from 'react';
import { useMapStore } from '@/stores/threatMapStore';
import { Shield, Flame, Layers, Eye, EyeOff } from 'lucide-react';

export default function ThreatMapControls() {
  const {
    showHeatmap, toggleHeatmap,
    showClusters, toggleClusters,
    showMilitaryBases, toggleMilitaryBases,
    militaryBases,
  } = useMapStore();

  return (
    <div className="absolute bottom-20 left-6 z-10 flex flex-col gap-2">
      <button
        onClick={toggleClusters}
        className={`flex h-10 w-10 items-center justify-center rounded-full shadow-lg transition-all duration-200 ${
          showClusters
            ? 'bg-tropic-gold text-black hover:bg-tropic-gold-light shadow-tropic-gold/30'
            : 'bg-black/90 text-tropic-gold-light hover:bg-tropic-gold/10 border border-tropic-gold-dark/30'
        } backdrop-blur-md`}
        title={showClusters ? 'Hide Event Markers' : 'Show Event Markers'}
      >
        {showClusters ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      </button>

      <button
        onClick={toggleHeatmap}
        className={`flex h-10 w-10 items-center justify-center rounded-full shadow-lg transition-all duration-200 ${
          showHeatmap
            ? 'bg-tropic-red text-white hover:bg-tropic-red-light shadow-tropic-red/30'
            : 'bg-black/90 text-tropic-gold-light hover:bg-tropic-gold/10 border border-tropic-gold-dark/30'
        } backdrop-blur-md`}
        title={showHeatmap ? 'Hide Heatmap' : 'Show Heatmap'}
      >
        <Flame className="h-4 w-4" />
      </button>

      <button
        onClick={toggleMilitaryBases}
        className={`flex h-10 w-10 items-center justify-center rounded-full shadow-lg transition-all duration-200 ${
          showMilitaryBases
            ? 'bg-tropic-gold-dark text-white hover:bg-tropic-gold shadow-tropic-gold-dark/30'
            : 'bg-black/90 text-tropic-gold-light hover:bg-tropic-gold/10 border border-tropic-gold-dark/30'
        } backdrop-blur-md`}
        title={showMilitaryBases ? `Hide Military Bases (${militaryBases.length})` : 'Show Military Bases'}
      >
        <Shield className="h-4 w-4" />
      </button>
    </div>
  );
}

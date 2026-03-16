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
            ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-600/30'
            : 'bg-gray-800/90 text-gray-200 hover:bg-gray-700 border border-gray-600/50'
        } backdrop-blur-md`}
        title={showClusters ? 'Hide Event Markers' : 'Show Event Markers'}
      >
        {showClusters ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      </button>

      <button
        onClick={toggleHeatmap}
        className={`flex h-10 w-10 items-center justify-center rounded-full shadow-lg transition-all duration-200 ${
          showHeatmap
            ? 'bg-orange-600 text-white hover:bg-orange-700 shadow-orange-600/30'
            : 'bg-gray-800/90 text-gray-200 hover:bg-gray-700 border border-gray-600/50'
        } backdrop-blur-md`}
        title={showHeatmap ? 'Hide Heatmap' : 'Show Heatmap'}
      >
        <Flame className="h-4 w-4" />
      </button>

      <button
        onClick={toggleMilitaryBases}
        className={`flex h-10 w-10 items-center justify-center rounded-full shadow-lg transition-all duration-200 ${
          showMilitaryBases
            ? 'bg-blue-500 text-white hover:bg-blue-600 shadow-blue-500/30'
            : 'bg-gray-800/90 text-gray-200 hover:bg-gray-700 border border-gray-600/50'
        } backdrop-blur-md`}
        title={showMilitaryBases ? `Hide Military Bases (${militaryBases.length})` : 'Show Military Bases'}
      >
        <Shield className="h-4 w-4" />
      </button>
    </div>
  );
}

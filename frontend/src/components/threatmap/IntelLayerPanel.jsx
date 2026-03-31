import React, { useState } from 'react';
import { useMapStore } from '@/stores/threatMapStore';
import { Button } from '@/components/ui/button';
import {
  Layers, ChevronLeft,
  Swords, Shield, Building2, TrendingDown,
  Landmark, Leaf, Database, Eye, EyeOff,
} from 'lucide-react';

const LAYER_GROUPS = [
  {
    id: 'conflicts',
    label: 'Conflicts & Security',
    icon: Swords,
    description: 'Wars, terrorism, piracy, crime',
    color: '#ef4444',
  },
  {
    id: 'military',
    label: 'Military Activity',
    icon: Shield,
    description: 'Deployments, exercises, bases',
    color: '#3b82f6',
  },
  {
    id: 'infrastructure',
    label: 'Infrastructure & Cyber',
    icon: Building2,
    description: 'Pipelines, grids, cyber threats',
    color: '#f59e0b',
  },
  {
    id: 'economic',
    label: 'Economic & Trade',
    icon: TrendingDown,
    description: 'Markets, sanctions, commodities',
    color: '#22c55e',
  },
  {
    id: 'diplomatic',
    label: 'Diplomatic & Political',
    icon: Landmark,
    description: 'Summits, treaties, tensions',
    color: '#a78bfa',
  },
  {
    id: 'environmental',
    label: 'Environmental & Health',
    icon: Leaf,
    description: 'Disasters, climate, health crises',
    color: '#14b8a6',
  },
];

const DATA_SOURCE_OPTIONS = [
  { id: 'all', label: 'All Events' },
  { id: 'real', label: 'Real-World' },
  { id: 'fictional', label: 'Fictional / Milsim' },
];

export default function IntelLayerPanel() {
  const {
    overlayLayers, toggleOverlayLayer,
    dataSourceFilter, setDataSourceFilter,
    mapViewMode,
  } = useMapStore();
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (isCollapsed) {
    return (
      <div className="absolute top-16 left-3 z-20">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-lg border bg-black/90 text-tropic-gold hover:bg-tropic-gold/10 backdrop-blur-md"
          style={{ borderColor: 'rgba(201,162,39,0.4)' }}
          onClick={() => setIsCollapsed(false)}
          title="Show intelligence layers"
        >
          <Layers className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div
      className="absolute top-16 left-3 z-20 w-56 rounded-lg border shadow-xl overflow-hidden"
      style={{
        borderColor: 'rgba(201,162,39,0.3)',
        background: 'rgba(5,10,20,0.95)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b"
        style={{ borderColor: 'rgba(201,162,39,0.2)' }}
      >
        <div className="flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 text-tropic-gold" />
          <span className="text-[11px] font-bold tracking-wider uppercase text-tropic-gold">
            Intel Layers
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-gray-500 hover:text-tropic-gold"
          onClick={() => setIsCollapsed(true)}
        >
          <ChevronLeft className="h-3 w-3" />
        </Button>
      </div>

      {/* Data source filter */}
      <div className="px-3 py-2 border-b" style={{ borderColor: 'rgba(201,162,39,0.15)' }}>
        <div className="flex items-center gap-1.5 mb-1.5">
          <Database className="h-3 w-3 text-gray-500" />
          <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
            Data Source
          </span>
        </div>
        <div className="flex gap-1">
          {DATA_SOURCE_OPTIONS.map(opt => (
            <button
              key={opt.id}
              onClick={() => setDataSourceFilter(opt.id)}
              className={`flex-1 text-[9px] py-1 rounded font-medium transition-all ${
                dataSourceFilter === opt.id
                  ? 'bg-tropic-gold/20 text-tropic-gold border border-tropic-gold/40'
                  : 'text-gray-500 hover:text-gray-300 border border-transparent hover:border-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Layer toggles */}
      <div className="px-2 py-2 space-y-0.5 max-h-64 overflow-y-auto">
        {LAYER_GROUPS.map(layer => {
          const isActive = overlayLayers[layer.id];
          const Icon = layer.icon;
          return (
            <button
              key={layer.id}
              onClick={() => toggleOverlayLayer(layer.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-all ${
                isActive
                  ? 'bg-white/5'
                  : 'opacity-50 hover:opacity-75'
              }`}
            >
              <div
                className="flex h-5 w-5 items-center justify-center rounded"
                style={{
                  background: isActive ? `${layer.color}20` : 'transparent',
                  border: `1px solid ${isActive ? layer.color : 'rgba(255,255,255,0.1)'}`,
                }}
              >
                <Icon className="h-3 w-3" style={{ color: isActive ? layer.color : '#6b7280' }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-medium" style={{ color: isActive ? '#e2e8f0' : '#9ca3af' }}>
                  {layer.label}
                </div>
                <div className="text-[8px] text-gray-600 truncate">
                  {layer.description}
                </div>
              </div>
              {isActive ? (
                <Eye className="h-3 w-3 shrink-0" style={{ color: layer.color }} />
              ) : (
                <EyeOff className="h-3 w-3 text-gray-700 shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      {/* View mode indicator */}
      <div className="px-3 py-1.5 border-t text-center" style={{ borderColor: 'rgba(201,162,39,0.15)' }}>
        <span className="text-[8px] text-gray-600 uppercase tracking-wider">
          {mapViewMode === 'globe' ? '🌍 Globe View' : '🗺️ Overlay View'}
        </span>
      </div>
    </div>
  );
}

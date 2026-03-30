/**
 * LayerControl.jsx
 *
 * Toggleable map layer visibility panel for the Operations Planner.
 * Controls visibility of terrain, units, drawings, grid overlay, etc.
 */

import React from 'react';
import { Layers, Eye, EyeOff } from 'lucide-react';

const LAYER_DEFS = [
  { id: 'terrain', label: 'Terrain / Base Map', color: '#6B7280' },
  { id: 'grid', label: 'Grid Overlay', color: '#C9A227' },
  { id: 'units', label: 'Units', color: '#3B82F6' },
  { id: 'drawings', label: 'Drawings & Overlays', color: '#22C55E' },
  { id: 'paths', label: 'Movement Paths', color: '#8B5CF6' },
];

export default function LayerControl({ layerVisibility, onToggleLayer }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 mb-2">
        <Layers className="w-3.5 h-3.5 text-[#C9A227]" />
        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">
          Map Layers
        </span>
      </div>
      {LAYER_DEFS.map((layer) => {
        const visible = layerVisibility[layer.id] !== false; // default true
        return (
          <button
            key={layer.id}
            className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-left text-xs transition ${
              visible
                ? 'text-gray-300 hover:bg-gray-800/60'
                : 'text-gray-600 hover:bg-gray-800/30'
            }`}
            onClick={() => onToggleLayer(layer.id)}
          >
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{
                backgroundColor: visible ? layer.color : '#374151',
                opacity: visible ? 1 : 0.3,
              }}
            />
            <span className="flex-1 truncate">{layer.label}</span>
            {visible ? (
              <Eye className="w-3.5 h-3.5 text-gray-500" />
            ) : (
              <EyeOff className="w-3.5 h-3.5 text-gray-600" />
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * DrawingToolbar.jsx
 *
 * Left-side toolbar for the Operations Planner that provides drawing tools
 * using OpenLayers Draw interactions.  Supports: freehand, line, polyline,
 * arrow, polygon, circle, and NATO planning symbols.
 */

import React, { useState } from 'react';
import {
  Minus, ArrowRight, Pentagon, Circle, Pencil,
  CornerDownRight, Target, Flag, Shield, Slash,
  MousePointer, Navigation, MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

/* ── Tool definitions ────────────────────────────────────────────────────── */

const DRAW_TOOLS = [
  { id: 'select', label: 'Select', icon: MousePointer, group: 'basic' },
  { id: 'freehand', label: 'Freehand', icon: Pencil, group: 'draw' },
  { id: 'line', label: 'Line', icon: Minus, group: 'draw' },
  { id: 'polyline', label: 'Polyline', icon: CornerDownRight, group: 'draw' },
  { id: 'arrow', label: 'Arrow', icon: ArrowRight, group: 'draw' },
  { id: 'polygon', label: 'Polygon', icon: Pentagon, group: 'draw' },
  { id: 'circle', label: 'Circle', icon: Circle, group: 'draw' },
];

const PLANNING_SYMBOLS = [
  { id: 'phase_line', label: 'Phase Line', icon: Slash, group: 'nato' },
  { id: 'boundary', label: 'Boundary', icon: Shield, group: 'nato' },
  { id: 'engagement_area', label: 'Engagement Area', icon: Target, group: 'nato' },
  { id: 'objective', label: 'Objective', icon: Flag, group: 'nato' },
];

const PATH_TOOLS = [
  { id: 'movement_path', label: 'Movement Path', icon: Navigation, group: 'path' },
];

const DEFAULT_STYLE = {
  color: '#C9A227',
  fill_color: null,
  stroke_width: 2,
  opacity: 1.0,
  line_dash: null,
};

const COLOR_PRESETS = [
  '#C9A227', '#3B82F6', '#EF4444', '#22C55E', '#A855F7',
  '#F97316', '#06B6D4', '#EC4899', '#FFFFFF', '#6B7280',
];

/* ── Component ───────────────────────────────────────────────────────────── */

export default function DrawingToolbar({
  activeTool,
  onToolChange,
  drawStyle,
  onStyleChange,
}) {
  const [expandedGroup, setExpandedGroup] = useState('draw');

  const handleToolClick = (toolId) => {
    onToolChange(toolId === activeTool ? 'select' : toolId);
  };

  const isActive = (id) => activeTool === id;

  const renderToolButton = (tool) => (
    <button
      key={tool.id}
      onClick={() => handleToolClick(tool.id)}
      className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-left text-xs transition ${
        isActive(tool.id)
          ? 'bg-[#C9A227]/20 text-[#C9A227] border border-[#C9A227]/40'
          : 'text-[#8a9aa8] hover:bg-[#111a24]/60 hover:text-[#d0d8e0]'
      }`}
      title={tool.label}
    >
      <tool.icon className="w-4 h-4 shrink-0" />
      <span>{tool.label}</span>
    </button>
  );

  const renderSection = (title, tools, groupId) => (
    <div key={groupId}>
      <button
        className="text-[10px] text-[#4a6070] uppercase tracking-wider block mb-1 w-full text-left hover:text-[#8a9aa8] transition"
        onClick={() => setExpandedGroup(expandedGroup === groupId ? '' : groupId)}
      >
        {title}
      </button>
      {expandedGroup === groupId && (
        <div className="space-y-0.5 mb-3">
          {tools.map(renderToolButton)}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Draw Tools */}
      {renderSection('Drawing Tools', DRAW_TOOLS, 'draw')}

      {/* NATO Planning Symbols */}
      {renderSection('Planning Symbols', PLANNING_SYMBOLS, 'nato')}

      {/* Movement Paths */}
      {renderSection('Movement', PATH_TOOLS, 'path')}

      {/* Style Controls */}
      {activeTool && activeTool !== 'select' && (
        <div className="pt-2 border-t border-[rgba(201,162,39,0.12)] space-y-2">
          <p className="text-[10px] text-[#4a6070] uppercase tracking-wider">
            Style
          </p>

          {/* Color */}
          <div>
            <label className="text-[9px] text-[#4a6070] block mb-1">Color</label>
            <div className="flex flex-wrap gap-1">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  className={`w-5 h-5 rounded border transition ${
                    drawStyle.color === c
                      ? 'border-white scale-110'
                      : 'border-[rgba(201,162,39,0.15)] hover:border-gray-500'
                  }`}
                  style={{ backgroundColor: c }}
                  onClick={() => onStyleChange({ ...drawStyle, color: c })}
                />
              ))}
            </div>
          </div>

          {/* Stroke Width */}
          <div>
            <label className="text-[9px] text-[#4a6070] block mb-1">
              Width: {drawStyle.stroke_width}px
            </label>
            <input
              type="range"
              min="1"
              max="8"
              step="0.5"
              value={drawStyle.stroke_width}
              onChange={(e) =>
                onStyleChange({ ...drawStyle, stroke_width: parseFloat(e.target.value) })
              }
              className="w-full accent-[#C9A227]"
            />
          </div>

          {/* Opacity */}
          <div>
            <label className="text-[9px] text-[#4a6070] block mb-1">
              Opacity: {Math.round(drawStyle.opacity * 100)}%
            </label>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.1"
              value={drawStyle.opacity}
              onChange={(e) =>
                onStyleChange({ ...drawStyle, opacity: parseFloat(e.target.value) })
              }
              className="w-full accent-[#C9A227]"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export { DRAW_TOOLS, PLANNING_SYMBOLS, PATH_TOOLS, DEFAULT_STYLE };

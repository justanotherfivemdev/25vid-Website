/**
 * DrawingPropertiesPanel.jsx
 *
 * Right-sidebar panel for editing the properties of a selected drawing element.
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Trash2, Pencil } from 'lucide-react';

const COLOR_PRESETS = [
  '#C9A227', '#3B82F6', '#EF4444', '#22C55E', '#A855F7',
  '#F97316', '#06B6D4', '#EC4899', '#FFFFFF', '#6B7280',
];

const DRAWING_TYPE_LABELS = {
  line: 'Line',
  arrow: 'Arrow',
  polyline: 'Polyline',
  polygon: 'Polygon',
  circle: 'Circle',
  freehand: 'Freehand',
  phase_line: 'Phase Line',
  boundary: 'Boundary',
  engagement_area: 'Engagement Area',
  objective: 'Objective',
};

export default function DrawingPropertiesPanel({
  drawing,
  onUpdate,
  onDelete,
  isViewOnly = false,
}) {
  if (!drawing) {
    return (
      <div className="p-4 text-center text-[#4a6070] text-sm">
        <Pencil className="w-8 h-8 mx-auto mb-2 text-[#4a6070]" />
        Select a drawing to edit its properties.
      </div>
    );
  }

  const style = drawing.style || {};

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Pencil className="w-4 h-4 text-[#C9A227]" />
        <Badge className="bg-[#C9A227]/15 text-[#C9A227] border border-[#C9A227]/30 text-[10px]">
          {DRAWING_TYPE_LABELS[drawing.drawing_type] || drawing.drawing_type}
        </Badge>
      </div>

      {/* Label */}
      <div>
        <label className="text-[10px] text-[#4a6070] uppercase tracking-wider block mb-1">
          Label
        </label>
        {isViewOnly ? (
          <p className="text-sm text-[#8a9aa8]">{drawing.label || '—'}</p>
        ) : (
          <Input
            value={drawing.label || ''}
            onChange={(e) => onUpdate(drawing.id, { label: e.target.value })}
            placeholder="Drawing label…"
            className="bg-[#0c1117] border-[rgba(201,162,39,0.15)] text-sm"
          />
        )}
      </div>

      {/* Notes */}
      <div>
        <label className="text-[10px] text-[#4a6070] uppercase tracking-wider block mb-1">
          Notes
        </label>
        {isViewOnly ? (
          <p className="text-sm text-[#8a9aa8]">{drawing.notes || '—'}</p>
        ) : (
          <Textarea
            value={drawing.notes || ''}
            onChange={(e) => onUpdate(drawing.id, { notes: e.target.value })}
            rows={2}
            className="bg-[#0c1117] border-[rgba(201,162,39,0.15)] text-sm"
          />
        )}
      </div>

      {/* Style */}
      {!isViewOnly && (
        <div className="pt-2 border-t border-[rgba(201,162,39,0.12)] space-y-2">
          <p className="text-[10px] text-[#4a6070] uppercase tracking-wider">Style</p>

          {/* Color */}
          <div>
            <label className="text-[9px] text-[#4a6070] block mb-1">Stroke Color</label>
            <div className="flex flex-wrap gap-1">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  className={`w-5 h-5 rounded border transition ${
                    style.color === c
                      ? 'border-white scale-110'
                      : 'border-[rgba(201,162,39,0.15)] hover:border-gray-500'
                  }`}
                  style={{ backgroundColor: c }}
                  onClick={() =>
                    onUpdate(drawing.id, { style: { ...style, color: c } })
                  }
                />
              ))}
            </div>
          </div>

          {/* Stroke Width */}
          <div>
            <label className="text-[9px] text-[#4a6070] block mb-1">
              Width: {style.stroke_width || 2}px
            </label>
            <input
              type="range"
              min="1"
              max="8"
              step="0.5"
              value={style.stroke_width || 2}
              onChange={(e) =>
                onUpdate(drawing.id, {
                  style: { ...style, stroke_width: parseFloat(e.target.value) },
                })
              }
              className="w-full accent-[#C9A227]"
            />
          </div>

          {/* Opacity */}
          <div>
            <label className="text-[9px] text-[#4a6070] block mb-1">
              Opacity: {Math.round((style.opacity || 1) * 100)}%
            </label>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.1"
              value={style.opacity || 1}
              onChange={(e) =>
                onUpdate(drawing.id, {
                  style: { ...style, opacity: parseFloat(e.target.value) },
                })
              }
              className="w-full accent-[#C9A227]"
            />
          </div>
        </div>
      )}

      {/* Coordinates info */}
      <div className="pt-2 border-t border-[rgba(201,162,39,0.12)]">
        <p className="text-[9px] text-[#4a6070] font-mono">
          {drawing.coordinates?.length || 0} vertices
          {drawing.radius != null && ` • r=${drawing.radius.toFixed(4)}`}
        </p>
      </div>

      {!isViewOnly && (
        <Button
          size="sm"
          variant="outline"
          className="w-full border-red-900 text-red-400 hover:bg-red-900/20"
          onClick={() => onDelete(drawing.id)}
        >
          <Trash2 className="w-4 h-4 mr-1" /> Remove Drawing
        </Button>
      )}
    </div>
  );
}

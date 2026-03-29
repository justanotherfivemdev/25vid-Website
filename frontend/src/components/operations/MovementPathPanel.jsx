/**
 * MovementPathPanel.jsx
 *
 * Right-sidebar panel for managing movement paths and path-to-unit linking
 * in the Operations Planner.
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Trash2, Link, Unlink, Navigation, Play, Pause,
  SkipBack, FastForward, Clock,
} from 'lucide-react';

const SPEED_OPTIONS = [0.5, 1, 2, 4];

export default function MovementPathPanel({
  movementPaths,
  pathAssignments,
  units,
  selectedPathId,
  onSelectPath,
  onUpdatePath,
  onDeletePath,
  onLinkUnit,
  onUnlinkUnit,
  // Animation
  animPlaying,
  animProgress,
  animSpeed,
  onAnimPlay,
  onAnimPause,
  onAnimReset,
  onAnimSeek,
  onAnimSetSpeed,
  isViewOnly = false,
}) {
  const selectedPath = movementPaths.find((p) => p.id === selectedPathId);
  const linkedAssignments = pathAssignments.filter((a) => a.path_id === selectedPathId);
  const linkedUnitIds = new Set(linkedAssignments.map((a) => a.unit_id));
  const availableUnits = units.filter((u) => !linkedUnitIds.has(u.id));

  return (
    <div className="space-y-3">
      {/* ── Animation Controls ─────────────────────────────────────── */}
      {movementPaths.length > 0 && (
        <div className="p-3 border border-gray-800 rounded-lg bg-black/20 space-y-2">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">
            <Navigation className="w-3 h-3 inline mr-1" />Animation
          </p>

          {/* Progress bar */}
          <div
            className="relative h-1.5 bg-gray-800 rounded-full cursor-pointer group"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              onAnimSeek(pct);
            }}
          >
            <div
              className="absolute top-0 left-0 h-full bg-[#3B82F6] rounded-full transition-all duration-75"
              style={{ width: `${(animProgress || 0) * 100}%` }}
            />
          </div>

          {/* Control buttons */}
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-gray-400 hover:text-[#3B82F6]"
              onClick={onAnimReset}
              title="Reset"
            >
              <SkipBack className="w-3 h-3" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-gray-400 hover:text-[#3B82F6]"
              onClick={animPlaying ? onAnimPause : onAnimPlay}
              title={animPlaying ? 'Pause' : 'Play'}
            >
              {animPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </Button>

            {/* Speed */}
            <div className="flex items-center gap-0.5 ml-1">
              {SPEED_OPTIONS.map((s) => (
                <button
                  key={s}
                  className={`px-1 py-0.5 rounded text-[9px] font-mono transition ${
                    animSpeed === s
                      ? 'bg-[#3B82F6]/20 text-[#3B82F6]'
                      : 'text-gray-600 hover:text-gray-400'
                  }`}
                  onClick={() => onAnimSetSpeed(s)}
                >
                  {s}x
                </button>
              ))}
            </div>

            <span className="ml-auto text-[9px] text-gray-600 font-mono">
              {Math.round((animProgress || 0) * 100)}%
            </span>
          </div>
        </div>
      )}

      {/* ── Path List ──────────────────────────────────────────────── */}
      <div>
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">
          Movement Paths ({movementPaths.length})
        </p>
        {movementPaths.length === 0 ? (
          <p className="text-[10px] text-gray-600 italic">
            Use the Movement Path tool to draw a path on the map.
          </p>
        ) : (
          <div className="space-y-1">
            {movementPaths.map((path) => {
              const isSelected = selectedPathId === path.id;
              const assignmentCount = pathAssignments.filter(
                (a) => a.path_id === path.id,
              ).length;
              return (
                <button
                  key={path.id}
                  className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-left text-xs transition ${
                    isSelected
                      ? 'bg-[#3B82F6]/15 text-[#3B82F6] border border-[#3B82F6]/30'
                      : 'text-gray-400 hover:bg-gray-800/40'
                  }`}
                  onClick={() => onSelectPath(isSelected ? null : path.id)}
                >
                  <Navigation className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate flex-1">{path.name || 'Unnamed Path'}</span>
                  {assignmentCount > 0 && (
                    <Badge className="bg-[#3B82F6]/20 text-[#3B82F6] text-[8px] px-1">
                      {assignmentCount}
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Selected Path Properties ───────────────────────────────── */}
      {selectedPath && (
        <div className="pt-2 border-t border-gray-800 space-y-2">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">
            Path Properties
          </p>

          <div>
            <label className="text-[9px] text-gray-500 block mb-0.5">Name</label>
            {isViewOnly ? (
              <p className="text-xs text-gray-300">{selectedPath.name || '—'}</p>
            ) : (
              <Input
                value={selectedPath.name}
                onChange={(e) => onUpdatePath(selectedPath.id, { name: e.target.value })}
                placeholder="Path name…"
                className="bg-gray-900 border-gray-700 text-xs h-7"
              />
            )}
          </div>

          <div>
            <label className="text-[9px] text-gray-500 block mb-0.5">
              <Clock className="w-3 h-3 inline mr-0.5" />Duration (seconds)
            </label>
            {isViewOnly ? (
              <p className="text-xs text-gray-300">{selectedPath.duration}s</p>
            ) : (
              <Input
                type="number"
                min="1"
                max="3600"
                value={selectedPath.duration}
                onChange={(e) =>
                  onUpdatePath(selectedPath.id, {
                    duration: Math.max(1, parseInt(e.target.value) || 60),
                  })
                }
                className="bg-gray-900 border-gray-700 text-xs h-7"
              />
            )}
          </div>

          <div>
            <label className="text-[9px] text-gray-500 block mb-0.5">Waypoints</label>
            <p className="text-[10px] text-gray-400 font-mono">
              {selectedPath.coordinates?.length || 0} point(s)
            </p>
          </div>

          {/* Linked Units */}
          <div className="pt-2 border-t border-gray-800">
            <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">
              Linked Units
            </p>
            {linkedAssignments.length === 0 ? (
              <p className="text-[9px] text-gray-600 italic">No units linked.</p>
            ) : (
              <div className="space-y-1">
                {linkedAssignments.map((a) => {
                  const unit = units.find((u) => u.id === a.unit_id);
                  return (
                    <div
                      key={a.id}
                      className="flex items-center gap-1 px-1.5 py-1 rounded bg-gray-800/40 text-[10px]"
                    >
                      <Link className="w-3 h-3 text-[#3B82F6] shrink-0" />
                      <span className="text-gray-300 truncate flex-1">
                        {unit?.name || a.unit_id.slice(0, 8)}
                      </span>
                      <Badge className="text-[8px] px-1 bg-transparent border border-gray-700 text-gray-500">
                        {a.mode}
                      </Badge>
                      {!isViewOnly && (
                        <button
                          onClick={() => onUnlinkUnit(a.unit_id, a.path_id)}
                          className="text-red-400 hover:text-red-300 transition"
                          title="Unlink unit"
                        >
                          <Unlink className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Link unit to path */}
            {!isViewOnly && availableUnits.length > 0 && (
              <div className="mt-2">
                <select
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[10px] text-gray-300"
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      onLinkUnit(e.target.value, selectedPath.id);
                      e.target.value = '';
                    }
                  }}
                >
                  <option value="">Link a unit…</option>
                  {availableUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name || `Unit ${u.id.slice(0, 8)}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {!isViewOnly && (
            <Button
              size="sm"
              variant="outline"
              className="w-full border-red-900 text-red-400 hover:bg-red-900/20 text-[10px]"
              onClick={() => onDeletePath(selectedPath.id)}
            >
              <Trash2 className="w-3 h-3 mr-1" /> Delete Path
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

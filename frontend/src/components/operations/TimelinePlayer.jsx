/**
 * TimelinePlayer.jsx
 *
 * A video-player-style scrub bar and controls for replaying operations plan
 * events.  Shows play/pause, speed control, progress bar, and current event
 * info.
 *
 * Used in OperationsPlanView when the user enters replay mode.
 */

import React from 'react';
import {
  Play, Pause, SkipBack, FastForward, Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const SPEED_OPTIONS = [0.5, 1, 2, 4];

export default function TimelinePlayer({
  playing,
  progress,
  currentIndex,
  totalEvents,
  speed,
  currentEvent,
  totalDurationMs,
  onPlay,
  onPause,
  onReset,
  onSeek,
  onSetSpeed,
}) {
  const handleScrub = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    const targetIndex = Math.round(pct * totalEvents);
    onSeek(targetIndex);
  };

  const eventTypeLabel = (et) => {
    const labels = {
      UNIT_CREATE: 'Unit Created',
      UNIT_MOVE: 'Unit Moved',
      UNIT_UPDATE: 'Unit Updated',
      UNIT_DELETE: 'Unit Deleted',
      PLAN_METADATA_UPDATE: 'Plan Updated',
    };
    return labels[et] || et;
  };

  const eventTypeColor = (et) => {
    const colors = {
      UNIT_CREATE: 'text-green-400',
      UNIT_MOVE: 'text-blue-400',
      UNIT_UPDATE: 'text-yellow-400',
      UNIT_DELETE: 'text-red-400',
      PLAN_METADATA_UPDATE: 'text-gray-400',
    };
    return colors[et] || 'text-gray-400';
  };

  const formatDuration = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="bg-[#0c1322] border-t border-gray-800 px-4 py-2">
      {/* Scrub bar */}
      <div
        className="relative h-2 bg-gray-800 rounded-full cursor-pointer mb-2 group"
        onClick={handleScrub}
      >
        <div
          className="absolute top-0 left-0 h-full bg-[#C9A227] rounded-full transition-all duration-100"
          style={{ width: `${progress}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-[#C9A227] rounded-full border-2 border-[#0c1322] shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `${progress}%`, transform: `translate(-50%, -50%)` }}
        />
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-2 text-xs">
        {/* Play/Pause */}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-gray-300 hover:text-[#C9A227]"
          onClick={onReset}
          title="Reset to start"
        >
          <SkipBack className="w-3.5 h-3.5" />
        </Button>

        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-gray-300 hover:text-[#C9A227]"
          onClick={playing ? onPause : onPlay}
          title={playing ? 'Pause' : 'Play'}
        >
          {playing ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4" />
          )}
        </Button>

        {/* Speed control */}
        <div className="flex items-center gap-1 ml-1">
          <FastForward className="w-3 h-3 text-gray-500" />
          {SPEED_OPTIONS.map((s) => (
            <button
              key={s}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition ${
                speed === s
                  ? 'bg-[#C9A227]/20 text-[#C9A227] border border-[#C9A227]/40'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
              onClick={() => onSetSpeed(s)}
            >
              {s}x
            </button>
          ))}
        </div>

        {/* Progress info */}
        <div className="flex-1 text-center text-gray-500">
          <span className="font-mono">{currentIndex}</span>
          <span className="mx-1">/</span>
          <span className="font-mono">{totalEvents}</span>
          <span className="ml-2 text-gray-600">events</span>
          {totalDurationMs > 0 && (
            <span className="ml-2 text-gray-600">
              <Clock className="w-3 h-3 inline mr-0.5" />
              {formatDuration(totalDurationMs)}
            </span>
          )}
        </div>

        {/* Current event indicator */}
        {currentEvent && (
          <div className="flex items-center gap-2 text-gray-400">
            <span className={`font-mono text-[10px] ${eventTypeColor(currentEvent.event_type)}`}>
              {eventTypeLabel(currentEvent.event_type)}
            </span>
            {currentEvent.username && (
              <span className="text-gray-600">by {currentEvent.username}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * CoordinateDisplay.jsx
 *
 * Overlay component that shows real-time cursor position on the tactical map.
 * When a Reforger map is active, coordinates are shown in game-coordinate
 * format (metres) along with grid references. For custom uploaded maps,
 * normalised (0-1) coordinates are displayed.
 */

import React from 'react';
import { Crosshair } from 'lucide-react';

/**
 * Convert pixel coordinates to a Reforger-style 8-digit grid reference.
 * E.g. easting 3456m, northing 7890m → "03450 07890"
 */
function toGridRef(easting, northing) {
  const e = String(Math.round(easting)).padStart(5, '0');
  const n = String(Math.round(northing)).padStart(5, '0');
  return `${e} ${n}`;
}

export default function CoordinateDisplay({
  cursorCoords,
  mapDimensions,
  isReforgerMap,
  reforgerMapConfig,
}) {
  if (!cursorCoords) return null;

  const { x, y } = cursorCoords;

  // Normalised coordinates
  const nx = mapDimensions.w > 0 ? (x / mapDimensions.w).toFixed(4) : '—';
  const ny = mapDimensions.w > 0 ? (y / mapDimensions.h).toFixed(4) : '—';

  return (
    <div className="absolute bottom-2 left-2 z-20 flex items-center gap-3 bg-[#050a0e]/80 backdrop-blur-sm border border-[rgba(201,162,39,0.09)] rounded px-3 py-1.5 text-[11px] font-mono text-[#8a9aa8] pointer-events-none select-none">
      <Crosshair className="w-3.5 h-3.5 text-[#C9A227] shrink-0" />
      {isReforgerMap && reforgerMapConfig ? (
        <>
          <span>
            <span className="text-[#4a6070] mr-1">X:</span>
            {Math.round(x)}m
          </span>
          <span>
            <span className="text-[#4a6070] mr-1">Y:</span>
            {Math.round(reforgerMapConfig.yMax - y)}m
          </span>
          <span className="text-[#C9A227]">
            <span className="text-[#4a6070] mr-1">Grid:</span>
            {toGridRef(x, reforgerMapConfig.yMax - y)}
          </span>
        </>
      ) : (
        <>
          <span>
            <span className="text-[#4a6070] mr-1">X:</span>{nx}
          </span>
          <span>
            <span className="text-[#4a6070] mr-1">Y:</span>{ny}
          </span>
          <span className="text-[#4a6070]">
            ({Math.round(x)}px, {Math.round(y)}px)
          </span>
        </>
      )}
    </div>
  );
}

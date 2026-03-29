/**
 * useAnimationEngine.js
 *
 * React hook for animating units along movement paths.
 * Uses requestAnimationFrame for smooth, time-based interpolation.
 *
 * Supports:
 *   - Play / Pause / Reset
 *   - Variable playback speed (0.5x .. 4x)
 *   - Timeline scrubbing (set progress 0→1)
 *   - Linked / unlinked modes (linked units move; unlinked stay static)
 */

import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Linearly interpolate between two coordinates.
 */
function lerp(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * Compute cumulative segment lengths for a coordinate array.
 * Returns an array of cumulative distances from the start.
 */
function computeSegmentLengths(coords) {
  const lengths = [0];
  for (let i = 1; i < coords.length; i++) {
    const dx = coords[i][0] - coords[i - 1][0];
    const dy = coords[i][1] - coords[i - 1][1];
    lengths.push(lengths[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  return lengths;
}

/**
 * Given a normalised progress (0→1) along a path, return the interpolated
 * coordinate using cumulative arc-length parameterisation.
 */
function getPositionAlongPath(coords, progress) {
  if (!coords || coords.length === 0) return null;
  if (coords.length === 1) return coords[0];
  if (progress <= 0) return coords[0];
  if (progress >= 1) return coords[coords.length - 1];

  const lengths = computeSegmentLengths(coords);
  const totalLength = lengths[lengths.length - 1];
  if (totalLength === 0) return coords[0];

  const targetDist = progress * totalLength;

  // Find the segment
  for (let i = 1; i < lengths.length; i++) {
    if (lengths[i] >= targetDist) {
      const segLen = lengths[i] - lengths[i - 1];
      const segProgress = segLen > 0 ? (targetDist - lengths[i - 1]) / segLen : 0;
      return lerp(coords[i - 1], coords[i], segProgress);
    }
  }
  return coords[coords.length - 1];
}

/**
 * Hook: useAnimationEngine
 *
 * @param {Object} params
 * @param {Array} params.movementPaths - Array of movement path objects
 * @param {Array} params.pathAssignments - Array of { unit_id, path_id, start_time, mode }
 * @param {Array} params.units - Current units array
 * @param {Function} params.onUnitPositionUpdate - Callback (unitId, {x, y}) for position updates
 */
export default function useAnimationEngine({
  movementPaths = [],
  pathAssignments = [],
  units = [],
  onUnitPositionUpdate,
}) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0→1
  const [speed, setSpeed] = useState(1);
  const [totalDuration, setTotalDuration] = useState(60); // seconds

  const rafRef = useRef(null);
  const startTimeRef = useRef(null);
  const pausedAtRef = useRef(0); // progress when paused

  // Compute total duration from max path duration
  useEffect(() => {
    if (movementPaths.length === 0) return;
    const maxDur = Math.max(...movementPaths.map((p) => p.duration || 60));
    setTotalDuration(maxDur);
  }, [movementPaths]);

  /**
   * Compute and apply animated positions for all linked units at a given progress.
   */
  const applyPositions = useCallback(
    (prog) => {
      if (!onUnitPositionUpdate) return;

      pathAssignments.forEach((assignment) => {
        if (assignment.mode !== 'linked') return;

        const path = movementPaths.find((p) => p.id === assignment.path_id);
        if (!path || !path.coordinates || path.coordinates.length < 2) return;

        // Calculate per-path progress accounting for start_time offset
        const pathDuration = path.duration || totalDuration;
        const startOffset = (assignment.start_time || 0) / totalDuration;
        const localProg = Math.max(0, Math.min(1, (prog - startOffset) * (totalDuration / pathDuration)));

        const pos = getPositionAlongPath(path.coordinates, localProg);
        if (pos) {
          onUnitPositionUpdate(assignment.unit_id, { x: pos[0], y: pos[1] });
        }
      });
    },
    [pathAssignments, movementPaths, totalDuration, onUnitPositionUpdate],
  );

  /**
   * Animation loop using requestAnimationFrame.
   */
  const animate = useCallback(
    (timestamp) => {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp;
      }

      const elapsed = (timestamp - startTimeRef.current) / 1000; // seconds
      const newProgress = Math.min(1, pausedAtRef.current + (elapsed * speed) / totalDuration);

      setProgress(newProgress);
      applyPositions(newProgress);

      if (newProgress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setPlaying(false);
      }
    },
    [speed, totalDuration, applyPositions],
  );

  // Start/stop animation loop
  useEffect(() => {
    if (playing) {
      startTimeRef.current = null;
      rafRef.current = requestAnimationFrame(animate);
    } else {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, animate]);

  /* ── Controls ────────────────────────────────────────────────────────── */

  const play = useCallback(() => {
    if (progress >= 1) {
      pausedAtRef.current = 0;
      setProgress(0);
    }
    setPlaying(true);
  }, [progress]);

  const pause = useCallback(() => {
    setPlaying(false);
    pausedAtRef.current = progress;
  }, [progress]);

  const reset = useCallback(() => {
    setPlaying(false);
    pausedAtRef.current = 0;
    setProgress(0);
    applyPositions(0);
  }, [applyPositions]);

  const seekTo = useCallback(
    (prog) => {
      const clamped = Math.max(0, Math.min(1, prog));
      pausedAtRef.current = clamped;
      setProgress(clamped);
      applyPositions(clamped);
      if (playing) {
        startTimeRef.current = null; // restart timing from new position
      }
    },
    [applyPositions, playing],
  );

  const changeSpeed = useCallback((newSpeed) => {
    pausedAtRef.current = progress;
    startTimeRef.current = null;
    setSpeed(newSpeed);
  }, [progress]);

  return {
    playing,
    progress,
    speed,
    totalDuration,
    play,
    pause,
    reset,
    seekTo,
    setSpeed: changeSpeed,
    getPositionAlongPath,
  };
}

export { getPositionAlongPath, computeSegmentLengths };

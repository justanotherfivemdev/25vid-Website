export function formatDeploymentDateTime(isoStr, options = {}) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return String(isoStr);
  const { includeYear = true, includeTime = true } = options;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

/**
 * Compute deployment progress (0-1) based on duration model.
 *
 * @param {object} dep - Deployment with started_at, total_duration_hours, route_points
 * @param {number} nowMs - Current time in ms (Date.now())
 * @returns {number} 0-1 progress fraction
 */
export function computeDeploymentProgress(dep, nowMs) {
  if (!dep.started_at || !dep.total_duration_hours) return 0;
  const startMs = new Date(dep.started_at).getTime();
  if (Number.isNaN(startMs)) return 0;
  const totalMs = dep.total_duration_hours * 3600000;
  if (totalMs <= 0) return 0;

  const elapsedMs = nowMs - startMs;
  if (elapsedMs <= 0) return 0;
  if (elapsedMs >= totalMs) return 1;

  // Calculate total stop duration across route points
  const rps = Array.isArray(dep.route_points) ? dep.route_points : [];
  let totalStopMs = 0;
  // Intermediate stops (all except first and last)
  for (let i = 1; i < rps.length - 1; i++) {
    const stop = rps[i].stop_duration_hours || 0;
    if (stop > 0) totalStopMs += stop * 3600000;
  }

  // If total stops exceed total time, just use linear progress
  if (totalStopMs >= totalMs) {
    return Math.max(0, Math.min(1, elapsedMs / totalMs));
  }

  const travelMs = totalMs - totalStopMs;
  const numSegments = Math.max(rps.length - 1, 1);
  const segmentTravelMs = travelMs / numSegments;

  // Walk through timeline: for each segment, consume travel time then stop time
  let timeAccum = 0;
  let distanceFraction = 0;
  const segFrac = 1 / numSegments;

  for (let i = 0; i < numSegments; i++) {
    // Travel phase for this segment
    const segEnd = timeAccum + segmentTravelMs;
    if (elapsedMs <= segEnd) {
      const segProgress = (elapsedMs - timeAccum) / segmentTravelMs;
      distanceFraction += segFrac * segProgress;
      return Math.max(0, Math.min(1, distanceFraction));
    }
    timeAccum = segEnd;
    distanceFraction += segFrac;

    // Stop phase at the end of this segment (intermediate stops only)
    if (i < numSegments - 1 && i + 1 < rps.length - 1) {
      const stopMs = (rps[i + 1].stop_duration_hours || 0) * 3600000;
      if (stopMs > 0) {
        const stopEnd = timeAccum + stopMs;
        if (elapsedMs <= stopEnd) {
          return Math.max(0, Math.min(1, distanceFraction));
        }
        timeAccum = stopEnd;
      }
    }
  }

  return 1;
}

/**
 * Compute countdown label showing remaining time for a deployment.
 *
 * @param {object} dep - Deployment with started_at, total_duration_hours
 * @param {number} nowMs - Current time in ms
 * @returns {string} e.g. "12h 30m" or ""
 */
export function computeCountdownLabel(dep, nowMs) {
  if (!dep.started_at || !dep.total_duration_hours) return '';
  const startMs = new Date(dep.started_at).getTime();
  if (Number.isNaN(startMs)) return '';
  const endMs = startMs + dep.total_duration_hours * 3600000;
  const remaining = endMs - nowMs;
  if (remaining <= 0) return '';
  const totalMinutes = Math.floor(remaining / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h 0m`;
  return `0h ${mins}m`;
}

/**
 * Interpolate position along a multi-point route by fractional progress (0-1).
 *
 * @param {Array<[number,number]>} coords - [[lng, lat], ...]
 * @param {number} fraction - 0-1
 * @returns {[number,number]} [lng, lat]
 */
export function interpolateAlongLine(coords, fraction) {
  if (!coords || coords.length < 2) return coords?.[0] || [0, 0];
  if (fraction <= 0) return coords[0];
  if (fraction >= 1) return coords[coords.length - 1];

  const segLengths = [];
  let totalLen = 0;
  for (let i = 1; i < coords.length; i++) {
    const dx = coords[i][0] - coords[i - 1][0];
    const dy = coords[i][1] - coords[i - 1][1];
    const len = Math.sqrt(dx * dx + dy * dy);
    segLengths.push(len);
    totalLen += len;
  }
  if (totalLen === 0) return coords[0];

  let target = fraction * totalLen;
  for (let i = 0; i < segLengths.length; i++) {
    if (segLengths[i] === 0) continue;
    if (target <= segLengths[i]) {
      const t = target / segLengths[i];
      return [
        coords[i][0] + t * (coords[i + 1][0] - coords[i][0]),
        coords[i][1] + t * (coords[i + 1][1] - coords[i][1]),
      ];
    }
    target -= segLengths[i];
  }
  return coords[coords.length - 1];
}

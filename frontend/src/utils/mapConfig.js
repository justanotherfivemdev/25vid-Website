const safeNumber = (value, fallback) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

export const MAP_TILE_URL = process.env.REACT_APP_MAP_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const MAP_ATTRIBUTION = process.env.REACT_APP_MAP_ATTRIBUTION || '&copy; OpenStreetMap contributors';
export const DEFAULT_MAP_CENTER = [
  safeNumber(process.env.REACT_APP_DEFAULT_MAP_CENTER_LAT ?? undefined, 20),
  safeNumber(process.env.REACT_APP_DEFAULT_MAP_CENTER_LNG ?? undefined, 0),
];
export const DEFAULT_MAP_ZOOM = safeNumber(process.env.REACT_APP_DEFAULT_MAP_ZOOM ?? undefined, 2);

export const SEVERITY_COLORS = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444',
};

export const severityToColor = (severity = 'medium') => SEVERITY_COLORS[severity] || '#f59e0b';

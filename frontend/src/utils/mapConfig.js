export const MAP_TILE_URL = process.env.REACT_APP_MAP_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const MAP_ATTRIBUTION = process.env.REACT_APP_MAP_ATTRIBUTION || '&copy; OpenStreetMap contributors';
export const DEFAULT_MAP_CENTER = [
  Number(process.env.REACT_APP_DEFAULT_MAP_CENTER_LAT ?? 20),
  Number(process.env.REACT_APP_DEFAULT_MAP_CENTER_LNG ?? 0),
];
export const DEFAULT_MAP_ZOOM = Number(process.env.REACT_APP_DEFAULT_MAP_ZOOM ?? 2);

export const SEVERITY_COLORS = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444',
};

export const severityToColor = (severity = 'medium') => SEVERITY_COLORS[severity] || '#f59e0b';

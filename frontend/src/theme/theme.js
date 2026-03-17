/**
 * Centralized theme constants for 25th Infantry Division website.
 *
 * Black + gold private military command-center aesthetic.
 * Import this module wherever you need brand-consistent values.
 */

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------
export const colors = {
  // Primary brand
  gold: '#C5A046',
  goldLight: '#E5C76B',
  goldDark: '#8F701A',

  // Tropic Lightning palette (shared with Tailwind config)
  tropicRed: '#B01C2E',
  tropicGold: '#C9A227',
  tropicGoldLight: '#E3C766',
  tropicGoldDark: '#8F701A',
  tropicRedDark: '#7E1420',
  tropicRedLight: '#D33A4C',
  tropicOlive: '#556B2F',

  // Background hierarchy
  bgDeep: '#0B0B0B',
  bgPanel: '#111111',
  bgElevated: '#1a1a1a',
  bgSurface: '#0a0a0a',

  // Borders
  border: '#1f1f1f',
  borderGold: '#2a2318',

  // Text
  textPrimary: '#e5e7eb',
  textMuted: '#6b7280',
  textGold: '#C9A227',

  // Map marker colors
  markerExternal: '#ef4444',   // Red – external/global threats
  markerOperation: '#C9A227',  // Gold – operations
  markerIntel: '#a855f7',      // Purple – intel
  markerCampaign: '#3b82f6',   // Blue – campaigns

  // Threat levels
  threatCritical: '#ef4444',
  threatHigh: '#f97316',
  threatMedium: '#eab308',
  threatLow: '#22c55e',
  threatInfo: '#3b82f6',
};

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------
export const fonts = {
  heading: "'Rajdhani', 'Segoe UI', system-ui, sans-serif",
  body: "'Roboto', 'Segoe UI', system-ui, sans-serif",
  mono: "'Roboto Mono', 'Courier New', monospace",
};

// ---------------------------------------------------------------------------
// Component style presets
// ---------------------------------------------------------------------------
export const panel = {
  background: colors.bgPanel,
  border: `1px solid ${colors.border}`,
  borderRadius: '8px',
};

export const button = {
  primary: {
    background: colors.gold,
    color: '#000',
    hoverBackground: colors.goldLight,
  },
  secondary: {
    background: 'transparent',
    color: colors.gold,
    border: `1px solid ${colors.gold}`,
    hoverBackground: `${colors.gold}22`,
  },
};

export const table = {
  headerBg: colors.bgElevated,
  rowHoverBg: `${colors.gold}0a`,
  borderColor: colors.border,
};

export const popup = {
  background: colors.bgPanel,
  border: `1px solid ${colors.borderGold}`,
  textColor: colors.textPrimary,
  accentColor: colors.gold,
};

// ---------------------------------------------------------------------------
// CSS-in-JS helper
// ---------------------------------------------------------------------------
export const cssVars = {
  '--brand-gold': colors.gold,
  '--brand-gold-light': colors.goldLight,
  '--brand-gold-dark': colors.goldDark,
  '--brand-red': colors.tropicRed,
  '--brand-bg': colors.bgDeep,
  '--brand-panel': colors.bgPanel,
  '--brand-border': colors.border,
  '--brand-text': colors.textPrimary,
  '--brand-muted': colors.textMuted,
};

const theme = {
  colors,
  fonts,
  panel,
  button,
  table,
  popup,
  cssVars,
};

export default theme;

/**
 * Centralized theme constants for 25th Infantry Division website.
 *
 * Military command-center terminal aesthetic — "TROPIC THUNDER COMMAND"
 * Deep navy-black backgrounds, tactical gold accents, terminal green data readouts.
 */

// ---------------------------------------------------------------------------
// Color palette — "Night Operations"
// ---------------------------------------------------------------------------
export const colors = {
  // Primary brand — Tactical gold (military insignia)
  gold: '#c9a227',
  goldLight: '#e8c547',
  goldDark: '#8F701A',
  goldMuted: '#a08420',

  // Tropic Lightning palette
  tropicRed: '#ff3333',
  tropicGold: '#e8c547',
  tropicGoldLight: '#f0d56a',
  tropicGoldDark: '#a08420',
  tropicRedDark: '#cc0000',
  tropicRedLight: '#ff5555',
  tropicOlive: '#556B2F',

  // Terminal green
  terminalGreen: '#00ff88',
  terminalGreenDark: '#00cc6a',

  // HUD blue
  hudBlue: '#00aaff',
  hudBlueDark: '#0088cc',

  // Background hierarchy — Deep navy-black
  bgDeep: '#050a0e',
  bgPanel: '#0c1117',
  bgElevated: '#111a24',
  bgSurface: '#080d12',
  bgCard: '#0a1018',

  // Borders
  border: '#1a2a3a',
  borderGold: 'rgba(201, 162, 39, 0.2)',
  borderGreen: 'rgba(0, 255, 136, 0.15)',

  // Text
  textPrimary: '#d0d8e0',
  textMuted: '#4a6070',
  textGold: '#e8c547',
  textGreen: '#00ff88',

  // Map marker colors
  markerExternal: '#ff3333',
  markerOperation: '#e8c547',
  markerIntel: '#a855f7',
  markerCampaign: '#00aaff',

  // Threat levels
  threatCritical: '#ff3333',
  threatHigh: '#ff6600',
  threatMedium: '#ffaa00',
  threatLow: '#00ff88',
  threatInfo: '#00aaff',

  // Grid/Lines
  gridLine: 'rgba(0, 255, 136, 0.06)',
};

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------
export const fonts = {
  heading: "'Orbitron', 'Rajdhani', 'Segoe UI', system-ui, sans-serif",
  body: "'Inter', 'Roboto', 'Segoe UI', system-ui, sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', 'Roboto Mono', 'Courier New', monospace",
  condensed: "'Oswald', 'Rajdhani', 'Segoe UI', system-ui, sans-serif",
};

// ---------------------------------------------------------------------------
// Component style presets
// ---------------------------------------------------------------------------
export const panel = {
  background: colors.bgPanel,
  border: `1px solid ${colors.border}`,
  borderRadius: '4px',
};

export const button = {
  primary: {
    background: 'transparent',
    color: colors.gold,
    border: `1px solid ${colors.gold}`,
    hoverBorder: colors.goldLight,
  },
  secondary: {
    background: 'transparent',
    color: colors.terminalGreen,
    border: `1px solid ${colors.borderGreen}`,
    hoverBackground: 'rgba(0, 255, 136, 0.08)',
  },
};

export const table = {
  headerBg: colors.bgElevated,
  rowHoverBg: 'rgba(0, 255, 136, 0.04)',
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
  '--terminal-green': colors.terminalGreen,
  '--hud-blue': colors.hudBlue,
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

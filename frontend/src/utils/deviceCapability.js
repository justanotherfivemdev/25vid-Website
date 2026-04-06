/**
 * Device Capability Detection — Centralized utility for adaptive UI.
 *
 * Replaces scattered `isMobileDevice()` checks with a richer capability model.
 * Instead of guessing from screen width alone, this module detects actual
 * capabilities so the UI can degrade gracefully on low-end hardware (smart
 * fridges, kiosks, old phones) while still lighting up on powerful desktops.
 *
 * Usage:
 *   import { device } from '@/utils/deviceCapability';
 *   if (device.tier === 'low') { /* skip 3D globe * / }
 *   if (device.prefersReducedMotion) { /* disable animations * / }
 */

// ---------------------------------------------------------------------------
// Core detection helpers (run once at module load)
// ---------------------------------------------------------------------------

function detectPointerType() {
  if (typeof window === 'undefined') return 'fine';
  if (window.matchMedia('(pointer: coarse)').matches) return 'coarse';
  if (window.matchMedia('(pointer: fine)').matches) return 'fine';
  return 'none';
}

function detectPrefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function detectPrefersReducedData() {
  if (typeof window === 'undefined') return false;
  // Non-standard but supported by some browsers
  return window.matchMedia('(prefers-reduced-data: reduce)').matches;
}

function detectColorScheme() {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function detectStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function detectWebGL() {
  if (typeof window === 'undefined') return { supported: false, tier: 'none' };
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl');
    if (!gl) return { supported: false, tier: 'none' };

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : '';
    const vendor = debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
      : '';

    // Detect software renderers or very weak GPUs
    const isSwiftShader = /swiftshader|llvmpipe|softpipe|microsoft basic/i.test(renderer);
    const isLowEnd = /mali-4|adreno 3|powervr sgx|intel hd graphics [2-4]/i.test(renderer);

    let tier = 'high';
    if (isSwiftShader) tier = 'none'; // software renderer — treat as no GPU
    else if (isLowEnd) tier = 'low';

    // Clean up
    const loseContext = gl.getExtension('WEBGL_lose_context');
    if (loseContext) loseContext.loseContext();

    return { supported: true, tier, renderer, vendor };
  } catch {
    return { supported: false, tier: 'none' };
  }
}

function detectNetworkClass() {
  if (typeof navigator === 'undefined') return 'unknown';
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) return 'unknown';

  // effectiveType: 'slow-2g' | '2g' | '3g' | '4g'
  const etype = conn.effectiveType;
  if (etype === 'slow-2g' || etype === '2g') return 'slow';
  if (etype === '3g') return 'moderate';
  if (etype === '4g') return 'fast';
  return 'unknown';
}

function detectDeviceMemory() {
  if (typeof navigator === 'undefined') return null;
  // navigator.deviceMemory returns GB (0.25, 0.5, 1, 2, 4, 8)
  return navigator.deviceMemory ?? null;
}

function detectHardwareConcurrency() {
  if (typeof navigator === 'undefined') return null;
  return navigator.hardwareConcurrency ?? null;
}

function detectScreenClass() {
  if (typeof window === 'undefined') return 'desktop';
  const w = window.innerWidth;
  if (w < 480) return 'small-mobile';   // iPhone SE, old Androids, smart displays
  if (w < 768) return 'mobile';         // Standard phones
  if (w < 1024) return 'tablet';        // iPads, large phones in landscape
  if (w < 1440) return 'desktop';       // Laptops, standard monitors
  return 'large-desktop';               // Ultrawide, 4K monitors
}

function detectTouchSupport() {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia('(pointer: coarse)').matches
  );
}

// ---------------------------------------------------------------------------
// Compute device tier: 'high' | 'mid' | 'low'
// ---------------------------------------------------------------------------

function computeTier(capabilities) {
  const { webgl, memory, cores, network, screen } = capabilities;

  // Definitive low-tier signals
  if (webgl.tier === 'none') return 'low';
  if (memory !== null && memory <= 1) return 'low';
  if (cores !== null && cores <= 2 && webgl.tier !== 'high') return 'low';
  if (network === 'slow') return 'low';
  if (screen === 'small-mobile' && webgl.tier === 'low') return 'low';

  // Mid-tier signals
  if (webgl.tier === 'low') return 'mid';
  if (memory !== null && memory <= 2) return 'mid';
  if (cores !== null && cores <= 4) return 'mid';
  if (network === 'moderate') return 'mid';
  if (screen === 'mobile' || screen === 'small-mobile') return 'mid';

  return 'high';
}

// ---------------------------------------------------------------------------
// Build the capability snapshot (singleton)
// ---------------------------------------------------------------------------

function buildCapabilities() {
  const webgl = detectWebGL();
  const memory = detectDeviceMemory();
  const cores = detectHardwareConcurrency();
  const network = detectNetworkClass();
  const screen = detectScreenClass();
  const pointer = detectPointerType();
  const touch = detectTouchSupport();
  const prefersReducedMotion = detectPrefersReducedMotion();
  const prefersReducedData = detectPrefersReducedData();
  const colorScheme = detectColorScheme();
  const standalone = detectStandalone();

  const raw = { webgl, memory, cores, network, screen, pointer, touch };
  const tier = computeTier(raw);

  return {
    // Device tier: 'high' | 'mid' | 'low'
    tier,

    // Screen classification
    screen,
    isMobile: screen === 'mobile' || screen === 'small-mobile',
    isTablet: screen === 'tablet',
    isDesktop: screen === 'desktop' || screen === 'large-desktop',

    // Input
    pointer,     // 'coarse' | 'fine' | 'none'
    touch,       // boolean

    // GPU
    webglSupported: webgl.supported,
    gpuTier: webgl.tier,  // 'high' | 'low' | 'none'
    gpuRenderer: webgl.renderer || null,

    // System resources
    memory,      // GB or null
    cores,       // number or null

    // Network
    network,     // 'fast' | 'moderate' | 'slow' | 'unknown'

    // Preferences
    prefersReducedMotion,
    prefersReducedData,
    colorScheme,
    standalone,

    // Convenience: should heavy features auto-degrade?
    shouldReduceComplexity: tier === 'low' || prefersReducedMotion || prefersReducedData,
    canRender3D: webgl.supported && webgl.tier !== 'none',
  };
}

/** Singleton device capability snapshot */
export const device = buildCapabilities();

/**
 * Re-evaluate screen-dependent fields (call on resize if needed).
 * Does NOT re-detect GPU or memory — those don't change at runtime.
 */
export function refreshScreenClass() {
  device.screen = detectScreenClass();
  device.isMobile = device.screen === 'mobile' || device.screen === 'small-mobile';
  device.isTablet = device.screen === 'tablet';
  device.isDesktop = device.screen === 'desktop' || device.screen === 'large-desktop';
}

/**
 * React hook — re-exported from @/hooks/useDeviceCapability for convenience.
 * Import from '@/hooks/useDeviceCapability' in React components.
 * This re-export avoids making deviceCapability.js depend on React at module scope.
 */
export { useDeviceCapability } from '@/hooks/useDeviceCapability';

/**
 * Backward-compatible drop-in for the old `isMobileDevice()` function
 * used in worldmonitor and threatmap code.
 */
export function isMobileDevice() {
  return device.isMobile || device.pointer === 'coarse';
}

export default device;

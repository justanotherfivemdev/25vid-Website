/**
 * Shared API base-URL helpers.
 *
 * REACT_APP_BACKEND_URL is baked into the React bundle at build time.
 * When the env-var is absent (e.g. local dev without a .env file, or a
 * same-origin nginx deployment where the variable was never set) we fall
 * back to the browser's current origin so that all /api/* requests still
 * reach the backend via the reverse-proxy.
 */
export const BACKEND_URL = (
  process.env.REACT_APP_BACKEND_URL || window.location.origin
).replace(/\/$/, '');

export const API = `${BACKEND_URL}/api`;

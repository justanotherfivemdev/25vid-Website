import { BACKEND_URL } from '@/utils/api';

export const WS_BASE = BACKEND_URL.replace(/^http/i, 'ws').replace(/\/$/, '');

export function buildServerWsUrl(path, params = {}) {
  const url = new URL(`${WS_BASE}${path}`);

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    const text = String(value);
    if (!text) return;
    url.searchParams.set(key, text);
  });

  return url.toString();
}

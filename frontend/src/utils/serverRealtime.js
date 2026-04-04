import { BACKEND_URL } from '@/utils/api';

export const WS_BASE = BACKEND_URL.replace(/^http/i, 'ws').replace(/\/$/, '');

function getCookie(name) {
  if (typeof document === 'undefined') return '';
  const prefix = `${name}=`;
  const match = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : '';
}

export function buildServerWsUrl(path, params = {}) {
  const url = new URL(`${WS_BASE}${path}`);
  const authToken = getCookie('auth_token');
  if (authToken) {
    url.searchParams.set('token', authToken);
  }

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    const text = String(value);
    if (!text) return;
    url.searchParams.set(key, text);
  });

  return url.toString();
}

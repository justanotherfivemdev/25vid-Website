const isDev = import.meta.env.DEV;

// In production, API paths are proxied through Nginx to the backend.
// In dev, Vite's dev server proxy handles them (configured in vite.config.mjs).

export function proxyUrl(localPath: string): string {
  // Both dev and production use relative paths — the proxy layer handles routing.
  return localPath;
}

export async function fetchWithProxy(url: string): Promise<Response> {
  return fetch(url);
}

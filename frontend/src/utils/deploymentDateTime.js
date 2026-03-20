const pad = (n) => String(n).padStart(2, '0');

export function toDeploymentInputValue(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return String(isoStr).slice(0, 16);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function toDeploymentApiValue(localDateTime) {
  if (!localDateTime) return null;
  const normalized = String(localDateTime).trim();
  if (!normalized) return null;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return normalized;
  return d.toISOString();
}

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

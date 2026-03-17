const URL_REGEX = /https?:\/\/[^\s)>\]"']+/g;

/**
 * Remove raw URLs from a text string so that feed summaries remain readable.
 * Trailing punctuation left by the removal is also cleaned up.
 */
export function stripUrls(text) {
  if (!text) return text;
  return text
    .replace(URL_REGEX, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Split text into segments of plain text and URL strings.
 * Used to render URLs as clickable <a> tags inside a React component.
 * Returns an array of { type: 'text'|'url', value: string }.
 */
export function parseUrlSegments(text) {
  if (!text) return [];
  const segments = [];
  let lastIndex = 0;
  let match;
  const re = new RegExp(URL_REGEX.source, 'g');
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'url', value: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return segments;
}

export function formatRelativeTime(date) {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function generateEventId() {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export const THREAT_LEVELS = ['critical', 'high', 'medium', 'low', 'info'];

export const EVENT_CATEGORIES = [
  'conflict', 'protest', 'disaster', 'diplomatic', 'economic',
  'terrorism', 'cyber', 'health', 'environmental', 'military',
  'crime', 'piracy', 'infrastructure', 'commodities',
];

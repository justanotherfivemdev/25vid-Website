const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const textOrFallback = (value, fallback = '') => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
};

const resolveAssetUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  if (url.startsWith('/uploads/')) return `${BACKEND_URL}/api${url}`;
  return `${BACKEND_URL}${url}`;
};

const getIconType = (iconHref) => {
  const cleanIcon = iconHref.split('?')[0].toLowerCase();
  if (cleanIcon.endsWith('.svg')) return 'image/svg+xml';
  if (cleanIcon.endsWith('.png')) return 'image/png';
  return 'image/x-icon';
};

export const applyBrowserMetadata = (browserContent = {}, browserDefaults = {}) => {
  const tabTitle = textOrFallback(browserContent.tabTitle, browserDefaults.tabTitle || '');
  if (tabTitle) document.title = tabTitle;

  const tabDescription = textOrFallback(browserContent.tabDescription, browserDefaults.tabDescription || '');
  let metaDescription = document.querySelector('meta[name="description"]');
  if (!metaDescription) {
    metaDescription = document.createElement('meta');
    metaDescription.setAttribute('name', 'description');
    document.head.appendChild(metaDescription);
  }
  metaDescription.setAttribute('content', tabDescription);

  const defaultFavicon = `${process.env.PUBLIC_URL || ''}/favicon.ico`;
  const iconUrl = textOrFallback(browserContent.tabIcon, browserDefaults.tabIcon || '');
  const iconHref = iconUrl ? resolveAssetUrl(iconUrl) : defaultFavicon;
  const iconType = getIconType(iconHref);

  const existing = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');
  if (existing.length === 0) {
    const iconLink = document.createElement('link');
    iconLink.setAttribute('rel', 'icon');
    iconLink.setAttribute('href', iconHref);
    iconLink.setAttribute('type', iconType);
    document.head.appendChild(iconLink);

    const shortcutLink = document.createElement('link');
    shortcutLink.setAttribute('rel', 'shortcut icon');
    shortcutLink.setAttribute('href', iconHref);
    shortcutLink.setAttribute('type', iconType);
    document.head.appendChild(shortcutLink);
    return;
  }

  existing.forEach((link) => {
    link.setAttribute('href', iconHref);
    link.setAttribute('type', iconType);
  });
};

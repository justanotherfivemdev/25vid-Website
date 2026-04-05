const ROOT_PRIORITY = ['config', 'profile', 'workshop'];

export function chooseFileManagerRoot(roots, tab = 'browser', preferredBrowserRoot = 'config') {
  const availableRoots = Array.isArray(roots) ? roots.filter((root) => root?.exists) : [];
  if (!availableRoots.length) return null;

  if (tab === 'profile') {
    return availableRoots.find((root) => root.key === 'profile') || null;
  }

  const preferredKeys = [];
  if (preferredBrowserRoot && preferredBrowserRoot !== 'profile') {
    preferredKeys.push(preferredBrowserRoot);
  }
  preferredKeys.push(...ROOT_PRIORITY);

  for (const key of preferredKeys) {
    const match = availableRoots.find((root) => root.key === key);
    if (match) return match;
  }

  return availableRoots[0] || null;
}

export function shouldConfirmDiscard(editDirty, currentFile, nextFile = null) {
  if (!editDirty || !currentFile) return false;
  if (!nextFile) return true;
  return currentFile.root !== nextFile.root || currentFile.path !== nextFile.path;
}

export function getDiscardMessage(fileName = 'this file', action = 'continue') {
  return `You have unsaved changes in ${fileName}. Discard them and ${action}?`;
}

export function formatFileManagerPath(root, path = '') {
  return `${root}:/${path || ''}`;
}

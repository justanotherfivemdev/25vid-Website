import { describe, expect, it } from 'vitest';
import {
  chooseFileManagerRoot,
  getDiscardMessage,
  shouldConfirmDiscard,
} from './fileManagerUtils';

const roots = [
  { key: 'config', label: 'Configs', exists: true },
  { key: 'profile', label: 'Profile', exists: true },
  { key: 'workshop', label: 'Workshop', exists: true },
];

describe('chooseFileManagerRoot', () => {
  it('prefers the config root for the browser tab', () => {
    expect(chooseFileManagerRoot(roots, 'browser')?.key).toBe('config');
  });

  it('keeps the current browser root when it is still available', () => {
    expect(chooseFileManagerRoot(roots, 'browser', 'workshop')?.key).toBe('workshop');
  });

  it('selects the profile root for the deployed profile tab', () => {
    expect(chooseFileManagerRoot(roots, 'profile')?.key).toBe('profile');
  });

  it('falls back to the next available browser root when config is unavailable', () => {
    expect(chooseFileManagerRoot([
      { key: 'config', exists: false },
      { key: 'profile', exists: true },
      { key: 'workshop', exists: true },
    ], 'browser')?.key).toBe('profile');
  });
});

describe('shouldConfirmDiscard', () => {
  const currentFile = { root: 'config', path: 'server.json' };

  it('does not prompt when there are no unsaved changes', () => {
    expect(shouldConfirmDiscard(false, currentFile)).toBe(false);
  });

  it('does not prompt when reopening the same file', () => {
    expect(shouldConfirmDiscard(true, currentFile, { root: 'config', path: 'server.json' })).toBe(false);
  });

  it('prompts when switching to another file', () => {
    expect(shouldConfirmDiscard(true, currentFile, { root: 'profile', path: 'configs/mod.json' })).toBe(true);
  });

  it('prompts when navigating away without a replacement file', () => {
    expect(shouldConfirmDiscard(true, currentFile)).toBe(true);
  });
});

describe('getDiscardMessage', () => {
  it('includes the filename and action in the confirmation prompt', () => {
    expect(getDiscardMessage('server.json', 'switch roots')).toBe(
      'You have unsaved changes in server.json. Discard them and switch roots?',
    );
  });
});

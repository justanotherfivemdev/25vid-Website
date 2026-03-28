/**
 * usePushToTalk.js
 *
 * Custom hook that manages the push-to-talk key binding system.
 *
 * Responsibilities:
 *  - Load / persist key preference (backend → localStorage fallback)
 *  - Key validation & safety classification (SAFE / CAUTION / HIGH_RISK / BLOCKED)
 *  - Runtime key listener with input-guard logic (no activation while typing)
 *  - Provides `startRecording` / `stopRecording` callbacks via the bound key
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { API } from '@/utils/api';

// ── Key safety classification ──────────────────────────────────────────────

const BLOCKED_CODES = new Set([
  'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight',
]);

const CAUTION_CODES = new Set([
  'CapsLock', 'ShiftLeft', 'ShiftRight',
  'ControlLeft', 'ControlRight',
  'AltLeft', 'AltRight',
  'Tab', 'Escape',
]);

const HIGH_RISK_CODES = new Set([
  'Enter', 'NumpadEnter', 'Space',
  'Backspace', 'Delete',
]);

/**
 * Classify a key code into a safety category.
 * @param {string} code – KeyboardEvent.code
 * @returns {{ category: 'SAFE'|'CAUTION'|'HIGH_RISK'|'BLOCKED', message: string|null }}
 */
export function classifyKey(code) {
  if (!code) return { category: 'BLOCKED', message: 'No key detected.' };

  if (BLOCKED_CODES.has(code)) {
    return {
      category: 'BLOCKED',
      message: 'This key is reserved by the operating system and cannot be used.',
    };
  }
  if (CAUTION_CODES.has(code)) {
    const warnings = {
      CapsLock: 'CapsLock toggles caps state — this may cause unexpected text capitalisation.',
      ShiftLeft: 'Shift is a modifier key and may conflict with keyboard shortcuts.',
      ShiftRight: 'Shift is a modifier key and may conflict with keyboard shortcuts.',
      ControlLeft: 'Ctrl is a modifier key used in many shortcuts (Ctrl+C, Ctrl+V, etc.).',
      ControlRight: 'Ctrl is a modifier key used in many shortcuts (Ctrl+C, Ctrl+V, etc.).',
      AltLeft: 'Alt is a modifier key and may trigger browser menus on some systems.',
      AltRight: 'Alt is a modifier key and may trigger browser menus on some systems.',
      Tab: 'Tab is used for navigation between fields — push-to-talk may interfere.',
      Escape: 'Escape may cancel dialogs or close menus unexpectedly.',
    };
    return { category: 'CAUTION', message: warnings[code] || 'This modifier key may have side-effects.' };
  }
  if (HIGH_RISK_CODES.has(code)) {
    const warnings = {
      Enter: 'Enter triggers form submissions and button clicks — use with caution.',
      NumpadEnter: 'Enter triggers form submissions and button clicks — use with caution.',
      Space: 'Space scrolls the page and activates buttons — use with caution.',
      Backspace: 'Backspace may navigate backwards in some browsers.',
      Delete: 'Delete may inadvertently remove content while push-to-talk is active.',
    };
    return { category: 'HIGH_RISK', message: warnings[code] || 'This key may interfere with normal usage.' };
  }

  return { category: 'SAFE', message: null };
}

/**
 * Convert a KeyboardEvent.code into a human-readable label.
 */
export function keyCodeToLabel(code) {
  if (!code) return '—';
  // Strip "Key" prefix from letter keys  (KeyA → A)
  if (code.startsWith('Key')) return code.slice(3);
  // Strip "Digit" prefix (Digit1 → 1)
  if (code.startsWith('Digit')) return code.slice(5);
  // Numpad keys
  if (code.startsWith('Numpad')) return `Numpad ${code.slice(6)}`;
  // Common special keys
  const map = {
    CapsLock: 'Caps Lock',
    ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift',
    ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl',
    AltLeft: 'Left Alt', AltRight: 'Right Alt',
    Tab: 'Tab', Escape: 'Esc', Space: 'Space',
    Enter: 'Enter', NumpadEnter: 'Numpad Enter',
    Backspace: 'Backspace', Delete: 'Delete',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    MetaLeft: 'Win/Cmd', MetaRight: 'Win/Cmd',
  };
  return map[code] || code;
}

const DEFAULT_KEY = 'CapsLock';
const LS_KEY = 'ptt_key_code';

// ── Hook ────────────────────────────────────────────────────────────────────

/**
 * @param {Object} opts
 * @param {boolean} opts.enabled  – Whether the listener should be active
 * @param {Function} opts.onKeyDown – Called when PTT key is pressed
 * @param {Function} opts.onKeyUp   – Called when PTT key is released
 */
export default function usePushToTalk({ enabled = false, onKeyDown, onKeyUp }) {
  const [pttKey, setPttKey] = useState(() => {
    // Synchronous init from localStorage (fast)
    return localStorage.getItem(LS_KEY) || DEFAULT_KEY;
  });
  const [loading, setLoading] = useState(true);
  const pttKeyRef = useRef(pttKey);

  // Keep ref in sync so event listeners always see the latest value.
  useEffect(() => { pttKeyRef.current = pttKey; }, [pttKey]);

  // ── Load from backend on mount ──────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API}/user/settings`);
        if (!cancelled && res.data?.push_to_talk_key) {
          setPttKey(res.data.push_to_talk_key);
          localStorage.setItem(LS_KEY, res.data.push_to_talk_key);
        }
      } catch {
        // Backend unavailable — keep localStorage / default
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Persist key change ──────────────────────────────────────────────────

  const changeKey = useCallback(async (newCode) => {
    const { category } = classifyKey(newCode);
    if (category === 'BLOCKED') return false;

    setPttKey(newCode);
    localStorage.setItem(LS_KEY, newCode);

    // Fire-and-forget save to backend
    try {
      await axios.put(`${API}/user/settings`, { push_to_talk_key: newCode });
    } catch (err) {
      console.warn('Failed to save PTT key to server — using local storage.', err);
    }
    return true;
  }, []);

  // ── Reset to default ───────────────────────────────────────────────────

  const resetKey = useCallback(() => changeKey(DEFAULT_KEY), [changeKey]);

  // ── Input-guard: skip if user is focused on a text field ───────────────

  const isTyping = useCallback(() => {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.isContentEditable) return true;
    return false;
  }, []);

  // ── Key listeners ─────────────────────────────────────────────────────

  const activeRef = useRef(false);
  const onKeyDownRef = useRef(onKeyDown);
  const onKeyUpRef = useRef(onKeyUp);
  useEffect(() => { onKeyDownRef.current = onKeyDown; }, [onKeyDown]);
  useEffect(() => { onKeyUpRef.current = onKeyUp; }, [onKeyUp]);

  useEffect(() => {
    if (!enabled) return;

    const handleDown = (e) => {
      if (e.code !== pttKeyRef.current) return;
      if (isTyping()) return;
      if (activeRef.current) return; // already held

      e.preventDefault();
      activeRef.current = true;
      onKeyDownRef.current?.();
    };

    const handleUp = (e) => {
      if (e.code !== pttKeyRef.current) return;
      if (!activeRef.current) return;

      e.preventDefault();
      activeRef.current = false;
      onKeyUpRef.current?.();
    };

    window.addEventListener('keydown', handleDown);
    window.addEventListener('keyup', handleUp);
    return () => {
      window.removeEventListener('keydown', handleDown);
      window.removeEventListener('keyup', handleUp);
      activeRef.current = false;
    };
  }, [enabled, isTyping]);

  return {
    pttKey,
    pttKeyLabel: keyCodeToLabel(pttKey),
    loading,
    changeKey,
    resetKey,
    DEFAULT_KEY,
  };
}

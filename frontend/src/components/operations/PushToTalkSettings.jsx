/**
 * PushToTalkSettings.jsx
 *
 * Inline settings panel for choosing the push-to-talk key.
 * Shows a "Press any key…" capture mode, validates the chosen key,
 * and displays appropriate warnings for caution / high-risk keys.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Settings, AlertTriangle, ShieldAlert, ShieldCheck, RotateCcw } from 'lucide-react';
import { classifyKey, keyCodeToLabel } from '@/hooks/usePushToTalk';

export default function PushToTalkSettings({ pttKey, pttKeyLabel, onChangeKey, onReset }) {
  const [open, setOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [pendingCode, setPendingCode] = useState(null);
  const [pendingClassification, setPendingClassification] = useState(null);
  const [saved, setSaved] = useState(false);
  const savedTimerRef = useRef(null);

  // Clean up saved-indicator timer on unmount
  useEffect(() => () => { clearTimeout(savedTimerRef.current); }, []);

  // ── Key capture listener ──────────────────────────────────────────────

  const handleCapture = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();

    const code = e.code;
    const classification = classifyKey(code);

    setPendingCode(code);
    setPendingClassification(classification);
    setCapturing(false);
  }, []);

  useEffect(() => {
    if (!capturing) return;
    window.addEventListener('keydown', handleCapture, true);
    return () => window.removeEventListener('keydown', handleCapture, true);
  }, [capturing, handleCapture]);

  // ── Confirm selection ─────────────────────────────────────────────────

  const confirmSelection = async () => {
    if (!pendingCode || pendingClassification?.category === 'BLOCKED') return;
    const ok = await onChangeKey(pendingCode);
    if (ok) {
      setSaved(true);
      setPendingCode(null);
      setPendingClassification(null);
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
    }
  };

  const cancelSelection = () => {
    setPendingCode(null);
    setPendingClassification(null);
  };

  const handleReset = async () => {
    await onReset();
    setPendingCode(null);
    setPendingClassification(null);
    setSaved(true);
    clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
  };

  // ── Warning badge for classification ──────────────────────────────────

  const ClassBadge = ({ cat }) => {
    if (cat === 'SAFE') return <Badge className="bg-green-600/20 text-green-400 border-green-600/30 text-[9px]"><ShieldCheck className="w-3 h-3 mr-0.5" />Safe</Badge>;
    if (cat === 'CAUTION') return <Badge className="bg-yellow-600/20 text-yellow-400 border-yellow-600/30 text-[9px]"><AlertTriangle className="w-3 h-3 mr-0.5" />Caution</Badge>;
    if (cat === 'HIGH_RISK') return <Badge className="bg-orange-600/20 text-orange-400 border-orange-600/30 text-[9px]"><ShieldAlert className="w-3 h-3 mr-0.5" />High Risk</Badge>;
    if (cat === 'BLOCKED') return <Badge className="bg-red-600/20 text-red-400 border-red-600/30 text-[9px]"><ShieldAlert className="w-3 h-3 mr-0.5" />Blocked</Badge>;
    return null;
  };

  // ── Collapsed view ────────────────────────────────────────────────────

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-[9px] text-gray-500 hover:text-gray-300 transition px-3 py-1"
        title="Push-to-talk key settings"
      >
        <Settings className="w-3 h-3" />
        <span>PTT Key: <strong className="text-gray-300">{pttKeyLabel}</strong></span>
      </button>
    );
  }

  // ── Expanded panel ────────────────────────────────────────────────────

  return (
    <div className="px-3 py-2 border-t border-gray-800 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">
          Push-to-Talk Key
        </span>
        <button
          onClick={() => { setOpen(false); cancelSelection(); }}
          className="text-gray-600 hover:text-gray-400 text-[10px]"
        >
          Close
        </button>
      </div>

      {/* Current key */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-500">Current:</span>
        <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-[10px] text-gray-200 font-mono border border-gray-700">
          {pttKeyLabel}
        </kbd>
        <ClassBadge cat={classifyKey(pttKey).category} />
      </div>

      {/* Capture button */}
      {capturing ? (
        <div className="text-center py-3 bg-[#C9A227]/10 border border-[#C9A227]/30 rounded animate-pulse">
          <p className="text-[11px] text-[#C9A227] font-bold">Press any key…</p>
          <p className="text-[9px] text-gray-500 mt-0.5">Press the key you want to use for push-to-talk</p>
          <Button
            size="sm"
            variant="ghost"
            className="text-gray-500 hover:text-gray-300 h-5 mt-1 text-[9px]"
            onClick={() => { setCapturing(false); }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="w-full border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600 h-7 text-[10px]"
          onClick={() => { setPendingCode(null); setPendingClassification(null); setCapturing(true); }}
        >
          Change Key Binding
        </Button>
      )}

      {/* Pending key result */}
      {pendingCode && pendingClassification && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500">Selected:</span>
            <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-[10px] text-gray-200 font-mono border border-gray-700">
              {keyCodeToLabel(pendingCode)}
            </kbd>
            <ClassBadge cat={pendingClassification.category} />
          </div>

          {/* Warning message */}
          {pendingClassification.message && (
            <div
              className={`text-[9px] px-2 py-1.5 rounded border ${
                pendingClassification.category === 'BLOCKED'
                  ? 'bg-red-900/20 border-red-800/40 text-red-400'
                  : pendingClassification.category === 'HIGH_RISK'
                    ? 'bg-orange-900/20 border-orange-800/40 text-orange-400'
                    : 'bg-yellow-900/20 border-yellow-800/40 text-yellow-400'
              }`}
            >
              {pendingClassification.category === 'BLOCKED' && <ShieldAlert className="w-3 h-3 inline mr-1" />}
              {pendingClassification.category === 'HIGH_RISK' && <AlertTriangle className="w-3 h-3 inline mr-1" />}
              {pendingClassification.category === 'CAUTION' && <AlertTriangle className="w-3 h-3 inline mr-1" />}
              {pendingClassification.message}
            </div>
          )}

          {/* Confirm / Cancel */}
          <div className="flex gap-1.5">
            {pendingClassification.category !== 'BLOCKED' && (
              <Button
                size="sm"
                className="flex-1 bg-[#C9A227] hover:bg-[#B8911F] text-black h-6 text-[10px]"
                onClick={confirmSelection}
              >
                {pendingClassification.category === 'HIGH_RISK' ? 'Use Anyway' : 'Confirm'}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="flex-1 text-gray-500 hover:text-gray-300 h-6 text-[10px]"
              onClick={cancelSelection}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Reset + saved indicator */}
      <div className="flex items-center justify-between">
        <button
          onClick={handleReset}
          className="flex items-center gap-1 text-[9px] text-gray-600 hover:text-gray-400 transition"
        >
          <RotateCcw className="w-3 h-3" /> Reset to Caps Lock
        </button>
        {saved && (
          <span className="text-[9px] text-green-400 animate-in fade-in">✓ Saved</span>
        )}
      </div>
    </div>
  );
}

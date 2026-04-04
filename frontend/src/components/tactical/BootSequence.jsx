import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const BOOT_LINES = [
  { text: 'TROPIC LIGHTNING NETWORK v4.2.1', delay: 0 },
  { text: 'INITIALIZING SECURE CHANNEL...', delay: 300 },
  { text: 'LOADING CRYPTOGRAPHIC MODULES... OK', delay: 600 },
  { text: 'ESTABLISHING ENCRYPTED LINK... OK', delay: 1000 },
  { text: 'AUTHENTICATING TERMINAL ACCESS...', delay: 1400 },
  { text: 'SYSTEM STATUS: ALL SYSTEMS NOMINAL', delay: 1800 },
  { text: '', delay: 2000 },
  { text: '25TH INFANTRY DIVISION — DIGITAL COMMAND CENTER', delay: 2200 },
  { text: 'TROPIC LIGHTNING NETWORK ONLINE', delay: 2600, highlight: true },
];

export function BootSequence({ onComplete, skipIfReturning = true }) {
  const [visible, setVisible] = useState(false);
  const [lines, setLines] = useState([]);
  const [phase, setPhase] = useState('booting');
  const skippedRef = useRef(false);
  const fadeTimerRef = useRef(null);
  const hasCompletedRef = useRef(false);

  useEffect(() => {
    if (skipIfReturning) {
      try {
        const hasVisited = sessionStorage.getItem('25vid_boot_done');
        if (hasVisited) {
          hasCompletedRef.current = true;
          onComplete?.();
          return;
        }
      } catch {
        // sessionStorage unavailable
      }
    }
    setVisible(true);
  }, [skipIfReturning, onComplete]);

  useEffect(() => {
    if (!visible || hasCompletedRef.current) return;
    const timers = BOOT_LINES.map((line) =>
      setTimeout(() => setLines(prev => [...prev, line]), line.delay)
    );
    const completeTimer = setTimeout(() => {
      if (skippedRef.current || hasCompletedRef.current) return;
      try { sessionStorage.setItem('25vid_boot_done', '1'); } catch { /* ignore */ }
      setPhase('done');
      fadeTimerRef.current = setTimeout(() => {
        if (skippedRef.current || hasCompletedRef.current) return;
        hasCompletedRef.current = true;
        setPhase('hidden');
        onComplete?.();
      }, 600);
    }, 3200);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(completeTimer);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, [visible, onComplete]);

  const handleSkip = useCallback(() => {
    if (hasCompletedRef.current) return;
    skippedRef.current = true;
    hasCompletedRef.current = true;
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    setPhase('hidden');
    try { sessionStorage.setItem('25vid_boot_done', '1'); } catch { /* ignore */ }
    onComplete?.();
  }, [onComplete]);

  if (!visible || phase === 'hidden') return null;

  return (
    <AnimatePresence mode="wait">
      {phase !== 'hidden' && (
        <motion.div
          key="boot"
          initial={{ opacity: 1 }}
          animate={{ opacity: phase === 'done' ? 0 : 1 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-[10000] bg-[#050a0e] flex flex-col items-start justify-center px-8 md:px-20"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          <div className="absolute inset-0 pointer-events-none" style={{
            background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)'
          }} />
          <div className="relative z-10 w-full max-w-2xl space-y-1">
            {lines.map((line, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15 }}
                className={`text-xs md:text-sm tracking-wider ${
                  line.highlight ? 'text-[#e8c547] font-bold text-base md:text-lg' : 'text-[#c9a227]'
                }`}
              >
                {line.text && <><span className="text-[#4a6070] mr-2">{'>'}</span>{line.text}</>}
              </motion.div>
            ))}
            {phase === 'booting' && (
              <span className="inline-block w-2 h-4 bg-[#e8c547] animate-[blink_0.8s_steps(1)_infinite]" />
            )}
          </div>
          <button
            onClick={handleSkip}
            className="absolute bottom-8 right-8 text-[10px] tracking-[0.3em] text-[#4a6070] hover:text-[#e8c547] transition-colors uppercase"
          >
            [SKIP]
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

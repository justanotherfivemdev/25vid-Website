import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Reusable terminal-style transition overlay.
 *
 * @param {Object[]} lines  – Array of { text, delay, highlight? } objects.
 * @param {Function} onComplete – Called after the animation finishes and fades out.
 */
export function TerminalTransition({ lines, onComplete }) {
  const [visibleLines, setVisibleLines] = useState([]);
  const [phase, setPhase] = useState('active');
  const hasCompletedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const fadeTimerRef = useRef(null);

  useEffect(() => {
    if (hasCompletedRef.current) return;
    setVisibleLines([]);
    const maxDelay = lines.length === 0 ? 0 : Math.max(...lines.map((l) => l.delay));
    const timers = lines.map((line) =>
      setTimeout(() => setVisibleLines((prev) => [...prev, line]), line.delay),
    );
    const completeTimer = setTimeout(() => {
      if (hasCompletedRef.current) return;
      setPhase('done');
      fadeTimerRef.current = setTimeout(() => {
        if (hasCompletedRef.current) return;
        hasCompletedRef.current = true;
        setPhase('hidden');
        onCompleteRef.current?.();
      }, 500);
    }, maxDelay + 600);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(completeTimer);
      clearTimeout(fadeTimerRef.current);
    };
  }, [lines]);

  if (phase === 'hidden') return null;

  return (
    <AnimatePresence mode="wait">
      {phase !== 'hidden' && (
        <motion.div
          key="terminal-transition"
          initial={{ opacity: 1 }}
          animate={{ opacity: phase === 'done' ? 0 : 1 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-[10000] bg-[#050a0e] flex flex-col items-start justify-center px-8 md:px-20"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
            }}
          />
          <div className="relative z-10 w-full max-w-2xl space-y-1">
            {visibleLines.map((line, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15 }}
                className={`text-xs md:text-sm tracking-wider ${
                  line.highlight
                    ? 'text-[#e8c547] font-bold text-base md:text-lg'
                    : 'text-[#c9a227]'
                }`}
              >
                <span className="text-[#4a6070] mr-2">{'>'}</span>
                {line.text}
              </motion.div>
            ))}
            {phase === 'active' && (
              <span className="inline-block w-2 h-4 bg-[#e8c547] animate-[blink_0.8s_steps(1)_infinite]" />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Pre-built line sets for common transitions. */

export function buildServerConnectLines(serverName) {
  const display = serverName || 'SERVER';
  return [
    { text: 'ESTABLISHING SECURE LINK...', delay: 0 },
    { text: 'ROUTING TO SERVER NODE... OK', delay: 350 },
    { text: `CONNECTING: ${display.toUpperCase()}`, delay: 700 },
    { text: 'LOADING SERVER TELEMETRY... OK', delay: 1100 },
    { text: 'INTERFACE READY', delay: 1500, highlight: true },
  ];
}

export function buildServerProvisionLines(serverName) {
  const display = serverName || 'SERVER';
  return [
    { text: 'PROVISIONING NEW SERVER INSTANCE...', delay: 0 },
    { text: `ALLOCATING RESOURCES: ${display.toUpperCase()}`, delay: 400 },
    { text: 'GENERATING CONFIGURATION... OK', delay: 800 },
    { text: 'INITIALIZING CONTAINER... OK', delay: 1200 },
    { text: 'SERVER ONLINE', delay: 1600, highlight: true },
  ];
}

export function buildThreatMapLines() {
  return [
    { text: 'GLOBAL THREAT ASSESSMENT SYSTEM v2.1', delay: 0 },
    { text: 'CONNECTING TO INTELLIGENCE FEEDS...', delay: 350 },
    { text: 'LOADING SATELLITE IMAGERY... OK', delay: 700 },
    { text: 'SYNCHRONIZING THREAT DATA... OK', delay: 1050 },
    { text: 'RENDERING OPERATIONAL PICTURE... OK', delay: 1400 },
    { text: 'THREAT MAP ONLINE', delay: 1800, highlight: true },
  ];
}

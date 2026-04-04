import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const buildLoginLines = (username) => {
  const display = username || 'OPERATOR';
  const masked = '*'.repeat(Math.max(8, display.length + 2));
  return [
    { text: 'INITIATING SECURE CONNECTION...', delay: 0 },
    { text: 'ROUTING THROUGH ENCRYPTED CHANNEL... OK', delay: 400 },
    { text: `AUTHENTICATING: ${display.toUpperCase()}`, delay: 900 },
    { text: `PASSWORD: ${masked}`, delay: 1300 },
    { text: 'VERIFYING CREDENTIALS... OK', delay: 1800 },
    { text: 'ACCESS GRANTED', delay: 2300, highlight: true },
    { text: 'LOADING COMMAND CENTER...', delay: 2700 },
  ];
};

export function LoginTransition({ username, onComplete }) {
  const [lines, setLines] = useState([]);
  const [phase, setPhase] = useState('active');
  const hasCompletedRef = useRef(false);

  const fadeTimerRef = useRef(null);

  useEffect(() => {
    if (hasCompletedRef.current) return;
    const loginLines = buildLoginLines(username);
    const timers = loginLines.map((line) =>
      setTimeout(() => setLines((prev) => [...prev, line]), line.delay)
    );
    const completeTimer = setTimeout(() => {
      if (hasCompletedRef.current) return;
      setPhase('done');
      fadeTimerRef.current = setTimeout(() => {
        if (hasCompletedRef.current) return;
        hasCompletedRef.current = true;
        setPhase('hidden');
        onComplete?.();
      }, 500);
    }, 3200);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(completeTimer);
      clearTimeout(fadeTimerRef.current);
    };
  }, [username, onComplete]);

  if (phase === 'hidden') return null;

  return (
    <AnimatePresence mode="wait">
      {phase !== 'hidden' && (
        <motion.div
          key="login-transition"
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
            {lines.map((line, idx) => (
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

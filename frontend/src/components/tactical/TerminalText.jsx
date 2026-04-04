import React, { useState, useEffect, useRef } from 'react';
import { useInView } from 'framer-motion';

export function TerminalText({
  text,
  speed = 40,
  delay = 0,
  className = '',
  cursor = true,
  onComplete,
  triggerOnView = true,
  prefix = '> ',
}) {
  const [displayed, setDisplayed] = useState('');
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });

  useEffect(() => {
    if (triggerOnView && !isInView) return;
    const timer = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(timer);
  }, [isInView, delay, triggerOnView]);

  useEffect(() => {
    if (!started || !text) return;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        setDone(true);
        onComplete?.();
      }
    }, speed);
    return () => clearInterval(interval);
  }, [started, text, speed, onComplete]);

  return (
    <span ref={ref} className={`${className}`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
      <span className="text-[#e8c547] opacity-50">{prefix}</span>
      {displayed}
      {cursor && !done && (
        <span className="inline-block w-[2px] h-[1em] bg-[#e8c547] ml-0.5 animate-[blink_1s_steps(1)_infinite] align-middle" />
      )}
    </span>
  );
}

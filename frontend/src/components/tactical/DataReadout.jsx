import React, { useEffect, useState, useRef } from 'react';
import { useInView } from 'framer-motion';

export function DataReadout({
  value,
  label,
  prefix = '',
  suffix = '',
  className = '',
  color = 'green',
  duration = 1.5,
}) {
  const [displayValue, setDisplayValue] = useState(0);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });
  const numericValue = typeof value === 'number' ? value : parseInt(value, 10) || 0;

  useEffect(() => {
    if (!isInView) return;
    const startTime = Date.now();
    const endTime = startTime + duration * 1000;

    const animate = () => {
      const now = Date.now();
      const progress = Math.min((now - startTime) / (duration * 1000), 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(eased * numericValue));
      if (now < endTime) requestAnimationFrame(animate);
      else setDisplayValue(numericValue);
    };
    requestAnimationFrame(animate);
  }, [isInView, numericValue, duration]);

  const colorClass = {
    green: 'text-[#00ff88]',
    gold: 'text-[#e8c547]',
    red: 'text-[#ff3333]',
    blue: 'text-[#00aaff]',
    white: 'text-[#d0d8e0]',
  }[color] || 'text-[#00ff88]';

  return (
    <div ref={ref} className={`data-readout ${className}`}>
      <div className={`text-3xl font-bold ${colorClass}`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
        {prefix}{displayValue.toLocaleString()}{suffix}
      </div>
      {label && (
        <div className="text-[10px] tracking-[0.25em] text-[#4a6070] uppercase mt-1" style={{ fontFamily: "'Oswald', sans-serif" }}>
          {label}
        </div>
      )}
    </div>
  );
}

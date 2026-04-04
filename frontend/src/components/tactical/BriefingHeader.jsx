import React from 'react';

export function BriefingHeader({ title, subtitle, timestamp, className = '' }) {
  return (
    <div className={`mb-8 ${className}`}>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[#00ff88] text-xs">▶</span>
          <span className="text-xs tracking-[0.3em] text-[#00ff88] uppercase" style={{ fontFamily: "'Oswald', sans-serif" }}>
            {title}
          </span>
        </div>
        <div className="flex-1 h-px bg-gradient-to-r from-[rgba(0,255,136,0.3)] to-transparent" />
        {timestamp && (
          <span className="text-[10px] text-[#4a6070] tracking-wider" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {timestamp}
          </span>
        )}
      </div>
      {subtitle && (
        <p className="mt-2 text-sm text-[#4a6070] tracking-wide" style={{ fontFamily: "'Inter', sans-serif" }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

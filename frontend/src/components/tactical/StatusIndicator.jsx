import React from 'react';

export function StatusIndicator({ status = 'online', label = '', className = '' }) {
  const dotClass = {
    online: 'status-dot-online',
    degraded: 'status-dot-degraded',
    critical: 'status-dot-critical',
    offline: 'status-dot-offline',
  }[status] || 'status-dot-online';

  const labelColor = {
    online: 'text-[#e8c547]',
    degraded: 'text-[#ffaa00]',
    critical: 'text-[#ff3333]',
    offline: 'text-[#4a6070]',
  }[status] || 'text-[#e8c547]';

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className={`status-dot ${dotClass}`} />
      {label && (
        <span className={`text-xs tracking-[0.15em] uppercase ${labelColor}`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          {label}
        </span>
      )}
    </span>
  );
}

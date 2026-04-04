import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

export function CommandPanel({
  title,
  children,
  className = '',
  status = 'online',
  badge = null,
  collapsible = false,
  defaultOpen = true,
  icon: Icon = null,
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const statusDotClass = {
    online: 'status-dot-online',
    degraded: 'status-dot-degraded',
    critical: 'status-dot-critical',
    offline: 'status-dot-offline',
  }[status] || 'status-dot-online';

  return (
    <div className={`bg-[#0c1117] border border-[rgba(0,255,136,0.1)] overflow-hidden ${className}`}>
      <div
        className={`flex items-center justify-between px-4 py-2.5 bg-[#080d12] border-b border-[rgba(0,255,136,0.08)] ${collapsible ? 'cursor-pointer select-none' : ''}`}
        onClick={collapsible ? () => setIsOpen(!isOpen) : undefined}
      >
        <div className="flex items-center gap-3">
          <span className={`status-dot ${statusDotClass}`} />
          {Icon && <Icon className="w-4 h-4 text-[#00ff88] opacity-60" />}
          <span className="text-xs tracking-[0.2em] text-[#d0d8e0] uppercase" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {badge && (
            <span className={`text-[9px] tracking-[0.2em] px-2 py-0.5 uppercase ${
              badge === 'LIVE' ? 'text-[#00ff88] bg-[rgba(0,255,136,0.1)] border border-[rgba(0,255,136,0.2)]' :
              'text-[#4a6070] bg-[rgba(74,96,112,0.1)] border border-[rgba(74,96,112,0.2)]'
            }`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {badge}
            </span>
          )}
          {collapsible && (
            <motion.div animate={{ rotate: isOpen ? 0 : -90 }} transition={{ duration: 0.2 }}>
              <ChevronDown className="w-4 h-4 text-[#4a6070]" />
            </motion.div>
          )}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="p-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

import React from 'react';
import { motion } from 'framer-motion';

export function TacticalCard({
  children,
  className = '',
  priority = 'normal',
  hoverable = true,
  delay = 0,
  noBrackets = false,
  ...props
}) {
  const priorityColors = {
    critical: 'border-l-2 border-l-[#ff3333]',
    high: 'border-l-2 border-l-[#ff6600]',
    normal: '',
    low: 'border-l-2 border-l-[#e8c547]',
    info: 'border-l-2 border-l-[#00aaff]',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.4, 0, 0.2, 1] }}
      className={`
        relative bg-[#0c1117] border border-[rgba(201,162,39,0.1)]
        ${hoverable ? 'hover:border-[rgba(201,162,39,0.25)] hover:-translate-y-0.5 hover:shadow-[0_0_25px_rgba(201,162,39,0.06)]' : ''}
        transition-all duration-300
        ${noBrackets ? '' : 'corner-bracket'}
        ${priorityColors[priority] || ''}
        ${className}
      `}
      {...props}
    >
      {children}
    </motion.div>
  );
}

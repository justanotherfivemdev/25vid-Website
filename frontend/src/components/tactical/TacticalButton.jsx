import React from 'react';
import { motion } from 'framer-motion';

export function TacticalButton({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  disabled = false,
  onClick,
  type = 'button',
  ...props
}) {
  const variants = {
    primary: 'border-[#c9a227] text-[#c9a227] bg-transparent hover:bg-[rgba(201,162,39,0.08)] hover:shadow-[0_0_20px_rgba(201,162,39,0.2)] active:bg-[rgba(201,162,39,0.12)]',
    danger: 'border-[#ff3333] text-[#ff3333] bg-transparent hover:bg-[rgba(255,51,51,0.08)] hover:shadow-[0_0_20px_rgba(255,51,51,0.2)] active:bg-[rgba(255,51,51,0.12)]',
    ghost: 'border-[rgba(201,162,39,0.2)] text-[#d0d8e0] bg-transparent hover:border-[rgba(201,162,39,0.4)] hover:text-[#e8c547] active:bg-[rgba(201,162,39,0.05)]',
    terminal: 'border-[#e8c547] text-[#e8c547] bg-transparent hover:bg-[rgba(201,162,39,0.08)] hover:shadow-[0_0_20px_rgba(201,162,39,0.15)] active:bg-[rgba(201,162,39,0.12)]',
    solid: 'border-[#c9a227] text-[#050a0e] bg-[#c9a227] hover:bg-[#e8c547] hover:shadow-[0_0_20px_rgba(201,162,39,0.3)] active:bg-[#a08420]',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-8 py-3.5 text-base',
  };

  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? {} : { scale: 1.02 }}
      whileTap={disabled ? {} : { scale: 0.98 }}
      className={`
        relative inline-flex items-center justify-center gap-2
        border tracking-[0.15em] uppercase
        transition-all duration-300
        disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none
        ${variants[variant] || variants.primary}
        ${sizes[size] || sizes.md}
        ${className}
      `}
      style={{
        clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))',
        fontFamily: "'JetBrains Mono', monospace",
      }}
      {...props}
    >
      {children}
    </motion.button>
  );
}

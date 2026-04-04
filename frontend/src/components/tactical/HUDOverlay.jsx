import React from 'react';

export function HUDOverlay({ classification = 'UNCLASSIFIED', children }) {
  return (
    <div className="relative min-h-screen">
      <div className="classification-banner">
        {classification} // TROPIC LIGHTNING COMMAND • 25TH INFANTRY DIVISION
      </div>
      <div className="scanline-overlay" />
      <div className="crt-vignette" />
      <div className="relative z-10">{children}</div>
      <div className="classification-banner mt-auto">
        {classification} // FOR OFFICIAL USE ONLY
      </div>
    </div>
  );
}

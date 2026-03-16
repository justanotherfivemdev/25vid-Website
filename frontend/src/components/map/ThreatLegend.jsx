import React from 'react';
import { SEVERITY_COLORS } from '@/utils/mapConfig';

const ThreatLegend = () => {
  const items = Object.entries(SEVERITY_COLORS);
  return (
    <div className="bg-black/70 border border-gray-700 rounded p-3 text-xs text-gray-300" data-testid="threat-legend">
      <div className="font-semibold tracking-wider text-gray-100 mb-2">THREAT LEGEND</div>
      <div className="space-y-1">
        {items.map(([severity, color]) => (
          <div key={severity} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="capitalize">{severity}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ThreatLegend;

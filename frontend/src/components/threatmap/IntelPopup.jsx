import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { Radio, ExternalLink } from 'lucide-react';

const CLASSIFICATION_COLORS = {
  routine: 'bg-gray-700/40 text-gray-300',
  priority: 'bg-tropic-gold/15 text-tropic-gold',
  immediate: 'bg-orange-700/15 text-orange-400',
  flash: 'bg-tropic-red/15 text-tropic-red',
};

export default function IntelPopup({ intel }) {
  const clsColor = CLASSIFICATION_COLORS[intel.classification] || CLASSIFICATION_COLORS.routine;

  return (
    <div className="min-w-[220px] max-w-[300px] p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Radio className="h-3.5 w-3.5 text-tropic-red shrink-0" />
          <h3 className="text-sm font-semibold text-tropic-gold line-clamp-2">
            {intel.title}
          </h3>
        </div>
        {intel.classification && (
          <Badge
            variant="outline"
            className={`shrink-0 text-[10px] uppercase tracking-wider border-none ${clsColor}`}
          >
            {intel.classification}
          </Badge>
        )}
      </div>

      {intel.description && (
        <p className="text-xs text-gray-400 mb-2 line-clamp-3">{intel.description}</p>
      )}

      <div className="flex flex-col gap-1 text-xs text-gray-400">
        {intel.region_label && (
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500 text-[10px] uppercase tracking-wider">Region</span>
            <span className="font-mono text-[11px]">{intel.region_label}</span>
          </div>
        )}
        {intel.theater && (
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500 text-[10px] uppercase tracking-wider">Theater</span>
            <span className="font-mono text-[11px]">{intel.theater}</span>
          </div>
        )}
        {intel.severity && (
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500 text-[10px] uppercase tracking-wider">Severity</span>
            <span className="capitalize font-mono text-[11px]">{intel.severity}</span>
          </div>
        )}
      </div>

      <div className="mt-3 pt-2 border-t" style={{ borderColor: 'rgba(255,215,0,0.15)' }}>
        <Link
          to="/hub/intel"
          className="inline-flex items-center gap-1 text-xs text-tropic-gold hover:text-tropic-gold-light transition-colors"
        >
          View Intel Board <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

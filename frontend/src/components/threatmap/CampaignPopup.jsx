import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { Flag, ExternalLink } from 'lucide-react';

const THREAT_LEVEL_COLORS = {
  low: 'bg-[rgba(201,162,39,0.1)] text-[#c9a227]',
  medium: 'bg-tropic-gold/15 text-tropic-gold',
  high: 'bg-orange-700/15 text-orange-400',
  critical: 'bg-tropic-red/15 text-tropic-red',
};

export default function CampaignPopup({ campaign }) {
  const threatColor = THREAT_LEVEL_COLORS[campaign.threat_level] || THREAT_LEVEL_COLORS.medium;

  return (
    <div className="min-w-[220px] max-w-[300px] p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Flag className="h-3.5 w-3.5 shrink-0" style={{ color: '#556B2F' }} />
          <h3 className="text-sm font-semibold text-tropic-gold line-clamp-2">
            {campaign.title}
          </h3>
        </div>
        {campaign.threat_level && (
          <Badge
            variant="outline"
            className={`shrink-0 text-[10px] uppercase tracking-wider border-none ${threatColor}`}
          >
            {campaign.threat_level}
          </Badge>
        )}
      </div>

      {campaign.description && (
        <p className="text-xs text-[#8a9aa8] mb-2 line-clamp-3">{campaign.description}</p>
      )}

      <div className="flex flex-col gap-1 text-xs text-[#8a9aa8]">
        {campaign.theater && (
          <div className="flex items-center gap-1.5">
            <span className="text-[#4a6070] text-[10px] uppercase tracking-wider">Theater</span>
            <span className="font-mono text-[11px]">{campaign.theater}</span>
          </div>
        )}
        {campaign.status && (
          <div className="flex items-center gap-1.5">
            <span className="text-[#4a6070] text-[10px] uppercase tracking-wider">Status</span>
            <span className="capitalize font-mono text-[11px]">{campaign.status}</span>
          </div>
        )}
      </div>

      <div className="mt-3 pt-2 border-t" style={{ borderColor: 'rgba(255,215,0,0.15)' }}>
        <Link
          to={campaign.related_entity_id ? `/hub/campaign?id=${campaign.related_entity_id}` : '/hub/campaign'}
          className="inline-flex items-center gap-1 text-xs text-tropic-gold hover:text-tropic-gold-light transition-colors"
        >
          View Campaign <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

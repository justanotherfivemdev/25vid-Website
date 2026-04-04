import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { Calendar, Users, ExternalLink, Map } from 'lucide-react';

export default function OperationPopup({ operation }) {
  const stateColors = {
    planned: 'bg-tropic-gold/15 text-tropic-gold',
    ongoing: 'bg-green-500/15 text-green-400',
    completed: 'bg-gray-500/15 text-[#8a9aa8]',
  };

  return (
    <div className="min-w-[220px] max-w-[300px] p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-tropic-gold line-clamp-2 tracking-wide">
          {operation.title}
        </h3>
        <Badge
          variant="outline"
          className={`shrink-0 text-[10px] capitalize border-none tracking-wider ${stateColors[operation.activity_state] || stateColors.planned}`}
        >
          {operation.activity_state}
        </Badge>
      </div>

      <div className="flex flex-col gap-1.5 text-xs text-[#8a9aa8]">
        {operation.operation_type && (
          <div className="flex items-center gap-1.5">
            <span className="text-[#4a6070] text-[10px] uppercase tracking-wider">Type</span>
            <span className="capitalize font-mono text-[11px]">{operation.operation_type}</span>
          </div>
        )}
        {operation.date && (
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3 w-3 text-[#4a6070]" />
            <span className="font-mono text-[11px]">{operation.date}</span>
          </div>
        )}
        {operation.max_participants > 0 && (
          <div className="flex items-center gap-1.5">
            <Users className="h-3 w-3 text-[#4a6070]" />
            <span className="text-[11px]">Max {operation.max_participants} participants</span>
          </div>
        )}
      </div>

      <div className="mt-3 pt-2 border-t flex flex-col gap-1.5" style={{ borderColor: 'rgba(255,215,0,0.15)' }}>
        <Link
          to={`/hub/operations/${operation.id}`}
          className="inline-flex items-center gap-1 text-xs text-tropic-gold hover:text-tropic-gold-light transition-colors"
        >
          View Details <ExternalLink className="h-3 w-3" />
        </Link>
        {operation.linked_plan_id && (
          <Link
            to={`/hub/plan/${operation.linked_plan_id}`}
            className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            <Map className="h-3 w-3" /> View Operations Plan
          </Link>
        )}
      </div>
    </div>
  );
}

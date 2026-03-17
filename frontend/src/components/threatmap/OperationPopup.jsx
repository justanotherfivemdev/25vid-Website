import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { MapPin, Calendar, Users, ExternalLink } from 'lucide-react';

export default function OperationPopup({ operation }) {
  const stateColors = {
    planned: 'bg-tropic-gold/20 text-tropic-gold',
    ongoing: 'bg-green-500/20 text-green-400',
    completed: 'bg-gray-500/20 text-gray-400',
  };

  return (
    <div className="min-w-[220px] max-w-[300px] p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-tropic-gold line-clamp-2">
          {operation.title}
        </h3>
        <Badge
          variant="outline"
          className={`shrink-0 text-xs capitalize border-none ${stateColors[operation.activity_state] || stateColors.planned}`}
        >
          {operation.activity_state}
        </Badge>
      </div>

      <div className="flex flex-col gap-1.5 text-xs text-gray-300">
        {operation.operation_type && (
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">Type:</span>
            <span className="capitalize">{operation.operation_type}</span>
          </div>
        )}
        {operation.date && (
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3 w-3 text-gray-500" />
            <span>{operation.date}</span>
          </div>
        )}
        {operation.max_participants > 0 && (
          <div className="flex items-center gap-1.5">
            <Users className="h-3 w-3 text-gray-500" />
            <span>Max {operation.max_participants} participants</span>
          </div>
        )}
      </div>

      <div className="mt-3 pt-2 border-t border-gray-700">
        <Link
          to={`/hub/operations/${operation.id}`}
          className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          View Details & RSVP <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

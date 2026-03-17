import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import { formatRelativeTime, stripUrls, parseUrlSegments } from '@/utils/threatMapUtils';

function LinkifiedText({ text }) {
  const segments = parseUrlSegments(text);
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'url' ? (
          <a
            key={i}
            href={seg.value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 underline break-all hover:text-blue-300"
          >
            {seg.value}
          </a>
        ) : (
          <span key={i}>{seg.value}</span>
        )
      )}
    </>
  );
}

export default function EventPopup({ event }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className={`min-w-[250px] p-3 ${isExpanded ? 'max-w-[500px]' : 'max-w-[300px]'}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-white line-clamp-2">
          {event.sourceUrl ? (
            <a
              href={event.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white hover:underline flex items-center gap-1"
            >
              {event.title}
            </a>
          ) : (
            event.title
          )}
        </h3>
        <Badge
          variant="outline"
          className={`shrink-0 text-xs capitalize border-none ${
            event.threatLevel === 'critical' ? 'bg-red-500/20 text-red-400' :
            event.threatLevel === 'high' ? 'bg-orange-500/20 text-orange-400' :
            event.threatLevel === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
            event.threatLevel === 'low' ? 'bg-green-500/20 text-green-400' :
            'bg-blue-500/20 text-blue-400'
          }`}
        >
          {event.threatLevel}
        </Badge>
      </div>

      {!isExpanded ? (
        <div className="mb-2 text-xs text-gray-300 line-clamp-3 break-words">
          {stripUrls(event.summary)}
        </div>
      ) : (
        <div className="mb-2 max-h-[400px] overflow-y-auto rounded-md bg-gray-800/50 p-3">
          <div className="text-xs text-gray-200 whitespace-pre-wrap break-words">
            <LinkifiedText text={event.rawContent || event.summary} />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-gray-400">
        <MapPin className="h-3 w-3" />
        <span>{event.location?.placeName || event.location?.country || 'Unknown'}</span>
      </div>

      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-gray-400">{formatRelativeTime(event.timestamp)}</span>
        <div className="flex items-center gap-2">
          {event.rawContent && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors"
            >
              {isExpanded ? (
                <><ChevronUp className="h-3 w-3" /> Collapse</>
              ) : (
                <><ChevronDown className="h-3 w-3" /> Expand</>
              )}
            </button>
          )}
          {event.sourceUrl && (
            <a
              href={event.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-blue-400 hover:underline"
            >
              Source <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        <Badge variant="outline" className="text-xs capitalize text-gray-300 border-gray-600">
          {event.category}
        </Badge>
        {(event.keywords || []).slice(0, 2).map((keyword) => (
          <Badge key={keyword} variant="secondary" className="text-xs bg-gray-700 text-gray-300">
            {keyword}
          </Badge>
        ))}
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, MapPin, ChevronDown, ChevronUp, Edit3, Save, X } from 'lucide-react';
import { formatRelativeTime, stripUrls, parseUrlSegments } from '@/utils/threatMapUtils';
import axios from 'axios';
import { API } from '@/utils/api';

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
            className="text-tropic-gold underline break-all hover:text-tropic-gold-light"
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

const CREDIBILITY_OPTIONS = [
  { value: 'confirmed', label: 'Confirmed', color: 'text-green-400' },
  { value: 'probable', label: 'Probable', color: 'text-yellow-400' },
  { value: 'possible', label: 'Possible', color: 'text-orange-400' },
  { value: 'doubtful', label: 'Doubtful', color: 'text-red-400' },
];

export default function EventPopup({ event, isAdmin = false }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDescription, setEditDescription] = useState(event.admin_description || event.summary || '');
  const [editSource, setEditSource] = useState(event.admin_source || 'Internal Intelligence');
  const [editCredibility, setEditCredibility] = useState(event.credibility || 'probable');
  const [saving, setSaving] = useState(false);
  // Local state for saved overrides (avoids mutating props)
  const [savedOverrides, setSavedOverrides] = useState({
    summary: event.admin_description || event.summary,
    source: event.admin_source || event.source,
    credibility: event.credibility,
  });

  // Reset state when the event changes (popup reused without unmounting)
  useEffect(() => {
    setIsExpanded(false);
    setIsEditing(false);
    setEditDescription(event.admin_description || event.summary || '');
    setEditSource(event.admin_source || 'Internal Intelligence');
    setEditCredibility(event.credibility || 'probable');
    setSaving(false);
    setSavedOverrides({
      summary: event.admin_description || event.summary,
      source: event.admin_source || event.source,
      credibility: event.credibility,
    });
  }, [event.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveOverride = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/admin/events/${event.id}/override`, {
        admin_description: editDescription,
        admin_source: editSource,
        credibility: editCredibility,
      }, { withCredentials: true });
      setSavedOverrides({
        summary: editDescription,
        source: editSource,
        credibility: editCredibility,
      });
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to save admin override:', err);
    } finally {
      setSaving(false);
    }
  };

  const displaySummary = savedOverrides.summary || event.summary;
  const displaySource = savedOverrides.source || event.source || 'unknown';
  const displayCredibility = savedOverrides.credibility || event.credibility;

  return (
    <div className={`p-3 ${isExpanded || isEditing ? 'sm:max-w-[500px]' : 'sm:max-w-[300px]'}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-white line-clamp-2">
          {event.sourceUrl && !isEditing ? (
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
        <div className="flex items-center gap-1">
          <Badge
            variant="outline"
            className={`shrink-0 text-xs capitalize border-none ${
              event.threatLevel === 'critical' ? 'bg-red-500/20 text-red-400' :
              event.threatLevel === 'high' ? 'bg-orange-500/20 text-orange-400' :
              event.threatLevel === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
              event.threatLevel === 'low' ? 'bg-green-500/20 text-green-400' :
              'bg-slate-500/20 text-slate-400'
            }`}
          >
            {event.threatLevel}
          </Badge>
        </div>
      </div>

      {/* Admin editing mode */}
      {isEditing && isAdmin ? (
        <div className="mb-2 space-y-2">
          <div>
            <label className="text-[10px] text-tropic-gold-dark font-medium uppercase tracking-wider">Description Override</label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="w-full mt-1 p-2 text-xs bg-black/60 border border-tropic-gold-dark/30 rounded text-gray-200 resize-y min-h-[60px] focus:border-tropic-gold/50 focus:outline-none"
              rows={3}
            />
          </div>
          <div>
            <label className="text-[10px] text-tropic-gold-dark font-medium uppercase tracking-wider">Source Attribution</label>
            <input
              value={editSource}
              onChange={(e) => setEditSource(e.target.value)}
              className="w-full mt-1 p-1.5 text-xs bg-black/60 border border-tropic-gold-dark/30 rounded text-gray-200 focus:border-tropic-gold/50 focus:outline-none"
              placeholder="e.g. Internal Intelligence"
            />
          </div>
          <div>
            <label className="text-[10px] text-tropic-gold-dark font-medium uppercase tracking-wider">Credibility</label>
            <div className="flex gap-1 mt-1">
              {CREDIBILITY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setEditCredibility(opt.value)}
                  className={`flex-1 text-[9px] py-1 rounded font-medium transition-all ${
                    editCredibility === opt.value
                      ? `bg-tropic-gold/20 ${opt.color} border border-tropic-gold/40`
                      : 'text-gray-500 border border-transparent hover:border-gray-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSaveOverride}
              disabled={saving}
              className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-tropic-gold/20 text-tropic-gold border border-tropic-gold/40 hover:bg-tropic-gold/30 transition-colors disabled:opacity-50"
            >
              <Save className="h-3 w-3" /> {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="flex items-center gap-1 px-2 py-1 text-[10px] rounded text-gray-400 border border-gray-700 hover:text-gray-200 transition-colors"
            >
              <X className="h-3 w-3" /> Cancel
            </button>
          </div>
        </div>
      ) : !isExpanded ? (
        <div className="mb-2 text-xs text-gray-300 line-clamp-3 break-words">
          {stripUrls(displaySummary)}
        </div>
      ) : (
        <div className="mb-2 max-h-[400px] overflow-y-auto rounded-md p-3" style={{ background: 'rgba(14,20,32,0.6)' }}>
          <div className="text-xs text-gray-200 whitespace-pre-wrap break-words">
            <LinkifiedText text={event.rawContent || displaySummary} />
          </div>
        </div>
      )}

      {/* Credibility badge */}
      {displayCredibility && !isEditing && (
        <div className="mb-1.5">
          <Badge variant="outline" className={`text-[9px] border-none ${
            displayCredibility === 'confirmed' ? 'bg-green-500/15 text-green-400' :
            displayCredibility === 'probable' ? 'bg-yellow-500/15 text-yellow-400' :
            displayCredibility === 'possible' ? 'bg-orange-500/15 text-orange-400' :
            'bg-red-500/15 text-red-400'
          }`}>
            {displayCredibility.charAt(0).toUpperCase() + displayCredibility.slice(1)}
          </Badge>
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-gray-400">
        <MapPin className="h-3 w-3" />
        <span>{event.location?.placeName || event.location?.country || 'Unknown'}</span>
      </div>

      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-gray-400">{formatRelativeTime(event.timestamp)}</span>
        <div className="flex items-center gap-2">
          {isAdmin && !isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-1 text-tropic-gold/60 hover:text-tropic-gold transition-colors"
              title="Edit intel"
            >
              <Edit3 className="h-3 w-3" />
            </button>
          )}
          {event.rawContent && !isEditing && (
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
          {event.sourceUrl && !isEditing && (
            <a
              href={event.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-tropic-gold/80 hover:text-tropic-gold transition-colors"
            >
              Source <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        <Badge variant="outline" className="text-[10px] capitalize text-gray-300 border-gray-700/60">
          {event.category}
        </Badge>
        {isAdmin && displaySource !== 'unknown' && (
          <Badge variant="outline" className="text-[10px] text-tropic-gold-dark border-tropic-gold-dark/30">
            {displaySource}
          </Badge>
        )}
        {(event.keywords || []).slice(0, 2).map((keyword) => (
          <Badge key={keyword} variant="secondary" className="text-[10px] bg-gray-800/60 text-gray-400">
            {keyword}
          </Badge>
        ))}
      </div>
    </div>
  );
}

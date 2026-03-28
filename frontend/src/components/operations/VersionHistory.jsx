/**
 * VersionHistory.jsx
 *
 * Displays the version history (event log) for an operations plan.
 * Allows staff users to rollback to a previous version.
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API } from '@/utils/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  History, RotateCcw, ChevronDown, ChevronUp, Clock, User,
} from 'lucide-react';

const EVENT_LABELS = {
  UNIT_CREATE: { label: 'Unit Created', color: 'text-green-400' },
  UNIT_MOVE: { label: 'Unit Moved', color: 'text-blue-400' },
  UNIT_UPDATE: { label: 'Unit Updated', color: 'text-yellow-400' },
  UNIT_DELETE: { label: 'Unit Deleted', color: 'text-red-400' },
  PLAN_METADATA_UPDATE: { label: 'Plan Updated', color: 'text-gray-400' },
};

export default function VersionHistory({ planId, canRollback = false, onRollback }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [rolling, setRolling] = useState(false);

  const fetchVersions = useCallback(async () => {
    if (!planId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/operations-events/${planId}/versions`);
      setVersions(res.data || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    if (expanded) fetchVersions();
  }, [expanded, fetchVersions]);

  const handleRollback = async (version) => {
    if (!window.confirm(`Rollback plan to version ${version}? This will remove all changes after that point.`)) return;
    setRolling(true);
    try {
      await axios.post(`${API}/operations-events/${planId}/rollback?target_version=${version}`);
      if (onRollback) onRollback(version);
      fetchVersions();
    } catch (err) {
      alert(err.response?.data?.detail || 'Rollback failed');
    } finally {
      setRolling(false);
    }
  };

  return (
    <div className="border-t border-gray-800">
      <button
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-gray-800/30 transition"
        onClick={() => setExpanded(!expanded)}
      >
        <History className="w-3.5 h-3.5 text-gray-500" />
        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold flex-1">
          Version History
        </span>
        {expanded ? (
          <ChevronUp className="w-3 h-3 text-gray-600" />
        ) : (
          <ChevronDown className="w-3 h-3 text-gray-600" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-1 max-h-60 overflow-y-auto">
          {loading ? (
            <p className="text-[10px] text-gray-600 text-center py-2">Loading…</p>
          ) : versions.length === 0 ? (
            <p className="text-[10px] text-gray-600 text-center py-2">No version history</p>
          ) : (
            versions.slice().reverse().slice(0, 50).map((v) => {
              const cfg = EVENT_LABELS[v.event_type] || EVENT_LABELS.PLAN_METADATA_UPDATE;
              return (
                <div
                  key={v.id}
                  className="flex items-center gap-2 text-[10px] py-1 px-1 rounded hover:bg-gray-800/30"
                >
                  <span className="text-gray-600 font-mono w-6 text-right shrink-0">
                    v{v.version}
                  </span>
                  <span className={`${cfg.color} truncate flex-1`}>
                    {cfg.label}
                  </span>
                  <span className="text-gray-600 shrink-0">{v.username || '?'}</span>
                  <span className="text-gray-700 shrink-0">
                    {v.timestamp ? new Date(v.timestamp).toLocaleTimeString() : ''}
                  </span>
                  {canRollback && (
                    <button
                      className="text-gray-600 hover:text-[#C9A227] transition"
                      onClick={() => handleRollback(v.version)}
                      disabled={rolling}
                      title={`Rollback to v${v.version}`}
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

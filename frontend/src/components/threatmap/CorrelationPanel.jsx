import React, { useMemo, useState } from 'react';
import { useEventsStore } from '@/stores/threatMapStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Zap, ChevronRight, ChevronLeft,
  TrendingUp, AlertTriangle, Radio,
} from 'lucide-react';

/**
 * Worldmonitor-inspired correlation signal detection.
 * Analyzes event clusters to find convergence, velocity spikes,
 * and region-level correlations.
 */

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

function detectSignals(events) {
  if (!events.length) return [];
  const signals = [];
  const now = Date.now();

  // Region clustering - group events by country
  const regionCounts = {};
  const recentEvents = events.filter(e => {
    const t = new Date(e.timestamp).getTime();
    return now - t < TWENTY_FOUR_HOURS_MS;
  });

  recentEvents.forEach(e => {
    const region = e.location?.country || 'Unknown';
    if (!regionCounts[region]) regionCounts[region] = [];
    regionCounts[region].push(e);
  });

  // Convergence: 3+ events from different sources in same region within 24h
  Object.entries(regionCounts).forEach(([region, evts]) => {
    if (evts.length >= 3) {
      const sources = new Set(evts.map(e => e.source || 'unknown'));
      if (sources.size >= 2) {
        const maxThreat = evts.reduce((max, e) => {
          const p = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
          return (p[e.threatLevel] || 0) > (p[max] || 0) ? e.threatLevel : max;
        }, 'info');
        signals.push({
          type: 'convergence',
          icon: Radio,
          label: `Convergence: ${region}`,
          description: `${evts.length} events from ${sources.size} sources in ${region}`,
          confidence: Math.min(0.95, 0.5 + sources.size * 0.1 + evts.length * 0.05),
          severity: maxThreat,
          region,
        });
      }
    }
  });

  // Velocity spike: category with 5+ events in 6h
  const catCounts = {};
  const recentSixH = events.filter(e => {
    const t = new Date(e.timestamp).getTime();
    return now - t < SIX_HOURS_MS;
  });
  recentSixH.forEach(e => {
    const cat = e.category || 'unknown';
    catCounts[cat] = (catCounts[cat] || 0) + 1;
  });

  Object.entries(catCounts).forEach(([cat, count]) => {
    if (count >= 5) {
      signals.push({
        type: 'velocity',
        icon: TrendingUp,
        label: `Velocity Spike: ${cat}`,
        description: `${count} ${cat} events in the last 6 hours`,
        confidence: Math.min(0.9, 0.4 + count * 0.08),
        severity: count >= 10 ? 'critical' : count >= 7 ? 'high' : 'medium',
        region: null,
      });
    }
  });

  // Critical mass: 2+ critical events anywhere
  const criticals = events.filter(e => e.threatLevel === 'critical');
  if (criticals.length >= 2) {
    signals.push({
      type: 'critical_mass',
      icon: AlertTriangle,
      label: 'Critical Mass Alert',
      description: `${criticals.length} critical-level events active`,
      confidence: 0.85,
      severity: 'critical',
      region: null,
    });
  }

  return signals.sort((a, b) => b.confidence - a.confidence).slice(0, 6);
}

const severityColor = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
  info: '#94a3b8',
};

export default function CorrelationPanel() {
  const { filteredEvents } = useEventsStore();
  const [isCollapsed, setIsCollapsed] = useState(true);

  const signals = useMemo(() => detectSignals(filteredEvents), [filteredEvents]);

  if (signals.length === 0) return null;

  if (isCollapsed) {
    return (
      <div className="absolute top-16 right-3 z-20">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-lg border bg-black/90 backdrop-blur-md relative"
          style={{ borderColor: 'rgba(255,215,0,0.4)', color: '#FFD700' }}
          onClick={() => setIsCollapsed(false)}
          title={`${signals.length} correlation signals`}
        >
          <Zap className="h-4 w-4" />
          {signals.length > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-[8px] font-bold text-white flex items-center justify-center">
              {signals.length}
            </span>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div
      className="absolute top-16 right-3 z-20 w-64 rounded-lg border shadow-xl overflow-hidden"
      style={{
        borderColor: 'rgba(255,215,0,0.3)',
        background: 'rgba(5,10,20,0.95)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b"
        style={{ borderColor: 'rgba(255,215,0,0.2)' }}
      >
        <div className="flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-tropic-gold" />
          <span className="text-[11px] font-bold tracking-wider uppercase text-tropic-gold">
            Signals
          </span>
          <Badge variant="outline" className="text-[9px] border-tropic-gold/30 text-tropic-gold ml-1">
            {signals.length}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-gray-500 hover:text-tropic-gold"
          onClick={() => setIsCollapsed(true)}
        >
          <ChevronRight className="h-3 w-3" />
        </Button>
      </div>

      <div className="max-h-64 overflow-y-auto">
        {signals.map((signal, i) => {
          const Icon = signal.icon;
          return (
            <div
              key={i}
              className="px-3 py-2 border-b hover:bg-white/5 transition-colors"
              style={{ borderColor: 'rgba(255,255,255,0.05)' }}
            >
              <div className="flex items-start gap-2">
                <div
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded"
                  style={{
                    background: `${severityColor[signal.severity] || '#94a3b8'}15`,
                    border: `1px solid ${severityColor[signal.severity] || '#94a3b8'}40`,
                  }}
                >
                  <Icon className="h-3 w-3" style={{ color: severityColor[signal.severity] }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-medium text-gray-200 truncate">
                      {signal.label}
                    </span>
                    <span
                      className="text-[8px] font-mono shrink-0"
                      style={{ color: severityColor[signal.severity] }}
                    >
                      {Math.round(signal.confidence * 100)}%
                    </span>
                  </div>
                  <p className="text-[9px] text-gray-500 mt-0.5">{signal.description}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-3 py-1.5 border-t text-center" style={{ borderColor: 'rgba(255,215,0,0.15)' }}>
        <span className="text-[8px] text-gray-600 uppercase tracking-wider">
          Heuristic signal detection
        </span>
      </div>
    </div>
  );
}

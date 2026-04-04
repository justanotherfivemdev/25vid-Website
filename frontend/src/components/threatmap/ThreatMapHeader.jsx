import React from 'react';
import { useEventsStore, useMapStore } from '@/stores/threatMapStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Activity, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import MapViewToggle from './MapViewToggle';
import CorrelationPanel from './CorrelationPanel';

export default function ThreatMapHeader({ onRefresh, isLoading, mapStatus, isAdmin = false }) {
  const { filteredEvents } = useEventsStore();
  const { dataSourceFilter } = useMapStore();

  const threatCounts = filteredEvents.reduce((acc, event) => {
    acc[event.threatLevel] = (acc[event.threatLevel] || 0) + 1;
    return acc;
  }, {});

  return (
    <header className="relative flex h-14 items-center justify-between border-b px-4"
      style={{
        background: 'rgba(5,10,20,0.98)',
        borderColor: 'rgba(255,215,0,0.35)',
        borderBottom: '1px solid rgba(255,215,0,0.35)',
      }}
    >
      <div className="flex items-center gap-3">
        <Link
          to="/hub"
          className="flex items-center gap-1 transition-colors mr-1"
          style={{ color: 'rgba(255,215,0,0.6)' }}
          title="Back to Hub"
          onMouseEnter={(e) => e.currentTarget.style.color = '#e8c547'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,215,0,0.6)'}
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>

        {/* 25th ID Branding */}
        <div className="flex items-center gap-2.5">
          {/* Tropic Lightning bolt badge */}
          <div
            className="flex items-center justify-center rounded-sm border"
            style={{
              width: 28,
              height: 28,
              background: 'rgba(255,215,0,0.12)',
              borderColor: 'rgba(255,215,0,0.4)',
            }}
          >
            <svg width="14" height="18" viewBox="0 0 14 18" fill="none" aria-label="Tropic Lightning bolt">
              <title>Tropic Lightning — 25th Infantry Division</title>
              <polygon points="8,0 2,10 7,10 6,18 12,8 7,8" fill="#e8c547" />
            </svg>
          </div>
          <div className="flex flex-col leading-none">
            <span
              className="text-[10px] font-black tracking-[0.22em] uppercase"
              style={{ color: 'rgba(255,215,0,0.7)' }}
            >
              25th Infantry Division
            </span>
            <span
              className="text-[13px] font-black tracking-[0.08em] uppercase"
              style={{ color: '#e8c547' }}
            >
              Global Threat Map
            </span>
          </div>
        </div>

        <Badge
          variant="outline"
          className="hidden md:flex border-[rgba(201,162,39,0.3)] text-[#e8c547] bg-[rgba(201,162,39,0.1)] gap-1"
        >
          <Activity className="h-3 w-3" />
          <span className="text-[10px] font-bold tracking-wider">LIVE</span>
        </Badge>
      </div>

      {/* Center — map toggle + tagline */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-3">
        <MapViewToggle />
        <div className="text-[11px] text-[#4a6070] hidden lg:flex items-center gap-1.5">
          <span>Intelligence powered by</span>
          <a
            href="https://www.valyu.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold hover:underline"
            style={{ color: '#e8c547' }}
          >
            Valyu
          </a>
          <span className="text-[#4a6070]">+ Community</span>
        </div>
      </div>

      {/* Right – threat counts + refresh */}
      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 md:flex">
          {threatCounts.critical > 0 && (
            <Badge variant="outline" className="border-red-500/50 text-red-400 bg-red-500/10 text-[10px]">
              {threatCounts.critical} Critical
            </Badge>
          )}
          {threatCounts.high > 0 && (
            <Badge variant="outline" className="border-orange-500/50 text-orange-400 bg-orange-500/10 text-[10px]">
              {threatCounts.high} High
            </Badge>
          )}
          <Badge
            variant="outline"
            className="text-[10px]"
            style={{
              borderColor: 'rgba(255,215,0,0.4)',
              color: '#e8c547',
              background: 'rgba(255,215,0,0.06)',
            }}
          >
            {filteredEvents.length} Events
          </Badge>
          {dataSourceFilter !== 'all' && (
            <Badge
              variant="outline"
              className="text-[10px]"
              style={{
                borderColor: dataSourceFilter === 'fictional' ? 'rgba(139,92,246,0.4)' : 'rgba(34,197,94,0.4)',
                color: dataSourceFilter === 'fictional' ? '#a78bfa' : '#e8c547',
                background: dataSourceFilter === 'fictional' ? 'rgba(139,92,246,0.06)' : 'rgba(34,197,94,0.06)',
              }}
            >
              {dataSourceFilter === 'fictional' ? 'Fictional' : 'Real-World'}
            </Badge>
          )}
          {mapStatus?.error && (
            <Badge
              variant="outline"
              className="text-[10px] border-red-500/40 text-red-300 bg-red-500/10"
              title={isAdmin ? mapStatus.error : 'Map rendering issue'}
            >
              Map degraded
            </Badge>
          )}
        </div>

        <div className="relative flex items-center gap-2">
          <CorrelationPanel docked />
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={isLoading}
            title="Refresh events"
            className="hover:bg-tropic-gold/10"
            style={{ color: 'rgba(255,215,0,0.7)' }}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>
    </header>
  );
}

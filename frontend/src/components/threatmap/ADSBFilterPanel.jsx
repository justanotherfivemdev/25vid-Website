import React, { useState } from 'react';
import { useMapStore } from '@/stores/threatMapStore';
import { ChevronDown, ChevronUp, Filter, RotateCcw, Plane } from 'lucide-react';

export default function ADSBFilterPanel({ countries = [], aircraftCount = 0 }) {
  const { adsbFilters, setAdsbFilter, resetAdsbFilters } = useMapStore();
  const [expanded, setExpanded] = useState(false);

  const hasActiveFilters =
    adsbFilters.originCountry ||
    adsbFilters.altitudeMin != null ||
    adsbFilters.altitudeMax != null ||
    !adsbFilters.showOnGround ||
    adsbFilters.callsignSearch;

  return (
    <div className="absolute bottom-4 left-16 md:left-20 z-10 w-64">
      {/* Toggle header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-t-lg text-xs font-semibold transition-all ${
          expanded ? 'rounded-b-none' : 'rounded-b-lg'
        } ${
          hasActiveFilters
            ? 'bg-cyan-900/90 text-cyan-300 border border-cyan-500/40'
            : 'bg-[#050a0e]/85 text-[#8a9aa8] border border-[rgba(201,162,39,0.15)]/50'
        } backdrop-blur-md shadow-lg`}
      >
        <span className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5" />
          ADS-B Filters
          {hasActiveFilters && (
            <span className="ml-1 px-1.5 py-0.5 rounded bg-cyan-600/30 text-cyan-200 text-[10px]">
              Active
            </span>
          )}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="flex items-center gap-1 text-[10px] text-[#8a9aa8]">
            <Plane className="h-3 w-3" />
            {aircraftCount}
          </span>
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </span>
      </button>

      {/* Filter panel body */}
      {expanded && (
        <div className="bg-[#050a0e]/90 backdrop-blur-md border border-t-0 border-[rgba(201,162,39,0.15)]/50 rounded-b-lg p-3 space-y-3 shadow-lg">
          {/* Callsign search */}
          <div>
            <label className="text-[10px] text-[#8a9aa8] uppercase tracking-wider font-semibold">
              Callsign
            </label>
            <input
              type="text"
              value={adsbFilters.callsignSearch}
              onChange={(e) => setAdsbFilter('callsignSearch', e.target.value)}
              placeholder="Search callsign..."
              className="mt-1 w-full px-2 py-1.5 rounded bg-[#111a24]/80 border border-[rgba(201,162,39,0.15)]/50 text-xs text-[#d0d8e0] placeholder-[#4a6070] focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
            />
          </div>

          {/* Origin country dropdown */}
          <div>
            <label className="text-[10px] text-[#8a9aa8] uppercase tracking-wider font-semibold">
              Origin Country
            </label>
            <select
              value={adsbFilters.originCountry}
              onChange={(e) => setAdsbFilter('originCountry', e.target.value)}
              className="mt-1 w-full px-2 py-1.5 rounded bg-[#111a24]/80 border border-[rgba(201,162,39,0.15)]/50 text-xs text-[#d0d8e0] focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 appearance-none"
            >
              <option value="">All Countries</option>
              {countries.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Altitude range */}
          <div>
            <label className="text-[10px] text-[#8a9aa8] uppercase tracking-wider font-semibold">
              Altitude Range (ft)
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                value={adsbFilters.altitudeMin ?? ''}
                onChange={(e) => setAdsbFilter('altitudeMin', e.target.value ? Number(e.target.value) : null)}
                placeholder="Min"
                min="0"
                className="w-1/2 px-2 py-1.5 rounded bg-[#111a24]/80 border border-[rgba(201,162,39,0.15)]/50 text-xs text-[#d0d8e0] placeholder-[#4a6070] focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
              />
              <span className="text-[#4a6070] text-xs">—</span>
              <input
                type="number"
                value={adsbFilters.altitudeMax ?? ''}
                onChange={(e) => setAdsbFilter('altitudeMax', e.target.value ? Number(e.target.value) : null)}
                placeholder="Max"
                min="0"
                className="w-1/2 px-2 py-1.5 rounded bg-[#111a24]/80 border border-[rgba(201,162,39,0.15)]/50 text-xs text-[#d0d8e0] placeholder-[#4a6070] focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
              />
            </div>
          </div>

          {/* On-ground toggle */}
          <div className="flex items-center justify-between">
            <label className="text-[10px] text-[#8a9aa8] uppercase tracking-wider font-semibold">
              Show Grounded
            </label>
            <button
              onClick={() => setAdsbFilter('showOnGround', !adsbFilters.showOnGround)}
              className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${
                adsbFilters.showOnGround ? 'bg-cyan-600' : 'bg-[#4a6070]'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                  adsbFilters.showOnGround ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Reset button */}
          {hasActiveFilters && (
            <button
              onClick={resetAdsbFilters}
              className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-[#111a24]/60 hover:bg-[#111a24]/60 border border-[rgba(201,162,39,0.15)]/40 text-xs text-[#8a9aa8] hover:text-[#d0d8e0] transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              Reset Filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}

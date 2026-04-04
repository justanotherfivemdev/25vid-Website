/**
 * ReforgerMapPage.jsx
 *
 * Full-screen interactive Arma Reforger map viewer.
 * Allows users to select from common Reforger maps, place markers,
 * measure distances, and export marker data for use in operations.
 *
 * Maps sourced from ArmaReforgerMortarCalculator (MIT License).
 */

import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';

import { REFORGER_MAPS } from '@/config/reforgerMaps';
import ReforgerMapViewer from '@/components/map/ReforgerMapViewer';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ChevronLeft, Map, Globe2, Download, Send, Crosshair,
} from 'lucide-react';

export default function ReforgerMapPage() {
  const [selectedMap, setSelectedMap] = useState(null);
  const [markers, setMarkers] = useState([]);

  const handleExportMarkers = useCallback(() => {
    if (!selectedMap || markers.length === 0) return;
    const data = markers.map((m) => ({
      label: m.label,
      color: m.color,
      gameX: Math.round(m.lng),
      gameY: Math.round(selectedMap.yMax - m.lat),
      gridRef: `${String(Math.floor(m.lng / (selectedMap.gridSize || 1000))).padStart(2, '0')}${String(Math.floor((selectedMap.yMax - m.lat) / (selectedMap.gridSize || 1000))).padStart(2, '0')}`,
    }));
    const blob = new Blob([JSON.stringify({ map: selectedMap.name, markers: data }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reforger-markers-${selectedMap.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [selectedMap, markers]);

  const handleExportToPlanner = useCallback(() => {
    if (!selectedMap) return;
    // Store map reference for Operations Planner to pick up
    const exportData = {
      reforgerMapId: selectedMap.id,
      markers: markers.map((m) => ({
        ...m,
        gameX: Math.round(m.lng),
        gameY: Math.round(selectedMap.yMax - m.lat),
      })),
      exportedAt: new Date().toISOString(),
    };
    localStorage.setItem('reforger_map_export', JSON.stringify(exportData));
    window.location.href = '/hub/operations-planner';
  }, [selectedMap, markers]);

  /* ── Map selection screen ────────────────────────────────────────────── */
  if (!selectedMap) {
    return (
      <div className="min-h-screen bg-[#060a14] text-white">
        <header className="border-b border-[rgba(201,162,39,0.12)] bg-[#0c1322] px-4 py-3 flex items-center gap-3">
          <Link to="/hub" className="text-[#8a9aa8] hover:text-white transition">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <Globe2 className="w-5 h-5 text-[#C9A227]" />
          <h1 className="text-lg font-bold tracking-wide" style={{ fontFamily: "'Share Tech', sans-serif" }}>
            REFORGER MAPS
          </h1>
        </header>

        <div className="max-w-4xl mx-auto p-6">
          <p className="text-[#8a9aa8] mb-6">
            Select an Arma Reforger map to open an interactive viewer with zoom, markers, and distance measurement.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {REFORGER_MAPS.map((m) => (
              <Card
                key={m.id}
                className="bg-[#0c1117]/60 border-[rgba(201,162,39,0.12)] hover:border-[#C9A227]/50 transition cursor-pointer group"
                onClick={() => { setSelectedMap(m); setMarkers([]); }}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-white group-hover:text-[#C9A227] transition" style={{ fontFamily: "'Share Tech', sans-serif" }}>
                      {m.name}
                    </h3>
                    <Badge className="bg-[#111a24] text-[#8a9aa8] text-[10px]">
                      {(m.xMax / 1000).toFixed(1)} × {(m.yMax / 1000).toFixed(1)} km
                    </Badge>
                  </div>
                  <p className="text-sm text-[#4a6070]">{m.description}</p>
                  <div className="flex items-center gap-2 text-xs text-[#4a6070]">
                    <Crosshair className="w-3 h-3" />
                    Grid: {m.gridSize}m squares
                  </div>

                  {/* Preview thumbnail */}
                  <div className="h-32 bg-[#111a24] rounded overflow-hidden">
                    <img
                      src={m.imageUrl}
                      alt={m.name}
                      className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition"
                      loading="lazy"
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ── Active map view ──────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col h-screen bg-[#060a14] text-white">
      {/* Top bar */}
      <header className="shrink-0 border-b border-[rgba(201,162,39,0.12)] bg-[#0c1322] px-4 py-2 flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setSelectedMap(null)}
          className="text-[#8a9aa8] hover:text-white transition"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <Map className="w-5 h-5 text-[#C9A227]" />
        <h1 className="text-lg font-bold tracking-wide" style={{ fontFamily: "'Share Tech', sans-serif" }}>
          {selectedMap.name.toUpperCase()}
        </h1>
        <Badge className="bg-[#111a24] text-[#8a9aa8] text-[10px]">
          {(selectedMap.xMax / 1000).toFixed(1)} × {(selectedMap.yMax / 1000).toFixed(1)} km
        </Badge>

        <div className="ml-auto flex items-center gap-2">
          {markers.length > 0 && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-[rgba(201,162,39,0.15)] text-[#8a9aa8]"
                onClick={handleExportMarkers}
              >
                <Download className="w-3 h-3 mr-1" /> Export Markers
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs bg-[#C9A227] text-black hover:bg-[#b8931f]"
                onClick={handleExportToPlanner}
              >
                <Send className="w-3 h-3 mr-1" /> Send to Planner
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Map viewer */}
      <ReforgerMapViewer
        mapConfig={selectedMap}
        markers={markers}
        onMarkersChange={setMarkers}
        className="flex-1"
      />
    </div>
  );
}

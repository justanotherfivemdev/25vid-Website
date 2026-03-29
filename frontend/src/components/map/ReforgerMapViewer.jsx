/**
 * ReforgerMapViewer.jsx
 *
 * Interactive Arma Reforger map viewer using Leaflet CRS.Simple.
 * Provides:
 *  - Pan & zoom with mouse wheel / pinch
 *  - Game-coordinate grid overlay
 *  - Click-to-place markers with popups
 *  - Distance measurement between two points
 *  - Coordinate readout on hover
 *  - Marker management (add/remove/label)
 *
 * Inspired by izurvive.com/reforger_everon and reforger.recoil.org.
 * Map images from ArmaReforgerMortarCalculator (MIT License).
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  MapPin, Trash2, Crosshair, Ruler, X, Plus, Navigation,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════════════ */

const MARKER_COLORS = [
  '#3B82F6', // blue (friendly)
  '#EF4444', // red (hostile)
  '#22C55E', // green (neutral)
  '#EAB308', // yellow (unknown)
  '#C9A227', // gold
  '#A855F7', // purple
  '#F97316', // orange
  '#06B6D4', // cyan
];

/* ═══════════════════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

export default function ReforgerMapViewer({
  mapConfig,          // { id, name, xMax, yMax, imageUrl, gridSize }
  markers: externalMarkers,
  onMarkersChange,
  readOnly = false,
  className = '',
  showToolbar = true,
  initialCenter,
  initialZoom,
}) {
  const containerRef = useRef(null);
  const leafletMap = useRef(null);
  const imageOverlay = useRef(null);
  const gridLayerRef = useRef(null);
  const markersLayerRef = useRef(null);
  const measureLayerRef = useRef(null);

  // Internal markers state (used if no external control provided)
  const [internalMarkers, setInternalMarkers] = useState([]);
  const markers = externalMarkers ?? internalMarkers;
  const setMarkers = onMarkersChange ?? setInternalMarkers;

  const [cursorCoords, setCursorCoords] = useState(null);
  const [activeTool, setActiveTool] = useState('pan'); // pan | marker | measure
  const [markerColor, setMarkerColor] = useState(MARKER_COLORS[0]);
  const [markerLabel, setMarkerLabel] = useState('');
  const [measurePoints, setMeasurePoints] = useState([]);
  const [measureDistance, setMeasureDistance] = useState(null);

  const { xMax, yMax, imageUrl, gridSize, name } = mapConfig;

  /* ── Initialise Leaflet map ──────────────────────────────────────────── */
  useEffect(() => {
    if (!containerRef.current || !xMax || !yMax || !imageUrl) return;

    // Destroy previous instance
    if (leafletMap.current) {
      leafletMap.current.remove();
      leafletMap.current = null;
    }

    // CRS.Simple maps pixels to LatLng 1:1 (y = lat, x = lng)
    const bounds = [[0, 0], [yMax, xMax]];

    const map = L.map(containerRef.current, {
      crs: L.CRS.Simple,
      minZoom: -3,
      maxZoom: 4,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      attributionControl: false,
      maxBounds: [[-yMax * 0.1, -xMax * 0.1], [yMax * 1.1, xMax * 1.1]],
      maxBoundsViscosity: 0.8,
    });

    const overlay = L.imageOverlay(imageUrl, bounds).addTo(map);
    imageOverlay.current = overlay;

    // Fit to bounds
    if (initialCenter && initialZoom != null) {
      map.setView(initialCenter, initialZoom);
    } else {
      map.fitBounds(bounds);
    }

    // Grid layer
    const gridLayer = L.layerGroup().addTo(map);
    gridLayerRef.current = gridLayer;

    // Markers layer
    const markersGroup = L.layerGroup().addTo(map);
    markersLayerRef.current = markersGroup;

    // Measure layer
    const measureGroup = L.layerGroup().addTo(map);
    measureLayerRef.current = measureGroup;

    // Mouse move → coordinate display
    map.on('mousemove', (e) => {
      const { lat, lng } = e.latlng;
      if (lng >= 0 && lng <= xMax && lat >= 0 && lat <= yMax) {
        setCursorCoords({ x: Math.round(lng), y: Math.round(yMax - lat) });
      }
    });

    map.on('mouseout', () => setCursorCoords(null));

    leafletMap.current = map;

    return () => {
      map.remove();
      leafletMap.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xMax, yMax, imageUrl]);

  /* ── Draw grid when zoom changes ─────────────────────────────────────── */
  useEffect(() => {
    const map = leafletMap.current;
    const layer = gridLayerRef.current;
    if (!map || !layer) return;

    const drawGrid = () => {
      layer.clearLayers();
      const zoom = map.getZoom();
      // Only show grid at sufficient zoom
      if (zoom < -1.5) return;

      const step = gridSize || 1000;
      const lineStyle = { color: 'rgba(255,255,255,0.15)', weight: 1 };
      const labelStyle = 'color:rgba(255,255,255,0.5);font-size:10px;font-family:monospace;text-shadow:1px 1px 2px rgba(0,0,0,0.8);';

      // Vertical lines (x-axis)
      for (let x = 0; x <= xMax; x += step) {
        L.polyline([[0, x], [yMax, x]], lineStyle).addTo(layer);
        if (zoom >= -0.5) {
          const label = L.divIcon({
            className: '',
            html: `<span style="${labelStyle}">${(x / 1000).toFixed(0)}</span>`,
            iconSize: [30, 14],
          });
          L.marker([yMax + yMax * 0.015, x], { icon: label, interactive: false }).addTo(layer);
        }
      }

      // Horizontal lines (y-axis)
      for (let y = 0; y <= yMax; y += step) {
        L.polyline([[y, 0], [y, xMax]], lineStyle).addTo(layer);
        if (zoom >= -0.5) {
          const label = L.divIcon({
            className: '',
            html: `<span style="${labelStyle}">${((yMax - y) / 1000).toFixed(0)}</span>`,
            iconSize: [30, 14],
          });
          L.marker([y, -xMax * 0.02], { icon: label, interactive: false }).addTo(layer);
        }
      }
    };

    drawGrid();
    map.on('zoomend', drawGrid);
    return () => map.off('zoomend', drawGrid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xMax, yMax, gridSize]);

  /* ── Sync markers to Leaflet layer ───────────────────────────────────── */
  useEffect(() => {
    const layer = markersLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    markers.forEach((m) => {
      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:24px;height:24px;border-radius:50%;
          background:${m.color || '#3B82F6'};
          border:2px solid rgba(255,255,255,0.8);
          display:flex;align-items:center;justify-content:center;
          font-size:10px;font-weight:bold;color:#fff;
          box-shadow:0 2px 6px rgba(0,0,0,0.5);
          transform:translate(-12px,-12px);
        ">${m.label ? m.label[0].toUpperCase() : '•'}</div>`,
        iconSize: [24, 24],
        iconAnchor: [0, 0],
      });

      const marker = L.marker([m.lat, m.lng], { icon, draggable: !readOnly })
        .addTo(layer);

      // Popup
      const gameX = Math.round(m.lng);
      const gameY = Math.round(yMax - m.lat);
      const gridRef = `${String(Math.floor(gameX / 1000)).padStart(2, '0')}${String(Math.floor(gameY / 1000)).padStart(2, '0')}`;
      marker.bindPopup(`
        <div style="font-family:monospace;font-size:12px;color:#333;">
          <strong>${m.label || 'Marker'}</strong><br/>
          Grid: ${gridRef}<br/>
          X: ${gameX} | Y: ${gameY}
        </div>
      `);

      if (!readOnly) {
        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          setMarkers((prev) =>
            prev.map((mk) => mk.id === m.id ? { ...mk, lat: pos.lat, lng: pos.lng } : mk)
          );
        });
      }
    });
  }, [markers, yMax, readOnly, setMarkers]);

  /* ── Map click handler ───────────────────────────────────────────────── */
  useEffect(() => {
    const map = leafletMap.current;
    if (!map) return;

    const handleClick = (e) => {
      const { lat, lng } = e.latlng;
      if (lng < 0 || lng > xMax || lat < 0 || lat > yMax) return;

      if (activeTool === 'marker' && !readOnly) {
        const newMarker = {
          id: crypto.randomUUID(),
          lat,
          lng,
          label: markerLabel || `MK${markers.length + 1}`,
          color: markerColor,
        };
        setMarkers((prev) => [...prev, newMarker]);
      } else if (activeTool === 'measure') {
        setMeasurePoints((prev) => {
          const next = [...prev, [lat, lng]];
          if (next.length === 2) {
            const d = Math.sqrt(
              Math.pow(next[1][1] - next[0][1], 2) +
              Math.pow((yMax - next[1][0]) - (yMax - next[0][0]), 2)
            );
            setMeasureDistance(d);
            // Draw line
            const ml = measureLayerRef.current;
            if (ml) {
              ml.clearLayers();
              L.polyline(next, { color: '#EAB308', weight: 2, dashArray: '8,4' }).addTo(ml);
              const midLat = (next[0][0] + next[1][0]) / 2;
              const midLng = (next[0][1] + next[1][1]) / 2;
              const label = L.divIcon({
                className: '',
                html: `<span style="color:#EAB308;font-size:11px;font-weight:bold;text-shadow:1px 1px 2px #000;font-family:monospace;">${Math.round(d)}m</span>`,
                iconSize: [60, 16],
              });
              L.marker([midLat, midLng], { icon: label, interactive: false }).addTo(ml);
            }
            return [];
          }
          return next;
        });
      }
    };

    map.on('click', handleClick);
    return () => map.off('click', handleClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, markerColor, markerLabel, markers.length, readOnly, xMax, yMax]);

  /* ── Clear measurement ───────────────────────────────────────────────── */
  const clearMeasure = useCallback(() => {
    setMeasurePoints([]);
    setMeasureDistance(null);
    measureLayerRef.current?.clearLayers();
  }, []);

  const removeMarker = useCallback((id) => {
    setMarkers((prev) => prev.filter((m) => m.id !== id));
  }, [setMarkers]);

  const clearAllMarkers = useCallback(() => {
    if (!window.confirm('Remove all markers?')) return;
    setMarkers([]);
  }, [setMarkers]);

  /* ── Get exportable markers with game coords ─────────────────────────── */
  const getGameCoordMarkers = useCallback(() => {
    return markers.map((m) => ({
      ...m,
      gameX: Math.round(m.lng),
      gameY: Math.round(yMax - m.lat),
    }));
  }, [markers, yMax]);

  /* ═══════════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════════ */

  return (
    <div className={`flex flex-col bg-[#060a14] ${className}`}>
      {/* Toolbar */}
      {showToolbar && (
        <div className="flex items-center gap-2 px-3 py-2 bg-[#0c1322] border-b border-gray-800 flex-wrap">
          <Badge className="bg-[#C9A227]/20 text-[#C9A227] border border-[#C9A227]/40 text-[10px]">
            {name}
          </Badge>

          <div className="w-px h-5 bg-gray-700 mx-1" />

          {/* Tool buttons */}
          <Button
            size="sm"
            variant={activeTool === 'pan' ? 'default' : 'outline'}
            className={`h-7 text-xs ${activeTool === 'pan' ? 'bg-[#C9A227] text-black' : 'border-gray-700 text-gray-400'}`}
            onClick={() => setActiveTool('pan')}
          >
            <Navigation className="w-3 h-3 mr-1" /> Pan
          </Button>

          {!readOnly && (
            <Button
              size="sm"
              variant={activeTool === 'marker' ? 'default' : 'outline'}
              className={`h-7 text-xs ${activeTool === 'marker' ? 'bg-[#C9A227] text-black' : 'border-gray-700 text-gray-400'}`}
              onClick={() => setActiveTool('marker')}
            >
              <MapPin className="w-3 h-3 mr-1" /> Marker
            </Button>
          )}

          <Button
            size="sm"
            variant={activeTool === 'measure' ? 'default' : 'outline'}
            className={`h-7 text-xs ${activeTool === 'measure' ? 'bg-[#C9A227] text-black' : 'border-gray-700 text-gray-400'}`}
            onClick={() => { setActiveTool('measure'); clearMeasure(); }}
          >
            <Ruler className="w-3 h-3 mr-1" /> Measure
          </Button>

          {/* Marker options */}
          {activeTool === 'marker' && !readOnly && (
            <>
              <div className="w-px h-5 bg-gray-700 mx-1" />
              <div className="flex gap-1">
                {MARKER_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`w-5 h-5 rounded-full border-2 transition ${markerColor === c ? 'border-white scale-110' : 'border-gray-600'}`}
                    style={{ background: c }}
                    onClick={() => setMarkerColor(c)}
                  />
                ))}
              </div>
              <Input
                value={markerLabel}
                onChange={(e) => setMarkerLabel(e.target.value)}
                placeholder="Label…"
                className="bg-gray-900 border-gray-700 h-7 w-24 text-xs"
              />
            </>
          )}

          {/* Measure result */}
          {measureDistance != null && (
            <>
              <div className="w-px h-5 bg-gray-700 mx-1" />
              <Badge className="bg-yellow-900/40 text-yellow-400 border border-yellow-700/40 text-xs font-mono">
                {measureDistance >= 1000
                  ? `${(measureDistance / 1000).toFixed(2)} km`
                  : `${Math.round(measureDistance)} m`}
              </Badge>
              <button onClick={clearMeasure} className="text-gray-500 hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </>
          )}

          {/* Actions */}
          <div className="ml-auto flex items-center gap-2">
            {markers.length > 0 && !readOnly && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-red-900/60 text-red-400 hover:bg-red-900/20"
                onClick={clearAllMarkers}
              >
                <Trash2 className="w-3 h-3 mr-1" /> Clear Markers
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Map container */}
      <div className="relative flex-1 min-h-[400px]">
        <div ref={containerRef} className="absolute inset-0" style={{ background: '#080e1c' }} />

        {/* Coordinate readout */}
        {cursorCoords && (
          <div className="absolute bottom-3 left-3 z-[1000] bg-black/80 border border-gray-700 rounded px-2 py-1 text-[11px] font-mono text-gray-300 pointer-events-none">
            <Crosshair className="w-3 h-3 inline mr-1 text-[#C9A227]" />
            X: {cursorCoords.x} | Y: {cursorCoords.y}
            {cursorCoords.x != null && (
              <span className="ml-2 text-gray-500">
                Grid {String(Math.floor(cursorCoords.x / (gridSize || 1000))).padStart(2, '0')}
                {String(Math.floor(cursorCoords.y / (gridSize || 1000))).padStart(2, '0')}
              </span>
            )}
          </div>
        )}

        {/* Marker list overlay */}
        {markers.length > 0 && (
          <div className="absolute top-3 right-3 z-[1000] bg-black/80 border border-gray-700 rounded max-h-48 overflow-y-auto w-48">
            <div className="px-2 py-1 border-b border-gray-700 text-[10px] text-gray-500 uppercase tracking-wider">
              Markers ({markers.length})
            </div>
            {markers.map((m) => {
              const gx = Math.round(m.lng);
              const gy = Math.round(yMax - m.lat);
              return (
                <div key={m.id} className="flex items-center gap-2 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800/50">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: m.color }} />
                  <span className="truncate flex-1">{m.label}</span>
                  <span className="text-gray-500 font-mono text-[10px]">{gx},{gy}</span>
                  {!readOnly && (
                    <button onClick={() => removeMarker(m.id)} className="text-red-500 hover:text-red-300">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

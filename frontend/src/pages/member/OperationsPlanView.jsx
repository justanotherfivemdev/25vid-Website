/**
 * OperationsPlanView.jsx
 *
 * Read-only viewer for a published Operations Plan.  Renders the tactical
 * map with all placed units using OpenLayers + milsymbol.  Accessible from
 * the Hub to any authenticated member (for plans with visibility "all_members").
 */

import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';

import { API, BACKEND_URL } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';
import { hasPermission, PERMISSIONS } from '@/utils/permissions';
import { useMemberLayout } from '@/components/MemberLayout';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import {
  ChevronLeft, Pencil, Calendar, User, Eye, Crosshair, Radio,
  Play, Download, Globe2,
} from 'lucide-react';

import useReplayTimeline from '@/hooks/useReplayTimeline';
import TimelinePlayer from '@/components/operations/TimelinePlayer';
import CommsChannel from '@/components/operations/CommsChannel';
import ExportControls from '@/components/operations/ExportControls';

/* ── OpenLayers ────────────────────────────────────────────────────────────── */
import Map from 'ol/Map';
import View from 'ol/View';
import ImageLayer from 'ol/layer/Image';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import ImageStatic from 'ol/source/ImageStatic';
import { Projection } from 'ol/proj';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import Polygon from 'ol/geom/Polygon';
import CircleGeom from 'ol/geom/Circle';
import { Icon, Style, Stroke, Fill, Circle as CircleStyle, Text as OlText } from 'ol/style';

/* ── milsymbol ─────────────────────────────────────────────────────────────── */
import { renderMilSymbolDataUrl } from '@/lib/milsymbol';
import 'ol/ol.css';

import { createDrawingStyle, createPathStyle } from '@/hooks/useOlDrawing';

const AFFILIATION_LABELS = {
  friendly: 'Friendly',
  hostile: 'Hostile',
  neutral: 'Neutral',
  unknown: 'Unknown',
};

const AFFILIATION_COLORS = {
  friendly: '#3B82F6',
  hostile: '#EF4444',
  neutral: '#22C55E',
  unknown: '#EAB308',
};

function renderSymbolDataURL(sidc, size = 40) {
  return renderMilSymbolDataUrl(sidc, size);
}

export default function OperationsPlanView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const inLayout = useMemberLayout();
  const canEdit = hasPermission(user?.role, PERMISSIONS.MANAGE_PLANS);

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const vectorSourceRef = useRef(null);

  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [replayMode, setReplayMode] = useState(false);

  /* ── Fetch plan ──────────────────────────────────────────────────────── */

  useEffect(() => {
    const fetchPlan = async () => {
      try {
        const res = await axios.get(`${API}/operations-plans/${id}`);
        setPlan(res.data);
        setIsLive(!!res.data.is_live_session_active && !!res.data.allow_live_viewing);
      } catch (err) {
        setError(err.response?.data?.detail || 'Failed to load plan');
      } finally {
        setLoading(false);
      }
    };
    fetchPlan();
  }, [id]);

  /* ── Replay timeline hook ────────────────────────────────────────────── */

  const replay = useReplayTimeline({ planId: id, enabled: replayMode });

  // When replay provides units, update the map features
  useEffect(() => {
    if (!replayMode || !vectorSourceRef.current || !plan?.map_width || !plan?.map_height) return;
    const vs = vectorSourceRef.current;
    vs.clear();
    (replay.units || []).forEach((u) => {
      const url = renderSymbolDataURL(u.symbol_code, Math.round(32 * (u.scale || 1)));
      if (!url) return;
      const feature = new Feature({
        geometry: new Point([u.x * plan.map_width, u.y * plan.map_height]),
      });
      feature.set('unitData', u);
      feature.setStyle(
        new Style({
          image: new Icon({
            src: url,
            anchor: [0.5, 0.5],
            rotation: ((u.rotation || 0) * Math.PI) / 180,
          }),
        }),
      );
      vs.addFeature(feature);
    });
  }, [replayMode, replay.units, plan?.map_width, plan?.map_height]);

  /* ── Live polling: refresh plan data when live ───────────────────────
       Uses polling (not WebSocket) for read-only viewers to keep the
       implementation simple and avoid maintaining a separate WS path for
       view-only connections.  8-second interval balances responsiveness
       with server load.
     ──────────────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!isLive || !plan) return;
    const interval = setInterval(async () => {
      try {
        const res = await axios.get(`${API}/operations-plans/${id}`);
        const updated = res.data;
        setPlan(updated);
        setIsLive(!!updated.is_live_session_active && !!updated.allow_live_viewing);
        // Update map features if vector source exists
        if (vectorSourceRef.current && updated.map_width && updated.map_height) {
          const vs = vectorSourceRef.current;
          vs.clear();
          (updated.units || []).forEach((u) => {
            const url = renderSymbolDataURL(u.symbol_code, Math.round(32 * (u.scale || 1)));
            if (!url) return;
            const feature = new Feature({
              geometry: new Point([u.x * updated.map_width, u.y * updated.map_height]),
            });
            feature.set('unitData', u);
            feature.setStyle(
              new Style({
                image: new Icon({
                  src: url,
                  anchor: [0.5, 0.5],
                  rotation: ((u.rotation || 0) * Math.PI) / 180,
                }),
              }),
            );
            vs.addFeature(feature);
          });
        }
      } catch {
        // Ignore polling errors
      }
    }, 8000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, id, plan?.map_width, plan?.map_height]);

  /* ── Setup map when plan is loaded ───────────────────────────────────── */

  useEffect(() => {
    if (!plan?.map_image_url || !plan.map_width || !plan.map_height) return;
    if (!mapContainerRef.current) return;

    if (mapRef.current) {
      mapRef.current.setTarget(null);
      mapRef.current = null;
    }

    const w = plan.map_width;
    const h = plan.map_height;
    const extent = [0, 0, w, h];

    const projection = new Projection({
      code: 'pixel',
      units: 'pixels',
      extent,
    });

    const mapUrl = plan.map_image_url.startsWith('http')
      ? plan.map_image_url
      : `${BACKEND_URL}${plan.map_image_url}`;

    const imageLayer = new ImageLayer({
      source: new ImageStatic({
        url: mapUrl,
        projection,
        imageExtent: extent,
      }),
    });

    const vectorSource = new VectorSource();
    vectorSourceRef.current = vectorSource;

    // Place units
    (plan.units || []).forEach((u) => {
      const url = renderSymbolDataURL(u.symbol_code, Math.round(32 * (u.scale || 1)));
      if (!url) return;
      const feature = new Feature({
        geometry: new Point([u.x * w, u.y * h]),
      });
      feature.set('unitData', u);
      feature.setStyle(
        new Style({
          image: new Icon({
            src: url,
            anchor: [0.5, 0.5],
            rotation: ((u.rotation || 0) * Math.PI) / 180,
          }),
        }),
      );
      vectorSource.addFeature(feature);
    });

    // ── Render drawings ──────────────────────────────────────────────────
    const drawingSource = new VectorSource();
    (plan.drawings || []).forEach((d) => {
      const coords = (d.coordinates || []).map(([x, y]) => [x * w, y * h]);
      if (coords.length === 0) return;

      let geom;
      if (d.drawing_type === 'circle' && d.radius != null) {
        geom = new CircleGeom(coords[0], d.radius * Math.max(w, h));
      } else if (
        d.drawing_type === 'polygon' ||
        d.drawing_type === 'engagement_area' ||
        d.drawing_type === 'objective'
      ) {
        if (coords.length >= 3) geom = new Polygon([coords]);
        else return;
      } else {
        if (coords.length >= 2) geom = new LineString(coords);
        else return;
      }

      const feat = new Feature({ geometry: geom });
      feat.set('drawingData', d);
      feat.setStyle(createDrawingStyle(d));
      drawingSource.addFeature(feat);
    });
    const drawingLayer = new VectorLayer({ source: drawingSource, zIndex: 5 });

    // ── Render movement paths ─────────────────────────────────────────────
    const pathSource = new VectorSource();
    (plan.movement_paths || []).forEach((p) => {
      const coords = (p.coordinates || []).map(([x, y]) => [x * w, y * h]);
      if (coords.length < 2) return;

      const feat = new Feature({ geometry: new LineString(coords) });
      feat.set('pathData', p);
      feat.setStyle(createPathStyle(p));
      pathSource.addFeature(feat);
    });
    const pathLayer = new VectorLayer({ source: pathSource, zIndex: 4 });

    const vectorLayer = new VectorLayer({ source: vectorSource });

    const view = new View({
      projection,
      center: [w / 2, h / 2],
      zoom: 1,
      minZoom: 0,
      maxZoom: 6,
    });

    const olMap = new Map({
      target: mapContainerRef.current,
      layers: [imageLayer, pathLayer, drawingLayer, vectorLayer],
      view,
    });

    view.fit(extent, { padding: [20, 20, 20, 20] });

    // Click to inspect a unit
    olMap.on('click', (e) => {
      const feat = olMap.forEachFeatureAtPixel(e.pixel, (f) => f);
      if (feat) {
        setSelectedUnit(feat.get('unitData'));
      } else {
        setSelectedUnit(null);
      }
    });

    mapRef.current = olMap;

    return () => {
      olMap.setTarget(null);
      mapRef.current = null;
    };
  }, [plan]);

  /* ── Loading / error states ──────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-gray-400">
        Loading plan…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-gray-400">
        <p>{error}</p>
        <Link to="/hub">
          <Button variant="outline" className="border-gray-700">
            Back to Hub
          </Button>
        </Link>
      </div>
    );
  }

  if (!plan) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link to="/hub" className="text-gray-400 hover:text-[#C9A227]">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <h1
          className="text-xl font-bold tracking-wider text-[#C9A227] uppercase"
          style={{ fontFamily: 'Rajdhani, sans-serif' }}
        >
          {plan.title}
        </h1>
        <Badge
          className={
            plan.is_published
              ? 'bg-green-900/40 text-green-400 border border-green-700'
              : 'bg-gray-800 text-gray-500 border border-gray-700'
          }
        >
          {plan.is_published ? 'Published' : 'Draft'}
        </Badge>
        {isLive && (
          <Badge className="bg-red-600/80 text-white animate-pulse text-[10px]">
            <Radio className="w-3 h-3 mr-1" /> LIVE
          </Badge>
        )}

        <div className="flex-1" />

        {/* Replay toggle */}
        <Button
          size="sm"
          variant="outline"
          className={`${replayMode ? 'border-[#C9A227] text-[#C9A227] bg-[#C9A227]/10' : 'border-gray-600 text-gray-400'}`}
          onClick={() => setReplayMode(!replayMode)}
        >
          <Play className="w-4 h-4 mr-1" /> {replayMode ? 'Exit Replay' : 'Replay'}
        </Button>

        {/* Export controls */}
        <ExportControls
          mapRef={mapRef}
          planTitle={plan.title}
          planDescription={plan.description}
          unitCount={plan.units?.length || 0}
          createdBy={plan.created_by_username || ''}
        />

        {canEdit && (
          <Link to={`/hub/operations-planner/${plan.id}`}>
            <Button
              size="sm"
              variant="outline"
              className="border-[#C9A227] text-[#C9A227] hover:bg-[#C9A227]/10"
            >
              <Pencil className="w-4 h-4 mr-1" /> Edit Plan
            </Button>
          </Link>
        )}
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
        <span className="flex items-center gap-1">
          <User className="w-3 h-3" /> {plan.created_by_username || 'Unknown'}
        </span>
        {plan.updated_at && (
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" /> Updated{' '}
            {new Date(plan.updated_at).toLocaleDateString()}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Eye className="w-3 h-3" /> {plan.visibility_scope === 'staff_only' ? 'Staff Only' : 'All Members'}
        </span>
        {plan.units && (
          <span>{plan.units.length} unit(s)</span>
        )}
      </div>

      {plan.description && (
        <p className="text-sm text-gray-400 max-w-prose">{plan.description}</p>
      )}

      {/* Map + Unit Info */}
      <div className="flex gap-4 flex-col xl:flex-row">
        {/* Map */}
        <div className="flex-1 relative bg-[#060a14] rounded border border-gray-800 overflow-hidden" style={{ minHeight: '400px' }}>
          <div ref={mapContainerRef} className="absolute inset-0" />
        </div>

        {/* Selected unit panel */}
        <div className="w-full xl:w-72 shrink-0">
          <Card className="bg-[#0c1322] border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-400 uppercase tracking-wider">
                {selectedUnit ? 'Unit Info' : 'Select a Unit'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedUnit ? (
                <div className="space-y-3">
                  <div className="flex justify-center">
                    {(() => {
                      const url = renderSymbolDataURL(selectedUnit.symbol_code, 48);
                      return url ? (
                        <img src={url} alt="" className="h-14 object-contain" />
                      ) : null;
                    })()}
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">Name</p>
                    <p className="text-sm text-gray-200">{selectedUnit.name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">Affiliation</p>
                    <Badge
                      className="border"
                      style={{
                        color: AFFILIATION_COLORS[selectedUnit.affiliation],
                        borderColor: AFFILIATION_COLORS[selectedUnit.affiliation],
                        backgroundColor: `${AFFILIATION_COLORS[selectedUnit.affiliation]}15`,
                      }}
                    >
                      {AFFILIATION_LABELS[selectedUnit.affiliation] || selectedUnit.affiliation}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">SIDC</p>
                    <p className="text-xs text-gray-500 font-mono">{selectedUnit.symbol_code}</p>
                  </div>
                  {selectedUnit.notes && (
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase">Notes</p>
                      <p className="text-sm text-gray-300">{selectedUnit.notes}</p>
                    </div>
                  )}
                  {(selectedUnit.location_name || selectedUnit.geo_lat != null || selectedUnit.geo_lng != null) && (
                    <div className="pt-2 border-t border-gray-800">
                      <p className="text-[10px] text-gray-500 uppercase mb-1">
                        <Globe2 className="w-3 h-3 inline mr-1" />Geo Location
                      </p>
                      {selectedUnit.location_name && (
                        <p className="text-sm text-gray-300">{selectedUnit.location_name}</p>
                      )}
                      {(selectedUnit.geo_lat != null || selectedUnit.geo_lng != null) && (
                        <p className="text-xs text-gray-500 font-mono mt-1">
                          {selectedUnit.geo_lat != null ? selectedUnit.geo_lat : '—'}, {selectedUnit.geo_lng != null ? selectedUnit.geo_lng : '—'}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center text-gray-600 py-4">
                  <Crosshair className="w-8 h-8 mx-auto mb-2 text-gray-700" />
                  <p className="text-sm">Click a unit on the map to view its details.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Comms Channel */}
          <Card className="bg-[#0c1322] border-gray-800">
            <CardHeader className="pb-1">
              <CardTitle className="text-sm text-gray-400 uppercase tracking-wider">
                Comms Channel
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <CommsChannel
                planId={id}
                readOnly={true}
                username={user?.username || ''}
              />
            </CardContent>
          </Card>

          {/* Threat map link */}
          {plan.threat_map_link && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Globe2 className="w-3 h-3 text-[#C9A227]" />
              <span>Linked to threat map: {plan.threat_map_link}</span>
            </div>
          )}
        </div>
      </div>

      {/* Timeline Player (replay mode) */}
      {replayMode && (
        <TimelinePlayer
          playing={replay.playing}
          progress={replay.progress}
          currentIndex={replay.currentIndex}
          totalEvents={replay.totalEvents}
          speed={replay.speed}
          currentEvent={replay.currentEvent}
          totalDurationMs={replay.totalDurationMs}
          onPlay={replay.play}
          onPause={replay.pause}
          onReset={replay.reset}
          onSeek={replay.seekTo}
          onSetSpeed={replay.setSpeed}
        />
      )}
    </div>
  );
}

/**
 * OperationsPlanner.jsx
 *
 * Tactical planning tool for the 25th ID website.
 * Uses OpenLayers with an ImageStatic layer and milsymbol for NATO APP-6D
 * military symbology.  Supports uploading custom map images, placing/editing
 * military symbols, and saving/loading operations plans.
 *
 * Coordinates are normalised (0 → 1) so placement survives map resizing.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';

import { API, BACKEND_URL } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';
import { hasPermission, PERMISSIONS } from '@/utils/permissions';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import {
  Upload, Save, Globe2, Trash2, Plus, ChevronLeft, Eye, EyeOff,
  RotateCw, ZoomIn, ZoomOut, Crosshair, Layers, Settings, MapPin,
  FileText, X, Check, Move, Pencil,
} from 'lucide-react';

/* ── OpenLayers ────────────────────────────────────────────────────────────── */
import Map from 'ol/Map';
import View from 'ol/View';
import ImageLayer from 'ol/layer/Image';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import ImageStatic from 'ol/source/ImageStatic';
import { Projection, get as getProjection } from 'ol/proj';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { Icon, Style } from 'ol/style';
import { defaults as defaultInteractions } from 'ol/interaction/defaults';
import { Translate } from 'ol/interaction';

/* ── milsymbol ─────────────────────────────────────────────────────────────── */
import ms from 'milsymbol';

import 'ol/ol.css';

/* ══════════════════════════════════════════════════════════════════════════════
   Symbol palette — a curated set of MIL-STD-2525D SIDCs the planner can pick
   ══════════════════════════════════════════════════════════════════════════════ */

const SYMBOL_PALETTE = [
  // Friendly
  { sidc: '10031000001211000000', name: 'Infantry', affiliation: 'friendly' },
  { sidc: '10031000001205000000', name: 'Armor', affiliation: 'friendly' },
  { sidc: '10031000001206000000', name: 'Artillery', affiliation: 'friendly' },
  { sidc: '10031000001210000000', name: 'Aviation', affiliation: 'friendly' },
  { sidc: '10031000001216000000', name: 'Logistics', affiliation: 'friendly' },
  { sidc: '10031000001200000000', name: 'HQ', affiliation: 'friendly' },
  { sidc: '10031000001207000000', name: 'Engineer', affiliation: 'friendly' },
  { sidc: '10031000001220000000', name: 'Recon', affiliation: 'friendly' },
  { sidc: '10031000001213000000', name: 'Medical', affiliation: 'friendly' },
  { sidc: '10031000001209000000', name: 'Signal', affiliation: 'friendly' },
  // Hostile
  { sidc: '10061000001211000000', name: 'Infantry', affiliation: 'hostile' },
  { sidc: '10061000001205000000', name: 'Armor', affiliation: 'hostile' },
  { sidc: '10061000001206000000', name: 'Artillery', affiliation: 'hostile' },
  { sidc: '10061000001210000000', name: 'Aviation', affiliation: 'hostile' },
  { sidc: '10061000001200000000', name: 'HQ', affiliation: 'hostile' },
  { sidc: '10061000001220000000', name: 'Recon', affiliation: 'hostile' },
  // Neutral
  { sidc: '10041000001211000000', name: 'Infantry', affiliation: 'neutral' },
  { sidc: '10041000001200000000', name: 'HQ', affiliation: 'neutral' },
  // Unknown
  { sidc: '10011000001211000000', name: 'Infantry', affiliation: 'unknown' },
  { sidc: '10011000001200000000', name: 'HQ', affiliation: 'unknown' },
];

const AFFILIATION_LABELS = {
  friendly: 'Friendly (BLU)',
  hostile: 'Hostile (RED)',
  neutral: 'Neutral (GRN)',
  unknown: 'Unknown (YEL)',
};

const AFFILIATION_COLORS = {
  friendly: '#3B82F6',
  hostile: '#EF4444',
  neutral: '#22C55E',
  unknown: '#EAB308',
};

/* ── milsymbol helper ──────────────────────────────────────────────────────── */
function renderSymbolDataURL(sidc, size = 40) {
  try {
    const sym = new ms.Symbol(sidc, { size });
    return sym.toDataURL();
  } catch {
    return null;
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════════════════ */

export default function OperationsPlanner() {
  const { id: planId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = hasPermission(user?.role, PERMISSIONS.MANAGE_PLANS);
  const isViewOnly = !canEdit;

  /* ── Map state ──────────────────────────────────────────────────────────── */
  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const vectorSourceRef = useRef(null);
  const translateRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapImageUrl, setMapImageUrl] = useState(null);
  const [mapDimensions, setMapDimensions] = useState({ w: 0, h: 0 });

  /* ── Plan state ─────────────────────────────────────────────────────────── */
  const [planTitle, setPlanTitle] = useState('');
  const [planDescription, setPlanDescription] = useState('');
  const [planMapId, setPlanMapId] = useState('');
  const [planPublished, setPlanPublished] = useState(false);
  const [planVisibility, setPlanVisibility] = useState('all_members');
  const [units, setUnits] = useState([]);
  const [selectedUnitId, setSelectedUnitId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!planId);

  /* ── UI state ───────────────────────────────────────────────────────────── */
  const [availableMaps, setAvailableMaps] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [activePanel, setActivePanel] = useState('symbols'); // symbols | properties | metadata
  const [affiliationFilter, setAffiliationFilter] = useState('friendly');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [existingPlans, setExistingPlans] = useState([]);

  /* ══════════════════════════════════════════════════════════════════════════
     Load existing plan (if planId provided)
     ══════════════════════════════════════════════════════════════════════════ */

  useEffect(() => {
    if (planId) {
      loadPlan(planId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  const loadPlan = async (id) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/operations-plans/${id}`);
      const plan = res.data;
      setPlanTitle(plan.title || '');
      setPlanDescription(plan.description || '');
      setPlanMapId(plan.map_id || '');
      setPlanPublished(!!plan.is_published);
      setPlanVisibility(plan.visibility_scope || 'all_members');
      setUnits(
        (plan.units || []).map((u) => ({
          ...u,
          id: u.id || crypto.randomUUID(),
        })),
      );
      if (plan.map_image_url) {
        setMapImageUrl(`${BACKEND_URL}${plan.map_image_url}`);
        setMapDimensions({ w: plan.map_width || 0, h: plan.map_height || 0 });
      }
    } catch (err) {
      console.error('Failed to load plan', err);
    } finally {
      setLoading(false);
    }
  };

  /* ══════════════════════════════════════════════════════════════════════════
     OpenLayers map setup
     ══════════════════════════════════════════════════════════════════════════ */

  useEffect(() => {
    if (!mapImageUrl || !mapDimensions.w || !mapDimensions.h) return;
    if (!mapContainerRef.current) return;

    // Tear down any previous map
    if (mapRef.current) {
      mapRef.current.setTarget(null);
      mapRef.current = null;
    }

    const extent = [0, 0, mapDimensions.w, mapDimensions.h];

    const projection = new Projection({
      code: 'pixel',
      units: 'pixels',
      extent,
    });

    const imageLayer = new ImageLayer({
      source: new ImageStatic({
        url: mapImageUrl,
        projection,
        imageExtent: extent,
      }),
    });

    const vectorSource = new VectorSource();
    vectorSourceRef.current = vectorSource;

    const vectorLayer = new VectorLayer({ source: vectorSource });

    const view = new View({
      projection,
      center: [mapDimensions.w / 2, mapDimensions.h / 2],
      zoom: 1,
      minZoom: 0,
      maxZoom: 6,
    });

    const olMap = new Map({
      target: mapContainerRef.current,
      layers: [imageLayer, vectorLayer],
      view,
      interactions: defaultInteractions({ doubleClickZoom: false }),
    });

    // Fit map to extent
    view.fit(extent, { padding: [20, 20, 20, 20] });

    // Drag interaction for symbols (edit mode only)
    if (!isViewOnly) {
      const translate = new Translate({ layers: [vectorLayer] });
      translateRef.current = translate;
      olMap.addInteraction(translate);

      translate.on('translateend', (e) => {
        e.features.forEach((feat) => {
          const uid = feat.get('unitId');
          const coords = feat.getGeometry().getCoordinates();
          const nx = coords[0] / mapDimensions.w;
          const ny = coords[1] / mapDimensions.h;
          setUnits((prev) =>
            prev.map((u) =>
              u.id === uid
                ? { ...u, x: Math.max(0, Math.min(1, nx)), y: Math.max(0, Math.min(1, ny)) }
                : u,
            ),
          );
        });
      });

      // Click to select unit
      olMap.on('click', (e) => {
        const feat = olMap.forEachFeatureAtPixel(e.pixel, (f) => f);
        if (feat) {
          setSelectedUnitId(feat.get('unitId'));
          setActivePanel('properties');
        } else {
          setSelectedUnitId(null);
        }
      });
    } else {
      // View-only: click to inspect
      olMap.on('click', (e) => {
        const feat = olMap.forEachFeatureAtPixel(e.pixel, (f) => f);
        if (feat) {
          setSelectedUnitId(feat.get('unitId'));
          setActivePanel('properties');
        } else {
          setSelectedUnitId(null);
        }
      });
    }

    mapRef.current = olMap;
    setMapReady(true);

    return () => {
      olMap.setTarget(null);
      mapRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapImageUrl, mapDimensions.w, mapDimensions.h, isViewOnly]);

  /* ── Sync units → OL features ──────────────────────────────────────────── */
  useEffect(() => {
    const vs = vectorSourceRef.current;
    if (!vs || !mapDimensions.w) return;

    vs.clear();
    units.forEach((u) => {
      const url = renderSymbolDataURL(u.symbol_code, Math.round(32 * (u.scale || 1)));
      if (!url) return;

      const feature = new Feature({
        geometry: new Point([u.x * mapDimensions.w, u.y * mapDimensions.h]),
      });
      feature.set('unitId', u.id);
      feature.setStyle(
        new Style({
          image: new Icon({
            src: url,
            anchor: [0.5, 0.5],
            rotation: ((u.rotation || 0) * Math.PI) / 180,
            scale: 1,
          }),
        }),
      );
      vs.addFeature(feature);
    });
  }, [units, mapDimensions]);

  /* ══════════════════════════════════════════════════════════════════════════
     Map upload
     ══════════════════════════════════════════════════════════════════════════ */

  const handleMapUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await axios.post(`${API}/maps/upload`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = res.data;
      setPlanMapId(data.id);
      setMapImageUrl(`${BACKEND_URL}${data.image_url}`);
      setMapDimensions({ w: data.width, h: data.height });
      setShowUploadDialog(false);
    } catch (err) {
      console.error('Upload failed', err);
      alert(err.response?.data?.detail || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  /* ══════════════════════════════════════════════════════════════════════════
     Save / Publish plan
     ══════════════════════════════════════════════════════════════════════════ */

  const savePlan = async (publish = null) => {
    if (!planMapId) {
      alert('Please upload or select a map first.');
      return;
    }
    if (!planTitle.trim()) {
      alert('Please enter a plan title.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: planTitle,
        description: planDescription,
        map_id: planMapId,
        units: units.map(({ id, ...rest }) => rest),
        is_published: publish !== null ? publish : planPublished,
        visibility_scope: planVisibility,
      };

      let res;
      if (planId) {
        res = await axios.put(`${API}/operations-plans/${planId}`, payload);
      } else {
        res = await axios.post(`${API}/operations-plans`, payload);
      }

      if (!planId && res.data?.id) {
        navigate(`/hub/operations-planner/${res.data.id}`, { replace: true });
      }
      if (publish !== null) setPlanPublished(publish);
    } catch (err) {
      console.error('Save failed', err);
      alert(err.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  /* ══════════════════════════════════════════════════════════════════════════
     Unit management
     ══════════════════════════════════════════════════════════════════════════ */

  const addUnit = (palette) => {
    const newUnit = {
      id: crypto.randomUUID(),
      symbol_code: palette.sidc,
      name: palette.name,
      affiliation: palette.affiliation,
      x: 0.5,
      y: 0.5,
      rotation: 0,
      scale: 1,
      z_index: units.length,
      notes: '',
    };
    setUnits((prev) => [...prev, newUnit]);
    setSelectedUnitId(newUnit.id);
    setActivePanel('properties');
  };

  const updateUnit = (id, changes) => {
    setUnits((prev) => prev.map((u) => (u.id === id ? { ...u, ...changes } : u)));
  };

  const deleteUnit = (id) => {
    setUnits((prev) => prev.filter((u) => u.id !== id));
    if (selectedUnitId === id) setSelectedUnitId(null);
  };

  const selectedUnit = units.find((u) => u.id === selectedUnitId);

  /* ══════════════════════════════════════════════════════════════════════════
     Load plan / map lists
     ══════════════════════════════════════════════════════════════════════════ */

  const openLoadDialog = async () => {
    setShowLoadDialog(true);
    try {
      const [plansRes, mapsRes] = await Promise.all([
        axios.get(`${API}/operations-plans`),
        axios.get(`${API}/maps`),
      ]);
      setExistingPlans(plansRes.data || []);
      setAvailableMaps(mapsRes.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const selectExistingMap = (map) => {
    setPlanMapId(map.id);
    setMapImageUrl(`${BACKEND_URL}${map.image_url}`);
    setMapDimensions({ w: map.width, h: map.height });
    setShowLoadDialog(false);
  };

  const clearMap = () => {
    if (!window.confirm('Clear all units from the map?')) return;
    setUnits([]);
    setSelectedUnitId(null);
  };

  /* ══════════════════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════════════════ */

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[70vh] text-gray-400">
        Loading plan…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-[#080e1c] text-white overflow-hidden">
      {/* ── Top Bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2 bg-[#0c1322] border-b border-[#C9A227]/20 shrink-0 flex-wrap">
        <Link to="/hub" className="text-gray-400 hover:text-[#C9A227] transition">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <h1
          className="text-lg font-bold tracking-wider text-[#C9A227] uppercase"
          style={{ fontFamily: 'Rajdhani, sans-serif' }}
        >
          Operations Planner
        </h1>

        {isViewOnly && (
          <Badge className="bg-gray-700 text-gray-300 ml-2">View Only</Badge>
        )}

        <div className="flex-1" />

        {!isViewOnly && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="border-gray-600 text-gray-300 hover:border-[#C9A227] hover:text-[#C9A227]"
              onClick={() => setShowUploadDialog(true)}
            >
              <Upload className="w-4 h-4 mr-1" /> Upload Map
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-gray-600 text-gray-300 hover:border-[#C9A227] hover:text-[#C9A227]"
              onClick={openLoadDialog}
            >
              <FileText className="w-4 h-4 mr-1" /> Load
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-gray-600 text-gray-300 hover:border-[#C9A227] hover:text-[#C9A227]"
              onClick={() => savePlan()}
              disabled={saving}
            >
              <Save className="w-4 h-4 mr-1" /> {saving ? 'Saving…' : 'Save Draft'}
            </Button>
            <Button
              size="sm"
              className="bg-[#C9A227] text-black hover:bg-[#b8931f]"
              onClick={() => savePlan(true)}
              disabled={saving}
            >
              <Eye className="w-4 h-4 mr-1" /> Publish
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-red-900 text-red-400 hover:border-red-500"
              onClick={clearMap}
            >
              <Trash2 className="w-4 h-4 mr-1" /> Clear
            </Button>
          </>
        )}
      </div>

      {/* ── Main Content ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── Left Sidebar ─────────────────────────────────────────────── */}
        {!isViewOnly && (
          <div className="w-64 border-r border-gray-800 bg-[#0c1322] overflow-y-auto shrink-0 hidden lg:block">
            {/* Panel tabs */}
            <div className="flex border-b border-gray-800">
              <button
                className={`flex-1 py-2 text-xs uppercase tracking-wider font-bold transition ${
                  activePanel === 'symbols'
                    ? 'text-[#C9A227] border-b-2 border-[#C9A227]'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
                onClick={() => setActivePanel('symbols')}
              >
                Symbols
              </button>
              <button
                className={`flex-1 py-2 text-xs uppercase tracking-wider font-bold transition ${
                  activePanel === 'metadata'
                    ? 'text-[#C9A227] border-b-2 border-[#C9A227]'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
                onClick={() => setActivePanel('metadata')}
              >
                Plan Info
              </button>
            </div>

            {activePanel === 'symbols' && (
              <div className="p-3 space-y-3">
                {/* Affiliation filter */}
                <div className="flex flex-wrap gap-1">
                  {Object.entries(AFFILIATION_LABELS).map(([key, label]) => (
                    <button
                      key={key}
                      className={`text-[10px] px-2 py-1 rounded border transition ${
                        affiliationFilter === key
                          ? 'border-[#C9A227] text-[#C9A227] bg-[#C9A227]/10'
                          : 'border-gray-700 text-gray-500 hover:text-gray-300'
                      }`}
                      onClick={() => setAffiliationFilter(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Symbol list */}
                <div className="space-y-1">
                  {SYMBOL_PALETTE.filter(
                    (s) => s.affiliation === affiliationFilter,
                  ).map((s, i) => {
                    const dataUrl = renderSymbolDataURL(s.sidc, 28);
                    return (
                      <button
                        key={`${s.sidc}-${i}`}
                        className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-gray-800/60 transition text-left"
                        onClick={() => addUnit(s)}
                        title={`Add ${s.name}`}
                      >
                        {dataUrl ? (
                          <img src={dataUrl} alt={s.name} className="w-7 h-7 object-contain" />
                        ) : (
                          <div className="w-7 h-7 bg-gray-700 rounded" />
                        )}
                        <span className="text-sm text-gray-300">{s.name}</span>
                        <Plus className="w-3 h-3 text-gray-600 ml-auto" />
                      </button>
                    );
                  })}
                </div>

                {/* Placed units list */}
                {units.length > 0 && (
                  <div className="pt-3 border-t border-gray-800">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">
                      Placed Units ({units.length})
                    </p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {units.map((u) => {
                        const url = renderSymbolDataURL(u.symbol_code, 20);
                        return (
                          <button
                            key={u.id}
                            className={`flex items-center gap-2 w-full px-2 py-1 rounded text-left text-xs transition ${
                              selectedUnitId === u.id
                                ? 'bg-[#C9A227]/15 text-[#C9A227]'
                                : 'text-gray-400 hover:bg-gray-800/40'
                            }`}
                            onClick={() => {
                              setSelectedUnitId(u.id);
                              setActivePanel('properties');
                            }}
                          >
                            {url && <img src={url} alt="" className="w-5 h-5 object-contain" />}
                            <span className="truncate">{u.name || 'Unnamed'}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activePanel === 'metadata' && (
              <div className="p-3 space-y-3">
                <div>
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">
                    Plan Title
                  </label>
                  <Input
                    value={planTitle}
                    onChange={(e) => setPlanTitle(e.target.value)}
                    placeholder="Operation Thunder…"
                    className="bg-gray-900 border-gray-700 text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">
                    Description
                  </label>
                  <Textarea
                    value={planDescription}
                    onChange={(e) => setPlanDescription(e.target.value)}
                    placeholder="Briefing details…"
                    rows={4}
                    className="bg-gray-900 border-gray-700 text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">
                    Visibility
                  </label>
                  <select
                    value={planVisibility}
                    onChange={(e) => setPlanVisibility(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-300"
                  >
                    <option value="all_members">All Members</option>
                    <option value="staff_only">Staff Only</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Published:</span>
                  <Badge
                    className={
                      planPublished
                        ? 'bg-green-900/40 text-green-400 border border-green-700'
                        : 'bg-gray-800 text-gray-500 border border-gray-700'
                    }
                  >
                    {planPublished ? 'Yes' : 'Draft'}
                  </Badge>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Map Canvas ───────────────────────────────────────────────── */}
        <div className="flex-1 relative min-h-0 bg-[#060a14]">
          {!mapImageUrl ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-500">
              <MapPin className="w-16 h-16 text-gray-700" />
              <p className="text-lg">No map loaded</p>
              {!isViewOnly && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="border-[#C9A227] text-[#C9A227]"
                    onClick={() => setShowUploadDialog(true)}
                  >
                    <Upload className="w-4 h-4 mr-1" /> Upload Map
                  </Button>
                  <Button
                    variant="outline"
                    className="border-gray-600 text-gray-400"
                    onClick={openLoadDialog}
                  >
                    <FileText className="w-4 h-4 mr-1" /> Load Existing
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div ref={mapContainerRef} className="absolute inset-0" />
          )}
        </div>

        {/* ── Right Sidebar (Unit Properties) ──────────────────────────── */}
        <div className="w-72 border-l border-gray-800 bg-[#0c1322] overflow-y-auto shrink-0 hidden xl:block">
          <div className="border-b border-gray-800 px-3 py-2">
            <h3
              className="text-xs uppercase tracking-wider font-bold text-gray-400"
              style={{ fontFamily: 'Rajdhani, sans-serif' }}
            >
              {selectedUnit ? 'Unit Properties' : 'Select a Unit'}
            </h3>
          </div>

          {selectedUnit ? (
            <div className="p-3 space-y-3">
              {/* Preview */}
              <div className="flex justify-center py-2">
                {(() => {
                  const url = renderSymbolDataURL(selectedUnit.symbol_code, 48);
                  return url ? (
                    <img src={url} alt="" className="h-16 object-contain" />
                  ) : (
                    <div className="w-16 h-16 bg-gray-700 rounded" />
                  );
                })()}
              </div>

              {/* Editable fields */}
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">
                  Name
                </label>
                {isViewOnly ? (
                  <p className="text-sm text-gray-300">{selectedUnit.name || '—'}</p>
                ) : (
                  <Input
                    value={selectedUnit.name}
                    onChange={(e) => updateUnit(selectedUnit.id, { name: e.target.value })}
                    className="bg-gray-900 border-gray-700 text-sm"
                  />
                )}
              </div>

              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">
                  Affiliation
                </label>
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
                <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">
                  SIDC
                </label>
                <p className="text-xs text-gray-500 font-mono">{selectedUnit.symbol_code}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">
                    Rotation (°)
                  </label>
                  {isViewOnly ? (
                    <p className="text-sm text-gray-300">{selectedUnit.rotation}</p>
                  ) : (
                    <Input
                      type="number"
                      value={selectedUnit.rotation}
                      onChange={(e) =>
                        updateUnit(selectedUnit.id, { rotation: parseFloat(e.target.value) || 0 })
                      }
                      className="bg-gray-900 border-gray-700 text-sm"
                    />
                  )}
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">
                    Scale
                  </label>
                  {isViewOnly ? (
                    <p className="text-sm text-gray-300">{selectedUnit.scale}</p>
                  ) : (
                    <Input
                      type="number"
                      step="0.1"
                      min="0.2"
                      max="5"
                      value={selectedUnit.scale}
                      onChange={(e) =>
                        updateUnit(selectedUnit.id, {
                          scale: Math.max(0.2, Math.min(5, parseFloat(e.target.value) || 1)),
                        })
                      }
                      className="bg-gray-900 border-gray-700 text-sm"
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">
                  Notes
                </label>
                {isViewOnly ? (
                  <p className="text-sm text-gray-300">{selectedUnit.notes || '—'}</p>
                ) : (
                  <Textarea
                    value={selectedUnit.notes}
                    onChange={(e) => updateUnit(selectedUnit.id, { notes: e.target.value })}
                    rows={3}
                    className="bg-gray-900 border-gray-700 text-sm"
                  />
                )}
              </div>

              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">
                  Position (normalised)
                </label>
                <p className="text-xs text-gray-500 font-mono">
                  x: {selectedUnit.x.toFixed(4)} — y: {selectedUnit.y.toFixed(4)}
                </p>
              </div>

              {!isViewOnly && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full border-red-900 text-red-400 hover:bg-red-900/20"
                  onClick={() => deleteUnit(selectedUnit.id)}
                >
                  <Trash2 className="w-4 h-4 mr-1" /> Remove Unit
                </Button>
              )}
            </div>
          ) : (
            <div className="p-4 text-center text-gray-600 text-sm">
              <Crosshair className="w-8 h-8 mx-auto mb-2 text-gray-700" />
              Click a unit on the map or in the unit list to view/edit its properties.
            </div>
          )}
        </div>
      </div>

      {/* ── Upload Dialog ────────────────────────────────────────────────── */}
      {showUploadDialog && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-[#0c1322] border-gray-800">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[#C9A227]">Upload Tactical Map</CardTitle>
                <button onClick={() => setShowUploadDialog(false)}>
                  <X className="w-5 h-5 text-gray-400 hover:text-white" />
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-400">
                Upload a map image (JPG, PNG, or WebP). Max 20 MB.
              </p>
              <Input
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                onChange={handleMapUpload}
                disabled={uploading}
                className="bg-gray-900 border-gray-700"
              />
              {uploading && <p className="text-sm text-[#C9A227]">Uploading…</p>}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Load Dialog ──────────────────────────────────────────────────── */}
      {showLoadDialog && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl bg-[#0c1322] border-gray-800 max-h-[80vh] flex flex-col">
            <CardHeader className="pb-2 shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[#C9A227]">Load Plan or Map</CardTitle>
                <button onClick={() => setShowLoadDialog(false)}>
                  <X className="w-5 h-5 text-gray-400 hover:text-white" />
                </button>
              </div>
            </CardHeader>
            <CardContent className="overflow-y-auto space-y-4">
              {/* Existing plans */}
              {existingPlans.length > 0 && (
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-gray-500 mb-2">
                    Existing Plans
                  </h4>
                  <div className="space-y-1">
                    {existingPlans.map((p) => (
                      <button
                        key={p.id}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded hover:bg-gray-800/60 transition text-left"
                        onClick={() => {
                          setShowLoadDialog(false);
                          navigate(`/hub/operations-planner/${p.id}`);
                        }}
                      >
                        <FileText className="w-4 h-4 text-[#C9A227] shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm text-gray-200 truncate">{p.title}</p>
                          <p className="text-[10px] text-gray-500">
                            by {p.created_by_username} •{' '}
                            {p.is_published ? 'Published' : 'Draft'}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Available maps */}
              {availableMaps.length > 0 && (
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-gray-500 mb-2">
                    Available Maps
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {availableMaps.map((m) => (
                      <button
                        key={m.id}
                        className="flex flex-col items-center gap-1 p-2 rounded border border-gray-800 hover:border-[#C9A227]/50 transition"
                        onClick={() => selectExistingMap(m)}
                      >
                        <img
                          src={`${BACKEND_URL}${m.image_url}`}
                          alt={m.original_filename}
                          className="w-full h-20 object-cover rounded"
                        />
                        <span className="text-[10px] text-gray-400 truncate w-full text-center">
                          {m.original_filename}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {existingPlans.length === 0 && availableMaps.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-6">
                  No plans or maps found. Upload a map to get started.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

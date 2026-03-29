/**
 * OperationsPlanner.jsx
 *
 * Tactical planning tool for the 25th ID website.
 * Uses OpenLayers with an ImageStatic layer and milsymbol for NATO APP-6D
 * military symbology.  Supports uploading custom map images, placing/editing
 * military symbols, drawing tactical overlays, movement paths, and animated
 * unit movement along defined paths.
 *
 * Coordinates are normalised (0 → 1) so placement survives map resizing.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';

import { API, BACKEND_URL } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';
import { hasPermission, PERMISSIONS } from '@/utils/permissions';
import usePlanningSession from '@/hooks/usePlanningSession';
import useOlDrawing from '@/hooks/useOlDrawing';
import useAnimationEngine from '@/hooks/useAnimationEngine';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import {
  Upload, Save, Globe2, Trash2, Plus, ChevronLeft, Eye, EyeOff,
  RotateCw, ZoomIn, ZoomOut, Crosshair, Layers, Settings, MapPin,
  FileText, X, Check, Move, Pencil, Radio, Users, Lock, LogIn, LogOut,
  Navigation,
} from 'lucide-react';

import ExportControls from '@/components/operations/ExportControls';
import CommsChannel from '@/components/operations/CommsChannel';
import VersionHistory from '@/components/operations/VersionHistory';
import DrawingToolbar, { DEFAULT_STYLE } from '@/components/operations/DrawingToolbar';
import DrawingPropertiesPanel from '@/components/operations/DrawingPropertiesPanel';
import MovementPathPanel from '@/components/operations/MovementPathPanel';

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
  const sessionBroadcastRef = useRef({ sessionId: null, sendUnitUpdate: null });
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
  const [threatMapLink, setThreatMapLink] = useState('');
  const [geoLat, setGeoLat] = useState('');
  const [geoLng, setGeoLng] = useState('');

  /* ── UI state ───────────────────────────────────────────────────────────── */
  const [availableMaps, setAvailableMaps] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [activePanel, setActivePanel] = useState('symbols'); // symbols | draw | properties | paths | metadata
  const [affiliationFilter, setAffiliationFilter] = useState('friendly');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [existingPlans, setExistingPlans] = useState([]);

  /* ── Drawing state ─────────────────────────────────────────────────────── */
  const [drawings, setDrawings] = useState([]);
  const [selectedDrawingId, setSelectedDrawingId] = useState(null);
  const [activeTool, setActiveTool] = useState('select');
  const [drawStyle, setDrawStyle] = useState({ ...DEFAULT_STYLE });

  /* ── Movement path state ───────────────────────────────────────────────── */
  const [movementPaths, setMovementPaths] = useState([]);
  const [pathAssignments, setPathAssignments] = useState([]);
  const [selectedPathId, setSelectedPathId] = useState(null);

  /* ── Session / collaboration state ─────────────────────────────────────── */
  const [sessionId, setSessionId] = useState(null);
  const [joinCode, setJoinCode] = useState('');
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [allowLiveViewing, setAllowLiveViewing] = useState(false);

  /* ── WebSocket collaboration hook ──────────────────────────────────────── */
  const {
    connected: wsConnected,
    participants: wsParticipants,
    isLocked: wsLocked,
    sendUnitCreate,
    sendUnitUpdate,
    sendUnitDelete,
    sendPlanUpdate,
    createSession: apiCreateSession,
    joinSession: apiJoinSession,
    leaveSession: apiLeaveSession,
    closeSession: apiCloseSession,
    lockSession: apiLockSession,
  } = usePlanningSession({
    sessionId,
    onUnitCreate: (unit) => {
      setUnits((prev) => {
        if (prev.some((u) => u.id === unit.id)) return prev;
        return [...prev, unit];
      });
    },
    onUnitUpdate: (unitId, changes) => {
      setUnits((prev) => prev.map((u) => (u.id === unitId ? { ...u, ...changes } : u)));
    },
    onUnitDelete: (unitId) => {
      setUnits((prev) => prev.filter((u) => u.id !== unitId));
      setSelectedUnitId((prev) => (prev === unitId ? null : prev));
    },
    onPlanUpdate: (fields) => {
      if (fields.title !== undefined) setPlanTitle(fields.title);
      if (fields.description !== undefined) setPlanDescription(fields.description);
      if (fields.allow_live_viewing !== undefined) setAllowLiveViewing(fields.allow_live_viewing);
    },
    onSyncState: (state) => {
      if (state.units) {
        setUnits(state.units.map((u) => ({ ...u, id: u.id || crypto.randomUUID() })));
      }
      if (state.title) setPlanTitle(state.title);
      if (state.description) setPlanDescription(state.description);
    },
    onSessionClose: () => {
      setSessionId(null);
      setJoinCode('');
    },
    onSessionLock: () => {
      // isLocked comes from hook state
    },
  });

  /* ── Session control handlers ──────────────────────────────────────────── */

  const handleStartSession = async () => {
    if (!planId) {
      alert('Save the plan first before starting a session.');
      return;
    }
    try {
      const data = await apiCreateSession(planId);
      setSessionId(data.id);
      setJoinCode(data.join_code);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to start session');
    }
  };

  const handleJoinSession = async () => {
    if (!joinCodeInput.trim()) return;
    try {
      const data = await apiJoinSession(joinCodeInput.trim().toUpperCase());
      setSessionId(data.session_id);
      setJoinCode(data.join_code);
      setShowJoinDialog(false);
      setJoinCodeInput('');
      // Navigate to the plan if not already there
      if (data.plan_id && data.plan_id !== planId) {
        navigate(`/hub/operations-planner/${data.plan_id}`);
      }
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to join session');
    }
  };

  const handleEndSession = async () => {
    if (!sessionId) return;
    if (!window.confirm('End the live session for all participants?')) return;
    try {
      await apiCloseSession(sessionId);
      setSessionId(null);
      setJoinCode('');
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to end session');
    }
  };

  const handleToggleLiveViewing = async () => {
    const newVal = !allowLiveViewing;
    setAllowLiveViewing(newVal);
    // Persist to backend
    if (planId) {
      try {
        await axios.put(`${API}/operations-plans/${planId}`, { allow_live_viewing: newVal });
      } catch { /* ignore */ }
    }
    // Broadcast via WS if connected
    if (sessionId) {
      sendPlanUpdate({ allow_live_viewing: newVal });
    }
  };

  /* ── Keep broadcast ref in sync for OL callbacks ─────────────────────── */
  useEffect(() => {
    sessionBroadcastRef.current = { sessionId, sendUnitUpdate };
  }, [sessionId, sendUnitUpdate]);

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
      setAllowLiveViewing(!!plan.allow_live_viewing);
      setThreatMapLink(plan.threat_map_link || '');
      setGeoLat(plan.geo_lat != null ? String(plan.geo_lat) : '');
      setGeoLng(plan.geo_lng != null ? String(plan.geo_lng) : '');
      // If the plan has an active live session, auto-connect
      if (plan.live_session_id && plan.is_live_session_active) {
        setSessionId(plan.live_session_id);
      }
      setUnits(
        (plan.units || []).map((u) => ({
          ...u,
          id: u.id || crypto.randomUUID(),
        })),
      );
      // Load drawings, movement paths, and path assignments
      setDrawings(
        (plan.drawings || []).map((d) => ({
          ...d,
          id: d.id || crypto.randomUUID(),
        })),
      );
      setMovementPaths(
        (plan.movement_paths || []).map((p) => ({
          ...p,
          id: p.id || crypto.randomUUID(),
        })),
      );
      setPathAssignments(
        (plan.path_assignments || []).map((a) => ({
          ...a,
          id: a.id || crypto.randomUUID(),
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
          const clampedX = Math.max(0, Math.min(1, nx));
          const clampedY = Math.max(0, Math.min(1, ny));
          setUnits((prev) =>
            prev.map((u) =>
              u.id === uid ? { ...u, x: clampedX, y: clampedY } : u,
            ),
          );
          // Broadcast position change via WS
          const br = sessionBroadcastRef.current;
          if (br.sessionId && br.sendUnitUpdate) {
            br.sendUnitUpdate(uid, { x: clampedX, y: clampedY });
          }
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
      const parsedGeoLat = geoLat === '' ? null : parseFloat(geoLat);
      const parsedGeoLng = geoLng === '' ? null : parseFloat(geoLng);
      const payload = {
        title: planTitle,
        description: planDescription,
        map_id: planMapId,
        units: units.map(({ id, ...rest }) => {
          const lat = rest.geo_lat === '' || rest.geo_lat === null || rest.geo_lat === undefined ? null : parseFloat(rest.geo_lat);
          const lng = rest.geo_lng === '' || rest.geo_lng === null || rest.geo_lng === undefined ? null : parseFloat(rest.geo_lng);
          return {
            ...rest,
            geo_lat: (lat !== null && !Number.isNaN(lat)) ? lat : null,
            geo_lng: (lng !== null && !Number.isNaN(lng)) ? lng : null,
            location_name: rest.location_name || '',
          };
        }),
        drawings: drawings.map(({ id, ...rest }) => rest),
        movement_paths: movementPaths.map(({ id, ...rest }) => rest),
        path_assignments: pathAssignments.map(({ id, ...rest }) => rest),
        is_published: publish !== null ? publish : planPublished,
        visibility_scope: planVisibility,
        threat_map_link: threatMapLink || null,
        geo_lat: (parsedGeoLat != null && !Number.isNaN(parsedGeoLat)) ? parsedGeoLat : null,
        geo_lng: (parsedGeoLng != null && !Number.isNaN(parsedGeoLng)) ? parsedGeoLng : null,
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
      geo_lat: '',
      geo_lng: '',
      location_name: '',
    };
    setUnits((prev) => [...prev, newUnit]);
    setSelectedUnitId(newUnit.id);
    setActivePanel('properties');
    // Broadcast if in session
    if (sessionId) sendUnitCreate(newUnit);
  };

  const updateUnit = (id, changes) => {
    setUnits((prev) => prev.map((u) => (u.id === id ? { ...u, ...changes } : u)));
    // Broadcast if in session
    if (sessionId) sendUnitUpdate(id, changes);
  };

  const deleteUnit = (id) => {
    setUnits((prev) => prev.filter((u) => u.id !== id));
    if (selectedUnitId === id) setSelectedUnitId(null);
    // Broadcast if in session
    if (sessionId) sendUnitDelete(id);
  };

  const selectedUnit = units.find((u) => u.id === selectedUnitId);

  /* ══════════════════════════════════════════════════════════════════════════
     Drawing management
     ══════════════════════════════════════════════════════════════════════════ */

  const addDrawing = useCallback((drawingData) => {
    const newDrawing = {
      id: crypto.randomUUID(),
      ...drawingData,
    };
    setDrawings((prev) => [...prev, newDrawing]);
    setSelectedDrawingId(newDrawing.id);
    setSelectedUnitId(null);
    setSelectedPathId(null);
  }, []);

  const updateDrawing = useCallback((id, changes) => {
    setDrawings((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...changes } : d)),
    );
  }, []);

  const deleteDrawing = useCallback((id) => {
    setDrawings((prev) => prev.filter((d) => d.id !== id));
    if (selectedDrawingId === id) setSelectedDrawingId(null);
  }, [selectedDrawingId]);

  const selectedDrawing = drawings.find((d) => d.id === selectedDrawingId);

  /* ══════════════════════════════════════════════════════════════════════════
     Movement path management
     ══════════════════════════════════════════════════════════════════════════ */

  const addMovementPath = useCallback((pathData) => {
    const newPath = {
      id: crypto.randomUUID(),
      ...pathData,
    };
    setMovementPaths((prev) => [...prev, newPath]);
    setSelectedPathId(newPath.id);
    setSelectedDrawingId(null);
    setSelectedUnitId(null);
    setActivePanel('paths');
  }, []);

  const updateMovementPath = useCallback((id, changes) => {
    setMovementPaths((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...changes } : p)),
    );
  }, []);

  const deleteMovementPath = useCallback((id) => {
    setMovementPaths((prev) => prev.filter((p) => p.id !== id));
    setPathAssignments((prev) => prev.filter((a) => a.path_id !== id));
    if (selectedPathId === id) setSelectedPathId(null);
  }, [selectedPathId]);

  const linkUnitToPath = useCallback((unitId, pathId) => {
    const existing = pathAssignments.find(
      (a) => a.unit_id === unitId && a.path_id === pathId,
    );
    if (existing) return;
    setPathAssignments((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        unit_id: unitId,
        path_id: pathId,
        start_time: 0,
        mode: 'linked',
      },
    ]);
  }, [pathAssignments]);

  const unlinkUnitFromPath = useCallback((unitId, pathId) => {
    setPathAssignments((prev) =>
      prev.filter((a) => !(a.unit_id === unitId && a.path_id === pathId)),
    );
  }, []);

  /* ── Animation engine ──────────────────────────────────────────────────── */

  const handleAnimationPositionUpdate = useCallback((unitId, pos) => {
    setUnits((prev) =>
      prev.map((u) =>
        u.id === unitId ? { ...u, x: pos.x, y: pos.y } : u,
      ),
    );
  }, []);

  const animation = useAnimationEngine({
    movementPaths,
    pathAssignments,
    units,
    onUnitPositionUpdate: handleAnimationPositionUpdate,
  });

  /* ── OL Drawing integration ────────────────────────────────────────────── */

  useOlDrawing({
    olMap: mapRef.current,
    mapDimensions,
    activeTool,
    drawStyle,
    drawings,
    movementPaths,
    onDrawingComplete: addDrawing,
    onMovementPathComplete: addMovementPath,
    selectedDrawingId,
    onSelectDrawing: (id) => {
      setSelectedDrawingId(id);
      if (id) {
        setSelectedUnitId(null);
        setSelectedPathId(null);
      }
    },
    selectedPathId,
    onSelectPath: (id) => {
      setSelectedPathId(id);
      if (id) {
        setSelectedUnitId(null);
        setSelectedDrawingId(null);
        setActivePanel('paths');
      }
    },
    isViewOnly,
  });

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
    if (!window.confirm('Clear all units, drawings, and paths from the map?')) return;
    setUnits([]);
    setDrawings([]);
    setMovementPaths([]);
    setPathAssignments([]);
    setSelectedUnitId(null);
    setSelectedDrawingId(null);
    setSelectedPathId(null);
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

        {/* Session / live indicator */}
        {sessionId && wsConnected && (
          <Badge className="bg-red-600/80 text-white animate-pulse ml-1 text-[10px]">
            <Radio className="w-3 h-3 mr-1" /> LIVE
          </Badge>
        )}
        {wsLocked && (
          <Badge className="bg-yellow-700/60 text-yellow-300 ml-1 text-[10px]">
            <Lock className="w-3 h-3 mr-1" /> LOCKED
          </Badge>
        )}

        {/* Active collaborators */}
        {wsParticipants.length > 0 && (
          <div className="flex items-center gap-1 ml-2">
            <Users className="w-3.5 h-3.5 text-gray-500" />
            <div className="flex -space-x-1">
              {wsParticipants.slice(0, 5).map((p) => (
                <div
                  key={p.user_id}
                  className="w-6 h-6 rounded-full bg-[#C9A227]/30 border border-[#C9A227]/50 flex items-center justify-center text-[9px] font-bold text-[#C9A227]"
                  title={p.username}
                >
                  {(p.username || '?')[0].toUpperCase()}
                </div>
              ))}
            </div>
            {wsParticipants.length > 5 && (
              <span className="text-[10px] text-gray-500">+{wsParticipants.length - 5}</span>
            )}
          </div>
        )}

        <div className="flex-1" />

        {!isViewOnly && (
          <>
            {/* Session controls */}
            {!sessionId ? (
              <>
                {planId && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-green-700 text-green-400 hover:bg-green-900/30"
                    onClick={handleStartSession}
                  >
                    <Radio className="w-4 h-4 mr-1" /> Start Session
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="border-blue-700 text-blue-400 hover:bg-blue-900/30"
                  onClick={() => setShowJoinDialog(true)}
                >
                  <LogIn className="w-4 h-4 mr-1" /> Join
                </Button>
              </>
            ) : (
              <>
                {joinCode && (
                  <div className="flex items-center gap-1 bg-gray-800/60 rounded px-2 py-1">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">Code:</span>
                    <span className="text-sm font-mono text-[#C9A227] select-all">{joinCode}</span>
                  </div>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className={`${
                    allowLiveViewing
                      ? 'border-green-600 text-green-400'
                      : 'border-gray-600 text-gray-400'
                  }`}
                  onClick={handleToggleLiveViewing}
                  title="Allow Hub members to view this session live"
                >
                  {allowLiveViewing ? <Eye className="w-4 h-4 mr-1" /> : <EyeOff className="w-4 h-4 mr-1" />}
                  Live View
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-800 text-red-400 hover:bg-red-900/30"
                  onClick={handleEndSession}
                >
                  <X className="w-4 h-4 mr-1" /> End Session
                </Button>
              </>
            )}

            <div className="w-px h-5 bg-gray-700 mx-1" />

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
            <ExportControls
              mapRef={mapRef}
              planTitle={planTitle}
              planDescription={planDescription}
              unitCount={units.length}
              createdBy={user?.username || ''}
            />
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

      {/* ── Join Session Dialog ─────────────────────────────────────────── */}
      {showJoinDialog && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <Card className="w-full max-w-sm bg-[#0c1322] border-gray-800">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[#C9A227]">Join Session</CardTitle>
                <button onClick={() => setShowJoinDialog(false)}>
                  <X className="w-5 h-5 text-gray-400 hover:text-white" />
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-400">
                Enter the session join code shared by the session host.
              </p>
              <Input
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                placeholder="e.g. A1B2C3D4"
                className="bg-gray-900 border-gray-700 font-mono text-center text-lg tracking-widest"
                maxLength={8}
              />
              <Button
                className="w-full bg-[#C9A227] text-black hover:bg-[#b8931f]"
                onClick={handleJoinSession}
                disabled={!joinCodeInput.trim()}
              >
                <LogIn className="w-4 h-4 mr-1" /> Join Session
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Main Content ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── Left Sidebar ─────────────────────────────────────────────── */}
        {!isViewOnly && (
          <div className="w-64 border-r border-gray-800 bg-[#0c1322] overflow-y-auto shrink-0 hidden lg:block">
            {/* Panel tabs */}
            <div className="flex border-b border-gray-800">
              <button
                className={`flex-1 py-2 text-[10px] uppercase tracking-wider font-bold transition ${
                  activePanel === 'symbols'
                    ? 'text-[#C9A227] border-b-2 border-[#C9A227]'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
                onClick={() => setActivePanel('symbols')}
              >
                Units
              </button>
              <button
                className={`flex-1 py-2 text-[10px] uppercase tracking-wider font-bold transition ${
                  activePanel === 'draw'
                    ? 'text-[#C9A227] border-b-2 border-[#C9A227]'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
                onClick={() => setActivePanel('draw')}
              >
                Draw
              </button>
              <button
                className={`flex-1 py-2 text-[10px] uppercase tracking-wider font-bold transition ${
                  activePanel === 'metadata'
                    ? 'text-[#C9A227] border-b-2 border-[#C9A227]'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
                onClick={() => setActivePanel('metadata')}
              >
                Info
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

            {activePanel === 'draw' && (
              <div className="p-3">
                <DrawingToolbar
                  activeTool={activeTool}
                  onToolChange={(tool) => {
                    setActiveTool(tool);
                    // When switching to a draw tool, deselect units
                    if (tool !== 'select') {
                      setSelectedUnitId(null);
                    }
                  }}
                  drawStyle={drawStyle}
                  onStyleChange={setDrawStyle}
                />

                {/* Drawings list */}
                {drawings.length > 0 && (
                  <div className="pt-3 mt-3 border-t border-gray-800">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">
                      Drawings ({drawings.length})
                    </p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {drawings.map((d) => (
                        <button
                          key={d.id}
                          className={`flex items-center gap-2 w-full px-2 py-1 rounded text-left text-xs transition ${
                            selectedDrawingId === d.id
                              ? 'bg-[#C9A227]/15 text-[#C9A227]'
                              : 'text-gray-400 hover:bg-gray-800/40'
                          }`}
                          onClick={() => {
                            setSelectedDrawingId(d.id);
                            setSelectedUnitId(null);
                            setSelectedPathId(null);
                          }}
                        >
                          <Pencil className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">
                            {d.label || d.drawing_type || 'Drawing'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Movement paths list */}
                {movementPaths.length > 0 && (
                  <div className="pt-3 mt-3 border-t border-gray-800">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">
                      Paths ({movementPaths.length})
                    </p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {movementPaths.map((p) => (
                        <button
                          key={p.id}
                          className={`flex items-center gap-2 w-full px-2 py-1 rounded text-left text-xs transition ${
                            selectedPathId === p.id
                              ? 'bg-[#3B82F6]/15 text-[#3B82F6]'
                              : 'text-gray-400 hover:bg-gray-800/40'
                          }`}
                          onClick={() => {
                            setSelectedPathId(p.id);
                            setSelectedDrawingId(null);
                            setSelectedUnitId(null);
                            setActivePanel('paths');
                          }}
                        >
                          <Navigation className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">
                            {p.name || 'Unnamed Path'}
                          </span>
                        </button>
                      ))}
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

                {/* ── Threat Map Integration ──────────────────────────── */}
                <div className="pt-2 border-t border-gray-800">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">
                    <Globe2 className="w-3 h-3 inline mr-1" />Threat Map Integration
                  </p>
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">
                      Threat Map Link
                    </label>
                    <Input
                      value={threatMapLink}
                      onChange={(e) => setThreatMapLink(e.target.value)}
                      placeholder="Operation or event ID…"
                      className="bg-gray-900 border-gray-700 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">
                        Geo Latitude
                      </label>
                      <Input
                        type="number"
                        step="any"
                        value={geoLat}
                        onChange={(e) => setGeoLat(e.target.value)}
                        placeholder="e.g. 21.49"
                        className="bg-gray-900 border-gray-700 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">
                        Geo Longitude
                      </label>
                      <Input
                        type="number"
                        step="any"
                        value={geoLng}
                        onChange={(e) => setGeoLng(e.target.value)}
                        placeholder="e.g. -158.06"
                        className="bg-gray-900 border-gray-700 text-sm"
                      />
                    </div>
                  </div>
                  <p className="text-[9px] text-gray-600 mt-1">
                    Optional. If set, this plan appears on the Global Threat Map.
                  </p>
                </div>
              </div>
            )}

            {/* ── Comms Channel (below panels) ───────────────────────── */}
            {planId && (
              <div className="border-t border-gray-800">
                <CommsChannel
                  planId={planId}
                  sessionId={sessionId}
                  readOnly={isViewOnly}
                  username={user?.username || ''}
                />
              </div>
            )}

            {/* ── Version History ─────────────────────────────────────── */}
            {planId && (
              <VersionHistory
                planId={planId}
                canRollback={canEdit}
                onRollback={() => loadPlan(planId)}
              />
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

        {/* ── Right Sidebar (Properties) ───────────────────────────────── */}
        <div className="w-72 border-l border-gray-800 bg-[#0c1322] overflow-y-auto shrink-0 hidden xl:block">
          {/* Tab switcher for right panel */}
          <div className="flex border-b border-gray-800">
            <button
              className={`flex-1 py-2 text-[10px] uppercase tracking-wider font-bold transition ${
                activePanel === 'properties' || activePanel === 'symbols'
                  ? 'text-[#C9A227] border-b-2 border-[#C9A227]'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
              onClick={() => setActivePanel('properties')}
            >
              Properties
            </button>
            <button
              className={`flex-1 py-2 text-[10px] uppercase tracking-wider font-bold transition ${
                activePanel === 'paths'
                  ? 'text-[#3B82F6] border-b-2 border-[#3B82F6]'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
              onClick={() => setActivePanel('paths')}
            >
              Paths
            </button>
          </div>

          {activePanel === 'paths' ? (
            <div className="p-3">
              <MovementPathPanel
                movementPaths={movementPaths}
                pathAssignments={pathAssignments}
                units={units}
                selectedPathId={selectedPathId}
                onSelectPath={(id) => {
                  setSelectedPathId(id);
                  if (id) {
                    setSelectedUnitId(null);
                    setSelectedDrawingId(null);
                  }
                }}
                onUpdatePath={updateMovementPath}
                onDeletePath={deleteMovementPath}
                onLinkUnit={linkUnitToPath}
                onUnlinkUnit={unlinkUnitFromPath}
                animPlaying={animation.playing}
                animProgress={animation.progress}
                animSpeed={animation.speed}
                onAnimPlay={animation.play}
                onAnimPause={animation.pause}
                onAnimReset={animation.reset}
                onAnimSeek={animation.seekTo}
                onAnimSetSpeed={animation.setSpeed}
                isViewOnly={isViewOnly}
              />
            </div>
          ) : selectedDrawing ? (
            <DrawingPropertiesPanel
              drawing={selectedDrawing}
              onUpdate={updateDrawing}
              onDelete={deleteDrawing}
              isViewOnly={isViewOnly}
            />
          ) : (
            <>
              <div className="border-b border-gray-800 px-3 py-2">
                <h3
                  className="text-xs uppercase tracking-wider font-bold text-gray-400"
                  style={{ fontFamily: 'Rajdhani, sans-serif' }}
                >
                  {selectedUnit ? 'Unit Properties' : 'Select a Unit or Drawing'}
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

              {/* ── Unit Geo Coordinates ─────────────────────────── */}
              <div className="pt-2 border-t border-gray-800">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">
                  <Globe2 className="w-3 h-3 inline mr-1" />Geo Location
                </p>
                <div>
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">
                    Location Name
                  </label>
                  {isViewOnly ? (
                    <p className="text-sm text-gray-300">{selectedUnit.location_name || '—'}</p>
                  ) : (
                    <Input
                      value={selectedUnit.location_name || ''}
                      onChange={(e) => updateUnit(selectedUnit.id, { location_name: e.target.value })}
                      placeholder="e.g. Schofield Barracks, HI"
                      className="bg-gray-900 border-gray-700 text-sm"
                    />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">
                      Latitude
                    </label>
                    {isViewOnly ? (
                      <p className="text-sm text-gray-300">{selectedUnit.geo_lat ?? '—'}</p>
                    ) : (
                      <Input
                        type="number"
                        step="any"
                        value={selectedUnit.geo_lat ?? ''}
                        onChange={(e) => updateUnit(selectedUnit.id, { geo_lat: e.target.value })}
                        placeholder="e.g. 21.49"
                        className="bg-gray-900 border-gray-700 text-sm"
                      />
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">
                      Longitude
                    </label>
                    {isViewOnly ? (
                      <p className="text-sm text-gray-300">{selectedUnit.geo_lng ?? '—'}</p>
                    ) : (
                      <Input
                        type="number"
                        step="any"
                        value={selectedUnit.geo_lng ?? ''}
                        onChange={(e) => updateUnit(selectedUnit.id, { geo_lng: e.target.value })}
                        placeholder="e.g. -158.06"
                        className="bg-gray-900 border-gray-700 text-sm"
                      />
                    )}
                  </div>
                </div>
                <p className="text-[9px] text-gray-600 mt-1">
                  Optional. Real-world coordinates for Global Threat Map placement.
                </p>
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
              Click a unit or drawing on the map to view/edit its properties.
            </div>
          )}
            </>
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

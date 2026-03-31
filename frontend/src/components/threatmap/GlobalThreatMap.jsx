import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map, {
  NavigationControl,
  GeolocateControl,
  ScaleControl,
  Source,
  Layer,
  Popup,
  Marker,
} from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useMapStore, useEventsStore, threatLevelColors } from '@/stores/threatMapStore';
import EventPopup from './EventPopup';
import OperationPopup from './OperationPopup';
import IntelPopup from './IntelPopup';
import CampaignPopup from './CampaignPopup';
import CountryConflictsModal from './CountryConflictsModal';
import AircraftLayer, { addAircraftIcon, AIRCRAFT_INTERACTIVE_LAYERS } from './AircraftLayer';
import ADSBFilterPanel from './ADSBFilterPanel';
import useADSBAircraft from '@/hooks/useADSBAircraft';
import axios from 'axios';
import { API } from '@/utils/api';

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;
const CLUSTER_MAX_ZOOM = 14;
const CLUSTER_RADIUS = 50;

const clusterLayer = {
  id: 'clusters',
  type: 'circle',
  filter: ['has', 'point_count'],
  paint: {
    'circle-color': [
      'step', ['get', 'maxSeverity'],
      '#94a3b8', 2, '#22c55e', 3, '#eab308', 4, '#f97316', 5, '#ef4444',
    ],
    'circle-radius': ['step', ['get', 'point_count'], 12, 10, 16, 30, 20, 100, 24],
    'circle-stroke-width': 2,
    'circle-stroke-color': '#1e293b',
    'circle-opacity': 0.85,
  },
};

const clusterCountLayer = {
  id: 'cluster-count',
  type: 'symbol',
  filter: ['has', 'point_count'],
  layout: {
    'text-field': ['get', 'point_count_abbreviated'],
    'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
    'text-size': 11,
  },
  paint: { 'text-color': '#ffffff' },
};

const unclusteredPointLayer = {
  id: 'unclustered-point',
  type: 'circle',
  filter: ['!', ['has', 'point_count']],
  paint: {
    'circle-color': [
      'match', ['get', 'threatLevel'],
      'critical', threatLevelColors.critical,
      'high', threatLevelColors.high,
      'medium', threatLevelColors.medium,
      'low', threatLevelColors.low,
      'info', threatLevelColors.info,
      '#94a3b8',
    ],
    'circle-radius': 8,
    'circle-stroke-width': 2,
    'circle-stroke-color': '#1e293b',
  },
};

const pulseRingLayer = {
  id: 'pulse-ring',
  type: 'circle',
  filter: [
    'all',
    ['!', ['has', 'point_count']],
    ['in', ['get', 'threatLevel'], ['literal', ['critical', 'high']]],
  ],
  paint: {
    'circle-color': [
      'match', ['get', 'threatLevel'],
      'critical', threatLevelColors.critical,
      'high', threatLevelColors.high,
      '#ef4444',
    ],
    'circle-radius': 16,
    'circle-opacity': 0.15,
    'circle-stroke-width': 1,
    'circle-stroke-color': [
      'match', ['get', 'threatLevel'],
      'critical', threatLevelColors.critical,
      'high', threatLevelColors.high,
      '#ef4444',
    ],
    'circle-stroke-opacity': 0.3,
  },
};

const heatmapLayer = {
  id: 'events-heat',
  type: 'heatmap',
  maxzoom: 9,
  paint: {
    'heatmap-weight': ['interpolate', ['linear'], ['get', 'severity'], 0, 0, 5, 1],
    'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
    'heatmap-color': [
      'interpolate', ['linear'], ['heatmap-density'],
      0, 'rgba(0, 0, 0, 0)',
      0.2, 'rgba(59, 130, 246, 0.5)',
      0.4, 'rgba(234, 179, 8, 0.6)',
      0.6, 'rgba(249, 115, 22, 0.7)',
      0.8, 'rgba(239, 68, 68, 0.8)',
      1, 'rgba(220, 38, 38, 0.9)',
    ],
    'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 9, 20],
    'heatmap-opacity': 0.8,
  },
};

const entityLocationLayer = {
  id: 'entity-locations',
  type: 'circle',
  paint: {
    'circle-color': '#a855f7',
    'circle-radius': 10,
    'circle-stroke-width': 3,
    'circle-stroke-color': '#ffffff',
  },
};

const entityLocationLabelLayer = {
  id: 'entity-location-labels',
  type: 'symbol',
  layout: {
    'text-field': ['get', 'placeName'],
    'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
    'text-size': 12,
    'text-offset': [0, 1.5],
    'text-anchor': 'top',
  },
  paint: {
    'text-color': '#a855f7',
    'text-halo-color': '#1e293b',
    'text-halo-width': 1,
  },
};

const militaryBaseLayer = {
  id: 'military-bases',
  type: 'circle',
  paint: {
    'circle-color': '#FFD700',
    'circle-radius': 5,
    'circle-stroke-width': 1,
    'circle-stroke-color': '#1e293b',
    'circle-opacity': 0.7,
  },
};

const militaryBaseLabelLayer = {
  id: 'military-base-labels',
  type: 'symbol',
  minzoom: 5,
  layout: {
    'text-field': ['get', 'baseName'],
    'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
    'text-size': 10,
    'text-offset': [0, 1.2],
    'text-anchor': 'top',
  },
  paint: {
    'text-color': '#FFE44D',
    'text-halo-color': '#1e293b',
    'text-halo-width': 1,
  },
};

/* Operations overlay (our internal ops) - gold markers */
const operationsLayer = {
  id: 'operations-markers',
  type: 'circle',
  paint: {
    'circle-color': '#FFD700',
    'circle-radius': 10,
    'circle-stroke-width': 3,
    'circle-stroke-color': '#B8960F',
  },
};

const operationsLabelLayer = {
  id: 'operations-labels',
  type: 'symbol',
  layout: {
    'text-field': ['get', 'title'],
    'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
    'text-size': 11,
    'text-offset': [0, 1.8],
    'text-anchor': 'top',
    'text-max-width': 12,
  },
  paint: {
    'text-color': '#FFD700',
    'text-halo-color': '#1e293b',
    'text-halo-width': 1,
  },
};

const severityToNumber = {
  info: 1,
  low: 2,
  medium: 3,
  high: 4,
  critical: 5,
};

/* Intel overlay - red markers */
const intelLayer = {
  id: 'intel-markers',
  type: 'circle',
  paint: {
    'circle-color': '#C8102E',
    'circle-radius': 9,
    'circle-stroke-width': 2,
    'circle-stroke-color': '#8B0A1E',
  },
};

const intelLabelLayer = {
  id: 'intel-labels',
  type: 'symbol',
  layout: {
    'text-field': ['get', 'title'],
    'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
    'text-size': 10,
    'text-offset': [0, 1.6],
    'text-anchor': 'top',
    'text-max-width': 12,
  },
  paint: {
    'text-color': '#E0334A',
    'text-halo-color': '#1e293b',
    'text-halo-width': 1,
  },
};

/* Campaign overlay - olive/green markers */
const campaignLayer = {
  id: 'campaign-markers',
  type: 'circle',
  paint: {
    'circle-color': '#556B2F',
    'circle-radius': 10,
    'circle-stroke-width': 2,
    'circle-stroke-color': '#3d4f22',
  },
};

const campaignLabelLayer = {
  id: 'campaign-labels',
  type: 'symbol',
  layout: {
    'text-field': ['get', 'title'],
    'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
    'text-size': 10,
    'text-offset': [0, 1.6],
    'text-anchor': 'top',
    'text-max-width': 12,
  },
  paint: {
    'text-color': '#7a9a42',
    'text-halo-color': '#1e293b',
    'text-halo-width': 1,
  },
};

/* ── NATO Symbology SVG Renderer (APP-6 Inspired) ──────────────────────── */

const NATO_AFFILIATION_COLORS = {
  friendly: { fill: '#80b0ff', stroke: '#3366cc', bg: '#1a3a6e' },
  hostile: { fill: '#ff8080', stroke: '#cc3333', bg: '#6e1a1a' },
  neutral: { fill: '#80ff80', stroke: '#33aa33', bg: '#1a6e1a' },
  unknown: { fill: '#ffff80', stroke: '#cccc33', bg: '#6e6e1a' },
};

const NATO_SYMBOL_ICONS = {
  infantry: 'M4,12 L16,4 L28,12 L16,20 Z',
  armor: (sz) => `<ellipse cx="${sz/2}" cy="${sz/2}" rx="${sz*0.38}" ry="${sz*0.28}" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
  aviation: 'M6,18 L16,6 L26,18',
  artillery: 'M10,8 L22,8 M16,8 L16,24',
  logistics: 'M8,10 L24,10 L24,22 L8,22 Z',
  headquarters: 'M8,16 L24,16 M8,8 L8,24',
  medical: 'M14,8 L18,8 L18,14 L24,14 L24,18 L18,18 L18,24 L14,24 L14,18 L8,18 L8,14 L14,14 Z',
  recon: 'M8,16 L16,8 L24,16 L16,24 Z',
  signal: 'M8,20 Q12,6 16,16 Q20,26 24,12',
  engineer: 'M8,8 L24,24 M24,8 L8,24',
  objective: 'M16,6 L16,26 M6,16 L26,16',
  waypoint: 'M16,4 L20,14 L28,16 L20,18 L16,28 L12,18 L4,16 L12,14 Z',
  air_defense: 'M8,22 L16,8 L24,22 M8,16 L24,16',
  naval: 'M6,16 Q10,10 16,16 Q22,22 26,16',
  special_operations: 'M16,6 L19,13 L26,14 L21,19 L22,26 L16,22 L10,26 L11,19 L6,14 L13,13 Z',
  military_police: 'M10,8 L22,8 L22,24 L10,24 Z M16,8 L16,24',
  chemical: 'M10,10 L22,10 L22,22 L10,22 Z M10,10 L22,22 M22,10 L10,22',
  maintenance: 'M8,16 L24,16 M16,8 L16,24 M10,10 L22,22',
  transportation: 'M6,20 L16,10 L26,20 M11,15 L21,15',
  supply: 'M8,12 L24,12 L24,20 L8,20 Z',
  missile: 'M16,6 L16,26 M12,10 L16,6 L20,10',
  cyber: 'M8,16 L12,10 L20,10 L24,16 L20,22 L12,22 Z',
  civil_affairs: 'M10,16 L16,10 L22,16 L16,22 Z M16,10 L16,6 M16,22 L16,26',
  psychological_operations: 'M10,8 L22,8 Q26,16 22,24 L10,24 Q6,16 10,8 Z',
  unmanned_aerial: 'M8,16 L16,8 L24,16 M12,22 L16,16 L20,22',
  electronic_warfare: 'M8,16 Q12,8 16,16 Q20,24 24,16 M8,12 L24,12',
  staging_area: 'M8,8 L24,8 L24,24 L8,24 Z M12,12 L20,12 L20,20 L12,20 Z',
  custom: 'M16,6 L16,26 M6,16 L26,16 M10,10 L22,22 M22,10 L10,22',
};

function buildNATOMarkerSVG(affiliation, symbolType, size = 32) {
  const colors = NATO_AFFILIATION_COLORS[affiliation] || NATO_AFFILIATION_COLORS.unknown;
  let shape;
  if (affiliation === 'friendly') {
    shape = `<rect x="3" y="6" width="${size-6}" height="${size-12}" rx="2" fill="${colors.bg}" stroke="${colors.stroke}" stroke-width="2"/>`;
  } else if (affiliation === 'hostile') {
    shape = `<polygon points="${size/2},3 ${size-3},${size/2} ${size/2},${size-3} 3,${size/2}" fill="${colors.bg}" stroke="${colors.stroke}" stroke-width="2"/>`;
  } else if (affiliation === 'neutral') {
    shape = `<rect x="4" y="4" width="${size-8}" height="${size-8}" fill="${colors.bg}" stroke="${colors.stroke}" stroke-width="2"/>`;
  } else {
    shape = `<rect x="4" y="4" width="${size-8}" height="${size-8}" rx="${size/4}" fill="${colors.bg}" stroke="${colors.stroke}" stroke-width="2"/>`;
  }

  let icon = '';
  const sym = NATO_SYMBOL_ICONS[symbolType];
  if (typeof sym === 'function') {
    icon = sym(size);
  } else if (typeof sym === 'string') {
    if (sym.startsWith('M') || sym.startsWith('m')) {
      icon = `<path d="${sym}" fill="none" stroke="${colors.fill}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
  }
  if (symbolType === 'medical') {
    icon = `<path d="${NATO_SYMBOL_ICONS.medical}" fill="${colors.fill}" stroke="none"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${shape}${icon}</svg>`;
}

/* ── Deployment path colours per unit ────────────────────────────────────── */
// 25th ID fixed branded color
const TWENTY_FIFTH_COLOR = '#FFD700';

// Partner unit palette – blues / cyans / teals (allied tones)
const PARTNER_COLORS = [
  '#3B82F6', // blue
  '#06B6D4', // cyan
  '#14B8A6', // teal
  '#0EA5E9', // sky
  '#22D3EE', // bright cyan
  '#38BDF8', // light sky
  '#60A5FA', // light blue
  '#2DD4BF', // aquamarine
  '#34D399', // light emerald
  '#818CF8', // light indigo
  '#10B981', // emerald
  '#67E8F9', // ice cyan
  '#93C5FD', // pale blue
  '#5EEAD4', // pale teal
  '#7DD3FC', // powder blue
];

// Counterpart / support unit palette – purples / pinks / oranges / warm tones
const COUNTERPART_COLORS = [
  '#A855F7', // purple
  '#EC4899', // pink
  '#F97316', // orange
  '#EF4444', // red
  '#F59E0B', // amber
  '#6366F1', // indigo
  '#D946EF', // fuchsia
  '#F43F5E', // rose
  '#8B5CF6', // violet
  '#84CC16', // lime
  '#FB923C', // light orange
  '#E879F9', // light fuchsia
  '#C084FC', // light purple
  '#FB7185', // light rose
  '#FBBF24', // bright amber
];

// Combined palette for backward compatibility (index 0 = 25th gold, rest = unique)
const UNIT_DEPLOYMENT_COLORS = [
  TWENTY_FIFTH_COLOR,
  ...PARTNER_COLORS,
  ...COUNTERPART_COLORS,
];

// Phases considered "visible" on the map (everything except planning/completed)
const VISIBLE_DEPLOYMENT_PHASES = ['deploying', 'deployed', 'endex', 'rtb'];

// Maximum zoom level when tracking active deployment
// Cap zoom during tracking so the user can see the broader region, not zoomed-in
const TRACKING_ZOOM_CAP = 5;

// Latitude offset in degrees applied to each partner unit's deployment line
// so overlapping routes remain visually distinguishable (~16 km per unit).
const PARTNER_LINE_OFFSET_DEG = 0.15;

function getUnitColor(originUnitId, unitIndex, originType) {
  if (!originUnitId) return TWENTY_FIFTH_COLOR; // 25th ID gold
  if (originType === 'counterpart') {
    return COUNTERPART_COLORS[unitIndex % COUNTERPART_COLORS.length];
  }
  return PARTNER_COLORS[unitIndex % PARTNER_COLORS.length];
}

function getDeploymentTypeLabel(dep) {
  if (dep.origin_type === 'partner') return dep.unit_name || 'Partner Unit';
  if (dep.origin_type === 'counterpart') return dep.unit_name || 'Allied Unit';
  return '25th ID';
}

/* ── ATAK-style tactical route layers ─────────────────────────────────── */
/* Outer glow – subtle halo for tactical route visibility */
const deploymentPathGlowLayer = {
  id: 'deployment-path-glow',
  type: 'line',
  paint: {
    'line-color': ['get', 'color'],
    'line-width': 8,
    'line-opacity': 0.12,
    'line-blur': 4,
  },
  layout: {
    'line-cap': 'round',
    'line-join': 'round',
  },
};

/* Core tactical route line – refined military dash pattern */
const deploymentPathLayer = {
  id: 'deployment-path',
  type: 'line',
  paint: {
    'line-color': ['get', 'color'],
    'line-width': 2.5,
    'line-dasharray': [8, 4],
    'line-opacity': 0.88,
  },
  layout: {
    'line-cap': 'butt',
    'line-join': 'miter',
  },
};

/* Directional chevrons along the route – subtle, evenly spaced */
const deploymentArrowLayer = {
  id: 'deployment-arrows',
  type: 'symbol',
  layout: {
    'symbol-placement': 'line',
    'symbol-spacing': 140,
    'text-field': '▸',
    'text-size': 14,
    'text-rotate': 0,
    'text-rotation-alignment': 'map',
    'text-keep-upright': false,
    'text-allow-overlap': true,
    'text-ignore-placement': true,
  },
  paint: {
    'text-color': ['get', 'color'],
    'text-opacity': 0.7,
  },
};

/* (Removed – countdown timer is now rendered via React Markers) */

export default function GlobalThreatMap({ operations = [], intelEvents = [], campaignEvents = [] }) {
  const mapRef = useRef(null);
  const {
    viewport, showHeatmap, showClusters, showMilitaryBases, showADSB,
    adsbFilters, entityLocations, militaryBases, setViewport,
  } = useMapStore();
  const { filteredEvents, selectEvent, selectedEvent } = useEventsStore();

  const [popupInfo, setPopupInfo] = useState(null);
  const [operationPopup, setOperationPopup] = useState(null);
  const [intelPopup, setIntelPopup] = useState(null);
  const [campaignPopup, setCampaignPopup] = useState(null);
  const [countryModal, setCountryModal] = useState(null);
  const [cursor, setCursor] = useState('');

  // NATO markers, deployments, and division location state
  const [natoMarkers, setNatoMarkers] = useState([]);
  const [deployments, setDeployments] = useState([]);
  const [divisionLocation, setDivisionLocation] = useState(null);
  const [deploymentPopup, setDeploymentPopup] = useState(null);
  const [trackDeployment, setTrackDeployment] = useState(false);

  // ADS-B military aircraft tracking
  const { aircraft: adsbAircraftRaw } = useADSBAircraft(showADSB);
  const [aircraftPopup, setAircraftPopup] = useState(null);

  // Client-side ADS-B filtering for instant feedback
  const adsbAircraft = useMemo(() => {
    if (!adsbAircraftRaw.length) return adsbAircraftRaw;
    return adsbAircraftRaw.filter((ac) => {
      if (adsbFilters.originCountry && ac.origin_country !== adsbFilters.originCountry) return false;
      if (adsbFilters.altitudeMin != null && (ac.altitude == null || ac.altitude < adsbFilters.altitudeMin)) return false;
      if (adsbFilters.altitudeMax != null && (ac.altitude == null || ac.altitude > adsbFilters.altitudeMax)) return false;
      if (!adsbFilters.showOnGround && ac.on_ground) return false;
      if (adsbFilters.callsignSearch && !(ac.callsign || '').toUpperCase().includes(adsbFilters.callsignSearch.toUpperCase())) return false;
      return true;
    });
  }, [adsbAircraftRaw, adsbFilters]);

  // Collect unique origin countries for filter dropdown
  const adsbCountries = useMemo(() => {
    const set = new Set();
    adsbAircraftRaw.forEach((ac) => { if (ac.origin_country) set.add(ac.origin_country); });
    return [...set].sort();
  }, [adsbAircraftRaw]);

  // Fetch NATO markers, deployments, division location
  useEffect(() => {
    const fetchMapData = async () => {
      try {
        const [markersRes, deploymentsRes, divRes] = await Promise.allSettled([
          axios.get(`${API}/map/nato-markers`, { withCredentials: true }),
          axios.get(`${API}/map/deployments`, { withCredentials: true }),
          axios.get(`${API}/map/division-location`, { withCredentials: true }),
        ]);
        if (markersRes.status === 'fulfilled') setNatoMarkers(markersRes.value.data);
        if (deploymentsRes.status === 'fulfilled') setDeployments(deploymentsRes.value.data);
        if (divRes.status === 'fulfilled') setDivisionLocation(divRes.value.data);
      } catch { /* silently fail for unauthenticated sessions */ }
    };
    fetchMapData();
  }, []);

  // Build GeoJSON for threat events
  const eventsGeoJson = useMemo(() => ({
    type: 'FeatureCollection',
    features: filteredEvents
      .filter((e) => e.location && typeof e.location.latitude === 'number' && typeof e.location.longitude === 'number')
      .map((event) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [event.location.longitude, event.location.latitude],
        },
        properties: {
          id: event.id,
          title: event.title,
          summary: event.summary,
          category: event.category,
          threatLevel: event.threatLevel,
          severity: severityToNumber[event.threatLevel] || 3,
          timestamp: event.timestamp,
          source: event.source,
          sourceUrl: event.sourceUrl || '',
          placeName: event.location.placeName || '',
          country: event.location.country || '',
          keywords: JSON.stringify(event.keywords || []),
          rawContent: event.rawContent || '',
        },
      })),
  }), [filteredEvents]);

  // Build GeoJSON for entity locations
  const entityGeoJson = useMemo(() => ({
    type: 'FeatureCollection',
    features: entityLocations.map((loc, i) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [loc.longitude, loc.latitude] },
      properties: { placeName: loc.placeName || loc.entityName, entityName: loc.entityName },
    })),
  }), [entityLocations]);

  // Build GeoJSON for military bases
  const militaryBasesGeoJson = useMemo(() => ({
    type: 'FeatureCollection',
    features: militaryBases.map((base, i) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [base.longitude, base.latitude] },
      properties: { baseName: base.baseName, country: base.country, type: base.type || 'military' },
    })),
  }), [militaryBases]);

  // Build GeoJSON for operations overlay
  const operationsGeoJson = useMemo(() => ({
    type: 'FeatureCollection',
    features: operations
      .filter((op) => op.lat && op.lng)
      .map((op) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [op.lng, op.lat] },
        properties: {
          id: op.id || op._id,
          title: op.title,
          operation_type: op.operation_type,
          date: op.date || '',
          severity: op.severity || 'medium',
          activity_state: op.activity_state || 'planned',
          max_participants: op.max_participants || 0,
        },
      })),
  }), [operations]);

  // Build GeoJSON for intel events overlay
  const intelGeoJson = useMemo(() => ({
    type: 'FeatureCollection',
    features: intelEvents
      .filter((ev) => ev.latitude != null && ev.longitude != null)
      .map((ev) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [ev.longitude, ev.latitude] },
        properties: {
          id: ev.id,
          title: ev.title,
          description: ev.description || '',
          region_label: ev.region_label || '',
          theater: ev.theater || '',
          severity: ev.threat_level || ev.severity || 'medium',
          classification: ev.classification || 'routine',
        },
      })),
  }), [intelEvents]);

  // Build GeoJSON for campaign events overlay
  const campaignGeoJson = useMemo(() => ({
    type: 'FeatureCollection',
    features: campaignEvents
      .filter((ev) => ev.latitude !== null && ev.latitude !== undefined && ev.longitude !== null && ev.longitude !== undefined)
      .map((ev) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [ev.longitude, ev.latitude] },
        properties: {
          id: ev.id,
          title: ev.title,
          description: ev.description || '',
          theater: ev.metadata?.theater || '',
          status: ev.metadata?.status || '',
          threat_level: ev.threat_level || 'medium',
          related_entity_id: ev.related_entity_id || '',
        },
      })),
  }), [campaignEvents]);

  // Build a stable unit-index map so each partner unit gets a unique color
  const partnerUnitIndexMap = useMemo(() => {
    const map = {};
    let idx = 0;
    deployments.forEach((d) => {
      if (d.origin_unit_id && !(d.origin_unit_id in map)) {
        map[d.origin_unit_id] = idx++;
      }
      // Counterpart deployments without origin_unit_id use their own id as key
      if (d.origin_type === 'counterpart' && !d.origin_unit_id && !(d.id in map)) {
        map[d.id] = idx++;
      }
    });
    return map;
  }, [deployments]);

  // Live clock tick – updates every 60 s so countdown labels refresh
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Tracking mode – fly map to active deployment's current position
  useEffect(() => {
    if (!trackDeployment || !mapRef.current) return;
    const activeDep = deployments.find(
      (d) => d.origin_type === '25th' && VISIBLE_DEPLOYMENT_PHASES.includes(d.status)
    );
    if (!activeDep || !activeDep.route_points || activeDep.route_points.length < 2) return;

    const coords = getDeploymentCoords(activeDep, 0);
    if (coords.length < 2) return;

    let trackProgress;
    if (activeDep.status === 'rtb') {
      const rtbStartMs = activeDep.return_started_at ? new Date(activeDep.return_started_at).getTime() : 0;
      const rtbDurationMs = (activeDep.return_duration_hours || activeDep.total_duration_hours) * 3600000;
      if (rtbStartMs && rtbDurationMs > 0) {
        const rtbElapsed = nowTick - rtbStartMs;
        trackProgress = 1 - Math.max(0, Math.min(1, rtbElapsed / rtbDurationMs));
      } else {
        trackProgress = 1;
      }
    } else if (activeDep.status === 'deployed' || activeDep.status === 'endex') {
      trackProgress = 1;
    } else {
      trackProgress = computeProgress(activeDep);
    }

    const pos = interpolateAlongLine(coords, trackProgress);
    const map = mapRef.current.getMap();
    map.easeTo({
      center: [pos[0], pos[1]],
      zoom: Math.min(map.getZoom(), TRACKING_ZOOM_CAP),
      duration: 2000,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackDeployment, nowTick, deployments]);

  // Countdown label: remaining time based on total_duration_hours + started_at
  function computeCountdownLabel(dep) {
    if (!dep.started_at || !dep.total_duration_hours) return '';
    const startMs = new Date(dep.started_at).getTime();
    if (Number.isNaN(startMs)) return '';
    const endMs = startMs + dep.total_duration_hours * 3600000;
    const remaining = endMs - nowTick;
    if (remaining <= 0) return '';
    const totalMinutes = Math.floor(remaining / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h 0m`;
    return `0h ${mins}m`;
  }

  // Compute deployment progress (0-1) based on total_duration_hours + started_at + route_points
  function computeProgress(dep) {
    if (!dep.started_at || !dep.total_duration_hours) return 0;
    const startMs = new Date(dep.started_at).getTime();
    if (Number.isNaN(startMs)) return 0;
    const totalMs = dep.total_duration_hours * 3600000;
    if (totalMs <= 0) return 0;
    const elapsedMs = nowTick - startMs;
    if (elapsedMs <= 0) return 0;
    if (elapsedMs >= totalMs) return 1;

    const rps = Array.isArray(dep.route_points) ? dep.route_points : [];
    let totalStopMs = 0;
    for (let i = 1; i < rps.length - 1; i++) {
      const stop = rps[i].stop_duration_hours || 0;
      if (stop > 0) totalStopMs += stop * 3600000;
    }
    if (totalStopMs >= totalMs) return Math.max(0, Math.min(1, elapsedMs / totalMs));

    const travelMs = totalMs - totalStopMs;
    const numSegments = Math.max(rps.length - 1, 1);
    const segmentTravelMs = travelMs / numSegments;

    let timeAccum = 0;
    let distanceFraction = 0;
    const segFrac = 1 / numSegments;

    for (let i = 0; i < numSegments; i++) {
      const segEnd = timeAccum + segmentTravelMs;
      if (elapsedMs <= segEnd) {
        const segProgress = (elapsedMs - timeAccum) / segmentTravelMs;
        distanceFraction += segFrac * segProgress;
        return Math.max(0, Math.min(1, distanceFraction));
      }
      timeAccum = segEnd;
      distanceFraction += segFrac;

      if (i < numSegments - 1 && i + 1 < rps.length - 1) {
        const stopMs = (rps[i + 1].stop_duration_hours || 0) * 3600000;
        if (stopMs > 0) {
          const stopEnd = timeAccum + stopMs;
          if (elapsedMs <= stopEnd) return Math.max(0, Math.min(1, distanceFraction));
          timeAccum = stopEnd;
        }
      }
    }
    return 1;
  }

  // Build the ordered list of coordinates for a deployment from route_points
  function getDeploymentCoords(dep, offsetLat = 0) {
    const rps = Array.isArray(dep.route_points) ? dep.route_points : [];
    if (rps.length === 0) return [];
    const sorted = [...rps].sort((a, b) => a.order - b.order);
    return sorted.map(rp => [rp.longitude, rp.latitude + offsetLat]);
  }

  // Interpolate a position along a multi-segment LineString by fractional progress (0-1)
  function interpolateAlongLine(coords, fraction) {
    if (!coords || coords.length < 2) return coords?.[0] || [0, 0];
    if (fraction <= 0) return coords[0];
    if (fraction >= 1) return coords[coords.length - 1];

    // Compute cumulative segment lengths
    const segLengths = [];
    let totalLen = 0;
    for (let i = 1; i < coords.length; i++) {
      const dx = coords[i][0] - coords[i - 1][0];
      const dy = coords[i][1] - coords[i - 1][1];
      const len = Math.sqrt(dx * dx + dy * dy);
      segLengths.push(len);
      totalLen += len;
    }
    if (totalLen === 0) return coords[0];

    let target = fraction * totalLen;
    for (let i = 0; i < segLengths.length; i++) {
      if (segLengths[i] === 0) {
        // Skip zero-length segments (duplicate waypoint coordinates)
        continue;
      }
      if (target <= segLengths[i]) {
        const t = target / segLengths[i];
        return [
          coords[i][0] + t * (coords[i + 1][0] - coords[i][0]),
          coords[i][1] + t * (coords[i + 1][1] - coords[i][1]),
        ];
      }
      target -= segLengths[i];
    }
    return coords[coords.length - 1];
  }

  // Build GeoJSON for deployment travel paths (supports route_points)
  const deploymentPathsGeoJson = useMemo(() => ({
    type: 'FeatureCollection',
    features: deployments
      .filter((d) => d.route_points && d.route_points.length >= 2 && VISIBLE_DEPLOYMENT_PHASES.includes(d.status))
      .map((d) => {
        const unitKey = d.origin_unit_id || (d.origin_type === 'counterpart' ? d.id : null);
        const unitIdx = unitKey ? (partnerUnitIndexMap[unitKey] ?? 0) : -1;
        const color = getUnitColor(unitKey, unitIdx, d.origin_type);
        const offsetLat = unitKey ? (unitIdx + 1) * PARTNER_LINE_OFFSET_DEG : 0;
        const coords = getDeploymentCoords(d, offsetLat);
        return {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: coords,
          },
          properties: {
            id: d.id,
            title: d.title,
            status: d.status,
            origin_unit_id: d.origin_unit_id || '',
            color,
          },
        };
      }),
  }), [deployments, partnerUnitIndexMap]);

  // Current active deployment for the 25th ID
  const activeDeployment = useMemo(() =>
    deployments.find((d) =>
      d.origin_type === '25th' && VISIBLE_DEPLOYMENT_PHASES.includes(d.status)
    ), [deployments]);

  // Build legend entries for active deployments
  const deploymentLegendEntries = useMemo(() => {
    const activeDeployments = deployments.filter((d) => VISIBLE_DEPLOYMENT_PHASES.includes(d.status));
    if (activeDeployments.length === 0) return [];
    const entries = [];
    activeDeployments.forEach((d) => {
      const unitKey = d.origin_unit_id || (d.origin_type === 'counterpart' ? d.id : null);
      const unitIdx = unitKey ? (partnerUnitIndexMap[unitKey] ?? 0) : -1;
      const color = getUnitColor(unitKey, unitIdx, d.origin_type);
      const label = getDeploymentTypeLabel(d);
      const category = d.origin_type === '25th' ? '25th ID' : d.origin_type === 'partner' ? 'Partner' : 'Allied';
      entries.push({ id: d.id, color, label, title: d.title, category });
    });
    return entries;
  }, [deployments, partnerUnitIndexMap]);

  // Division display location
  const divisionDisplayLocation = useMemo(() => {
    if (divisionLocation) {
      return {
        name: divisionLocation.current_location_name || 'Schofield Barracks, HI',
        latitude: divisionLocation.current_latitude || 21.4959,
        longitude: divisionLocation.current_longitude || -158.0648,
        state: divisionLocation.state || 'home_station',
      };
    }
    return { name: 'Schofield Barracks, HI', latitude: 21.4959, longitude: -158.0648, state: 'home_station' };
  }, [divisionLocation]);

  // Pan to selected event from sidebar (no zoom change)
  useEffect(() => {
    if (selectedEvent && mapRef.current) {
      const map = mapRef.current.getMap();
      map.panTo([selectedEvent.location.longitude, selectedEvent.location.latitude]);
    }
  }, [selectedEvent]);

  const onMapClick = useCallback((event) => {
    // Check for cluster click
    const features = event.features || [];
    const clusterFeature = features.find((f) => f.layer.id === 'clusters');
    if (clusterFeature && mapRef.current) {
      const map = mapRef.current.getMap();
      const source = map.getSource('events');
      if (source) {
        source.getClusterExpansionZoom(clusterFeature.properties.cluster_id, (err, zoom) => {
          if (err) return;
          map.flyTo({
            center: clusterFeature.geometry.coordinates,
            zoom: zoom + 1,
            duration: 500,
          });
        });
      }
      return;
    }

    // Check for unclustered event point click
    const eventFeature = features.find((f) => f.layer.id === 'unclustered-point');
    if (eventFeature) {
      const props = eventFeature.properties;
      setPopupInfo({
        longitude: eventFeature.geometry.coordinates[0],
        latitude: eventFeature.geometry.coordinates[1],
        event: {
          id: props.id,
          title: props.title,
          summary: props.summary,
          category: props.category,
          threatLevel: props.threatLevel,
          timestamp: props.timestamp,
          source: props.source,
          sourceUrl: props.sourceUrl,
          rawContent: props.rawContent,
          keywords: (() => { try { return JSON.parse(props.keywords); } catch { return []; } })(),
          location: {
            placeName: props.placeName,
            country: props.country,
            latitude: eventFeature.geometry.coordinates[1],
            longitude: eventFeature.geometry.coordinates[0],
          },
        },
      });
      selectEvent(null);
      return;
    }

    // Check for operations click
    const opFeature = features.find((f) => f.layer.id === 'operations-markers');
    if (opFeature) {
      setOperationPopup({
        longitude: opFeature.geometry.coordinates[0],
        latitude: opFeature.geometry.coordinates[1],
        operation: opFeature.properties,
      });
      return;
    }

    // Check for intel click
    const intelFeature = features.find((f) => f.layer.id === 'intel-markers');
    if (intelFeature) {
      setIntelPopup({
        longitude: intelFeature.geometry.coordinates[0],
        latitude: intelFeature.geometry.coordinates[1],
        intel: intelFeature.properties,
      });
      return;
    }

    // Check for campaign click
    const campaignFeature = features.find((f) => f.layer.id === 'campaign-markers');
    if (campaignFeature) {
      setCampaignPopup({
        longitude: campaignFeature.geometry.coordinates[0],
        latitude: campaignFeature.geometry.coordinates[1],
        campaign: campaignFeature.properties,
      });
      return;
    }

    // Check for ADS-B aircraft click
    const aircraftFeature = features.find(
      (f) => f.layer.id === 'adsb-aircraft-circle' || f.layer.id === 'adsb-aircraft-heading'
    );
    if (aircraftFeature) {
      const props = aircraftFeature.properties;
      setAircraftPopup({
        longitude: aircraftFeature.geometry.coordinates[0],
        latitude: aircraftFeature.geometry.coordinates[1],
        callsign: props.callsign,
        altitude: props.altitude,
        velocity: props.velocity,
        heading: props.heading,
        vertical_rate: props.vertical_rate,
        aircraft_type: props.aircraft_type,
        origin_country: props.origin_country,
        on_ground: props.on_ground,
        squawk: props.squawk,
        source: props.source,
      });
      return;
    }

    // Check for country polygon click (for conflicts modal)
    if (mapRef.current) {
      const map = mapRef.current.getMap();
      const countryFeatures = map.queryRenderedFeatures(event.point, {
        layers: ['country-boundaries'],
      });
      if (countryFeatures.length > 0) {
        const countryName = countryFeatures[0].properties.name_en || countryFeatures[0].properties.name;
        if (countryName) {
          setCountryModal(countryName);
        }
      }
    }

    setPopupInfo(null);
    setOperationPopup(null);
    setIntelPopup(null);
    setCampaignPopup(null);
    setDeploymentPopup(null);
    setAircraftPopup(null);
  }, [selectEvent]);

  const onMouseEnter = useCallback(() => setCursor('pointer'), []);
  const onMouseLeave = useCallback(() => setCursor(''), []);

  const onMove = useCallback((evt) => {
    setViewport(evt.viewState);
  }, [setViewport]);

  const interactiveLayerIds = useMemo(() => {
    const ids = ['clusters', 'unclustered-point', 'operations-markers', 'intel-markers', 'campaign-markers', 'deployment-path'];
    if (showADSB) ids.push(...AIRCRAFT_INTERACTIVE_LAYERS);
    return ids;
  }, [showADSB]);

  // Add aircraft icon to map when it loads
  const onMapLoad = useCallback(() => {
    if (mapRef.current) {
      addAircraftIcon(mapRef.current.getMap());
    }
  }, []);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-full items-center justify-center bg-black text-tropic-gold-dark">
        <div className="text-center p-8">
          <p className="text-lg font-semibold mb-2 text-tropic-gold">Mapbox Token Required</p>
          <p className="text-sm">Set <code className="bg-gray-900 text-tropic-gold-light px-2 py-1 rounded border border-tropic-gold-dark/30">REACT_APP_MAPBOX_TOKEN</code> in your environment.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <Map
        ref={mapRef}
        {...viewport}
        projection="globe"
        onMove={onMove}
        onClick={onMapClick}
        onLoad={onMapLoad}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        cursor={cursor}
        interactiveLayerIds={interactiveLayerIds}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        mapboxAccessToken={MAPBOX_TOKEN}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
        reuseMaps
      >
        <NavigationControl position="top-right" />
        <GeolocateControl position="top-right" />
        <ScaleControl position="bottom-right" />

        {/* Heatmap layer */}
        {showHeatmap && (
          <Source id="events-heatmap" type="geojson" data={eventsGeoJson}>
            <Layer {...heatmapLayer} />
          </Source>
        )}

        {/* Clustered event markers */}
        {showClusters && (
          <Source
            id="events"
            type="geojson"
            data={eventsGeoJson}
            cluster={true}
            clusterMaxZoom={CLUSTER_MAX_ZOOM}
            clusterRadius={CLUSTER_RADIUS}
            clusterProperties={{
              maxSeverity: ['max', ['get', 'severity']],
            }}
          >
            <Layer {...clusterLayer} />
            <Layer {...clusterCountLayer} />
            <Layer {...unclusteredPointLayer} />
            <Layer {...pulseRingLayer} />
          </Source>
        )}

        {/* Entity locations */}
        {entityLocations.length > 0 && (
          <Source id="entity-locations" type="geojson" data={entityGeoJson}>
            <Layer {...entityLocationLayer} />
            <Layer {...entityLocationLabelLayer} />
          </Source>
        )}

        {/* Military bases */}
        {showMilitaryBases && militaryBases.length > 0 && (
          <Source id="military-bases" type="geojson" data={militaryBasesGeoJson}>
            <Layer {...militaryBaseLayer} />
            <Layer {...militaryBaseLabelLayer} />
          </Source>
        )}

        {/* Internal Operations overlay */}
        {operations.length > 0 && (
          <Source id="operations" type="geojson" data={operationsGeoJson}>
            <Layer {...operationsLayer} />
            <Layer {...operationsLabelLayer} />
          </Source>
        )}

        {/* Intel events overlay */}
        {intelEvents.length > 0 && (
          <Source id="intel-events" type="geojson" data={intelGeoJson}>
            <Layer {...intelLayer} />
            <Layer {...intelLabelLayer} />
          </Source>
        )}

        {/* Campaign events overlay */}
        {campaignEvents.length > 0 && (
          <Source id="campaign-events" type="geojson" data={campaignGeoJson}>
            <Layer {...campaignLayer} />
            <Layer {...campaignLabelLayer} />
          </Source>
        )}

        {/* Deployment travel paths – ATAK-style tactical route lines */}
        {deployments.length > 0 && (
          <Source id="deployment-paths" type="geojson" data={deploymentPathsGeoJson}>
            <Layer {...deploymentPathGlowLayer} />
            <Layer {...deploymentPathLayer} />
            <Layer {...deploymentArrowLayer} />
          </Source>
        )}

        {/* Countdown timer UI boxes at midpoint of each active deployment path */}
        {deployments
          .filter((d) => VISIBLE_DEPLOYMENT_PHASES.includes(d.status) && d.route_points && d.route_points.length >= 2 && d.started_at)
          .map((d) => {
            const unitKey = d.origin_unit_id || (d.origin_type === 'counterpart' ? d.id : null);
            const unitIdx = unitKey ? (partnerUnitIndexMap[unitKey] ?? 0) : -1;
            const color = getUnitColor(unitKey, unitIdx, d.origin_type);
            const offsetLat = unitKey ? (unitIdx + 1) * PARTNER_LINE_OFFSET_DEG : 0;
            const coords = getDeploymentCoords(d, offsetLat);
            const mid = interpolateAlongLine(coords, 0.5);

            // compute the phase label and countdown
            let countdown = '';
            let phaseLabel = '';

            if (d.status === 'deploying') {
              countdown = computeCountdownLabel(d);
              phaseLabel = 'DEPLOYING';
            } else if (d.status === 'deployed') {
              phaseLabel = 'DEPLOYED';
            } else if (d.status === 'endex') {
              phaseLabel = 'ENDEX';
            } else if (d.status === 'rtb') {
              phaseLabel = 'RTB';
              if (d.return_started_at && d.return_duration_hours) {
                const rtbStartMs = new Date(d.return_started_at).getTime();
                const rtbEndMs = rtbStartMs + d.return_duration_hours * 3600000;
                const remaining = rtbEndMs - nowTick;
                if (remaining > 0) {
                  const totalMinutes = Math.floor(remaining / 60000);
                  const hours = Math.floor(totalMinutes / 60);
                  const mins = totalMinutes % 60;
                  countdown = hours > 0 ? `${hours}h ${mins}m` : `0h ${mins}m`;
                }
              }
            }

            const fmtTime = (iso) => {
              if (!iso) return '';
              const dt = new Date(iso);
              if (Number.isNaN(dt.getTime())) return '';
              return dt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            };
            const startedTime = fmtTime(d.started_at);

            return (
              <Marker key={`dep-timer-${d.id}`} longitude={mid[0]} latitude={mid[1]} anchor="center" style={{ zIndex: 2 }}>
                {/* Tactical data box – compact, clean, command-center style */}
                <div
                  className="flex flex-col items-start gap-0.5 px-2 py-1 whitespace-nowrap select-none"
                  style={{
                    background: 'rgba(8,14,28,0.92)',
                    border: `1px solid ${color}66`,
                    borderLeft: `2px solid ${color}`,
                    boxShadow: `0 0 6px ${color}22`,
                    borderRadius: 3,
                    minWidth: 72,
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  {phaseLabel && (
                    <div
                      className="text-[7px] font-black tracking-[0.2em] uppercase w-full"
                      style={{ color, opacity: 0.9 }}
                    >
                      {phaseLabel}
                    </div>
                  )}
                  {countdown && (
                    <div className="flex items-center gap-1">
                      <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                        <circle cx="5" cy="5" r="4" stroke={color} strokeWidth="1" opacity="0.7" />
                        <line x1="5" y1="5" x2="5" y2="2.5" stroke={color} strokeWidth="1" strokeLinecap="round" opacity="0.8" />
                        <line x1="5" y1="5" x2="7" y2="6.5" stroke={color} strokeWidth="0.8" strokeLinecap="round" opacity="0.8" />
                      </svg>
                      <span className="font-mono font-bold text-[10px]" style={{ color }}>
                        {countdown}
                      </span>
                    </div>
                  )}
                  {startedTime && (
                    <div className="text-[7px] text-gray-500 leading-tight font-mono">
                      {startedTime}
                    </div>
                  )}
                </div>
              </Marker>
            );
          })
        }

        {/* Deployment aircraft icons – C-17 military transport silhouette oriented to direction of travel.
            25th ID deployments are represented by the NATO HQ marker instead (avoids label overlap). */}
        {deployments
          .filter((d) =>
            d.origin_type !== '25th' &&
            VISIBLE_DEPLOYMENT_PHASES.includes(d.status) &&
            d.route_points && d.route_points.length >= 2 &&
            d.started_at && d.total_duration_hours
          )
          .map((d) => {
            const unitKey = d.origin_unit_id || (d.origin_type === 'counterpart' ? d.id : null);
            const unitIdx = unitKey ? (partnerUnitIndexMap[unitKey] ?? 0) : -1;
            const color = getUnitColor(unitKey, unitIdx, d.origin_type);
            const offsetLat = unitKey ? (unitIdx + 1) * PARTNER_LINE_OFFSET_DEG : 0;
            const coords = getDeploymentCoords(d, offsetLat);
            if (coords.length < 2) return null;

            let progress;
            if (d.status === 'rtb') {
              const rtbStartMs = d.return_started_at ? new Date(d.return_started_at).getTime() : 0;
              const rtbDurationMs = (d.return_duration_hours || d.total_duration_hours) * 3600000;
              if (rtbStartMs && rtbDurationMs > 0) {
                const rtbElapsed = nowTick - rtbStartMs;
                const rtbFraction = Math.max(0, Math.min(1, rtbElapsed / rtbDurationMs));
                progress = 1 - rtbFraction;
              } else {
                progress = 1;
              }
            } else if (d.status === 'deployed' || d.status === 'endex') {
              progress = 1;
            } else {
              progress = computeProgress(d);
            }
            const atDestination = d.status === 'deployed' || d.status === 'endex';
            if (progress < 0 || progress > 1) return null;
            if (progress === 0 && !atDestination) return null;
            if (progress === 1 && d.status === 'deploying') return null;

            const pos = interpolateAlongLine(coords, progress);

            // Compute heading (degrees, 0 = north) from path tangent at current position
            const aheadPos = interpolateAlongLine(coords, Math.min(1, progress + 0.01));
            const dLon = aheadPos[0] - pos[0];
            const dLat = aheadPos[1] - pos[1];
            const heading = (Math.atan2(dLon, dLat) * 180) / Math.PI;

            return (
              <Marker
                key={`dep-plane-${d.id}`}
                longitude={pos[0]}
                latitude={pos[1]}
                anchor="center"
                style={{ zIndex: 4 }}
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  setDeploymentPopup({
                    longitude: pos[0],
                    latitude: pos[1],
                    type: 'deployment',
                    data: d,
                  });
                }}
              >
                <div
                  className="flex flex-col items-center"
                  style={{ cursor: 'pointer' }}
                  title={`${d.title} — ${Math.round(progress * 100)}%`}
                >
                  {/* C-17 tactical silhouette – compact, centered, nose-up */}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 32 32"
                    aria-label={`${d.unit_name || d.title} — deployment aircraft`}
                    style={{
                      transform: `rotate(${heading}deg)`,
                      filter: `drop-shadow(0 0 4px ${color}aa)`,
                      transition: 'transform 1s cubic-bezier(0.4,0,0.2,1)',
                    }}
                  >
                    <title>{d.unit_name || d.title} — C-17 in transit</title>
                    {/* Fuselage */}
                    <path d="M16,3 C15,5.5 14.5,8 14.5,12 L14.5,22 C14.8,24 15.3,26 16,29 C16.7,26 17.2,24 17.5,22 L17.5,12 C17.5,8 17,5.5 16,3 Z" fill={color} />
                    {/* Wings */}
                    <path d="M14.5,11 L3,15.5 L3,16.8 L14.5,13.5 Z" fill={color} />
                    <path d="M17.5,11 L29,15.5 L29,16.8 L17.5,13.5 Z" fill={color} />
                    {/* Engines */}
                    <ellipse cx="6" cy="15.8" rx="1.8" ry="0.7" fill={color} opacity="0.85" />
                    <ellipse cx="10" cy="14.5" rx="1.6" ry="0.65" fill={color} opacity="0.85" />
                    <ellipse cx="22" cy="14.5" rx="1.6" ry="0.65" fill={color} opacity="0.85" />
                    <ellipse cx="26" cy="15.8" rx="1.8" ry="0.7" fill={color} opacity="0.85" />
                    {/* Tail stabilizers */}
                    <path d="M14.5,22 L9.5,25.5 L10,26.5 L14.5,24 Z" fill={color} opacity="0.9" />
                    <path d="M17.5,22 L22.5,25.5 L22,26.5 L17.5,24 Z" fill={color} opacity="0.9" />
                  </svg>
                  <span
                    className="text-[8px] font-bold mt-0.5 whitespace-nowrap px-1 py-0.5 rounded tracking-wide"
                    style={{
                      color,
                      background: 'rgba(0,0,0,0.85)',
                      border: `1px solid ${color}44`,
                      letterSpacing: '0.06em',
                    }}
                  >
                    {d.unit_name || d.title}
                  </span>
                </div>
              </Marker>
            );
          })
        }

        {/* NATO Markers */}
        {natoMarkers.map((marker) => (
          <Marker
            key={marker.id}
            longitude={marker.longitude}
            latitude={marker.latitude}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setDeploymentPopup({
                longitude: marker.longitude,
                latitude: marker.latitude,
                type: 'nato',
                data: marker,
              });
            }}
          >
            <div
              title={`${marker.title} (${marker.affiliation} ${marker.symbol_type})`}
              style={{ cursor: 'pointer' }}
              dangerouslySetInnerHTML={{
                __html: buildNATOMarkerSVG(marker.affiliation, marker.symbol_type, 36),
              }}
            />
          </Marker>
        ))}

        {/* 25th ID Division Location Marker – moves along deployment path when deploying.
            Shows a C-17 silhouette while in transit (deploying/rtb) and the NATO HQ symbol at rest. */}
        {divisionDisplayLocation && (() => {
          let markerLng = divisionDisplayLocation.longitude;
          let markerLat = divisionDisplayLocation.latitude;
          let divHeading = 0;
          let divProgress = null;

          if (activeDeployment && VISIBLE_DEPLOYMENT_PHASES.includes(activeDeployment.status)) {
            const coords = getDeploymentCoords(activeDeployment, 0);
            if (coords.length >= 2) {
              if (activeDeployment.status === 'rtb') {
                const rtbStartMs = activeDeployment.return_started_at ? new Date(activeDeployment.return_started_at).getTime() : 0;
                const rtbDurationMs = (activeDeployment.return_duration_hours || activeDeployment.total_duration_hours) * 3600000;
                if (rtbStartMs && rtbDurationMs > 0) {
                  const rtbElapsed = nowTick - rtbStartMs;
                  divProgress = 1 - Math.max(0, Math.min(1, rtbElapsed / rtbDurationMs));
                } else {
                  divProgress = 1;
                }
              } else if (activeDeployment.status === 'deployed' || activeDeployment.status === 'endex') {
                divProgress = 1;
              } else {
                divProgress = computeProgress(activeDeployment);
              }
              const pos = interpolateAlongLine(coords, divProgress);
              markerLng = pos[0];
              markerLat = pos[1];

              // Compute heading for C-17 icon orientation
              const aheadPos = interpolateAlongLine(coords, Math.min(1, divProgress + 0.01));
              const dLon = aheadPos[0] - pos[0];
              const dLat = aheadPos[1] - pos[1];
              divHeading = (Math.atan2(dLon, dLat) * 180) / Math.PI;
            }
          }

          const isInTransit = activeDeployment &&
            (activeDeployment.status === 'deploying' || activeDeployment.status === 'rtb');

          return (
            <Marker
              longitude={markerLng}
              latitude={markerLat}
              anchor="center"
              style={{ zIndex: 5 }}
            >
              <div
                className="flex flex-col items-center"
                title={`25th Infantry Division — ${activeDeployment ? activeDeployment.title : divisionDisplayLocation.name}`}
                onClick={(e) => {
                  if (!activeDeployment) return;
                  e.stopPropagation();
                  setDeploymentPopup({
                    longitude: markerLng,
                    latitude: markerLat,
                    type: 'deployment',
                    data: activeDeployment,
                  });
                }}
                style={{ cursor: activeDeployment ? 'pointer' : 'default' }}
              >
                {isInTransit ? (
                  /* C-17 tactical silhouette for 25th ID – gold with glow */
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="28"
                    height="28"
                    viewBox="0 0 32 32"
                    aria-label="25th Infantry Division — C-17 in transit"
                    style={{
                      transform: `rotate(${divHeading}deg)`,
                      filter: 'drop-shadow(0 0 6px #FFD700aa)',
                      transition: 'transform 1s cubic-bezier(0.4,0,0.2,1)',
                    }}
                  >
                    <title>25th Infantry Division — C-17 in transit</title>
                    <path d="M16,3 C15,5.5 14.5,8 14.5,12 L14.5,22 C14.8,24 15.3,26 16,29 C16.7,26 17.2,24 17.5,22 L17.5,12 C17.5,8 17,5.5 16,3 Z" fill="#FFD700" />
                    <path d="M14.5,11 L3,15.5 L3,16.8 L14.5,13.5 Z" fill="#FFD700" />
                    <path d="M17.5,11 L29,15.5 L29,16.8 L17.5,13.5 Z" fill="#FFD700" />
                    <ellipse cx="6" cy="15.8" rx="1.8" ry="0.7" fill="#FFD700" opacity="0.85" />
                    <ellipse cx="10" cy="14.5" rx="1.6" ry="0.65" fill="#FFD700" opacity="0.85" />
                    <ellipse cx="22" cy="14.5" rx="1.6" ry="0.65" fill="#FFD700" opacity="0.85" />
                    <ellipse cx="26" cy="15.8" rx="1.8" ry="0.7" fill="#FFD700" opacity="0.85" />
                    <path d="M14.5,22 L9.5,25.5 L10,26.5 L14.5,24 Z" fill="#FFD700" opacity="0.9" />
                    <path d="M17.5,22 L22.5,25.5 L22,26.5 L17.5,24 Z" fill="#FFD700" opacity="0.9" />
                  </svg>
                ) : (
                  /* NATO HQ marker at rest / deployed */
                  <div className="relative">
                    <div
                      dangerouslySetInnerHTML={{
                        __html: buildNATOMarkerSVG('friendly', 'headquarters', 40),
                      }}
                    />
                    {divisionDisplayLocation.state !== 'home_station' && (
                      <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-tropic-gold rounded-full animate-pulse border border-black/80" />
                    )}
                  </div>
                )}
                <span
                  className="text-[8px] font-black whitespace-nowrap px-1.5 py-0.5 rounded tracking-widest uppercase mt-0.5"
                  style={{
                    color: '#FFD700',
                    background: 'rgba(0,0,0,0.88)',
                    border: '1px solid rgba(255,215,0,0.35)',
                    letterSpacing: '0.12em',
                  }}
                >
                  {isInTransit ? `25th ID · ${activeDeployment.title}` : '25th ID'}
                </span>
              </div>
            </Marker>
          );
        })()}

        {/* Deployment destination markers */}
        {deployments
          .filter((d) => d.route_points && d.route_points.length > 0 && VISIBLE_DEPLOYMENT_PHASES.includes(d.status))
          .map((d) => {
            const lastRp = [...d.route_points].sort((a, b) => a.order - b.order).pop();
            if (!lastRp) return null;
            const unitKey = d.origin_unit_id || (d.origin_type === 'counterpart' ? d.id : null);
            const unitIdx = unitKey ? (partnerUnitIndexMap[unitKey] ?? 0) : -1;
            const color = getUnitColor(unitKey, unitIdx, d.origin_type);
            return (
            <Marker
              key={`dep-dest-${d.id}`}
              longitude={lastRp.longitude}
              latitude={lastRp.latitude}
              anchor="center"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                setDeploymentPopup({
                  longitude: lastRp.longitude,
                  latitude: lastRp.latitude,
                  type: 'deployment',
                  data: d,
                });
              }}
            >
              <div className="flex flex-col items-center" style={{ cursor: 'pointer' }}>
                <div
                  dangerouslySetInnerHTML={{
                    __html: buildNATOMarkerSVG('friendly', 'objective', 28),
                  }}
                />
                <span
                  className="text-[8px] mt-0.5 whitespace-nowrap px-1 py-0.5 rounded max-w-[100px] truncate font-mono"
                  style={{ color, background: 'rgba(0,0,0,0.8)', border: `1px solid ${color}33` }}
                >
                  {lastRp.name || d.title}
                </span>
              </div>
            </Marker>
            );
          })}

        {/* Intermediate route point stop markers */}
        {deployments
          .filter((d) => VISIBLE_DEPLOYMENT_PHASES.includes(d.status) && Array.isArray(d.route_points) && d.route_points.length > 2)
          .flatMap((d) => {
            const unitKey = d.origin_unit_id || (d.origin_type === 'counterpart' ? d.id : null);
            const unitIdx = unitKey ? (partnerUnitIndexMap[unitKey] ?? 0) : -1;
            const color = getUnitColor(unitKey, unitIdx, d.origin_type);
            const sorted = [...d.route_points].sort((a, b) => a.order - b.order);
            // Show intermediate stops (indices 1 to length-2)
            return sorted.slice(1, -1)
              .filter(rp => rp.latitude != null && rp.longitude != null)
              .map((rp, rpIdx) => (
                <Marker key={`wp-${d.id}-${rpIdx}`} longitude={rp.longitude} latitude={rp.latitude} anchor="center">
                  <div
                    title={`${rp.name || `Stop ${rpIdx + 1}`}${rp.stop_duration_hours ? ` (${rp.stop_duration_hours}h stop)` : ''}`}
                    className="rounded-full border border-black/80"
                    style={{ width: 8, height: 8, backgroundColor: color, opacity: 0.75, boxShadow: `0 0 3px ${color}44` }}
                  />
                </Marker>
              ));
          })
        }

        {/* ADS-B Military Aircraft Layer */}
        <AircraftLayer
          aircraft={adsbAircraft}
          visible={showADSB}
          popup={aircraftPopup}
          onClosePopup={() => setAircraftPopup(null)}
        />

        {/* Event popup */}
        {popupInfo && (
          <Popup
            longitude={popupInfo.longitude}
            latitude={popupInfo.latitude}
            closeOnClick={false}
            onClose={() => setPopupInfo(null)}
            maxWidth="350px"
            className="threat-map-popup"
          >
            <EventPopup event={popupInfo.event} />
          </Popup>
        )}

        {/* Operation popup */}
        {operationPopup && (
          <Popup
            longitude={operationPopup.longitude}
            latitude={operationPopup.latitude}
            closeOnClick={false}
            onClose={() => setOperationPopup(null)}
            maxWidth="320px"
            className="threat-map-popup"
          >
            <OperationPopup operation={operationPopup.operation} />
          </Popup>
        )}

        {/* Intel popup */}
        {intelPopup && (
          <Popup
            longitude={intelPopup.longitude}
            latitude={intelPopup.latitude}
            closeOnClick={false}
            onClose={() => setIntelPopup(null)}
            maxWidth="320px"
            className="threat-map-popup"
          >
            <IntelPopup intel={intelPopup.intel} />
          </Popup>
        )}

        {/* Campaign popup */}
        {campaignPopup && (
          <Popup
            longitude={campaignPopup.longitude}
            latitude={campaignPopup.latitude}
            closeOnClick={false}
            onClose={() => setCampaignPopup(null)}
            maxWidth="320px"
            className="threat-map-popup"
          >
            <CampaignPopup campaign={campaignPopup.campaign} />
          </Popup>
        )}

        {/* Deployment / NATO marker popup */}
        {deploymentPopup && (
          <Popup
            longitude={deploymentPopup.longitude}
            latitude={deploymentPopup.latitude}
            closeOnClick={false}
            onClose={() => setDeploymentPopup(null)}
            maxWidth="320px"
            className="threat-map-popup"
          >
            <div
              className="text-white"
              style={{
                background: 'rgba(8,14,28,0.97)',
                border: '1px solid rgba(255,215,0,0.3)',
                borderTop: '2px solid #FFD700',
                borderRadius: 4,
                padding: '10px 12px',
                minWidth: 220,
                backdropFilter: 'blur(6px)',
              }}
            >
              {deploymentPopup.type === 'nato' ? (
                <>
                  {/* NATO marker header */}
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-[9px] font-black tracking-[0.15em] uppercase px-2 py-0.5 bg-blue-800/30 text-blue-300 border border-blue-700/30 rounded-sm">
                      {deploymentPopup.data.affiliation}
                    </span>
                    <span className="text-[9px] tracking-wider uppercase px-2 py-0.5 bg-gray-800 text-gray-400 border border-gray-700/40 rounded-sm">
                      {deploymentPopup.data.symbol_type?.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <h3 className="font-bold text-tropic-gold text-sm tracking-wide">{deploymentPopup.data.title}</h3>
                  {deploymentPopup.data.designator && (
                    <p className="text-[11px] text-gray-400 mt-1 font-mono">{deploymentPopup.data.designator}</p>
                  )}
                  {deploymentPopup.data.description && (
                    <p className="text-[11px] text-gray-300 mt-1 leading-snug">{deploymentPopup.data.description}</p>
                  )}
                </>
              ) : (
                <>
                  {/* Deployment status + type chips */}
                  <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                    <span className={`text-[9px] font-black tracking-[0.15em] uppercase px-2 py-0.5 rounded-sm border ${
                      deploymentPopup.data.status === 'deploying' ? 'bg-yellow-900/30 text-yellow-300 border-yellow-700/30' :
                      deploymentPopup.data.status === 'deployed'  ? 'bg-green-900/30 text-green-300 border-green-700/30' :
                      deploymentPopup.data.status === 'endex'     ? 'bg-orange-900/30 text-orange-300 border-orange-700/30' :
                      deploymentPopup.data.status === 'rtb'       ? 'bg-blue-900/30 text-blue-300 border-blue-700/30' :
                      'bg-gray-800/50 text-gray-300 border-gray-700/30'
                    }`}>
                      {deploymentPopup.data.status}
                    </span>
                    <span className={`text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-sm border ${
                      deploymentPopup.data.origin_type === 'counterpart' ? 'bg-purple-900/30 text-purple-300 border-purple-700/30' :
                      deploymentPopup.data.origin_type === 'partner'     ? 'bg-cyan-900/30 text-cyan-300 border-cyan-700/30' :
                      'bg-tropic-gold/10 text-tropic-gold border-tropic-gold/30'
                    }`}>
                      {getDeploymentTypeLabel(deploymentPopup.data)}
                    </span>
                  </div>

                  {/* Title */}
                  <h3
                    className="font-black text-sm tracking-wide uppercase"
                    style={{ color: '#FFD700' }}
                  >
                    {deploymentPopup.data.title}
                  </h3>

                  {/* Origin → Destination */}
                  {(() => {
                    const rps = Array.isArray(deploymentPopup.data.route_points)
                      ? [...deploymentPopup.data.route_points].sort((a, b) => a.order - b.order)
                      : [];
                    const firstName = rps.length > 0 ? rps[0].name : '';
                    const lastName = rps.length > 1 ? rps[rps.length - 1].name : '';
                    if (firstName && lastName) {
                      return (
                        <p className="text-[11px] text-gray-300 mt-1 flex items-center gap-1">
                          <span className="text-gray-500 font-mono">{firstName}</span>
                          <span className="text-tropic-gold/60">→</span>
                          <span className="text-gray-300 font-mono">{lastName}</span>
                        </p>
                      );
                    }
                    return null;
                  })()}

                  {/* Countdown */}
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <circle cx="5" cy="5" r="4" stroke="#FFD700" strokeWidth="1" opacity="0.7" />
                      <line x1="5" y1="5" x2="5" y2="2.5" stroke="#FFD700" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
                      <line x1="5" y1="5" x2="7" y2="6.5" stroke="#FFD700" strokeWidth="0.8" strokeLinecap="round" opacity="0.8" />
                    </svg>
                    <span className="font-mono text-tropic-gold text-[11px]">
                      {computeCountdownLabel(deploymentPopup.data) || 'Arrived'}
                    </span>
                  </div>

                  {/* Start time */}
                  {deploymentPopup.data.started_at && (
                    <p className="text-[10px] text-gray-500 mt-1 font-mono">
                      {new Date(deploymentPopup.data.started_at).toLocaleString(undefined, {
                        month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  )}

                  {/* Route points */}
                  {Array.isArray(deploymentPopup.data.route_points) && deploymentPopup.data.route_points.length > 0 && (
                    <div className="mt-2 border-t pt-2" style={{ borderColor: 'rgba(255,215,0,0.2)' }}>
                      <p className="text-[9px] font-black tracking-[0.15em] text-tropic-gold uppercase mb-1">
                        Route
                      </p>
                      <ul className="space-y-0.5">
                        {[...deploymentPopup.data.route_points]
                          .sort((a, b) => a.order - b.order)
                          .map((rp, i, arr) => (
                            <li key={i} className="text-[10px] text-gray-300 flex items-center gap-1.5">
                              <span
                                className="shrink-0"
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: i === 0 || i === arr.length - 1 ? 1 : '50%',
                                  backgroundColor: i === 0 ? '#22c55e' : i === arr.length - 1 ? '#ef4444' : '#FFD700',
                                  display: 'inline-block',
                                }}
                              />
                              <span className="font-mono">{rp.name || `WP${i + 1}`}</span>
                              {rp.stop_duration_hours != null && rp.stop_duration_hours > 0 && (
                                <span className="text-gray-600 ml-auto text-[9px]">{rp.stop_duration_hours}h</span>
                              )}
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          </Popup>
        )}
      </Map>

      {/* Deployment Legend – positioned above the bottom-left control buttons (zIndex 15 to stay on top).
          Uses 288px (= 18rem at default 16px root font) as a fixed pixel value so it's unaffected
          by user font-size changes. This clears the ~264px tall ThreatMapControls stack. */}
      {deploymentLegendEntries.length > 0 && (
        <div
          className="absolute left-4 rounded border shadow-lg"
          style={{
            bottom: 288,
            background: 'rgba(8,14,28,0.94)',
            borderColor: 'rgba(255,215,0,0.35)',
            maxWidth: 240,
            zIndex: 15,
            backdropFilter: 'blur(6px)',
          }}
        >
          {/* Legend header */}
          <div
            className="flex items-center gap-2 px-3 py-1.5 border-b"
            style={{ borderColor: 'rgba(255,215,0,0.2)' }}
          >
            <svg width="8" height="8" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <title>Deployment indicator</title>
              <polygon points="5,0 10,10 0,10" fill="#FFD700" opacity="0.8" />
            </svg>
            <span className="text-[8px] font-black tracking-[0.15em] text-tropic-gold uppercase">
              Active Deployments
            </span>
          </div>
          <div className="px-3 py-2 space-y-1.5 max-h-[160px] overflow-y-auto">
            {deploymentLegendEntries.map((entry) => (
              <div key={entry.id} className="flex items-center gap-2">
                <div
                  className="shrink-0"
                  style={{
                    width: 10,
                    height: 2.5,
                    backgroundColor: entry.color,
                    borderRadius: 1,
                    boxShadow: `0 0 3px ${entry.color}66`,
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div
                    className="text-[8px] font-bold truncate leading-tight tracking-wide uppercase"
                    style={{ color: entry.color }}
                  >
                    {entry.title}
                  </div>
                  <div className="text-[7px] text-gray-500 leading-tight">
                    {entry.label} · {entry.category}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ADS-B Filter Panel */}
      {showADSB && (
        <ADSBFilterPanel countries={adsbCountries} aircraftCount={adsbAircraft.length} />
      )}

      {/* Tracking mode toggle */}
      <div className="absolute bottom-20 right-3 z-10">
        <button
          onClick={() => setTrackDeployment(prev => !prev)}
          className={`flex h-10 w-10 items-center justify-center rounded-full shadow-lg transition-all duration-200 ${
            trackDeployment
              ? 'bg-tropic-gold text-black hover:bg-tropic-gold-light shadow-tropic-gold/30'
              : 'bg-black/90 text-tropic-gold-light hover:bg-tropic-gold/10 border border-tropic-gold-dark/30'
          } backdrop-blur-md`}
          title={trackDeployment ? 'Stop Tracking Deployment' : 'Track Active Deployment'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="3" />
            <line x1="12" y1="2" x2="12" y2="6" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="2" y1="12" x2="6" y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
          </svg>
        </button>
      </div>

      {/* Country conflicts modal */}
      {countryModal && (
        <CountryConflictsModal
          country={countryModal}
          onClose={() => setCountryModal(null)}
        />
      )}
    </div>
  );
}

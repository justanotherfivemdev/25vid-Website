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
import { renderMilSymbolDataUrl } from '@/lib/milsymbol';

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
      '#8a9aa8', 2, '#c9a227', 3, '#eab308', 4, '#f97316', 5, '#ef4444',
    ],
    'circle-radius': ['step', ['get', 'point_count'], 12, 10, 16, 30, 20, 100, 24],
    'circle-stroke-width': 2,
    'circle-stroke-color': '#0c1117',
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
      '#8a9aa8',
    ],
    'circle-radius': 8,
    'circle-stroke-width': 2,
    'circle-stroke-color': '#0c1117',
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
    'circle-color': '#c9a227',
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
    'text-color': '#c9a227',
    'text-halo-color': '#0c1117',
    'text-halo-width': 1,
  },
};

const militaryBaseLayer = {
  id: 'military-bases',
  type: 'circle',
  paint: {
    'circle-color': '#e8c547',
    'circle-radius': 5,
    'circle-stroke-width': 1,
    'circle-stroke-color': '#0c1117',
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
    'text-halo-color': '#0c1117',
    'text-halo-width': 1,
  },
};

/* Operations overlay (our internal ops) - gold markers */
const operationsLayer = {
  id: 'operations-markers',
  type: 'circle',
  paint: {
    'circle-color': '#e8c547',
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
    'text-color': '#e8c547',
    'text-halo-color': '#0c1117',
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
    'text-halo-color': '#0c1117',
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
    'text-halo-color': '#0c1117',
    'text-halo-width': 1,
  },
};

/* ── NATO Symbology via milsymbol (MIL-STD-2525) ───────────────────────── */

/**
 * Affiliation digit (4th character / position 4 in the SIDC layout; e.g. `100${aff}...`):
 *   3 = Friendly, 6 = Hostile, 4 = Neutral, 1 = Unknown
 */
const AFFILIATION_SIDC_DIGIT = {
  friendly: '3',
  hostile: '6',
  neutral: '4',
  unknown: '1',
};

/**
 * Symbol type → 6-digit SIDC entity/type/subtype segment (positions 11-16 in a 20-char SIDC).
 * Uses MIL-STD-2525D / APP-6D numeric SIDCs.
 * Format: SSAA------EEEEEE----  (Set, Affiliation, ..., Entity/Type/Subtype, ...)
 */
const SYMBOL_TYPE_SIDC_MAP = {
  infantry:              '121100',
  armor:                 '120500',
  aviation:              '140700',
  artillery:             '130300',
  logistics:             '160000',
  headquarters:          '110000',
  medical:               '160200',
  recon:                 '121100',
  signal:                '111800',
  engineer:              '111400',
  air_defense:           '130200',
  naval:                 '150000',
  special_operations:    '121600',
  military_police:       '111600',
  chemical:              '111300',
  maintenance:           '160100',
  transportation:        '161200',
  supply:                '160600',
  missile:               '130100',
  cyber:                 '112200',
  civil_affairs:         '111200',
  psychological_operations: '111700',
  unmanned_aerial:       '140702',
  electronic_warfare:    '112300',
  objective:             '110000',
  waypoint:              '110000',
  staging_area:          '110000',
  custom:                '110000',
};

/**
 * Echelon → SIDC Modifier 1 two-digit segment (positions 17-18 in the 20-char SIDC).
 * MIL-STD-2525D echelon amplifiers.
 */
const ECHELON_SIDC_MAP = {
  none:       '00',
  team:       '11',
  squad:      '12',
  section:    '13',
  platoon:    '14',
  company:    '15',
  battalion:  '16',
  regiment:   '17',
  brigade:    '18',
  division:   '19',
  corps:      '20',
  army:       '21',
  army_group: '22',
  theater:    '23',
};

/**
 * Build a full 20-character SIDC for milsymbol (MIL-STD-2525D).
 *
 * Position layout (20 chars total):
 *   [1-2]   Version / coding scheme  = "10" (MIL-STD-2525D)
 *   [3]     Context                   = "0"  (Reality)
 *   [4]     Standard Identity          = aff digit (3=Friendly, 6=Hostile, 4=Neutral, 1=Unknown)
 *   [5-6]   Symbol Set                = "10" (Land Unit / Equipment)
 *   [7]     Status                     = "0"  (Present)
 *   [8-9]   HQ / Task Force / Dummy   = "00"
 *   [10]    Amplifier / Descriptor     = "0"
 *   [11-16] Entity / Type / Subtype    = icon (6 digits from SYMBOL_TYPE_SIDC_MAP)
 *   [17-18] Modifier 1 (Echelon)       = ech (2 digits from ECHELON_SIDC_MAP)
 *   [19-20] Modifier 2 (Mobility)      = "00"
 *
 * Example: friendly infantry = "10031000001211000000"
 */
function buildSIDC(affiliation = 'friendly', symbolType = 'infantry', echelon = 'none') {
  const aff = AFFILIATION_SIDC_DIGIT[affiliation] || '1';
  const icon = SYMBOL_TYPE_SIDC_MAP[symbolType] || '110000';
  const ech = ECHELON_SIDC_MAP[echelon] || '00';
  return `100${aff}100000${icon}${ech}00`;
}

/**
 * Render a NATO marker using milsymbol. Falls back to a simple colored circle
 * if milsymbol fails to render the SIDC.
 * Results are cached by (sidc, size) to avoid re-creating ms.Symbol every render.
 */
const _milsymbolCache = new Map();
function renderNATOMarkerImage(affiliation, symbolType, echelon, size = 40) {
  try {
    const sidc = buildSIDC(affiliation, symbolType, echelon);
    const key = `${sidc}_${size}`;
    if (_milsymbolCache.has(key)) return _milsymbolCache.get(key);
    const result = renderMilSymbolDataUrl(sidc, size);
    _milsymbolCache.set(key, result);
    return result;
  } catch (err) {
    console.warn('[ThreatMap] NATO marker render failed:', { affiliation, symbolType, echelon }, err);
    return null;
  }
}

/* ── Fallback colors used if milsymbol render fails ─────────────────────── */
const NATO_AFFILIATION_COLORS = {
  friendly: { fill: '#80b0ff', stroke: '#3366cc', bg: '#1a3a6e' },
  hostile: { fill: '#ff8080', stroke: '#cc3333', bg: '#6e1a1a' },
  neutral: { fill: '#80ff80', stroke: '#33aa33', bg: '#1a6e1a' },
  unknown: { fill: '#ffff80', stroke: '#cccc33', bg: '#6e6e1a' },
};

/* ── Deployment path colours per unit ────────────────────────────────────── */
// 25th ID fixed branded color
const TWENTY_FIFTH_COLOR = '#e8c547';

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
  '#8a9aa8', // muted steel
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
  '#4a6070', // slate
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

/** Returns true if a route point has valid numeric coordinates. */
function isValidCoordinate(rp) {
  return typeof rp.longitude === 'number' && typeof rp.latitude === 'number'
    && !Number.isNaN(rp.longitude) && !Number.isNaN(rp.latitude);
}

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

export default function GlobalThreatMap({
  operations = [],
  intelEvents = [],
  campaignEvents = [],
  isAdmin = false,
  onStatusChange,
}) {
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
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(null);

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
        else console.warn('Failed to fetch NATO markers:', markersRes.reason);
        if (deploymentsRes.status === 'fulfilled') setDeployments(deploymentsRes.value.data);
        else console.warn('Failed to fetch deployments:', deploymentsRes.reason);
        if (divRes.status === 'fulfilled') setDivisionLocation(divRes.value.data);
        else console.warn('Failed to fetch division location:', divRes.reason);
      } catch { /* ignore unexpected errors; individual request failures are handled above */ }
    };
    fetchMapData();
  }, []);

  // Build GeoJSON for threat events
  const eventsGeoJson = useMemo(() => ({
    type: 'FeatureCollection',
    features: filteredEvents
      .filter((e) =>
        e.map_worthy !== false &&
        e.location &&
        typeof e.location.latitude === 'number' &&
        typeof e.location.longitude === 'number'
      )
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
          campaign_name: event.campaign_name || '',
          event_nature: event.event_nature || 'real',
          is_simulated: String(Boolean(event.is_simulated || event.event_nature === 'fictional')),
          source_badge: event.source_badge || event.provider || event.source || '',
          generation_provider: event.generation_provider || '',
          location_precision: event.location_precision || '',
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
    // Helper functions (getDeploymentCoords, computeProgress, interpolateAlongLine) are
    // defined in component scope but are functionally stable — their behavior depends only
    // on the arguments passed plus nowTick, which is already in the dependency array.
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
    return sorted
      .filter(isValidCoordinate)
      .map(rp => [rp.longitude, rp.latitude + offsetLat]);
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
    try {
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
          campaign_name: props.campaign_name,
          event_nature: props.event_nature,
          is_simulated: props.is_simulated === 'true',
          source_badge: props.source_badge,
          generation_provider: props.generation_provider,
          location_precision: props.location_precision,
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

    // Check for country polygon click (for conflicts modal).
    // Mapbox dark-v11 does not include a fill layer named "country-boundaries".
    // We query without a layer filter and look for country-label features, or fall
    // back to any feature whose sourceLayer includes "country" or "admin".
    if (mapRef.current) {
      try {
        const map = mapRef.current.getMap();
        // Prefer the visible country-label layer (always present in dark-v11)
        const styleLayers = map.getStyle()?.layers || [];
        const candidateIds = styleLayers
          .filter((l) => /^country-label/.test(l.id))
          .map((l) => l.id);

        let countryName = null;
        if (candidateIds.length > 0) {
          const hits = map.queryRenderedFeatures(event.point, { layers: candidateIds });
          if (hits.length > 0) {
            countryName = hits[0].properties.name_en || hits[0].properties.name;
          }
        }

        // Fallback: query all features at the click point and find one with a
        // country-related source layer (admin-0, country-boundary, etc.)
        if (!countryName) {
          const allHits = map.queryRenderedFeatures(event.point);
          const countryHit = allHits.find(
            (f) =>
              f.sourceLayer &&
              (/^admin-0|^country/.test(f.sourceLayer) || /^place_label/.test(f.sourceLayer)) &&
              (f.properties.name_en || f.properties.name),
          );
          if (countryHit) {
            countryName = countryHit.properties.name_en || countryHit.properties.name;
          }
        }

        if (countryName) {
          setCountryModal(countryName);
        }
      } catch (err) {
        // Swallow style/layer query errors so the click handler never crashes
        console.warn('Country query failed:', err);
      }
    }

    setPopupInfo(null);
    setOperationPopup(null);
    setIntelPopup(null);
    setCampaignPopup(null);
    setDeploymentPopup(null);
    setAircraftPopup(null);
    } catch (err) {
      console.error('Map click handler error:', err);
    }
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
    try {
      if (mapRef.current) {
        addAircraftIcon(mapRef.current.getMap());
      }
    } catch (err) {
      console.warn('[ThreatMap] Failed to add aircraft icon:', err);
    }
    console.info('[ThreatMap] Globe initialized successfully');
    setMapReady(true);
    setMapError(null);
    onStatusChange?.({ ready: true, error: null });
  }, [onStatusChange]);

  const onMapError = useCallback((event) => {
    const message = event?.error?.message || event?.message || 'Map rendering failed.';
    console.error('[ThreatMap] Map error:', message, event);
    setMapReady(false);
    setMapError(message);
    onStatusChange?.({ ready: false, error: message });
  }, [onStatusChange]);

  useEffect(() => {
    if (!MAPBOX_TOKEN) {
      console.warn('[ThreatMap] REACT_APP_MAPBOX_TOKEN is not set — globe disabled');
      onStatusChange?.({
        ready: false,
        error: 'Mapbox token missing. Set REACT_APP_MAPBOX_TOKEN to enable the globe.',
      });
    } else {
      console.info('[ThreatMap] Mapbox token present, initializing globe...');
    }
  }, [onStatusChange]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,#223012_0%,#0a0d12_52%,#040506_100%)] text-tropic-gold-dark">
        <div className="max-w-lg rounded-2xl border border-tropic-gold/20 bg-[#050a0e]/80 p-8 text-center shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-tropic-gold-dark">Threat Map Offline</p>
          <p className="mt-3 text-2xl font-semibold text-tropic-gold">Mapbox token required</p>
          <p className="mt-3 text-sm text-[#8a9aa8]">
            The intelligence feed is still available, but the globe cannot render until
            <code className="mx-1 rounded border border-tropic-gold/20 bg-[#050a0e] px-2 py-1 text-tropic-gold-light">REACT_APP_MAPBOX_TOKEN</code>
            is configured.
          </p>
          {isAdmin && (
            <p className="mt-4 text-xs text-[#4a6070]">
              Admin diagnostic: verify the token, map style access, and outbound tile connectivity.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {!mapReady && !mapError && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[#050a0e]/35 backdrop-blur-[1px]">
          <div className="rounded-xl border border-tropic-gold/20 bg-[#050a0e]/75 px-4 py-3 text-sm text-tropic-gold-light">
            Initializing globe...
          </div>
        </div>
      )}
      {mapError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#050a0e]/75 backdrop-blur-sm">
          <div className="max-w-xl rounded-2xl border border-red-500/25 bg-[#091018] p-6 text-center shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-300">Map Rendering Degraded</p>
            <p className="mt-3 text-xl font-semibold text-tropic-gold">Global threat map unavailable</p>
            <p className="mt-3 text-sm text-[#8a9aa8]">
              The sidebar feed and search remain active while the globe recovers.
            </p>
            <p className="mt-4 text-xs text-[#4a6070]">
              {isAdmin ? mapError : 'A map style, token, or tile-loading error prevented the globe from rendering.'}
            </p>
          </div>
        </div>
      )}
      <Map
        ref={mapRef}
        {...viewport}
        projection="globe"
        onMove={onMove}
        onClick={onMapClick}
        onLoad={onMapLoad}
        onError={onMapError}
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
                    <div className="text-[7px] text-[#4a6070] leading-tight font-mono">
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
                  {/* milsymbol unit marker for deployment */}
                  {(() => {
                    const affiliation = d.origin_type === '25th' ? 'friendly'
                      : d.origin_type === 'counterpart' ? 'neutral' : 'friendly';
                    const depImg = renderNATOMarkerImage(affiliation, 'infantry', 'division', 32);
                    return depImg ? (
                      <img
                        src={depImg}
                        alt={`${d.unit_name || d.title} — deployment unit`}
                        style={{
                          width: 32,
                          height: 32,
                          filter: `drop-shadow(0 0 4px ${color}aa)`,
                        }}
                      />
                    ) : (
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: color, border: '2px solid rgba(0,0,0,0.5)' }} />
                    );
                  })()}
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

        {/* NATO Markers — rendered with milsymbol (MIL-STD-2525) */}
        {natoMarkers.map((marker) => {
          const milSymImg = renderNATOMarkerImage(marker.affiliation, marker.symbol_type, marker.echelon, 40);
          return (
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
              {milSymImg ? (
                <img
                  src={milSymImg}
                  alt={`${marker.title} (${marker.affiliation} ${marker.symbol_type})`}
                  title={`${marker.title} (${marker.affiliation} ${marker.symbol_type})`}
                  style={{ cursor: 'pointer', width: 40, height: 40 }}
                />
              ) : (
                <div
                  title={`${marker.title} (${marker.affiliation} ${marker.symbol_type})`}
                  style={{
                    cursor: 'pointer',
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: (NATO_AFFILIATION_COLORS[marker.affiliation] || NATO_AFFILIATION_COLORS.unknown).bg,
                    border: `2px solid ${(NATO_AFFILIATION_COLORS[marker.affiliation] || NATO_AFFILIATION_COLORS.unknown).stroke}`,
                  }}
                />
              )}
            </Marker>
          );
        })}

        {/* 25th ID Division Location Marker – moves along deployment path when deploying.
            Shows a C-17 silhouette while in transit (deploying/rtb) and the NATO HQ symbol at rest. */}
        {divisionDisplayLocation && (() => {
          let markerLng = divisionDisplayLocation.longitude;
          let markerLat = divisionDisplayLocation.latitude;
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
                  /* milsymbol friendly HQ division marker in transit */
                  (() => {
                    const transitImg = renderNATOMarkerImage('friendly', 'headquarters', 'division', 36);
                    return transitImg ? (
                      <img
                        src={transitImg}
                        alt="25th Infantry Division — in transit"
                        style={{
                          width: 36,
                          height: 36,
                          filter: 'drop-shadow(0 0 6px #FFD700aa)',
                        }}
                      />
                    ) : (
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1a3a6e', border: '2px solid #3366cc' }} />
                    );
                  })()
                ) : (
                  /* milsymbol NATO HQ marker at rest / deployed */
                  (() => {
                    const restImg = renderNATOMarkerImage('friendly', 'headquarters', 'division', 44);
                    return (
                      <div className="relative">
                        {restImg ? (
                          <img src={restImg} alt="25th Infantry Division HQ" style={{ width: 44, height: 44 }} />
                        ) : (
                          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#1a3a6e', border: '2px solid #3366cc' }} />
                        )}
                        {divisionDisplayLocation.state !== 'home_station' && (
                          <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-tropic-gold rounded-full animate-pulse border border-black/80" />
                        )}
                      </div>
                    );
                  })()
                )}
                <span
                  className="text-[8px] font-black whitespace-nowrap px-1.5 py-0.5 rounded tracking-widest uppercase mt-0.5"
                  style={{
                    color: '#e8c547',
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
                {(() => {
                  const objImg = renderNATOMarkerImage('friendly', 'objective', 'none', 28);
                  return objImg ? (
                    <img src={objImg} alt={lastRp.name || d.title} style={{ width: 28, height: 28 }} />
                  ) : (
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#1a3a6e', border: '2px solid #3366cc' }} />
                  );
                })()}
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
                    <span className="text-[9px] tracking-wider uppercase px-2 py-0.5 bg-[#111a24] text-[#8a9aa8] border border-[rgba(201,162,39,0.06)] rounded-sm">
                      {deploymentPopup.data.symbol_type?.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <h3 className="font-bold text-tropic-gold text-sm tracking-wide">{deploymentPopup.data.title}</h3>
                  {deploymentPopup.data.designator && (
                    <p className="text-[11px] text-[#8a9aa8] mt-1 font-mono">{deploymentPopup.data.designator}</p>
                  )}
                  {deploymentPopup.data.description && (
                    <p className="text-[11px] text-[#8a9aa8] mt-1 leading-snug">{deploymentPopup.data.description}</p>
                  )}
                </>
              ) : (
                <>
                  {/* Deployment status + type chips */}
                  <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                    <span className={`text-[9px] font-black tracking-[0.15em] uppercase px-2 py-0.5 rounded-sm border ${
                      deploymentPopup.data.status === 'deploying' ? 'bg-yellow-900/30 text-yellow-300 border-yellow-700/30' :
                      deploymentPopup.data.status === 'deployed'  ? 'bg-[rgba(201,162,39,0.1)] text-[#c9a227] border-[rgba(201,162,39,0.3)]' :
                      deploymentPopup.data.status === 'endex'     ? 'bg-orange-900/30 text-orange-300 border-orange-700/30' :
                      deploymentPopup.data.status === 'rtb'       ? 'bg-blue-900/30 text-blue-300 border-blue-700/30' :
                      'bg-[#111a24]/50 text-[#8a9aa8] border-[rgba(201,162,39,0.045)]'
                    }`}>
                      {deploymentPopup.data.status}
                    </span>
                    <span className={`text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-sm border ${
                      deploymentPopup.data.origin_type === 'counterpart' ? 'bg-[#111a24] text-[#8a9aa8] border-[rgba(138,154,168,0.3)]' :
                      deploymentPopup.data.origin_type === 'partner'     ? 'bg-cyan-900/30 text-cyan-300 border-cyan-700/30' :
                      'bg-tropic-gold/10 text-tropic-gold border-tropic-gold/30'
                    }`}>
                      {getDeploymentTypeLabel(deploymentPopup.data)}
                    </span>
                  </div>

                  {/* Title */}
                  <h3
                    className="font-black text-sm tracking-wide uppercase"
                    style={{ color: '#e8c547' }}
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
                        <p className="text-[11px] text-[#8a9aa8] mt-1 flex items-center gap-1">
                          <span className="text-[#4a6070] font-mono">{firstName}</span>
                          <span className="text-tropic-gold/60">→</span>
                          <span className="text-[#8a9aa8] font-mono">{lastName}</span>
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
                    <p className="text-[10px] text-[#4a6070] mt-1 font-mono">
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
                            <li key={i} className="text-[10px] text-[#8a9aa8] flex items-center gap-1.5">
                              <span
                                className="shrink-0"
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: i === 0 || i === arr.length - 1 ? 1 : '50%',
                                  backgroundColor: i === 0 ? '#c9a227' : i === arr.length - 1 ? '#ef4444' : '#e8c547',
                                  display: 'inline-block',
                                }}
                              />
                              <span className="font-mono">{rp.name || `WP${i + 1}`}</span>
                              {rp.stop_duration_hours != null && rp.stop_duration_hours > 0 && (
                                <span className="text-[#4a6070] ml-auto text-[9px]">{rp.stop_duration_hours}h</span>
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
                  <div className="text-[7px] text-[#4a6070] leading-tight">
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
              : 'bg-[#050a0e]/90 text-tropic-gold-light hover:bg-tropic-gold/10 border border-tropic-gold-dark/30'
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

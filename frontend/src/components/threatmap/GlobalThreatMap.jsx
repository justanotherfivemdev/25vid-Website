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
      '#3b82f6', 2, '#22c55e', 3, '#eab308', 4, '#f97316', 5, '#ef4444',
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
      '#3b82f6',
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
    'circle-color': '#60a5fa',
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
    'text-color': '#60a5fa',
    'text-halo-color': '#1e293b',
    'text-halo-width': 1,
  },
};

/* Operations overlay (our internal ops) - gold markers */
const operationsLayer = {
  id: 'operations-markers',
  type: 'circle',
  paint: {
    'circle-color': '#C9A227',
    'circle-radius': 10,
    'circle-stroke-width': 3,
    'circle-stroke-color': '#8F701A',
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
    'text-color': '#C9A227',
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
    'circle-color': '#B01C2E',
    'circle-radius': 9,
    'circle-stroke-width': 2,
    'circle-stroke-color': '#7E1420',
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
    'text-color': '#D33A4C',
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
const UNIT_DEPLOYMENT_COLORS = [
  '#C9A227', // gold  – 25th ID (default)
  '#3B82F6', // blue
  '#EF4444', // red
  '#10B981', // emerald
  '#A855F7', // purple
  '#F59E0B', // amber
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#F97316', // orange
  '#6366F1', // indigo
];

function getUnitColor(partnerUnitId, unitIndex) {
  if (!partnerUnitId) return UNIT_DEPLOYMENT_COLORS[0]; // 25th ID gold
  return UNIT_DEPLOYMENT_COLORS[(unitIndex % (UNIT_DEPLOYMENT_COLORS.length - 1)) + 1];
}

/* Deployment path layer – uses data-driven color */
const deploymentPathLayer = {
  id: 'deployment-path',
  type: 'line',
  paint: {
    'line-color': ['get', 'color'],
    'line-width': 2.5,
    'line-dasharray': [2, 2],
    'line-opacity': 0.8,
  },
  layout: {
    'line-cap': 'round',
    'line-join': 'round',
  },
};

const deploymentArrowLayer = {
  id: 'deployment-arrows',
  type: 'symbol',
  layout: {
    'symbol-placement': 'line',
    'symbol-spacing': 80,
    'text-field': '▶',
    'text-size': 14,
    'text-rotate': 0,
    'text-rotation-alignment': 'map',
    'text-keep-upright': false,
    'text-allow-overlap': true,
  },
  paint: {
    'text-color': ['get', 'color'],
    'text-opacity': 0.9,
  },
};

/* Duration label shown along the deployment line when deploying */
const deploymentDurationLayer = {
  id: 'deployment-duration',
  type: 'symbol',
  filter: ['==', ['get', 'status'], 'deploying'],
  layout: {
    'symbol-placement': 'line-center',
    'text-field': ['get', 'durationLabel'],
    'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
    'text-size': 11,
    'text-offset': [0, -1.2],
    'text-allow-overlap': true,
    'text-anchor': 'center',
  },
  paint: {
    'text-color': ['get', 'color'],
    'text-halo-color': '#0f172a',
    'text-halo-width': 1.5,
  },
};

export default function GlobalThreatMap({ operations = [], intelEvents = [], campaignEvents = [] }) {
  const mapRef = useRef(null);
  const {
    viewport, showHeatmap, showClusters, showMilitaryBases,
    entityLocations, militaryBases, setViewport,
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
      if (d.partner_unit_id && !(d.partner_unit_id in map)) {
        map[d.partner_unit_id] = idx++;
      }
    });
    return map;
  }, [deployments]);

  // Compute a human-readable travel duration label from start_date → estimated_arrival
  function computeDurationLabel(dep) {
    if (!dep.start_date || !dep.estimated_arrival) return '';
    const start = new Date(dep.start_date);
    const end = new Date(dep.estimated_arrival);
    const diffMs = end - start;
    if (isNaN(diffMs) || diffMs <= 0) return '';
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0 && hours > 0) return `${days}d ${hours}h`;
    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    return '';
  }

  // Build GeoJSON for deployment travel paths
  const deploymentPathsGeoJson = useMemo(() => ({
    type: 'FeatureCollection',
    features: deployments
      .filter((d) => d.destination_latitude != null && d.destination_longitude != null &&
                     d.status !== 'completed' && d.status !== 'cancelled')
      .map((d) => {
        const unitIdx = d.partner_unit_id ? (partnerUnitIndexMap[d.partner_unit_id] ?? 0) : -1;
        const color = getUnitColor(d.partner_unit_id, unitIdx);
        const durationLabel = computeDurationLabel(d);
        // Offset overlapping lines slightly for partner units
        const offsetLat = d.partner_unit_id ? (unitIdx + 1) * 0.15 : 0;
        return {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [d.start_longitude, d.start_latitude + offsetLat],
              [d.destination_longitude, d.destination_latitude + offsetLat],
            ],
          },
          properties: {
            id: d.id,
            title: d.title,
            status: d.status,
            partner_unit_id: d.partner_unit_id || '',
            color,
            durationLabel: durationLabel ? `⏱ ${durationLabel}` : '',
          },
        };
      }),
  }), [deployments, partnerUnitIndexMap]);

  // Current active deployment for the 25th ID
  const activeDeployment = useMemo(() =>
    deployments.find((d) =>
      !d.partner_unit_id &&
      ['deploying', 'deployed', 'returning'].includes(d.status)
    ), [deployments]);

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
  }, [selectEvent]);

  const onMouseEnter = useCallback(() => setCursor('pointer'), []);
  const onMouseLeave = useCallback(() => setCursor(''), []);

  const onMove = useCallback((evt) => {
    setViewport(evt.viewState);
  }, [setViewport]);

  const interactiveLayerIds = useMemo(() => {
    const ids = ['clusters', 'unclustered-point', 'operations-markers', 'intel-markers', 'campaign-markers', 'deployment-path'];
    return ids;
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
        onMove={onMove}
        onClick={onMapClick}
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

        {/* Deployment travel paths */}
        {deployments.length > 0 && (
          <Source id="deployment-paths" type="geojson" data={deploymentPathsGeoJson}>
            <Layer {...deploymentPathLayer} />
            <Layer {...deploymentArrowLayer} />
            <Layer {...deploymentDurationLayer} />
          </Source>
        )}

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

        {/* 25th ID Division Location Marker */}
        {divisionDisplayLocation && (
          <Marker
            longitude={divisionDisplayLocation.longitude}
            latitude={divisionDisplayLocation.latitude}
            anchor="center"
          >
            <div className="flex flex-col items-center" title={`25th ID - ${divisionDisplayLocation.name}`}>
              <div className="relative">
                <div
                  dangerouslySetInnerHTML={{
                    __html: buildNATOMarkerSVG('friendly', 'headquarters', 40),
                  }}
                />
                {divisionDisplayLocation.state !== 'home_station' && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-tropic-gold rounded-full animate-pulse border border-black" />
                )}
              </div>
              <span className="text-[10px] font-bold text-tropic-gold mt-0.5 whitespace-nowrap bg-black/70 px-1 rounded">
                25th ID
              </span>
            </div>
          </Marker>
        )}

        {/* Deployment destination markers */}
        {deployments
          .filter((d) => d.destination_latitude != null && d.destination_longitude != null &&
                         d.status !== 'completed' && d.status !== 'cancelled')
          .map((d) => {
            const unitIdx = d.partner_unit_id ? (partnerUnitIndexMap[d.partner_unit_id] ?? 0) : -1;
            const color = getUnitColor(d.partner_unit_id, unitIdx);
            return (
            <Marker
              key={`dep-dest-${d.id}`}
              longitude={d.destination_longitude}
              latitude={d.destination_latitude}
              anchor="center"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                setDeploymentPopup({
                  longitude: d.destination_longitude,
                  latitude: d.destination_latitude,
                  type: 'deployment',
                  data: d,
                });
              }}
            >
              <div className="flex flex-col items-center" style={{ cursor: 'pointer' }}>
                <div
                  dangerouslySetInnerHTML={{
                    __html: buildNATOMarkerSVG('friendly', 'objective', 32),
                  }}
                />
                <span
                  className="text-[9px] mt-0.5 whitespace-nowrap bg-black/70 px-1 rounded max-w-[100px] truncate"
                  style={{ color }}
                >
                  {d.destination_name || d.title}
                </span>
              </div>
            </Marker>
            );
          })}

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
            <div className="p-3 bg-gray-900 text-white rounded-lg border border-tropic-gold/20">
              {deploymentPopup.type === 'nato' ? (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-600/20 text-blue-300 uppercase">
                      {deploymentPopup.data.affiliation}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">
                      {deploymentPopup.data.symbol_type}
                    </span>
                  </div>
                  <h3 className="font-bold text-tropic-gold text-sm">{deploymentPopup.data.title}</h3>
                  {deploymentPopup.data.designator && (
                    <p className="text-xs text-gray-400 mt-1">{deploymentPopup.data.designator}</p>
                  )}
                  {deploymentPopup.data.description && (
                    <p className="text-xs text-gray-300 mt-1">{deploymentPopup.data.description}</p>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${
                      deploymentPopup.data.status === 'deploying' ? 'bg-yellow-600/20 text-yellow-300' :
                      deploymentPopup.data.status === 'deployed' ? 'bg-green-600/20 text-green-300' :
                      deploymentPopup.data.status === 'returning' ? 'bg-blue-600/20 text-blue-300' :
                      'bg-gray-600/20 text-gray-300'
                    }`}>
                      {deploymentPopup.data.status}
                    </span>
                  </div>
                  <h3 className="font-bold text-tropic-gold text-sm">{deploymentPopup.data.title}</h3>
                  <p className="text-xs text-gray-400 mt-1">
                    {deploymentPopup.data.start_location_name} → {deploymentPopup.data.destination_name}
                  </p>
                  {deploymentPopup.data.start_date && deploymentPopup.data.estimated_arrival && (
                    <p className="text-xs text-gray-500 mt-1">
                      ⏱ {computeDurationLabel(deploymentPopup.data) || 'Calculating...'}
                      {deploymentPopup.data.status === 'deploying' && ' — In Transit'}
                    </p>
                  )}
                  {deploymentPopup.data.estimated_arrival && (
                    <p className="text-xs text-gray-500 mt-1">
                      ETA: {new Date(deploymentPopup.data.estimated_arrival).toLocaleDateString()}
                    </p>
                  )}
                </>
              )}
            </div>
          </Popup>
        )}
      </Map>

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

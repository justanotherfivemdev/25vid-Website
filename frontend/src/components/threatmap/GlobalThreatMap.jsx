import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map, {
  NavigationControl,
  GeolocateControl,
  ScaleControl,
  Source,
  Layer,
  Popup,
} from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useMapStore, useEventsStore, threatLevelColors } from '@/stores/threatMapStore';
import EventPopup from './EventPopup';
import OperationPopup from './OperationPopup';
import CountryConflictsModal from './CountryConflictsModal';

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;

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

/* Operations overlay (our internal ops) - distinct green markers */
const operationsLayer = {
  id: 'operations-markers',
  type: 'circle',
  paint: {
    'circle-color': '#10b981',
    'circle-radius': 10,
    'circle-stroke-width': 3,
    'circle-stroke-color': '#065f46',
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
    'text-color': '#10b981',
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

export default function GlobalThreatMap({ operations = [] }) {
  const mapRef = useRef(null);
  const {
    viewport, showHeatmap, showClusters, showMilitaryBases,
    entityLocations, militaryBases, setViewport,
  } = useMapStore();
  const { filteredEvents, selectEvent, selectedEvent } = useEventsStore();

  const [popupInfo, setPopupInfo] = useState(null);
  const [operationPopup, setOperationPopup] = useState(null);
  const [countryModal, setCountryModal] = useState(null);
  const [cursor, setCursor] = useState('');

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

  // Fly to selected event from sidebar
  useEffect(() => {
    if (selectedEvent && mapRef.current) {
      const map = mapRef.current.getMap();
      map.flyTo({
        center: [selectedEvent.location.longitude, selectedEvent.location.latitude],
        zoom: 6,
        duration: 1500,
      });
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
  }, [selectEvent]);

  const onMouseEnter = useCallback(() => setCursor('pointer'), []);
  const onMouseLeave = useCallback(() => setCursor(''), []);

  const onMove = useCallback((evt) => {
    setViewport(evt.viewState);
  }, [setViewport]);

  const interactiveLayerIds = useMemo(() => {
    const ids = ['clusters', 'unclustered-point', 'operations-markers'];
    return ids;
  }, []);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-900 text-gray-400">
        <div className="text-center p-8">
          <p className="text-lg font-semibold mb-2">Mapbox Token Required</p>
          <p className="text-sm">Set <code className="bg-gray-800 px-2 py-1 rounded">REACT_APP_MAPBOX_TOKEN</code> in your environment.</p>
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
            clusterMaxZoom={14}
            clusterRadius={50}
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

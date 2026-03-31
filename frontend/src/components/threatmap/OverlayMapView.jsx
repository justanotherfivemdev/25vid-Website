import React, { useCallback, useMemo, useRef, useState } from 'react';
import Map, {
  NavigationControl,
  ScaleControl,
  Source,
  Layer,
  Popup,
  Marker,
} from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useMapStore, useEventsStore, threatLevelColors } from '@/stores/threatMapStore';
import EventPopup from './EventPopup';

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;

/* Layer style definitions for the 2D overlay view */
const heatmapLayer = {
  id: 'overlay-heatmap',
  type: 'heatmap',
  paint: {
    'heatmap-weight': [
      'match', ['get', 'threatLevel'],
      'critical', 1, 'high', 0.8, 'medium', 0.5, 'low', 0.3, 'info', 0.1, 0.4,
    ],
    'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.6, 9, 2],
    'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 8, 9, 30],
    'heatmap-opacity': 0.7,
    'heatmap-color': [
      'interpolate', ['linear'], ['heatmap-density'],
      0, 'rgba(0,0,0,0)',
      0.2, 'rgba(59,130,246,0.5)',
      0.4, 'rgba(34,197,94,0.6)',
      0.6, 'rgba(234,179,8,0.7)',
      0.8, 'rgba(249,115,22,0.8)',
      1, 'rgba(239,68,68,0.9)',
    ],
  },
};

const pointLayer = {
  id: 'overlay-points',
  type: 'circle',
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
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 4, 6, 7, 12, 10],
    'circle-stroke-width': 1.5,
    'circle-stroke-color': '#0f172a',
    'circle-opacity': 0.9,
  },
};

const pointLabelLayer = {
  id: 'overlay-point-labels',
  type: 'symbol',
  minzoom: 5,
  layout: {
    'text-field': ['get', 'title'],
    'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
    'text-size': 10,
    'text-offset': [0, 1.4],
    'text-anchor': 'top',
    'text-max-width': 12,
  },
  paint: {
    'text-color': '#e2e8f0',
    'text-halo-color': 'rgba(0,0,0,0.8)',
    'text-halo-width': 1,
  },
};

export default function OverlayMapView({ operations = [], intelEvents = [], campaignEvents = [] }) {
  const mapRef = useRef(null);
  const {
    viewport, showHeatmap, showClusters, showMilitaryBases,
    entityLocations, militaryBases, overlayLayers, dataSourceFilter,
    setViewport,
  } = useMapStore();
  const { filteredEvents, selectEvent } = useEventsStore();

  const [popupInfo, setPopupInfo] = useState(null);
  const [cursor, setCursor] = useState('');

  // Apply data source filter
  const displayEvents = useMemo(() => {
    if (dataSourceFilter === 'all') return filteredEvents;
    return filteredEvents.filter(e => {
      if (dataSourceFilter === 'real') return e.event_nature !== 'fictional';
      if (dataSourceFilter === 'fictional') return e.event_nature === 'fictional';
      return true;
    });
  }, [filteredEvents, dataSourceFilter]);

  // Apply overlay layer filters
  const layerFilteredEvents = useMemo(() => {
    const activeLayers = Object.entries(overlayLayers)
      .filter(([, v]) => v)
      .map(([k]) => k);

    if (activeLayers.length === 0) return displayEvents;

    // If all default layers are on, show everything
    const allDefaults = ['conflicts', 'military'];
    const isDefaultState = activeLayers.length <= allDefaults.length &&
      activeLayers.every(l => allDefaults.includes(l));
    if (isDefaultState) return displayEvents;

    return displayEvents.filter(e => {
      const cat = e.category || e.layer || 'conflict';
      return activeLayers.some(layer => {
        if (layer === 'conflicts') return ['conflict', 'terrorism', 'crime', 'piracy'].includes(cat);
        if (layer === 'military') return ['military'].includes(cat);
        if (layer === 'infrastructure') return ['infrastructure', 'cyber'].includes(cat);
        if (layer === 'economic') return ['economic', 'commodities'].includes(cat);
        if (layer === 'diplomatic') return ['diplomatic'].includes(cat);
        if (layer === 'environmental') return ['disaster', 'environmental', 'health'].includes(cat);
        return cat === layer;
      });
    });
  }, [displayEvents, overlayLayers]);

  // GeoJSON for events
  const eventsGeoJSON = useMemo(() => ({
    type: 'FeatureCollection',
    features: layerFilteredEvents
      .filter(e => e.location?.latitude != null && e.location?.longitude != null)
      .map(e => ({
        type: 'Feature',
        id: e.id,
        geometry: {
          type: 'Point',
          coordinates: [e.location.longitude, e.location.latitude],
        },
        properties: {
          id: e.id,
          title: (e.title || '').slice(0, 40),
          category: e.category,
          threatLevel: e.threatLevel,
          source: e.source || 'unknown',
          event_nature: e.event_nature || 'real',
        },
      })),
  }), [layerFilteredEvents]);

  // Military bases GeoJSON
  const basesGeoJSON = useMemo(() => ({
    type: 'FeatureCollection',
    features: (militaryBases || []).map((b, i) => ({
      type: 'Feature',
      id: i,
      geometry: { type: 'Point', coordinates: [b.longitude, b.latitude] },
      properties: {
        name: b.baseName,
        type: b.type,
        country: b.country,
      },
    })),
  }), [militaryBases]);

  const onMove = useCallback((evt) => setViewport(evt.viewState), [setViewport]);

  const onClick = useCallback((e) => {
    const feature = e.features?.[0];
    if (!feature) {
      setPopupInfo(null);
      return;
    }

    if (feature.layer.id === 'overlay-points') {
      const eventId = feature.properties.id;
      const event = layerFilteredEvents.find(ev => ev.id === eventId);
      if (event) {
        selectEvent(event);
        setPopupInfo({
          longitude: e.lngLat.lng,
          latitude: e.lngLat.lat,
          event,
        });
      }
    }
  }, [layerFilteredEvents, selectEvent]);

  const onMouseEnter = useCallback(() => setCursor('pointer'), []);
  const onMouseLeave = useCallback(() => setCursor(''), []);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-full items-center justify-center text-tropic-gold">
        <p>MAPBOX_TOKEN not configured</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <Map
        ref={mapRef}
        {...viewport}
        projection="mercator"
        onMove={onMove}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        cursor={cursor}
        interactiveLayerIds={['overlay-points']}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        mapboxAccessToken={MAPBOX_TOKEN}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
        reuseMaps
      >
        <NavigationControl position="top-right" />
        <ScaleControl position="bottom-right" />

        {/* Heatmap layer */}
        {showHeatmap && (
          <Source id="overlay-heatmap-src" type="geojson" data={eventsGeoJSON}>
            <Layer {...heatmapLayer} />
          </Source>
        )}

        {/* Event points */}
        {showClusters && (
          <Source id="overlay-events-src" type="geojson" data={eventsGeoJSON}>
            <Layer {...pointLayer} />
            <Layer {...pointLabelLayer} />
          </Source>
        )}

        {/* Military bases */}
        {showMilitaryBases && militaryBases.length > 0 && (
          <Source id="overlay-bases-src" type="geojson" data={basesGeoJSON}>
            <Layer
              id="overlay-bases"
              type="circle"
              paint={{
                'circle-color': [
                  'match', ['get', 'type'],
                  'usa', '#3b82f6',
                  'nato', '#6366f1',
                  '#94a3b8',
                ],
                'circle-radius': 5,
                'circle-stroke-width': 1.5,
                'circle-stroke-color': '#0f172a',
                'circle-opacity': 0.85,
              }}
            />
            <Layer
              id="overlay-bases-labels"
              type="symbol"
              minzoom={5}
              layout={{
                'text-field': ['get', 'name'],
                'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
                'text-size': 9,
                'text-offset': [0, 1.2],
                'text-anchor': 'top',
              }}
              paint={{
                'text-color': '#93c5fd',
                'text-halo-color': 'rgba(0,0,0,0.8)',
                'text-halo-width': 1,
              }}
            />
          </Source>
        )}

        {/* Entity location markers */}
        {entityLocations.map((loc, i) => (
          <Marker
            key={`entity-${i}`}
            longitude={loc.longitude}
            latitude={loc.latitude}
            anchor="center"
          >
            <div className="flex flex-col items-center">
              <div
                className="h-3 w-3 rounded-full border-2 border-cyan-400 bg-cyan-500/50"
                style={{ boxShadow: '0 0 8px rgba(34,211,238,0.6)' }}
              />
              {loc.placeName && (
                <span className="mt-0.5 text-[8px] text-cyan-300 bg-black/80 px-1 rounded">
                  {loc.placeName}
                </span>
              )}
            </div>
          </Marker>
        ))}

        {/* Internal operations */}
        {operations.filter(op => op.lat != null && op.lng != null).map(op => (
          <Marker key={op.id} longitude={op.lng} latitude={op.lat} anchor="center">
            <div
              className="h-3.5 w-3.5 rounded-sm border border-tropic-gold bg-tropic-gold/40"
              title={op.title}
              style={{ boxShadow: '0 0 6px rgba(201,162,39,0.5)' }}
            />
          </Marker>
        ))}

        {/* Popup */}
        {popupInfo && (
          <Popup
            longitude={popupInfo.longitude}
            latitude={popupInfo.latitude}
            anchor="bottom"
            onClose={() => setPopupInfo(null)}
            closeButton
            closeOnClick={false}
            maxWidth="320px"
            className="threat-map-popup"
          >
            <EventPopup event={popupInfo.event} onClose={() => setPopupInfo(null)} />
          </Popup>
        )}
      </Map>

      {/* Overlay view attribution */}
      <div
        className="absolute bottom-2 left-2 z-10 text-[9px] px-1.5 py-0.5 rounded"
        style={{ color: 'rgba(201,162,39,0.5)', background: 'rgba(0,0,0,0.6)' }}
      >
        Intelligence Overlay View • {layerFilteredEvents.length} events
      </div>
    </div>
  );
}

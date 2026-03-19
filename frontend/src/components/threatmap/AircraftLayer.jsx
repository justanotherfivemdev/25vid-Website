import React, { useMemo, useState, useCallback } from 'react';
import { Source, Layer, Popup } from 'react-map-gl/mapbox';

// ---------------------------------------------------------------------------
// Mapbox layers for aircraft rendering
// ---------------------------------------------------------------------------
const AIRCRAFT_SOURCE_ID = 'adsb-military-aircraft';

const aircraftCircleLayer = {
  id: 'adsb-aircraft-circle',
  type: 'circle',
  paint: {
    'circle-radius': [
      'interpolate', ['linear'], ['zoom'],
      2, 4,
      6, 6,
      10, 8,
    ],
    'circle-color': [
      'case',
      ['get', 'stale'], 'rgba(6, 182, 212, 0.3)',
      'rgba(6, 182, 212, 0.85)',
    ],
    'circle-stroke-width': 1.5,
    'circle-stroke-color': [
      'case',
      ['get', 'stale'], 'rgba(6, 182, 212, 0.2)',
      'rgba(6, 182, 212, 0.6)',
    ],
    'circle-blur': 0.15,
  },
};

const aircraftHeadingLayer = {
  id: 'adsb-aircraft-heading',
  type: 'symbol',
  layout: {
    'icon-image': 'adsb-aircraft-icon',
    'icon-size': [
      'interpolate', ['linear'], ['zoom'],
      2, 0.5,
      6, 0.7,
      10, 1.0,
    ],
    'icon-rotate': ['get', 'heading'],
    'icon-rotation-alignment': 'map',
    'icon-allow-overlap': true,
    'icon-ignore-placement': true,
  },
  paint: {
    'icon-opacity': [
      'case',
      ['get', 'stale'], 0.3,
      0.9,
    ],
  },
};

const aircraftLabelLayer = {
  id: 'adsb-aircraft-label',
  type: 'symbol',
  minzoom: 5,
  layout: {
    'text-field': ['get', 'callsign'],
    'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
    'text-size': 10,
    'text-offset': [0, 1.5],
    'text-anchor': 'top',
    'text-allow-overlap': false,
  },
  paint: {
    'text-color': 'rgba(6, 182, 212, 0.9)',
    'text-halo-color': 'rgba(0, 0, 0, 0.8)',
    'text-halo-width': 1,
  },
};

// ---------------------------------------------------------------------------
// Aircraft icon SVG → Mapbox image
// ---------------------------------------------------------------------------
const AIRCRAFT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgb(6,182,212)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>`;

/**
 * Adds a custom aircraft icon to the Mapbox map instance.
 * Called once when the map loads.
 */
export function addAircraftIcon(map) {
  if (map.hasImage('adsb-aircraft-icon')) return;

  const img = new Image(24, 24);
  img.onload = () => {
    if (!map.hasImage('adsb-aircraft-icon')) {
      map.addImage('adsb-aircraft-icon', img, { sdf: false });
    }
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(AIRCRAFT_SVG)}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function AircraftLayer({ aircraft = [], visible = false }) {
  const [popup, setPopup] = useState(null);

  const geojson = useMemo(() => ({
    type: 'FeatureCollection',
    features: aircraft.map((ac) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [ac.lon, ac.lat],
      },
      properties: {
        id: ac.id,
        callsign: ac.callsign || 'UNKNOWN',
        altitude: ac.altitude,
        velocity: ac.velocity,
        heading: ac.heading || 0,
        aircraft_type: ac.aircraft_type || '',
        source: ac.source || '',
        stale: ac._stale || false,
      },
    })),
  }), [aircraft]);

  const handleClick = useCallback((e) => {
    if (!e.features || e.features.length === 0) return;
    const feature = e.features[0];
    const props = feature.properties;
    setPopup({
      longitude: feature.geometry.coordinates[0],
      latitude: feature.geometry.coordinates[1],
      callsign: props.callsign,
      altitude: props.altitude,
      velocity: props.velocity,
      heading: props.heading,
      aircraft_type: props.aircraft_type,
      source: props.source,
    });
  }, []);

  if (!visible || aircraft.length === 0) return null;

  return (
    <>
      <Source id={AIRCRAFT_SOURCE_ID} type="geojson" data={geojson}>
        <Layer {...aircraftCircleLayer} />
        <Layer {...aircraftHeadingLayer} />
        <Layer {...aircraftLabelLayer} />
      </Source>

      {popup && (
        <Popup
          longitude={popup.longitude}
          latitude={popup.latitude}
          closeOnClick={false}
          onClose={() => setPopup(null)}
          maxWidth="280px"
          className="threat-map-popup"
        >
          <div className="p-3 bg-gray-900 text-white rounded-lg border border-cyan-500/30">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-cyan-600/20 text-cyan-300 uppercase">
                ADS-B
              </span>
              {popup.aircraft_type && (
                <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">
                  {popup.aircraft_type}
                </span>
              )}
            </div>
            <h3 className="font-bold text-cyan-400 text-sm tracking-wider">
              {popup.callsign || 'UNKNOWN'}
            </h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs">
              {popup.altitude != null && (
                <>
                  <span className="text-gray-400">Altitude</span>
                  <span className="text-gray-200 text-right">{Math.round(popup.altitude).toLocaleString()} ft</span>
                </>
              )}
              {popup.velocity != null && (
                <>
                  <span className="text-gray-400">Speed</span>
                  <span className="text-gray-200 text-right">{Math.round(popup.velocity)} kts</span>
                </>
              )}
              {popup.heading != null && (
                <>
                  <span className="text-gray-400">Heading</span>
                  <span className="text-gray-200 text-right">{Math.round(popup.heading)}°</span>
                </>
              )}
              {popup.source && (
                <>
                  <span className="text-gray-400">Source</span>
                  <span className="text-gray-200 text-right">{popup.source}</span>
                </>
              )}
            </div>
          </div>
        </Popup>
      )}
    </>
  );
}

/**
 * Returns the interactive layer IDs for aircraft click handling.
 */
export const AIRCRAFT_INTERACTIVE_LAYERS = ['adsb-aircraft-circle', 'adsb-aircraft-heading'];

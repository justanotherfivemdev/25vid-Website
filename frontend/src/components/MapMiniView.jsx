import React, { useMemo } from 'react';
import Map, { Marker, NavigationControl } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { colors } from '@/theme/theme';

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;

/**
 * Lightweight map view for embedding in detail pages (Operation, Intel, Campaign).
 *
 * Props:
 *   latitude / longitude – center of the map
 *   zoom               – initial zoom (default 6)
 *   markers            – optional array of { id, latitude, longitude, color, label }
 *   height             – CSS height (default '300px')
 *   className          – additional wrapper classes
 */
export default function MapMiniView({
  latitude = 20,
  longitude = 0,
  zoom = 6,
  markers = [],
  height = '300px',
  className = '',
}) {
  const mapStyle = process.env.REACT_APP_MAP_STYLE || 'mapbox://styles/mapbox/dark-v11';

  const initialViewState = useMemo(
    () => ({ latitude, longitude, zoom, bearing: 0, pitch: 0 }),
    [latitude, longitude, zoom],
  );

  if (!MAPBOX_TOKEN) {
    return (
      <div
        className={`flex items-center justify-center bg-[#111] border border-[#1f1f1f] rounded-lg ${className}`}
        style={{ height }}
      >
        <span className="text-gray-500 text-sm">Map unavailable – missing token</span>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-[#1f1f1f] ${className}`}
      style={{ height }}
    >
      <Map
        initialViewState={initialViewState}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle={mapStyle}
        style={{ width: '100%', height: '100%' }}
        interactive={true}
        scrollZoom={false}
        attributionControl={false}
      >
        <NavigationControl position="top-right" showCompass={false} />
        {markers.map((m) => (
          <Marker
            key={m.id || `${m.latitude}-${m.longitude}`}
            latitude={m.latitude}
            longitude={m.longitude}
            anchor="center"
          >
            <div
              title={m.label || ''}
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                backgroundColor: m.color || colors.gold,
                border: '2px solid #0B0B0B',
                boxShadow: `0 0 6px ${m.color || colors.gold}88`,
              }}
            />
          </Marker>
        ))}
      </Map>
    </div>
  );
}

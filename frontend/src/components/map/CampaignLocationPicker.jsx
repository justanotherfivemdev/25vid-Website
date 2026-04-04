import React, { useCallback, useMemo, useState } from 'react';
import Map, { Marker, NavigationControl } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;
const MAP_STYLE =
  process.env.REACT_APP_MAP_STYLE || 'mapbox://styles/mapbox/dark-v11';

const SEVERITY_COLORS = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444',
};

/**
 * Mapbox-powered location picker used in the campaign creator.
 *
 * Props:
 *   lat / lng     – current selected position (numbers or '')
 *   severity      – marker color ('low' | 'medium' | 'high' | 'critical')
 *   label         – marker tooltip text
 *   onMapClick    – ({ lat, lng }) => void – fired when the user clicks the map
 *   height        – CSS height string (default '240px')
 */
export default function CampaignLocationPicker({
  lat = '',
  lng = '',
  severity = 'medium',
  label = '',
  onMapClick,
  height = '240px',
}) {
  const hasPin =
    lat !== '' &&
    lng !== '' &&
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng));

  const [cursor, setCursor] = useState('crosshair');

  const initialViewState = useMemo(
    () => ({
      latitude: hasPin ? Number(lat) : 20,
      longitude: hasPin ? Number(lng) : 0,
      zoom: hasPin ? 5 : 2,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleClick = useCallback(
    (evt) => {
      if (!onMapClick) return;
      onMapClick({ lat: evt.lngLat.lat, lng: evt.lngLat.lng });
    },
    [onMapClick],
  );

  if (!MAPBOX_TOKEN) {
    return (
      <div
        className="flex items-center justify-center bg-[#050a0e] border border-[rgba(201,162,39,0.12)] rounded-lg text-[#4a6070] text-sm"
        style={{ height }}
      >
        Map preview unavailable – REACT_APP_MAPBOX_TOKEN not set
      </div>
    );
  }

  const markerColor = SEVERITY_COLORS[severity] || SEVERITY_COLORS.medium;

  return (
    <div
      className="rounded-lg overflow-hidden border border-[rgba(201,162,39,0.12)]"
      style={{ height }}
      data-testid="campaign-location-picker"
    >
      <Map
        initialViewState={initialViewState}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle={MAP_STYLE}
        style={{ width: '100%', height: '100%' }}
        cursor={cursor}
        onClick={handleClick}
        onMouseEnter={() => setCursor('crosshair')}
        attributionControl={false}
      >
        <NavigationControl position="top-right" showCompass={false} />
        {hasPin && (
          <Marker
            latitude={Number(lat)}
            longitude={Number(lng)}
            anchor="center"
          >
            <div
              title={label || `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`}
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                backgroundColor: markerColor,
                border: '2px solid #0B0B0B',
                boxShadow: `0 0 8px ${markerColor}99`,
                cursor: 'default',
              }}
            />
          </Marker>
        )}
      </Map>
    </div>
  );
}

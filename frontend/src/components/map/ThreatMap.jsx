import React, { useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMapEvents } from 'react-leaflet';
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, MAP_ATTRIBUTION, MAP_TILE_URL, severityToColor } from '@/utils/mapConfig';
import ThreatMarkerPopup from '@/components/map/ThreatMarkerPopup';

const hasCoords = (m) => Number.isFinite(Number(m?.lat)) && Number.isFinite(Number(m?.lng));

const ThreatMapClickHandler = ({ onMapClick }) => {
  useMapEvents({
    click: (e) => {
      if (!onMapClick) return;
      onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
};

const ThreatMap = ({ markers = [], selectedMarkerId = null, onSelectMarker, showRecruitCta = false, height = '420px', onMapClick = null }) => {
  const filteredMarkers = useMemo(() => markers.filter(hasCoords), [markers]);

  return (
    <div className="rounded-lg overflow-hidden border border-[rgba(201,162,39,0.12)]" style={{ height }} data-testid="threat-map-canvas">
      <MapContainer center={DEFAULT_MAP_CENTER} zoom={DEFAULT_MAP_ZOOM} scrollWheelZoom className="h-full w-full z-0">
        <TileLayer attribution={MAP_ATTRIBUTION} url={MAP_TILE_URL} />
        <ThreatMapClickHandler onMapClick={onMapClick} />
        {filteredMarkers.map((marker, idx) => {
          const color = severityToColor(marker.severity);
          const isSelected = selectedMarkerId === marker.id;
          return (
            <CircleMarker
              key={marker.id || `${marker.lat}-${marker.lng}-${idx}`}
              center={[Number(marker.lat), Number(marker.lng)]}
              pathOptions={{ color, fillColor: color, fillOpacity: isSelected ? 0.9 : 0.65 }}
              radius={isSelected ? 9 : 7}
              eventHandlers={{ click: () => onSelectMarker?.(marker) }}
            >
              <Popup>
                <ThreatMarkerPopup marker={marker} showRecruitCta={showRecruitCta} />
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
};

export default ThreatMap;

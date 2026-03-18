import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const ThreatMarkerPopup = ({ marker, showRecruitCta = false }) => {
  if (!marker) return null;

  return (
    <div className="min-w-52 text-black">
      <div className="font-bold">{marker.name || marker.region_label || 'Threat Marker'}</div>
      {marker.description && <div className="text-xs mt-1">{marker.description}</div>}
      <div className="text-[11px] mt-2 space-y-0.5">
        {marker.source_kind && <div>Layer: <b className="capitalize">{marker.source_kind}</b></div>}
        {marker.category && <div>Category: <b className="capitalize">{marker.category.replaceAll('_', ' ')}</b></div>}
        {marker.severity && <div>Severity: <b className="capitalize">{marker.severity}</b></div>}
        {marker.status && <div>Status: <b className="capitalize">{marker.status.replace('_', ' ')}</b></div>}
        {marker.origin_type && (
          <div>
            Origin: <b style={{ color: marker.origin_type === 'partner_unit' ? '#556B2F' : '#C9A227' }}>
              {marker.origin_unit_name || (marker.origin_type === '25id' ? '25th Infantry Division' : 'Partner Unit')}
            </b>
          </div>
        )}
      </div>
      {marker.linked_operation_id && (
        <Link to={`/hub/operations/${marker.linked_operation_id}`}>
          <Button size="sm" className="mt-2 w-full">View Operation</Button>
        </Link>
      )}
      {showRecruitCta && marker.is_public_recruiting && (
        <div className="text-[11px] mt-2 text-gray-700">Recruiting open for this region.</div>
      )}
    </div>
  );
};

export default ThreatMarkerPopup;

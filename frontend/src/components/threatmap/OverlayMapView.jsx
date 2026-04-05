import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * OverlayMapView — formerly embedded the World Monitor via iframe.
 *
 * The World Monitor is now integrated into the main frontend at /worldmonitor.
 * This component redirects there for backwards compatibility.
 */
export default function OverlayMapView() {
  return <Navigate to="/worldmonitor" replace />;
}

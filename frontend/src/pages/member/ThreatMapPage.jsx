import React, { useEffect, useCallback, useState } from 'react';
import axios from 'axios';
import { useEventsStore, useMapStore } from '@/stores/threatMapStore';
import GlobalThreatMap from '@/components/threatmap/GlobalThreatMap';
import OverlayMapView from '@/components/threatmap/OverlayMapView';
import ThreatMapHeader from '@/components/threatmap/ThreatMapHeader';
import ThreatMapSidebar from '@/components/threatmap/ThreatMapSidebar';
import ThreatMapControls from '@/components/threatmap/ThreatMapControls';
import IntelLayerPanel from '@/components/threatmap/IntelLayerPanel';
import TimelineScrubber from '@/components/threatmap/TimelineScrubber';
import '@/components/threatmap/threatmap.css';

import { API } from '@/utils/api';
const REFRESH_INTERVAL = 300000; // 5 minutes

export default function ThreatMapPage() {
  const { setEvents, setLoading, setError, isLoading } = useEventsStore();
  const { setMilitaryBases, setMilitaryBasesLoading, mapViewMode } = useMapStore();
  const [operations, setOperations] = useState([]);
  const [intelEvents, setIntelEvents] = useState([]);
  const [campaignEvents, setCampaignEvents] = useState([]);

  // Fetch threat events from our backend (Valyu-powered)
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post(`${API}/threat-events`, {}, { withCredentials: true });
      setEvents(res.data.events || []);
    } catch (err) {
      console.error('Failed to fetch threat events:', err);
      setError(err.response?.data?.detail || 'Failed to fetch threat events');
    } finally {
      setLoading(false);
    }
  }, [setEvents, setLoading, setError]);

  // Fetch military bases
  const fetchMilitaryBases = useCallback(async () => {
    setMilitaryBasesLoading(true);
    try {
      const res = await axios.get(`${API}/military-bases`, { withCredentials: true });
      setMilitaryBases(res.data.bases || []);
    } catch (err) {
      console.error('Failed to fetch military bases:', err);
    } finally {
      setMilitaryBasesLoading(false);
    }
  }, [setMilitaryBases, setMilitaryBasesLoading]);

  // Fetch our internal operations for the overlay
  const fetchOperations = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/operations`, { withCredentials: true });
      setOperations(res.data || []);
    } catch (err) {
      console.error('Failed to fetch operations:', err);
    }
  }, []);

  // Fetch internal intel map events
  const fetchIntelEvents = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/map/events?event_type=intel`, { withCredentials: true });
      setIntelEvents(res.data.events || []);
    } catch (err) {
      console.error('Failed to fetch intel map events:', err);
    }
  }, []);

  // Fetch internal campaign map events
  const fetchCampaignEvents = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/map/events?event_type=campaign`, { withCredentials: true });
      setCampaignEvents(res.data.events || []);
    } catch (err) {
      console.error('Failed to fetch campaign map events:', err);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
    fetchMilitaryBases();
    fetchOperations();
    fetchIntelEvents();
    fetchCampaignEvents();

    const interval = setInterval(() => {
      fetchEvents();
      fetchIntelEvents();
      fetchCampaignEvents();
    }, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchEvents, fetchMilitaryBases, fetchOperations, fetchIntelEvents, fetchCampaignEvents]);

  return (
    <div className="flex h-screen flex-col bg-black threat-map-page">
      <ThreatMapHeader onRefresh={fetchEvents} isLoading={isLoading} />
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1">
          {/* Dual Map System */}
          {mapViewMode === 'globe' ? (
            <GlobalThreatMap operations={operations} intelEvents={intelEvents} campaignEvents={campaignEvents} />
          ) : (
            <OverlayMapView operations={operations} intelEvents={intelEvents} campaignEvents={campaignEvents} />
          )}
          <TimelineScrubber />
          <ThreatMapControls />
          <IntelLayerPanel />
        </div>
        <ThreatMapSidebar />
      </div>
    </div>
  );
}

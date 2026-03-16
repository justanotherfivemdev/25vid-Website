import React, { useEffect, useCallback, useState } from 'react';
import axios from 'axios';
import { useEventsStore, useMapStore } from '@/stores/threatMapStore';
import GlobalThreatMap from '@/components/threatmap/GlobalThreatMap';
import ThreatMapHeader from '@/components/threatmap/ThreatMapHeader';
import ThreatMapSidebar from '@/components/threatmap/ThreatMapSidebar';
import ThreatMapControls from '@/components/threatmap/ThreatMapControls';
import TimelineScrubber from '@/components/threatmap/TimelineScrubber';
import '@/components/threatmap/threatmap.css';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const REFRESH_INTERVAL = 300000; // 5 minutes

export default function ThreatMapPage() {
  const { setEvents, setLoading, setError, isLoading } = useEventsStore();
  const { setMilitaryBases, setMilitaryBasesLoading } = useMapStore();
  const [operations, setOperations] = useState([]);

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

  useEffect(() => {
    fetchEvents();
    fetchMilitaryBases();
    fetchOperations();

    const interval = setInterval(fetchEvents, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchEvents, fetchMilitaryBases, fetchOperations]);

  return (
    <div className="flex h-screen flex-col bg-gray-950 threat-map-page">
      <ThreatMapHeader onRefresh={fetchEvents} isLoading={isLoading} />
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1">
          <GlobalThreatMap operations={operations} />
          <TimelineScrubber />
          <ThreatMapControls />
        </div>
        <ThreatMapSidebar />
      </div>
    </div>
  );
}

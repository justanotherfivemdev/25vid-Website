import React, { useEffect, useLayoutEffect, useCallback, useState, useRef } from 'react';
import axios from 'axios';
import { useEventsStore, useMapStore } from '@/stores/threatMapStore';
import { useAuth } from '@/context/AuthContext';
import GlobalThreatMap from '@/components/threatmap/GlobalThreatMap';
import ThreatMapHeader from '@/components/threatmap/ThreatMapHeader';
import ThreatMapSidebar from '@/components/threatmap/ThreatMapSidebar';
import ThreatMapControls from '@/components/threatmap/ThreatMapControls';
import TimelineScrubber from '@/components/threatmap/TimelineScrubber';
import IntelLayerPanel from '@/components/threatmap/IntelLayerPanel';
import '@/components/threatmap/threatmap.css';
import { TerminalTransition, buildThreatMapLines } from '@/components/tactical/TerminalTransition';

import { API } from '@/utils/api';
const REFRESH_INTERVAL = 300000; // 5 minutes
const THREAT_MAP_BOOT_KEY = '25vid_threatmap_boot_done';

export default function ThreatMapPage() {
  const { setEvents, setLoading, setError, isLoading } = useEventsStore();
  const { setMilitaryBases, setMilitaryBasesLoading, setMapViewMode } = useMapStore();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [operations, setOperations] = useState([]);
  const [intelEvents, setIntelEvents] = useState([]);
  const [campaignEvents, setCampaignEvents] = useState([]);
  const [mapStatus, setMapStatus] = useState({ ready: false, error: null });

  /* ── entry animation (once per session) ────────────────────────────── */
  const [animDone, setAnimDone] = useState(() => {
    try { return !!sessionStorage.getItem(THREAT_MAP_BOOT_KEY); } catch { return true; }
  });
  const threatMapLines = useRef(buildThreatMapLines());
  const handleAnimComplete = useCallback(() => {
    try { sessionStorage.setItem(THREAT_MAP_BOOT_KEY, '1'); } catch {}
    setAnimDone(true);
  }, []);

  // This page always renders the Globe view. World Monitor is a standalone app
  // at /worldmonitor/ (served by Nginx), not a React route.
  useLayoutEffect(() => {
    setMapViewMode('globe');
  }, [setMapViewMode]);

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

  // Fetch our internal operations for the Globe view
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
    <div className="flex h-screen flex-col bg-[#050a0e] threat-map-page">
      {!animDone && (
        <TerminalTransition lines={threatMapLines.current} onComplete={handleAnimComplete} />
      )}
      <ThreatMapHeader onRefresh={fetchEvents} isLoading={isLoading} mapStatus={mapStatus} isAdmin={isAdmin} />
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1">
          <GlobalThreatMap
            operations={operations}
            intelEvents={intelEvents}
            campaignEvents={campaignEvents}
            isAdmin={isAdmin}
            onStatusChange={setMapStatus}
          />
          <TimelineScrubber />
          <ThreatMapControls />
          <IntelLayerPanel />
        </div>
        <ThreatMapSidebar isAdmin={isAdmin} />
      </div>
    </div>
  );
}

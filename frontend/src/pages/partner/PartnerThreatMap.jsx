import React, { useEffect, useCallback, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useEventsStore, useMapStore } from '@/stores/threatMapStore';
import GlobalThreatMap from '@/components/threatmap/GlobalThreatMap';
import OverlayMapView from '@/components/threatmap/OverlayMapView';
import ThreatMapHeader from '@/components/threatmap/ThreatMapHeader';
import ThreatMapSidebar from '@/components/threatmap/ThreatMapSidebar';
import ThreatMapControls from '@/components/threatmap/ThreatMapControls';
import TimelineScrubber from '@/components/threatmap/TimelineScrubber';
import MapViewToggle from '@/components/threatmap/MapViewToggle';
import '@/components/threatmap/threatmap.css';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Shield, Home, LogOut, ArrowLeft } from 'lucide-react';
import { BACKEND_URL, API } from '@/utils/api';

const REFRESH_INTERVAL = 300000; // 5 minutes

export default function PartnerThreatMap() {
  const { setEvents, setLoading, setError, isLoading } = useEventsStore();
  const { setMilitaryBases, setMilitaryBasesLoading, setMapViewMode } = useMapStore();
  const [operations, setOperations] = useState([]);
  const [intelEvents, setIntelEvents] = useState([]);
  const [campaignEvents, setCampaignEvents] = useState([]);
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  // Route-driven view: /partner/threat-map → Globe, /partner/threat-map/world-monitor → World Monitor
  const location = useLocation();
  const isWorldMonitor = location.pathname.replace(/\/+$/, '').endsWith('/world-monitor');
  const isGlobe = !isWorldMonitor;

  // Keep store in sync with route
  useEffect(() => {
    setMapViewMode(isWorldMonitor ? 'overlay' : 'globe');
  }, [isWorldMonitor, setMapViewMode]);

  // Auth check
  useEffect(() => {
    axios.get(`${API}/auth/partner/me`, { withCredentials: true })
      .then(res => {
        if (res.data?.account_type !== 'partner') {
          navigate('/partner-login', { replace: true });
          return;
        }
        setUser(res.data);
      })
      .catch(() => navigate('/partner-login', { replace: true }));
  }, [navigate]);

  // Fetch threat events (Valyu-powered) — partners use same global events
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post(`${API}/threat-events`, {}, { withCredentials: true });
      setEvents(res.data.events || []);
    } catch (err) {
      console.error('Failed to fetch threat events:', err);
      // Partners may not have access to threat-events; gracefully degrade
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [setEvents, setLoading, setError]);

  const fetchMilitaryBases = useCallback(async () => {
    setMilitaryBasesLoading(true);
    try {
      const res = await axios.get(`${API}/military-bases`, { withCredentials: true });
      setMilitaryBases(res.data.bases || []);
    } catch {
      // Bases may not be accessible for partners
    } finally {
      setMilitaryBasesLoading(false);
    }
  }, [setMilitaryBases, setMilitaryBasesLoading]);

  // Fetch partner-scoped overlays: operations, intel, campaigns with origin metadata
  const fetchPartnerOverlays = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/partner/map/overlays`, { withCredentials: true });
      const data = res.data || {};
      // Partner overlays include origin_type and origin_unit_name metadata
      // Tag partner items with distinct origin for map differentiation
      const tagOrigin = (items, type) => (items || []).map(item => ({
        ...item,
        _origin: item.origin_type === 'partner_unit' ? 'partner' : '25th',
        _origin_label: item.origin_unit_name || '25th ID',
      }));
      setOperations(tagOrigin(data.operations || [], 'operation'));
      setIntelEvents(tagOrigin(data.intel || [], 'intel'));
      setCampaignEvents(tagOrigin(data.campaigns || [], 'campaign'));
    } catch (err) {
      console.error('Failed to fetch partner overlays:', err);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchEvents();
    fetchMilitaryBases();
    fetchPartnerOverlays();

    const interval = setInterval(() => {
      fetchEvents();
      fetchPartnerOverlays();
    }, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [user, fetchEvents, fetchMilitaryBases, fetchPartnerOverlays]);

  if (!user) {
    return <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="flex h-screen flex-col bg-black threat-map-page">
      {/* Custom header for partner context */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-tropic-olive/30 z-50">
        <div className="flex items-center gap-3">
          <Link to="/partner">
            <Button variant="outline" size="sm" className="border-tropic-olive/60 text-tropic-olive hover:bg-tropic-olive/10">
              <ArrowLeft className="w-4 h-4 mr-1" />Partner Hub
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <img src={`${BACKEND_URL}/api/uploads/25th_id_patch.png`} alt="25th ID" className="w-6 h-6 object-contain" />
            <h1 className="text-lg font-bold text-tropic-gold tracking-wider" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
              GLOBAL THREAT MAP
            </h1>
            <Badge className="bg-tropic-olive/20 text-tropic-olive border border-tropic-olive/40 text-[9px]">
              PARTNER VIEW
            </Badge>
            <MapViewToggle basePath="/partner/threat-map" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-3 mr-4">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-tropic-gold"></span>
              <span className="text-[10px] text-gray-400">25th ID</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-tropic-olive"></span>
              <span className="text-[10px] text-gray-400">Partner Units</span>
            </div>
          </div>
          <span className="text-xs text-gray-500">{user?.username}</span>
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1">
          {isGlobe ? (
            <GlobalThreatMap operations={operations} intelEvents={intelEvents} campaignEvents={campaignEvents} />
          ) : (
            <OverlayMapView />
          )}
          {/* Globe-only controls (World Monitor has its own) */}
          {isGlobe && <TimelineScrubber />}
          {isGlobe && <ThreatMapControls />}
        </div>
        {/* Sidebar — only shown in Globe mode; World Monitor has its own panels */}
        {isGlobe && <ThreatMapSidebar />}
      </div>
    </div>
  );
}

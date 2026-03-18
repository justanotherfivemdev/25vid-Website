import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Home, LogOut, Shield, MapPin, Target, Calendar, ChevronRight, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import Map, { NavigationControl, Source, Layer, Popup } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';

import { API } from '@/utils/api';

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;

const OBJ_STATUS_CFG = {
  pending: { color: 'bg-gray-700', dot: 'bg-gray-500', label: 'PENDING' },
  in_progress: { color: 'bg-tropic-red/15', dot: 'bg-tropic-red animate-pulse', label: 'IN PROGRESS' },
  complete: { color: 'bg-tropic-gold/15', dot: 'bg-tropic-gold', label: 'COMPLETE' },
  failed: { color: 'bg-red-900/20', dot: 'bg-red-500', label: 'FAILED' },
};

const PRIORITY_CFG = {
  primary: { border: 'border-tropic-red', text: 'text-tropic-red' },
  secondary: { border: 'border-tropic-gold', text: 'text-tropic-gold' },
  tertiary: { border: 'border-gray-600', text: 'text-gray-400' },
};

const overlayLayer = {
  id: 'campaign-overlay-markers',
  type: 'circle',
  paint: {
    'circle-color': ['match', ['get', 'source_kind'],
      'objective', '#C9A227',
      'operation', '#B01C2E',
      'intel', '#556B2F',
      '#C9A227',
    ],
    'circle-radius': 9,
    'circle-stroke-width': 2,
    'circle-stroke-color': ['match', ['get', 'source_kind'],
      'objective', '#8F701A',
      'operation', '#7E1420',
      'intel', '#3d4f22',
      '#8F701A',
    ],
  },
};

const overlayLabelLayer = {
  id: 'campaign-overlay-labels',
  type: 'symbol',
  layout: {
    'text-field': ['get', 'name'],
    'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
    'text-size': 10,
    'text-offset': [0, 1.4],
    'text-anchor': 'top',
    'text-max-width': 12,
  },
  paint: {
    'text-color': '#C9A227',
    'text-halo-color': '#1e293b',
    'text-halo-width': 1,
  },
};

const CampaignMap = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mapRef = useRef(null);
  const [campaign, setCampaign] = useState(null);
  const [allCampaigns, setAllCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [markerPopup, setMarkerPopup] = useState(null);
  const [filters, setFilters] = useState({ search: '', severity: 'all', status: 'all' });
  const [overlayData, setOverlayData] = useState({ objectives: [], operations: [], intel: [] });
  const [layerVisibility, setLayerVisibility] = useState({ objectives: true, operations: true, intel: true });
  const [creatingActivity, setCreatingActivity] = useState(false);
  const [activityMsg, setActivityMsg] = useState('');
  const [activityForm, setActivityForm] = useState({
    title: '',
    description: '',
    operation_type: 'combat',
    date: '',
    time: '',
    activity_state: 'ongoing',
  });
  const [mapViewport, setMapViewport] = useState({
    longitude: 0,
    latitude: 20,
    zoom: 2,
  });

  const loadData = useCallback(async () => {
    try {
      const [activeRes, allRes, overlaysRes] = await Promise.all([
        axios.get(`${API}/campaigns/active`),
        axios.get(`${API}/campaigns`),
        axios.get(`${API}/map/overlays`).catch(() => ({ data: { objectives: [], operations: [], intel: [] } })),
      ]);
      setOverlayData({
        objectives: overlaysRes.data?.objectives || [],
        operations: overlaysRes.data?.operations || [],
        intel: overlaysRes.data?.intel || [],
      });
      setAllCampaigns(allRes.data);
      const urlCampaignId = searchParams.get('id');
      const targetCampaign = urlCampaignId
        ? allRes.data.find(c => c.id === urlCampaignId)
        : null;
      if (targetCampaign) {
        setCampaign(targetCampaign);
        setSelectedId(targetCampaign.id);
      } else if (activeRes.data) {
        setCampaign(activeRes.data);
        setSelectedId(activeRes.data.id);
      } else if (allRes.data.length > 0) {
        setCampaign(allRes.data[0]);
        setSelectedId(allRes.data[0].id);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [searchParams]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (selectedId) {
      setSelectedMarker(null);
      setMarkerPopup(null);
      setCreatingActivity(false);
      setActivityMsg('');
      setActivityForm({
        title: '',
        description: '',
        operation_type: 'combat',
        date: '',
        time: '',
        activity_state: 'ongoing',
      });
      axios
        .get(`${API}/campaigns/${selectedId}`)
        .then((r) => setCampaign(r.data))
        .catch(() => {});
    }
  }, [selectedId]);

  useEffect(() => {
    if (!selectedMarker) return;
    setActivityMsg('');
    setActivityForm((prev) => ({
      ...prev,
      title: prev.title || `Activity: ${selectedMarker.name || selectedMarker.region_label || 'Threat Response'}`,
      description: prev.description || selectedMarker.description || '',
    }));
  }, [selectedMarker]);

  const handleLogout = async () => { await logout(); navigate('/'); };

  const phases = campaign?.phases || [];
  const objectives = campaign?.objectives || [];
  const activePhase = phases.find(p => p.status === 'active');
  const objComplete = objectives.filter(o => o.status === 'complete').length;
  const objInProgress = objectives.filter(o => o.status === 'in_progress').length;
  const progress = objectives.length > 0 ? Math.round((objComplete / objectives.length) * 100) : 0;
  const filteredObjectives = (overlayData.objectives || []).filter(o => !selectedId || o.campaign_id === selectedId);
  const filteredOperations = (overlayData.operations || []).filter(o => !selectedId || o.campaign_id === selectedId);
  const filteredIntel = (overlayData.intel || []).filter(o => !selectedId || o.campaign_id === selectedId || !o.campaign_id);

  const mapMarkers = [
    ...(layerVisibility.objectives ? filteredObjectives : []),
    ...(layerVisibility.operations ? filteredOperations : []),
    ...(layerVisibility.intel ? filteredIntel : []),
  ]
    .filter(o => o.lat !== undefined && o.lat !== null && o.lng !== undefined && o.lng !== null)
    .filter(o => filters.severity === 'all' || (o.severity || 'medium') === filters.severity)
    .filter(o => filters.status === 'all' || (o.status || '').toLowerCase() === filters.status)
    .filter(o => {
      const needle = filters.search.trim().toLowerCase();
      if (!needle) return true;
      return [o.name, o.region_label, o.description, o.grid_ref, o.source_kind, o.operation_type].filter(Boolean).join(' ').toLowerCase().includes(needle);
    });

  const overlayGeoJson = useMemo(() => ({
    type: 'FeatureCollection',
    features: mapMarkers.map((m) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [Number(m.lng), Number(m.lat)] },
      properties: {
        id: m.id || '',
        name: m.name || m.title || '',
        source_kind: m.source_kind || 'objective',
        severity: m.severity || 'medium',
        region_label: m.region_label || '',
        description: m.description || '',
      },
    })),
  }), [mapMarkers]);

  const onMapClick = useCallback((event) => {
    const features = event.features || [];
    const clickedFeature = features.find(f => f.layer.id === 'campaign-overlay-markers');
    if (clickedFeature) {
      const props = clickedFeature.properties;
      const marker = mapMarkers.find(m => m.id === props.id) || {
        id: props.id,
        name: props.name,
        source_kind: props.source_kind,
        severity: props.severity,
        region_label: props.region_label,
        description: props.description,
        lat: clickedFeature.geometry.coordinates[1],
        lng: clickedFeature.geometry.coordinates[0],
      };
      setSelectedMarker(marker);
      setMarkerPopup({
        longitude: clickedFeature.geometry.coordinates[0],
        latitude: clickedFeature.geometry.coordinates[1],
        marker,
      });
    } else {
      setMarkerPopup(null);
    }
  }, [mapMarkers]);

  const handleCreateActivity = async (e) => {
    e.preventDefault();
    if (!selectedMarker || !selectedId) return;
    setCreatingActivity(true);
    setActivityMsg('');
    try {
      await axios.post(`${API}/operations`, {
        ...activityForm,
        campaign_id: selectedId,
        objective_id: selectedMarker.source_kind === 'objective' ? selectedMarker.id : null,
        theater: campaign?.theater || '',
        region_label: selectedMarker.region_label || selectedMarker.grid_ref || '',
        grid_ref: selectedMarker.grid_ref || '',
        lat: selectedMarker.lat ?? null,
        lng: selectedMarker.lng ?? null,
        severity: selectedMarker.severity || 'medium',
        is_public_recruiting: !!selectedMarker.is_public_recruiting,
      });
      setActivityMsg('Activity created and linked to this map marker.');
      setActivityForm({
        title: '', description: '', operation_type: 'combat', date: '', time: '', activity_state: 'ongoing',
      });
      await loadData();
    } catch (err) {
      setActivityMsg(err?.response?.data?.detail || 'Failed to create activity');
    } finally {
      setCreatingActivity(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur border-b border-tropic-gold/30">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/hub"><Button size="sm" variant="outline" className="border-gray-700"><ArrowLeft className="w-4 h-4 mr-1" />Hub</Button></Link>
            <h1 className="text-xl font-bold tracking-widest text-tropic-gold" style={{ fontFamily: 'Rajdhani, sans-serif' }} data-testid="campaign-map-title">
              CAMPAIGNS
            </h1>
          </div>
          <div className="flex items-center space-x-3">
            {user?.role === 'admin' && <Link to="/admin/campaigns"><Button size="sm" variant="outline" className="border-tropic-red/60 text-tropic-red hover:bg-tropic-red/10"><Shield className="w-4 h-4 mr-1" />Manage</Button></Link>}
            <Link to="/"><Button size="sm" variant="outline" className="border-gray-700"><Home className="w-4 h-4" /></Button></Link>
            <Button size="sm" variant="outline" onClick={handleLogout} className="border-gray-700"><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </nav>

      <div className="pt-20 pb-12 px-6">
        <div className="container mx-auto max-w-6xl">
          {loading ? (
            <div className="text-center py-20 text-gray-500">Loading campaign data...</div>
          ) : !campaign ? (
            <div className="text-center py-20 text-gray-600">
              <MapPin className="w-16 h-16 mx-auto mb-4 opacity-20" />
              <h2 className="text-xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>NO ACTIVE CAMPAIGNS</h2>
              <p className="text-sm mt-2">Awaiting operational directives from Command.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Campaign Selector (if multiple) */}
              {allCampaigns.length > 1 && (
                <div className="flex gap-2 flex-wrap">
                  {allCampaigns.map(c => (
                    <Button key={c.id} size="sm"
                      variant={selectedId === c.id ? 'default' : 'outline'}
                      onClick={() => setSelectedId(c.id)}
                      className={selectedId === c.id ? 'bg-tropic-gold text-black' : 'border-gray-700 text-gray-400'}
                      data-testid={`select-campaign-${c.id}`}>
                      {c.name}
                      {c.status === 'active' && <div className="w-1.5 h-1.5 bg-tropic-red rounded-full ml-2 animate-pulse"></div>}
                    </Button>
                  ))}
                </div>
              )}

                {/* Campaign Header */}
                <div className="bg-gray-900/80 border border-tropic-red/30 rounded-lg p-6" data-testid="campaign-header">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-1 h-10 bg-tropic-red rounded-full"></div>
                      <div>
                        <h2 className="text-3xl font-bold tracking-wider" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{campaign.name}</h2>
                        <div className="flex items-center gap-3 mt-1">
                          <Badge className={`${campaign.status === 'active' ? 'bg-tropic-red text-white animate-pulse' : campaign.status === 'complete' ? 'bg-green-700 text-white' : 'bg-gray-700 text-gray-300'} text-[10px] tracking-wider`}>
                            {campaign.status?.toUpperCase()}
                          </Badge>
                          {campaign.theater && <Badge variant="outline" className="border-gray-700 text-gray-400 text-[10px]">{campaign.theater}</Badge>}
                          {activePhase && <Badge variant="outline" className="border-tropic-gold/50 text-tropic-gold text-[10px]">Active Phase: {activePhase.name}</Badge>}
                        </div>
                      </div>
                    </div>
                    {campaign.description && <p className="text-sm text-gray-400 ml-4 mt-2 max-w-2xl">{campaign.description}</p>}
                    <div className="ml-4 mt-3">
                      <Link to="/hub/threat-map">
                        <Button size="sm" variant="outline" className="border-tropic-gold/40 text-tropic-gold hover:bg-tropic-gold/10 text-xs">
                          <Target className="w-3.5 h-3.5 mr-1.5" />View on Global Threat Map
                        </Button>
                      </Link>
                    </div>
                  </div>
                  {/* Progress Ring */}
                  <div className="text-center shrink-0">
                    <div className="relative w-20 h-20">
                      <svg viewBox="0 0 36 36" className="w-20 h-20">
                        <path d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#1f2937" strokeWidth="3" />
                        <path d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#C8102E" strokeWidth="3" strokeDasharray={`${progress}, 100`} strokeLinecap="round" />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-lg font-bold text-tropic-gold">{progress}%</span>
                      </div>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-1 tracking-wider">OBJECTIVES</div>
                  </div>
                </div>

                <Card className="bg-gray-900 border-gray-800">
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <h3 className="text-xs text-tropic-gold tracking-widest">CAMPAIGN MAP OVERLAYS</h3>
                      <div className="flex items-center gap-3 text-[10px] text-gray-400">
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#C9A227] inline-block"></span>Objectives</span>
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#B01C2E] inline-block"></span>Operations</span>
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#556B2F] inline-block"></span>Intel</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-wrap">
                      <Input
                        placeholder="Search overlays..."
                        value={filters.search}
                        onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                        className="bg-black border-gray-700 h-8 text-xs max-w-[200px]"
                      />
                      <div className="flex items-center gap-4 text-xs text-gray-400">
                        <label className="flex items-center gap-1.5"><input type="checkbox" checked={layerVisibility.objectives} onChange={(e) => setLayerVisibility((prev) => ({ ...prev, objectives: e.target.checked }))} /> Objectives</label>
                        <label className="flex items-center gap-1.5"><input type="checkbox" checked={layerVisibility.operations} onChange={(e) => setLayerVisibility((prev) => ({ ...prev, operations: e.target.checked }))} /> Operations</label>
                        <label className="flex items-center gap-1.5"><input type="checkbox" checked={layerVisibility.intel} onChange={(e) => setLayerVisibility((prev) => ({ ...prev, intel: e.target.checked }))} /> Intel</label>
                      </div>
                    </div>
                    <div className="rounded-lg overflow-hidden border border-gray-800" style={{ height: '420px' }} data-testid="threat-map-canvas">
                      {MAPBOX_TOKEN ? (
                        <Map
                          ref={mapRef}
                          {...mapViewport}
                          onMove={(evt) => setMapViewport(evt.viewState)}
                          onClick={onMapClick}
                          interactiveLayerIds={['campaign-overlay-markers']}
                          mapStyle="mapbox://styles/mapbox/dark-v11"
                          mapboxAccessToken={MAPBOX_TOKEN}
                          style={{ width: '100%', height: '100%' }}
                          attributionControl={false}
                          reuseMaps
                        >
                          <NavigationControl position="top-right" />
                          <Source id="campaign-overlays" type="geojson" data={overlayGeoJson}>
                            <Layer {...overlayLayer} />
                            <Layer {...overlayLabelLayer} />
                          </Source>
                          {markerPopup && (
                            <Popup
                              longitude={markerPopup.longitude}
                              latitude={markerPopup.latitude}
                              closeOnClick={false}
                              onClose={() => setMarkerPopup(null)}
                              maxWidth="280px"
                              className="threat-map-popup"
                            >
                              <div className="p-2 min-w-[180px]">
                                <div className="font-semibold text-sm text-tropic-gold">{markerPopup.marker.name}</div>
                                {markerPopup.marker.source_kind && <Badge variant="outline" className="mt-1 border-gray-700 text-gray-400 text-[10px] uppercase">{markerPopup.marker.source_kind}</Badge>}
                                <div className="text-xs text-gray-400 mt-1">{markerPopup.marker.region_label || 'Unknown region'} • {(markerPopup.marker.severity || 'medium').toUpperCase()}</div>
                              </div>
                            </Popup>
                          )}
                        </Map>
                      ) : (
                        <div className="flex h-full items-center justify-center bg-gray-900 text-gray-500 text-sm">
                          Map unavailable — REACT_APP_MAPBOX_TOKEN not set
                        </div>
                      )}
                    </div>
                    {selectedMarker && (
                      <div className="bg-black/40 border border-gray-800 rounded p-3 text-sm">
                        <div className="font-semibold">{selectedMarker.name}</div>
                        {selectedMarker.source_kind && <Badge variant="outline" className="mt-2 border-gray-700 text-gray-400 text-[10px] uppercase">{selectedMarker.source_kind}</Badge>}
                        <div className="text-xs text-gray-400 mt-1">{selectedMarker.region_label || selectedMarker.grid_ref || 'Unknown region'} • {(selectedMarker.severity || 'medium').toUpperCase()}</div>
                        {(selectedMarker.linked_operation_id || selectedMarker.source_kind === 'operation') && (
                          <Link to={`/hub/operations/${selectedMarker.linked_operation_id || selectedMarker.id}`}>
                            <Button size="sm" className="mt-2 bg-tropic-red hover:bg-tropic-red-dark">Open Linked Operation <ChevronRight className="w-4 h-4 ml-1" /></Button>
                          </Link>
                        )}
                        {user?.role === 'admin' && (
                          <form onSubmit={handleCreateActivity} className="mt-3 space-y-2 border-t border-gray-800 pt-3">
                            <div className="text-xs tracking-wider text-tropic-gold">CREATE EVENT / ONGOING ACTIVITY</div>
                            <Input required value={activityForm.title} onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })} className="bg-black border-gray-700" placeholder="Activity title" />
                            <Textarea value={activityForm.description} onChange={(e) => setActivityForm({ ...activityForm, description: e.target.value })} className="bg-black border-gray-700" rows={2} placeholder="Activity details" />
                            <div className="grid grid-cols-2 gap-2">
                              <select value={activityForm.operation_type} onChange={(e) => setActivityForm({ ...activityForm, operation_type: e.target.value })} className="h-9 rounded-md bg-black border border-gray-700 px-2 text-xs">
                                <option value="combat">combat</option>
                                <option value="training">training</option>
                                <option value="recon">recon</option>
                                <option value="support">support</option>
                              </select>
                              <select value={activityForm.activity_state} onChange={(e) => setActivityForm({ ...activityForm, activity_state: e.target.value })} className="h-9 rounded-md bg-black border border-gray-700 px-2 text-xs">
                                <option value="planned">planned</option>
                                <option value="ongoing">ongoing</option>
                                <option value="completed">completed</option>
                              </select>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <Input required type="date" value={activityForm.date} onChange={(e) => setActivityForm({ ...activityForm, date: e.target.value })} className="bg-black border-gray-700" />
                              <Input required type="time" value={activityForm.time} onChange={(e) => setActivityForm({ ...activityForm, time: e.target.value })} className="bg-black border-gray-700" />
                            </div>
                            <Button type="submit" disabled={creatingActivity} size="sm" className="bg-tropic-gold hover:bg-tropic-gold-light text-black">
                              {creatingActivity ? 'Creating...' : 'Create Activity'}
                            </Button>
                            {activityMsg && <div className="text-xs text-gray-400">{activityMsg}</div>}
                          </form>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Stats Bar */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-gray-900 border-gray-800">
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-tropic-gold">{phases.length}</div>
                    <div className="text-[10px] text-gray-500 tracking-wider">PHASES</div>
                  </CardContent>
                </Card>
                <Card className="bg-gray-900 border-gray-800">
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-tropic-red">{objInProgress}</div>
                    <div className="text-[10px] text-gray-500 tracking-wider">ACTIVE OBJ</div>
                  </CardContent>
                </Card>
                <Card className="bg-gray-900 border-gray-800">
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-green-500">{objComplete}</div>
                    <div className="text-[10px] text-gray-500 tracking-wider">COMPLETE</div>
                  </CardContent>
                </Card>
                <Card className="bg-gray-900 border-gray-800">
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-gray-300">{objectives.length}</div>
                    <div className="text-[10px] text-gray-500 tracking-wider">TOTAL OBJ</div>
                  </CardContent>
                </Card>
              </div>

              {/* Situation */}
              {campaign.situation && (
                <Card className="bg-gray-900 border-gray-800">
                  <CardContent className="p-5">
                    <h3 className="text-xs text-tropic-gold tracking-widest mb-3 flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5" />SITUATION</h3>
                    <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{campaign.situation}</p>
                  </CardContent>
                </Card>
              )}

              <div className="grid lg:grid-cols-2 gap-6">
                {/* Phase Timeline */}
                <Card className="bg-gray-900 border-gray-800">
                  <CardContent className="p-5">
                    <h3 className="text-xs text-tropic-gold tracking-widest mb-4 flex items-center gap-2"><Calendar className="w-3.5 h-3.5" />PHASE TIMELINE</h3>
                    {phases.length === 0 ? (
                      <p className="text-sm text-gray-600">No phases defined</p>
                    ) : (
                      <div className="relative">
                        {/* Vertical line */}
                        <div className="absolute left-3 top-0 bottom-0 w-px bg-gray-800"></div>
                        <div className="space-y-4">
                          {phases.map((p, i) => {
                            const isActive = p.status === 'active';
                            const isDone = p.status === 'complete';
                            return (
                              <div key={i} className="relative pl-9" data-testid={`phase-${i}`}>
                                <div className={`absolute left-1.5 top-1.5 w-3 h-3 rounded-full border-2 ${isActive ? 'bg-tropic-red border-tropic-red animate-pulse' : isDone ? 'bg-green-500 border-green-500' : 'bg-gray-900 border-gray-600'}`}></div>
                                <div className={`p-3 rounded-lg ${isActive ? 'bg-tropic-red/10 border border-tropic-red/30' : 'bg-black/30'}`}>
                                  <div className="flex items-center justify-between">
                                    <span className={`font-bold text-sm tracking-wide ${isActive ? 'text-tropic-gold' : isDone ? 'text-green-400' : 'text-gray-400'}`} style={{ fontFamily: 'Rajdhani, sans-serif' }}>{p.name}</span>
                                    <Badge variant="outline" className={`text-[9px] capitalize ${isActive ? 'border-tropic-red text-tropic-red' : isDone ? 'border-green-600 text-green-500' : 'border-gray-700 text-gray-500'}`}>{p.status}</Badge>
                                  </div>
                                  {p.description && <p className="text-xs text-gray-500 mt-1">{p.description}</p>}
                                  {(p.start_date || p.end_date) && (
                                    <div className="text-[10px] text-gray-600 mt-1">{p.start_date}{p.end_date && ` — ${p.end_date}`}</div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Objectives Grid */}
                <Card className="bg-gray-900 border-gray-800">
                  <CardContent className="p-5">
                    <h3 className="text-xs text-tropic-gold tracking-widest mb-4 flex items-center gap-2"><Target className="w-3.5 h-3.5" />OBJECTIVES</h3>
                    {objectives.length === 0 ? (
                      <p className="text-sm text-gray-600">No objectives defined</p>
                    ) : (
                      <div className="space-y-2">
                        {objectives.map((o, i) => {
                          const st = OBJ_STATUS_CFG[o.status] || OBJ_STATUS_CFG.pending;
                          const pr = PRIORITY_CFG[o.priority] || PRIORITY_CFG.secondary;
                          return (
                            <div key={i} className={`${st.color} rounded-lg p-3 border border-gray-800/50`} data-testid={`objective-${i}`}>
                              <div className="flex items-start gap-3">
                                <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${st.dot}`}></div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-sm" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{o.name}</span>
                                    <Badge variant="outline" className={`${pr.border} ${pr.text} text-[8px] tracking-wider`}>{o.priority?.toUpperCase()}</Badge>
                                    <Badge variant="outline" className="border-gray-700 text-gray-500 text-[8px] capitalize">{st.label}</Badge>
                                  </div>
                                  {o.description && <p className="text-xs text-gray-500 mt-1">{o.description}</p>}
                                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-600">
                                    {o.grid_ref && <span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{o.grid_ref}</span>}
                                    {o.region_label && <span className="text-blue-400">{o.region_label}</span>}
                                    {o.severity && <span className="capitalize">{o.severity}</span>}
                                    {o.assigned_to && <span className="text-green-600">{o.assigned_to}</span>}
                                  </div>
                                  {o.linked_operation_id && (
                                    <Link to={`/hub/operations/${o.linked_operation_id}`} className="text-[10px] text-tropic-gold hover:underline mt-1 inline-block">View linked operation</Link>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Commander's Notes */}
              {campaign.commander_notes && (
                <Card className="bg-gray-900 border-gray-800">
                  <CardContent className="p-5">
                    <h3 className="text-xs text-tropic-gold tracking-widest mb-3 flex items-center gap-2"><Shield className="w-3.5 h-3.5" />COMMANDER'S NOTES</h3>
                    <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{campaign.commander_notes}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CampaignMap;

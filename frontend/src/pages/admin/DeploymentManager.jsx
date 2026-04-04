import React, { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Edit, Trash2, MapPin, Navigation, RefreshCw, ChevronUp, ChevronDown, Search } from 'lucide-react';
import Map, { Marker as MapMarker, Source as MapSource, Layer as MapLayer } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { API } from '@/utils/api';
import { formatApiError } from '@/utils/errorMessages';
import { formatDeploymentDateTime } from '@/utils/deploymentDateTime';
import { useAuth } from '@/context/AuthContext';

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;
const TROPIC_GOLD_HEX = '#C9A227';

const SCHOFIELD_BARRACKS = {
  name: 'Schofield Barracks, HI',
  latitude: 21.495052920207087,
  longitude: -158.06280285176283,
};

const DEPLOYMENT_STATUSES = ['planning', 'deploying', 'deployed', 'endex', 'rtb', 'completed', 'cancelled'];
const ORIGIN_TYPES = ['25th', 'partner', 'counterpart'];

const STATUS_COLORS = {
  planning: 'bg-[#4a6070] text-[#d0d8e0]',
  deploying: 'bg-yellow-600 text-yellow-100',
  deployed: 'bg-green-600 text-green-100',
  endex: 'bg-orange-600 text-orange-100',
  rtb: 'bg-blue-600 text-blue-100',
  completed: 'bg-purple-600 text-purple-100',
  cancelled: 'bg-red-600 text-red-100',
};

const ORIGIN_TYPE_COLORS = {
  '25th': 'bg-tropic-gold text-black',
  partner: 'bg-cyan-600 text-cyan-100',
  counterpart: 'bg-purple-600 text-purple-100',
};

const AFFILIATION_COLORS = {
  friendly: 'bg-blue-600 text-blue-100',
  hostile: 'bg-red-600 text-red-100',
  neutral: 'bg-green-600 text-green-100',
  unknown: 'bg-yellow-600 text-yellow-100',
};

const EMPTY_DEPLOYMENT = {
  title: '',
  unit_name: '',
  origin_type: '25th',
  status: 'planning',
  is_active: false,
  total_duration_hours: 24,
  return_duration_hours: 0,
  route_points: [],
  notes: '',
  metadata: {},
};

const EMPTY_ROUTE_POINT = {
  name: '',
  latitude: '',
  longitude: '',
  description: '',
  stop_duration_hours: 0,
};

const EMPTY_MARKER = {
  title: '',
  description: '',
  affiliation: 'friendly',
  symbol_type: 'infantry',
  echelon: 'none',
  designator: '',
  latitude: '',
  longitude: '',
  metadata: {},
};

const DeploymentManager = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('deployments');

  // Deployments state
  const [deployments, setDeployments] = useState([]);
  const [deploymentsLoading, setDeploymentsLoading] = useState(true);
  const [deploymentDialogOpen, setDeploymentDialogOpen] = useState(false);
  const [editingDeployment, setEditingDeployment] = useState(null);
  const [deploymentForm, setDeploymentForm] = useState({ ...EMPTY_DEPLOYMENT });
  const [originTypeFilter, setOriginTypeFilter] = useState('all');

  // Location entities for entity picker
  const [locationEntities, setLocationEntities] = useState([]);

  // NATO markers state
  const [markers, setMarkers] = useState([]);
  const [markersLoading, setMarkersLoading] = useState(true);
  const [markerDialogOpen, setMarkerDialogOpen] = useState(false);
  const [editingMarker, setEditingMarker] = useState(null);
  const [markerForm, setMarkerForm] = useState({ ...EMPTY_MARKER });

  // NATO reference data
  const [natoReference, setNatoReference] = useState(null);

  // Division location
  const [divisionLocation, setDivisionLocation] = useState(null);
  const [divisionForm, setDivisionForm] = useState({ name: '', latitude: '', longitude: '' });
  const [divisionDialogOpen, setDivisionDialogOpen] = useState(false);

  // Location search state for route points
  const [locationSearches, setLocationSearches] = useState({});
  const [locationResults, setLocationResults] = useState({});

  // Shared
  const [error, setError] = useState('');

  // --- Data fetching ---

  const fetchDeployments = useCallback(async () => {
    setDeploymentsLoading(true);
    try {
      const res = await axios.get(`${API}/admin/map/deployments`);
      setDeployments(res.data);
    } catch (err) {
      console.error('Error fetching deployments:', err);
      setError('Failed to load deployments');
    } finally {
      setDeploymentsLoading(false);
    }
  }, []);

  const fetchLocationEntities = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/map/location-entities`);
      setLocationEntities(res.data);
    } catch (err) {
      console.error('Error fetching location entities:', err);
    }
  }, []);

  const fetchMarkers = useCallback(async () => {
    setMarkersLoading(true);
    try {
      const res = await axios.get(`${API}/map/nato-markers`);
      setMarkers(res.data);
    } catch (err) {
      console.error('Error fetching NATO markers:', err);
      setError('Failed to load NATO markers');
    } finally {
      setMarkersLoading(false);
    }
  }, []);

  const fetchNatoReference = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/map/nato-reference`);
      setNatoReference(res.data);
    } catch (err) {
      console.error('Error fetching NATO reference:', err);
    }
  }, []);

  const fetchDivisionLocation = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/map/division-location`);
      setDivisionLocation(res.data);
    } catch (err) {
      console.error('Error fetching division location:', err);
    }
  }, []);

  useEffect(() => {
    fetchDeployments();
    fetchLocationEntities();
    fetchMarkers();
    fetchNatoReference();
    fetchDivisionLocation();
  }, [fetchDeployments, fetchLocationEntities, fetchMarkers, fetchNatoReference, fetchDivisionLocation]);

  // --- Filtered deployments ---

  const filteredDeployments = useMemo(() => {
    if (originTypeFilter === 'all') return deployments;
    return deployments.filter((dep) => dep.origin_type === originTypeFilter);
  }, [deployments, originTypeFilter]);

  const alliedDeployments = useMemo(() => {
    return deployments.filter((dep) => dep.origin_type === 'counterpart');
  }, [deployments]);

  // --- Entity picker helpers ---

  const groupedEntities = useMemo(() => {
    const groups = {};
    (locationEntities || []).forEach((entity) => {
      const type = entity.entity_type || 'other';
      if (!groups[type]) groups[type] = [];
      groups[type].push(entity);
    });
    return groups;
  }, [locationEntities]);

  const handleEntityPickRoutePoint = useCallback((entityId, idx) => {
    if (!entityId || entityId === '__manual__') return;
    const entity = (locationEntities || []).find((e) => String(e.entity_id) === String(entityId));
    if (!entity) return;
    setDeploymentForm((prev) => {
      const rps = [...prev.route_points];
      rps[idx] = {
        ...rps[idx],
        name: entity.name || '',
        latitude: entity.latitude ?? '',
        longitude: entity.longitude ?? '',
      };
      return { ...prev, route_points: rps };
    });
  }, [locationEntities]);

  // --- Location search helpers ---

  const handleLocationSearch = useCallback(async (query, idx) => {
    setLocationSearches(prev => ({ ...prev, [idx]: query }));
    if (!query || query.length < 3) {
      setLocationResults(prev => ({ ...prev, [idx]: [] }));
      return;
    }
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&limit=5&types=place,locality,region,country,poi`
      );
      const data = await res.json();
      setLocationResults(prev => ({
        ...prev,
        [idx]: (data.features || []).map(f => ({
          name: f.place_name,
          latitude: f.center[1],
          longitude: f.center[0],
        })),
      }));
    } catch {
      setLocationResults(prev => ({ ...prev, [idx]: [{ name: '⚠ Search failed — try again', latitude: null, longitude: null }] }));
    }
  }, []);

  const handleLocationSelect = useCallback((result, idx) => {
    if (result.latitude == null || result.longitude == null) return; // skip error placeholders
    setDeploymentForm((prev) => {
      const rps = [...prev.route_points];
      rps[idx] = {
        ...rps[idx],
        name: result.name,
        latitude: result.latitude,
        longitude: result.longitude,
      };
      return { ...prev, route_points: rps };
    });
    setLocationSearches(prev => ({ ...prev, [idx]: '' }));
    setLocationResults(prev => ({ ...prev, [idx]: [] }));
  }, []);

  // --- Route point reorder helpers ---

  const swapRoutePoints = useCallback((idx, targetIdx) => {
    setDeploymentForm((prev) => {
      const rps = [...prev.route_points];
      if (targetIdx < 0 || targetIdx >= rps.length) return prev;
      [rps[idx], rps[targetIdx]] = [rps[targetIdx], rps[idx]];
      return { ...prev, route_points: rps };
    });
  }, []);

  const moveRoutePointUp = useCallback((idx) => swapRoutePoints(idx, idx - 1), [swapRoutePoints]);
  const moveRoutePointDown = useCallback((idx) => swapRoutePoints(idx, idx + 1), [swapRoutePoints]);

  // --- Deployment handlers ---

  const openNewDeployment = useCallback(() => {
    setEditingDeployment(null);
    const defaultOriginType = user?.account_type === 'partner' ? 'partner' : '25th';
    const initialRoutePoints = defaultOriginType === '25th'
      ? [{ name: SCHOFIELD_BARRACKS.name, latitude: SCHOFIELD_BARRACKS.latitude, longitude: SCHOFIELD_BARRACKS.longitude, description: '', stop_duration_hours: 0 }]
      : [];
    setDeploymentForm({ ...EMPTY_DEPLOYMENT, origin_type: defaultOriginType, route_points: initialRoutePoints });
    setDeploymentDialogOpen(true);
  }, [user]);

  const openNewAlliedDeployment = useCallback(() => {
    setEditingDeployment(null);
    setDeploymentForm({ ...EMPTY_DEPLOYMENT, origin_type: 'counterpart' });
    setDeploymentDialogOpen(true);
  }, []);

  const openEditDeployment = useCallback((dep) => {
    setEditingDeployment(dep);
    let existingPoints = Array.isArray(dep.route_points)
      ? dep.route_points.map((rp) => ({
          name: rp.name || '',
          latitude: rp.latitude ?? '',
          longitude: rp.longitude ?? '',
          description: rp.description || '',
          stop_duration_hours: rp.stop_duration_hours ?? 0,
        }))
      : [];

    // For 25th deployments, always ensure first route point is Schofield Barracks
    if ((dep.origin_type || '25th') === '25th') {
      const schofield = { name: SCHOFIELD_BARRACKS.name, latitude: SCHOFIELD_BARRACKS.latitude, longitude: SCHOFIELD_BARRACKS.longitude, description: '', stop_duration_hours: 0 };
      existingPoints = existingPoints.length === 0
        ? [schofield]
        : [schofield, ...existingPoints.slice(1)];
    }

    setDeploymentForm({
      title: dep.title || '',
      unit_name: dep.unit_name || '',
      origin_type: dep.origin_type || '25th',
      status: dep.status || 'planning',
      is_active: dep.is_active ?? false,
      total_duration_hours: dep.total_duration_hours ?? 24,
      return_duration_hours: dep.return_duration_hours ?? 0,
      route_points: existingPoints,
      notes: dep.notes || '',
      metadata: dep.metadata || {},
    });
    setDeploymentDialogOpen(true);
  }, []);

  const handleDeploymentSubmit = useCallback(async (e) => {
    e.preventDefault();
    try {
      const safeFloat = (v) => {
        if (v === '' || v == null) return null;
        const n = parseFloat(v);
        return isNaN(n) ? null : n;
      };

      const trimmedTitle = (deploymentForm.title || '').trim();
      if (!trimmedTitle) {
        alert('Deployment title is required.');
        return;
      }

      const payload = {
        title: trimmedTitle,
        unit_name: deploymentForm.unit_name || '',
        origin_type: deploymentForm.origin_type || '25th',
        status: deploymentForm.status || 'planning',
        is_active: deploymentForm.is_active ?? false,
        total_duration_hours: safeFloat(deploymentForm.total_duration_hours) ?? 24,
        return_duration_hours: safeFloat(deploymentForm.return_duration_hours) ?? 0,
        notes: deploymentForm.notes || '',
        metadata: deploymentForm.metadata || {},
        route_points: (deploymentForm.route_points || [])
          .map((rp, idx) => ({
            order: idx,
            name: rp.name || '',
            latitude: safeFloat(rp.latitude),
            longitude: safeFloat(rp.longitude),
            description: rp.description || '',
            stop_duration_hours: safeFloat(rp.stop_duration_hours) ?? 0,
          }))
          .filter((rp) => rp.latitude != null && rp.longitude != null),
      };

      if (editingDeployment) {
        await axios.put(`${API}/admin/map/deployments/${editingDeployment.id}`, payload);
      } else {
        await axios.post(`${API}/admin/map/deployments`, payload);
      }

      setDeploymentDialogOpen(false);
      setEditingDeployment(null);
      setDeploymentForm({ ...EMPTY_DEPLOYMENT });
      await fetchDeployments();
    } catch (err) {
      console.error('Error saving deployment:', err);
      const responseText = typeof err?.response?.data === 'string' ? err.response.data : '';
      const networkMessage = err?.message && !err?.response ? `Network error: ${err.message}` : '';
      alert(formatApiError(err, responseText || networkMessage || 'Error saving deployment'));
    }
  }, [deploymentForm, editingDeployment, fetchDeployments]);

  const handleToggleActive = useCallback(async (dep) => {
    try {
      await axios.put(`${API}/admin/map/deployments/${dep.id}`, { is_active: !dep.is_active });
      await fetchDeployments();
    } catch (err) {
      console.error('Error toggling active:', err);
      alert(formatApiError(err, 'Error toggling deployment active state'));
    }
  }, [fetchDeployments]);

  const handleDeleteDeployment = useCallback(async (id) => {
    if (!window.confirm('Are you sure you want to delete this deployment? This action cannot be undone.')) return;
    try {
      setDeployments((prev) => prev.filter((d) => (d.id || d._id) !== id));
      await axios.delete(`${API}/admin/map/deployments/${id}`);
      await fetchDeployments();
    } catch (err) {
      console.error('Error deleting deployment:', err);
      alert(formatApiError(err, 'Error deleting deployment'));
      await fetchDeployments();
    }
  }, [fetchDeployments]);

  // --- NATO Marker handlers ---

  const openNewMarker = useCallback(() => {
    setEditingMarker(null);
    setMarkerForm({ ...EMPTY_MARKER });
    setMarkerDialogOpen(true);
  }, []);

  const openEditMarker = useCallback((marker) => {
    setEditingMarker(marker);
    setMarkerForm({
      title: marker.title || '',
      description: marker.description || '',
      affiliation: marker.affiliation || 'friendly',
      symbol_type: marker.symbol_type || 'infantry',
      echelon: marker.echelon || 'none',
      designator: marker.designator || '',
      latitude: marker.latitude ?? '',
      longitude: marker.longitude ?? '',
      metadata: marker.metadata || {},
    });
    setMarkerDialogOpen(true);
  }, []);

  const handleMarkerSubmit = useCallback(async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...markerForm,
        latitude: markerForm.latitude === '' ? null : parseFloat(markerForm.latitude),
        longitude: markerForm.longitude === '' ? null : parseFloat(markerForm.longitude),
      };

      if (editingMarker) {
        await axios.put(`${API}/admin/map/nato-markers/${editingMarker.id}`, payload);
      } else {
        await axios.post(`${API}/admin/map/nato-markers`, payload);
      }

      setMarkerDialogOpen(false);
      setEditingMarker(null);
      setMarkerForm({ ...EMPTY_MARKER });
      await fetchMarkers();
    } catch (err) {
      console.error('Error saving marker:', err);
      alert(formatApiError(err, 'Error saving marker'));
    }
  }, [markerForm, editingMarker, fetchMarkers]);

  const handleDeleteMarker = useCallback(async (id) => {
    if (!window.confirm('Are you sure you want to delete this NATO marker?')) return;
    try {
      await axios.delete(`${API}/admin/map/nato-markers/${id}`);
      await fetchMarkers();
    } catch (err) {
      console.error('Error deleting marker:', err);
      alert(formatApiError(err, 'Error deleting marker'));
    }
  }, [fetchMarkers]);

  // --- Division location handler ---

  const openDivisionDialog = useCallback(() => {
    setDivisionForm({
      name: divisionLocation?.current_location_name || '',
      latitude: divisionLocation?.current_latitude ?? '',
      longitude: divisionLocation?.current_longitude ?? '',
    });
    setDivisionDialogOpen(true);
  }, [divisionLocation]);

  const handleDivisionSubmit = useCallback(async (e) => {
    e.preventDefault();
    try {
      await axios.put(`${API}/admin/map/division-location`, {
        current_location_name: divisionForm.name,
        current_latitude: parseFloat(divisionForm.latitude),
        current_longitude: parseFloat(divisionForm.longitude),
      });
      setDivisionDialogOpen(false);
      await fetchDivisionLocation();
    } catch (err) {
      console.error('Error updating division location:', err);
      alert(formatApiError(err, 'Error updating division location'));
    }
  }, [divisionForm, fetchDivisionLocation]);

  // --- Helpers ---

  const symbolTypes = natoReference?.symbol_types
    ? natoReference.symbol_types
    : ['infantry', 'armor', 'aviation', 'artillery', 'logistics', 'headquarters', 'medical', 'recon', 'signal', 'engineer', 'air_defense', 'naval', 'special_operations', 'military_police', 'chemical', 'maintenance', 'transportation', 'supply', 'missile', 'cyber', 'civil_affairs', 'psychological_operations', 'unmanned_aerial', 'electronic_warfare', 'objective', 'waypoint', 'staging_area', 'custom'];

  const echelons = natoReference?.echelons
    ? natoReference.echelons
    : ['team', 'squad', 'section', 'platoon', 'company', 'battalion', 'regiment', 'brigade', 'division', 'corps', 'army', 'army_group', 'theater', 'none'];

  const affiliations = natoReference?.affiliations
    ? natoReference.affiliations
    : ['friendly', 'hostile', 'neutral', 'unknown'];

  const symbolTypeLabels = natoReference?.symbol_type_labels || {};
  const echelonLabels = natoReference?.echelon_labels || {};
  const affiliationLabels = natoReference?.affiliation_labels || {};

  const formatLabel = (str) => str.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const getNatoLabel = (value, labelsMap) => labelsMap[value] || formatLabel(value);

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="relative corner-bracket border border-[rgba(201,162,39,0.15)] bg-[radial-gradient(circle_at_top,rgba(201,162,39,0.06),#050a0e_58%)] px-6 py-7 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#c9a227]" style={{ fontFamily: "'Oswald', sans-serif" }}>Force Deployment</p>
              <h1 className="mt-3 text-4xl font-black uppercase tracking-[0.12em] text-[#e8c547]" style={{ fontFamily: "'Share Tech', sans-serif" }}>DEPLOYMENT MANAGER</h1>
              <p className="mt-2 text-sm text-[#8a9aa8]" style={{ fontFamily: "'Inter', sans-serif" }}>Manage server deployments, infrastructure, and provisioning</p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 border-b border-[rgba(201,162,39,0.12)] pb-2">
          {[
            { key: 'deployments', label: 'DEPLOYMENTS' },
            { key: 'allied', label: 'ALLIED DEPLOYMENTS' },
            { key: 'nato-markers', label: 'NATO MARKERS' },
            { key: 'division-location', label: 'DIVISION LOCATION' },
          ].map((tab) => (
            <button
              key={tab.key}
              className={`px-4 py-2 text-sm font-bold tracking-wider transition-colors ${
                activeTab === tab.key
                  ? 'text-tropic-gold border-b-2 border-tropic-gold'
                  : 'text-[#4a6070] hover:text-[#8a9aa8]'
              }`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 p-3 rounded text-sm">
            {error}
          </div>
        )}

        {/* ===================== DEPLOYMENTS TAB ===================== */}
        {activeTab === 'deployments' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <p className="text-[#8a9aa8] text-sm">{filteredDeployments.length} deployment(s)</p>
                <Select value={originTypeFilter} onValueChange={setOriginTypeFilter}>
                  <SelectTrigger className="w-[150px] bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-xs h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]">
                    <SelectItem value="all" className="text-xs">All Types</SelectItem>
                    {ORIGIN_TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="text-xs">{formatLabel(t)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8] hover:text-white"
                  onClick={fetchDeployments}
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Refresh
                </Button>
                <Button
                  className="bg-tropic-gold hover:bg-tropic-gold-dark text-black"
                  onClick={openNewDeployment}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  New Deployment
                </Button>
              </div>
            </div>

            {deploymentsLoading ? (
              <div className="text-center text-[#4a6070] py-12">Loading deployments...</div>
            ) : filteredDeployments.length === 0 ? (
              <div className="text-center text-[#4a6070] py-12">No deployments found. Create your first deployment.</div>
            ) : (
              <div className="space-y-3">
                {filteredDeployments.map((dep) => (
                  <Card key={dep.id || dep._id} className="bg-[#050a0e]/40 border-[rgba(201,162,39,0.12)] hover:border-[rgba(201,162,39,0.15)] transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <h3 className="text-lg font-bold text-white truncate" style={{ fontFamily: "'Share Tech', sans-serif" }}>
                              {dep.title}
                            </h3>
                            <Badge className={STATUS_COLORS[dep.status] || 'bg-[#4a6070]'}>
                              {dep.status?.toUpperCase()}
                            </Badge>
                            <Badge className={ORIGIN_TYPE_COLORS[dep.origin_type] || 'bg-[#4a6070]'}>
                              {dep.origin_type?.toUpperCase()}
                            </Badge>
                            {dep.is_active && (
                              <Badge variant="outline" className="border-green-500/50 text-green-400 text-[10px]">
                                ACTIVE
                              </Badge>
                            )}
                          </div>
                          {dep.unit_name && (
                            <p className="text-[#8a9aa8] text-sm mb-1">{dep.unit_name}</p>
                          )}
                          <div className="flex flex-wrap gap-4 text-xs text-[#4a6070]">
                            {Array.isArray(dep.route_points) && dep.route_points.length > 0 && (
                              <span className="flex items-center gap-1">
                                <Navigation className="w-3 h-3" />
                                {dep.route_points.map((rp) => rp.name || 'point').join(' → ')}
                              </span>
                            )}
                            {dep.total_duration_hours != null && (
                              <span>Duration: {dep.total_duration_hours}h</span>
                            )}
                            {dep.started_at && (
                              <span>Started: {formatDeploymentDateTime(dep.started_at, { includeTime: true })}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            className={`h-8 text-xs ${
                              dep.is_active
                                ? 'border-green-500/50 text-green-400 hover:bg-green-900/20'
                                : 'border-[rgba(201,162,39,0.15)] text-[#8a9aa8] hover:text-white'
                            }`}
                            onClick={() => handleToggleActive(dep)}
                          >
                            {dep.is_active ? 'Deactivate' : 'Activate'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8] hover:text-white h-8"
                            onClick={() => openEditDeployment(dep)}
                          >
                            <Edit className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-red-800/50 text-red-400 hover:text-red-300 hover:bg-red-900/20 h-8"
                            onClick={() => handleDeleteDeployment(dep.id || dep._id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===================== ALLIED DEPLOYMENTS TAB ===================== */}
        {activeTab === 'allied' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <p className="text-[#8a9aa8] text-sm">{alliedDeployments.length} allied deployment(s)</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8] hover:text-white"
                  onClick={fetchDeployments}
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Refresh
                </Button>
                <Button
                  className="bg-tropic-gold hover:bg-tropic-gold-dark text-black"
                  onClick={openNewAlliedDeployment}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  New Allied Deployment
                </Button>
              </div>
            </div>

            {deploymentsLoading ? (
              <div className="text-center text-[#4a6070] py-12">Loading allied deployments...</div>
            ) : alliedDeployments.length === 0 ? (
              <div className="text-center text-[#4a6070] py-12">No allied deployments found. Create your first allied deployment.</div>
            ) : (
              <div className="space-y-3">
                {alliedDeployments.map((dep) => (
                  <Card key={dep.id || dep._id} className="bg-[#050a0e]/40 border-[rgba(201,162,39,0.12)] hover:border-[rgba(201,162,39,0.15)] transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <h3 className="text-lg font-bold text-white truncate" style={{ fontFamily: "'Share Tech', sans-serif" }}>
                              {dep.title}
                            </h3>
                            <Badge className={STATUS_COLORS[dep.status] || 'bg-[#4a6070]'}>
                              {dep.status?.toUpperCase()}
                            </Badge>
                            <Badge className={ORIGIN_TYPE_COLORS[dep.origin_type] || 'bg-[#4a6070]'}>
                              {dep.origin_type?.toUpperCase()}
                            </Badge>
                            {dep.is_active && (
                              <Badge variant="outline" className="border-green-500/50 text-green-400 text-[10px]">
                                ACTIVE
                              </Badge>
                            )}
                          </div>
                          {dep.unit_name && (
                            <p className="text-[#8a9aa8] text-sm mb-1">{dep.unit_name}</p>
                          )}
                          <div className="flex flex-wrap gap-4 text-xs text-[#4a6070]">
                            {Array.isArray(dep.route_points) && dep.route_points.length > 0 && (
                              <span className="flex items-center gap-1">
                                <Navigation className="w-3 h-3" />
                                {dep.route_points.map((rp) => rp.name || 'point').join(' → ')}
                              </span>
                            )}
                            {dep.total_duration_hours != null && (
                              <span>Duration: {dep.total_duration_hours}h</span>
                            )}
                            {dep.started_at && (
                              <span>Started: {formatDeploymentDateTime(dep.started_at, { includeTime: true })}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            className={`h-8 text-xs ${
                              dep.is_active
                                ? 'border-green-500/50 text-green-400 hover:bg-green-900/20'
                                : 'border-[rgba(201,162,39,0.15)] text-[#8a9aa8] hover:text-white'
                            }`}
                            onClick={() => handleToggleActive(dep)}
                          >
                            {dep.is_active ? 'Deactivate' : 'Activate'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8] hover:text-white h-8"
                            onClick={() => openEditDeployment(dep)}
                          >
                            <Edit className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-red-800/50 text-red-400 hover:text-red-300 hover:bg-red-900/20 h-8"
                            onClick={() => handleDeleteDeployment(dep.id || dep._id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===================== NATO MARKERS TAB ===================== */}
        {activeTab === 'nato-markers' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-[#8a9aa8] text-sm">{markers.length} marker(s)</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8] hover:text-white"
                  onClick={fetchMarkers}
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Refresh
                </Button>
                <Button
                  className="bg-tropic-gold hover:bg-tropic-gold-dark text-black"
                  onClick={openNewMarker}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  New Marker
                </Button>
              </div>
            </div>

            {markersLoading ? (
              <div className="text-center text-[#4a6070] py-12">Loading NATO markers...</div>
            ) : markers.length === 0 ? (
              <div className="text-center text-[#4a6070] py-12">No NATO markers found. Create your first marker.</div>
            ) : (
              <div className="space-y-3">
                {markers.map((marker) => (
                  <Card key={marker.id} className="bg-[#050a0e]/40 border-[rgba(201,162,39,0.12)] hover:border-[rgba(201,162,39,0.15)] transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-bold text-white truncate" style={{ fontFamily: "'Share Tech', sans-serif" }}>
                              {marker.title}
                            </h3>
                            <Badge className={AFFILIATION_COLORS[marker.affiliation] || 'bg-[#4a6070]'}>
                              {marker.affiliation?.toUpperCase()}
                            </Badge>
                            <Badge variant="outline" className="border-[rgba(201,162,39,0.2)] text-[#8a9aa8] text-[10px]">
                              {formatLabel(marker.symbol_type || 'unknown')}
                            </Badge>
                            {marker.echelon && marker.echelon !== 'none' && (
                              <Badge variant="outline" className="border-tropic-gold/40 text-tropic-gold text-[10px]">
                                {formatLabel(marker.echelon)}
                              </Badge>
                            )}
                          </div>
                          {marker.description && (
                            <p className="text-[#8a9aa8] text-sm mb-2 line-clamp-2">{marker.description}</p>
                          )}
                          <div className="flex flex-wrap gap-4 text-xs text-[#4a6070]">
                            {marker.designator && <span>Designator: {marker.designator}</span>}
                            {marker.latitude != null && marker.longitude != null && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {marker.latitude.toFixed(4)}, {marker.longitude.toFixed(4)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8] hover:text-white h-8"
                            onClick={() => openEditMarker(marker)}
                          >
                            <Edit className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-red-800/50 text-red-400 hover:text-red-300 hover:bg-red-900/20 h-8"
                            onClick={() => handleDeleteMarker(marker.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===================== DIVISION LOCATION TAB ===================== */}
        {activeTab === 'division-location' && (
          <div className="space-y-4">
            <Card className="bg-[#050a0e]/40 border-[rgba(201,162,39,0.12)]">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <MapPin className="w-6 h-6 text-tropic-gold" />
                  <h2 className="text-xl font-bold text-white tracking-wider" style={{ fontFamily: "'Share Tech', sans-serif" }}>
                    DIVISION HQ LOCATION
                  </h2>
                </div>
                {divisionLocation ? (
                  <div className="space-y-2">
                    <div className="text-sm text-[#8a9aa8]">
                      <span className="text-[#4a6070]">Name:</span>{' '}
                      {divisionLocation.current_location_name || 'Unknown'}
                    </div>
                    <div className="text-sm text-[#8a9aa8]">
                      <span className="text-[#4a6070]">Coordinates:</span>{' '}
                      {divisionLocation.current_latitude?.toFixed(4)}, {divisionLocation.current_longitude?.toFixed(4)}
                    </div>
                  </div>
                ) : (
                  <p className="text-[#4a6070] text-sm">Division location not set.</p>
                )}
                <div className="mt-4">
                  <Button
                    variant="outline"
                    className="border-tropic-gold/50 text-tropic-gold hover:bg-tropic-gold/10"
                    onClick={openDivisionDialog}
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Update Location
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ===================== DEPLOYMENT DIALOG ===================== */}
        <Dialog open={deploymentDialogOpen} onOpenChange={(open) => {
          setDeploymentDialogOpen(open);
          if (!open) { setEditingDeployment(null); setDeploymentForm({ ...EMPTY_DEPLOYMENT }); }
        }}>
          <DialogContent className="bg-[#0c1117] text-white border-[rgba(201,162,39,0.12)] max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle style={{ fontFamily: "'Share Tech', sans-serif" }}>
                {editingDeployment ? 'EDIT DEPLOYMENT' : 'CREATE NEW DEPLOYMENT'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleDeploymentSubmit} className="space-y-4">
              <div>
                <Label>Title *</Label>
                <Input
                  required
                  value={deploymentForm.title}
                  onChange={(e) => setDeploymentForm({ ...deploymentForm, title: e.target.value })}
                  className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]"
                  placeholder="e.g., Operation Pacific Shield"
                />
              </div>

              <div>
                <Label>Unit Name</Label>
                <Input
                  value={deploymentForm.unit_name}
                  onChange={(e) => setDeploymentForm({ ...deploymentForm, unit_name: e.target.value })}
                  className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]"
                  placeholder="e.g., 2nd Brigade Combat Team"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Origin Type</Label>
                  <Select
                    value={deploymentForm.origin_type}
                    onValueChange={(val) => {
                      const prev = deploymentForm;
                      let newRoutePoints = prev.route_points || [];
                      if (val === '25th') {
                        const schofield = { name: SCHOFIELD_BARRACKS.name, latitude: SCHOFIELD_BARRACKS.latitude, longitude: SCHOFIELD_BARRACKS.longitude, description: '', stop_duration_hours: 0 };
                        const rest = prev.origin_type === '25th' ? newRoutePoints.slice(1) : newRoutePoints;
                        newRoutePoints = [schofield, ...rest];
                      } else if (prev.origin_type === '25th') {
                        newRoutePoints = newRoutePoints.slice(1);
                      }
                      setDeploymentForm({ ...prev, origin_type: val, route_points: newRoutePoints });
                    }}
                  >
                    <SelectTrigger className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]">
                      {ORIGIN_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{formatLabel(t)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select
                    value={deploymentForm.status}
                    onValueChange={(val) => setDeploymentForm({ ...deploymentForm, status: val })}
                  >
                    <SelectTrigger className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]">
                      {DEPLOYMENT_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{formatLabel(s)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm text-[#8a9aa8] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={deploymentForm.is_active}
                      onChange={(e) => setDeploymentForm({ ...deploymentForm, is_active: e.target.checked })}
                      className="rounded border-[rgba(201,162,39,0.15)]"
                    />
                    Active Deployment
                  </label>
                </div>
                <div>
                  <Label>Total Duration (hours)</Label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={deploymentForm.total_duration_hours}
                    onChange={(e) => setDeploymentForm({ ...deploymentForm, total_duration_hours: e.target.value })}
                    className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]"
                    placeholder="24"
                  />
                </div>
                <div>
                  <Label>Return Duration (hours)</Label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={deploymentForm.return_duration_hours ?? 0}
                    onChange={(e) => setDeploymentForm({ ...deploymentForm, return_duration_hours: e.target.value })}
                    className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Route Points */}
              <div className="border border-[rgba(201,162,39,0.12)] rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-tropic-gold tracking-wider font-bold">ROUTE POINTS</div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-tropic-gold/50 text-tropic-gold hover:bg-tropic-gold/10 h-7 text-xs"
                    onClick={() => setDeploymentForm({
                      ...deploymentForm,
                      route_points: [...(deploymentForm.route_points || []), { ...EMPTY_ROUTE_POINT }],
                    })}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Stop
                  </Button>
                </div>
                {/* Mini map for click-to-add route points */}
                {MAPBOX_TOKEN ? (
                <>
                <div className="rounded border border-[rgba(201,162,39,0.15)] overflow-hidden" style={{ height: 200 }}>
                  <Map
                    mapboxAccessToken={MAPBOX_TOKEN}
                    initialViewState={{ longitude: -98, latitude: 38, zoom: 1.5 }}
                    style={{ width: '100%', height: '100%' }}
                    mapStyle="mapbox://styles/mapbox/dark-v11"
                    onClick={(e) => {
                      const { lng, lat } = e.lngLat;
                      setDeploymentForm((prev) => ({
                        ...prev,
                        route_points: [
                          ...(prev.route_points || []),
                          { ...EMPTY_ROUTE_POINT, latitude: parseFloat(lat.toFixed(4)), longitude: parseFloat(lng.toFixed(4)), name: `Point ${(prev.route_points || []).length + 1}` },
                        ],
                      }));
                    }}
                    cursor="crosshair"
                    interactive
                    attributionControl={false}
                  >
                    {/* Show route points on mini map */}
                    {(deploymentForm.route_points || [])
                      .filter(rp => rp.latitude && rp.longitude && !isNaN(parseFloat(rp.latitude)) && !isNaN(parseFloat(rp.longitude)))
                      .map((rp, idx) => (
                        <MapMarker
                          key={`form-rp-${idx}`}
                          longitude={parseFloat(rp.longitude)}
                          latitude={parseFloat(rp.latitude)}
                          anchor="center"
                        >
                          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-tropic-gold text-black text-[9px] font-bold border border-black">
                            {idx + 1}
                          </div>
                        </MapMarker>
                      ))
                    }
                    {/* Route line preview */}
                    {(() => {
                      const validPts = (deploymentForm.route_points || [])
                        .filter(rp => rp.latitude && rp.longitude && !isNaN(parseFloat(rp.latitude)) && !isNaN(parseFloat(rp.longitude)));
                      if (validPts.length < 2) return null;
                      const lineGeoJson = {
                        type: 'Feature',
                        geometry: {
                          type: 'LineString',
                          coordinates: validPts.map(rp => [parseFloat(rp.longitude), parseFloat(rp.latitude)]),
                        },
                      };
                      return (
                        <MapSource id="form-route-preview" type="geojson" data={lineGeoJson}>
                          <MapLayer
                            id="form-route-line"
                            type="line"
                            paint={{ 'line-color': TROPIC_GOLD_HEX, 'line-width': 2, 'line-dasharray': [2, 2], 'line-opacity': 0.8 }}
                          />
                        </MapSource>
                      );
                    })()}
                  </Map>
                </div>
                <p className="text-[10px] text-[#4a6070] mt-1">Click the map to add route points, which will appear in the list below.</p>
                </>
                ) : (
                  <p className="text-[10px] text-yellow-600 italic">Mapbox token not configured. Map preview unavailable.</p>
                )}
                {(deploymentForm.route_points || []).length === 0 && (
                  <p className="text-xs text-[#4a6070] italic">No route points. Add stops to define the deployment route.</p>
                )}
                {(deploymentForm.route_points || []).map((rp, idx) => {
                  const isLockedOrigin = idx === 0 && deploymentForm.origin_type === '25th';
                  return (
                  <div key={idx} className={`border rounded p-2 space-y-2 ${isLockedOrigin ? 'border-tropic-gold/40 bg-tropic-gold/5' : 'border-[rgba(201,162,39,0.12)]/60'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-tropic-gold font-bold tracking-wider">
                        {isLockedOrigin ? 'ORIGIN — SCHOFIELD BARRACKS (LOCKED)' : `Stop ${idx + 1}`}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8] hover:text-white h-6 w-6 p-0 shrink-0"
                          onClick={() => moveRoutePointUp(idx)}
                          disabled={idx === 0}
                        >
                          <ChevronUp className="w-3 h-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8] hover:text-white h-6 w-6 p-0 shrink-0"
                          onClick={() => moveRoutePointDown(idx)}
                          disabled={isLockedOrigin || idx === (deploymentForm.route_points || []).length - 1}
                        >
                          <ChevronDown className="w-3 h-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-red-800/50 text-red-400 hover:text-red-300 hover:bg-red-900/20 h-6 w-6 p-0 shrink-0"
                          onClick={() => {
                            const rps = deploymentForm.route_points.filter((_, i) => i !== idx);
                            setDeploymentForm({ ...deploymentForm, route_points: rps });
                          }}
                          disabled={isLockedOrigin}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    {!isLockedOrigin && (
                    <div className="relative">
                      <Label className="text-[10px] text-[#4a6070] flex items-center gap-1">
                        <Search className="w-3 h-3" />
                        Search Location
                      </Label>
                      <Input
                        value={locationSearches[idx] || ''}
                        onChange={(e) => handleLocationSearch(e.target.value, idx)}
                        className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] h-8 text-xs"
                        placeholder="Type a place name to search..."
                      />
                      {(locationResults[idx] || []).length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-[#0c1117] border border-[rgba(201,162,39,0.15)] rounded shadow-lg max-h-[200px] overflow-y-auto">
                          {locationResults[idx].map((result, rIdx) => (
                            <button
                              key={rIdx}
                              type="button"
                              className="w-full text-left px-3 py-2 text-xs text-[#d0d8e0] hover:bg-[#111a24] border-b border-[rgba(201,162,39,0.12)] last:border-0"
                              onClick={() => handleLocationSelect(result, idx)}
                            >
                              <div className="text-white">{result.name}</div>
                              <div className="text-[10px] text-[#4a6070]">{result.latitude.toFixed(4)}, {result.longitude.toFixed(4)}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    )}
                    {!isLockedOrigin && (locationEntities || []).length > 0 && (
                      <div>
                        <Label className="text-[10px] text-[#4a6070] flex items-center gap-1">
                          <Search className="w-3 h-3" />
                          Select Entity
                        </Label>
                        <Select onValueChange={(val) => handleEntityPickRoutePoint(val, idx)}>
                          <SelectTrigger className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] h-7 text-xs">
                            <SelectValue placeholder="— Manual entry —" />
                          </SelectTrigger>
                          <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)] max-h-[250px]">
                            <SelectItem value="__manual__" className="text-xs text-[#8a9aa8]">— Manual entry —</SelectItem>
                            {Object.entries(groupedEntities).map(([type, entities]) => (
                              <React.Fragment key={type}>
                                <div className="px-2 py-1 text-[10px] text-tropic-gold/70 font-bold tracking-wider uppercase border-t border-[rgba(201,162,39,0.12)] mt-1">
                                  {type}
                                </div>
                                {entities.map((entity) => (
                                  <SelectItem key={`rp${idx}-${type}-${entity.entity_id}`} value={String(entity.entity_id)} className="text-xs">
                                    {entity.name} ({entity.latitude?.toFixed(2)}, {entity.longitude?.toFixed(2)})
                                  </SelectItem>
                                ))}
                              </React.Fragment>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="flex items-end gap-2">
                      <div className="flex-1 space-y-1">
                        <Label className="text-[10px] text-[#4a6070]">Name</Label>
                        <Input
                          value={rp.name || ''}
                          onChange={(e) => {
                            const rps = [...deploymentForm.route_points];
                            rps[idx] = { ...rps[idx], name: e.target.value };
                            setDeploymentForm({ ...deploymentForm, route_points: rps });
                          }}
                          className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] h-8 text-xs"
                          placeholder="e.g., Schofield Barracks"
                          disabled={isLockedOrigin}
                        />
                      </div>
                      <div className="w-24 space-y-1">
                        <Label className="text-[10px] text-[#4a6070]">Lat</Label>
                        <Input
                          type="number"
                          step="any"
                          value={rp.latitude ?? ''}
                          onChange={(e) => {
                            const rps = [...deploymentForm.route_points];
                            rps[idx] = { ...rps[idx], latitude: e.target.value };
                            setDeploymentForm({ ...deploymentForm, route_points: rps });
                          }}
                          className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] h-8 text-xs"
                          disabled={isLockedOrigin}
                        />
                      </div>
                      <div className="w-24 space-y-1">
                        <Label className="text-[10px] text-[#4a6070]">Lng</Label>
                        <Input
                          type="number"
                          step="any"
                          value={rp.longitude ?? ''}
                          onChange={(e) => {
                            const rps = [...deploymentForm.route_points];
                            rps[idx] = { ...rps[idx], longitude: e.target.value };
                            setDeploymentForm({ ...deploymentForm, route_points: rps });
                          }}
                          className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] h-8 text-xs"
                          disabled={isLockedOrigin}
                        />
                      </div>
                    </div>
                    {!isLockedOrigin && (
                    <div className="flex items-end gap-2">
                      <div className="flex-1 space-y-1">
                        <Label className="text-[10px] text-[#4a6070]">Description</Label>
                        <Input
                          value={rp.description || ''}
                          onChange={(e) => {
                            const rps = [...deploymentForm.route_points];
                            rps[idx] = { ...rps[idx], description: e.target.value };
                            setDeploymentForm({ ...deploymentForm, route_points: rps });
                          }}
                          className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] h-8 text-xs"
                          placeholder="Optional description"
                        />
                      </div>
                      <div className="w-28 space-y-1">
                        <Label className="text-[10px] text-[#4a6070]">Stop Duration (h)</Label>
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          value={rp.stop_duration_hours ?? ''}
                          onChange={(e) => {
                            const rps = [...deploymentForm.route_points];
                            rps[idx] = { ...rps[idx], stop_duration_hours: e.target.value };
                            setDeploymentForm({ ...deploymentForm, route_points: rps });
                          }}
                          className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] h-8 text-xs"
                          placeholder="Hours"
                        />
                      </div>
                    </div>
                    )}
                  </div>
                  );
                })}
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea
                  rows={2}
                  value={deploymentForm.notes}
                  onChange={(e) => setDeploymentForm({ ...deploymentForm, notes: e.target.value })}
                  className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]"
                  placeholder="Internal notes"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8]"
                  onClick={() => setDeploymentDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" className="bg-tropic-gold hover:bg-tropic-gold-dark text-black">
                  {editingDeployment ? 'Update Deployment' : 'Create Deployment'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* ===================== NATO MARKER DIALOG ===================== */}
        <Dialog open={markerDialogOpen} onOpenChange={(open) => {
          setMarkerDialogOpen(open);
          if (!open) { setEditingMarker(null); setMarkerForm({ ...EMPTY_MARKER }); }
        }}>
          <DialogContent className="bg-[#0c1117] text-white border-[rgba(201,162,39,0.12)] max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle style={{ fontFamily: "'Share Tech', sans-serif" }}>
                {editingMarker ? 'EDIT NATO MARKER' : 'CREATE NATO MARKER'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleMarkerSubmit} className="space-y-4">
              <div>
                <Label>Title *</Label>
                <Input
                  required
                  value={markerForm.title}
                  onChange={(e) => setMarkerForm({ ...markerForm, title: e.target.value })}
                  className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]"
                  placeholder="e.g., Alpha Company Forward Position"
                />
              </div>

              <div>
                <Label>Description</Label>
                <Textarea
                  rows={2}
                  value={markerForm.description}
                  onChange={(e) => setMarkerForm({ ...markerForm, description: e.target.value })}
                  className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]"
                  placeholder="Marker description"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <Label>Affiliation</Label>
                  <Select
                    value={markerForm.affiliation}
                    onValueChange={(val) => setMarkerForm({ ...markerForm, affiliation: val })}
                  >
                    <SelectTrigger className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)] max-h-[300px]">
                      {affiliations.map((a) => (
                        <SelectItem key={a} value={a}>{getNatoLabel(a, affiliationLabels)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Symbol Type</Label>
                  <Select
                    value={markerForm.symbol_type}
                    onValueChange={(val) => setMarkerForm({ ...markerForm, symbol_type: val })}
                  >
                    <SelectTrigger className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)] max-h-[300px]">
                      {symbolTypes.map((st) => (
                        <SelectItem key={st} value={st}>{getNatoLabel(st, symbolTypeLabels)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Echelon</Label>
                  <Select
                    value={markerForm.echelon}
                    onValueChange={(val) => setMarkerForm({ ...markerForm, echelon: val })}
                  >
                    <SelectTrigger className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)] max-h-[300px]">
                      {echelons.map((ec) => (
                        <SelectItem key={ec} value={ec}>{getNatoLabel(ec, echelonLabels)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Designator</Label>
                <Input
                  value={markerForm.designator}
                  onChange={(e) => setMarkerForm({ ...markerForm, designator: e.target.value })}
                  className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]"
                  placeholder="e.g., 1-25 INF"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Latitude</Label>
                  <Input
                    type="number"
                    step="any"
                    value={markerForm.latitude}
                    onChange={(e) => setMarkerForm({ ...markerForm, latitude: e.target.value })}
                    className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]"
                  />
                </div>
                <div>
                  <Label>Longitude</Label>
                  <Input
                    type="number"
                    step="any"
                    value={markerForm.longitude}
                    onChange={(e) => setMarkerForm({ ...markerForm, longitude: e.target.value })}
                    className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8]"
                  onClick={() => setMarkerDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" className="bg-tropic-gold hover:bg-tropic-gold-dark text-black">
                  {editingMarker ? 'Update Marker' : 'Create Marker'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* ===================== DIVISION LOCATION DIALOG ===================== */}
        <Dialog open={divisionDialogOpen} onOpenChange={setDivisionDialogOpen}>
          <DialogContent className="bg-[#0c1117] text-white border-[rgba(201,162,39,0.12)] max-w-md">
            <DialogHeader>
              <DialogTitle style={{ fontFamily: "'Share Tech', sans-serif" }}>
                UPDATE DIVISION LOCATION
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleDivisionSubmit} className="space-y-4">
              <div>
                <Label>Location Name</Label>
                <Input
                  required
                  value={divisionForm.name}
                  onChange={(e) => setDivisionForm({ ...divisionForm, name: e.target.value })}
                  className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]"
                  placeholder="e.g., Schofield Barracks, HI"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Latitude</Label>
                  <Input
                    required
                    type="number"
                    step="any"
                    value={divisionForm.latitude}
                    onChange={(e) => setDivisionForm({ ...divisionForm, latitude: e.target.value })}
                    className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]"
                  />
                </div>
                <div>
                  <Label>Longitude</Label>
                  <Input
                    required
                    type="number"
                    step="any"
                    value={divisionForm.longitude}
                    onChange={(e) => setDivisionForm({ ...divisionForm, longitude: e.target.value })}
                    className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8]"
                  onClick={() => setDivisionDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" className="bg-tropic-gold hover:bg-tropic-gold-dark text-black">
                  Update Location
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
};

export default DeploymentManager;

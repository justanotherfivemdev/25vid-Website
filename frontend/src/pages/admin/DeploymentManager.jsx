import React, { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Edit, Trash2, MapPin, Navigation, RefreshCw, ChevronUp, ChevronDown, Search } from 'lucide-react';
import { API } from '@/utils/api';
import { formatApiError } from '@/utils/errorMessages';

const DEPLOYMENT_STATUSES = ['planning', 'deploying', 'deployed', 'returning', 'completed', 'cancelled'];

const STATUS_COLORS = {
  planning: 'bg-gray-600 text-gray-100',
  deploying: 'bg-yellow-600 text-yellow-100',
  deployed: 'bg-green-600 text-green-100',
  returning: 'bg-blue-600 text-blue-100',
  completed: 'bg-purple-600 text-purple-100',
  cancelled: 'bg-red-600 text-red-100',
};

const AFFILIATION_COLORS = {
  friendly: 'bg-blue-600 text-blue-100',
  hostile: 'bg-red-600 text-red-100',
  neutral: 'bg-green-600 text-green-100',
  unknown: 'bg-yellow-600 text-yellow-100',
};

/** Convert an ISO / date string into the value format required by <input type="datetime-local"> (YYYY-MM-DDTHH:mm). */
function toDatetimeLocalValue(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr.slice(0, 16); // fallback: keep what we have
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const EMPTY_DEPLOYMENT = {
  title: '',
  description: '',
  status: 'planning',
  deployment_type: '25th_id',
  unit_name: '',
  partner_unit_id: null,
  start_location_name: 'Schofield Barracks, HI',
  start_latitude: 21.4959,
  start_longitude: -158.0648,
  destination_name: '',
  destination_latitude: '',
  destination_longitude: '',
  start_date: '',
  estimated_arrival: '',
  waypoints: [],
  notes: '',
  is_active: true,
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
  const [activeTab, setActiveTab] = useState('deployments');

  // Deployments state
  const [deployments, setDeployments] = useState([]);
  const [deploymentsLoading, setDeploymentsLoading] = useState(true);
  const [deploymentDialogOpen, setDeploymentDialogOpen] = useState(false);
  const [editingDeployment, setEditingDeployment] = useState(null);
  const [deploymentForm, setDeploymentForm] = useState({ ...EMPTY_DEPLOYMENT });

  // Allied deployments state
  const [alliedDeployments, setAlliedDeployments] = useState([]);
  const [alliedDeploymentsLoading, setAlliedDeploymentsLoading] = useState(true);

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

  // Shared
  const [error, setError] = useState('');

  const fetchDeployments = useCallback(async () => {
    setDeploymentsLoading(true);
    try {
      const res = await axios.get(`${API}/admin/map/deployments`, { withCredentials: true });
      setDeployments(res.data);
    } catch (err) {
      console.error('Error fetching deployments:', err);
      setError('Failed to load deployments');
    } finally {
      setDeploymentsLoading(false);
    }
  }, []);

  const fetchAlliedDeployments = useCallback(async () => {
    setAlliedDeploymentsLoading(true);
    try {
      const res = await axios.get(`${API}/admin/map/deployments?deployment_type=allied`, { withCredentials: true });
      setAlliedDeployments(res.data);
    } catch (err) {
      console.error('Error fetching allied deployments:', err);
      setError('Failed to load allied deployments');
    } finally {
      setAlliedDeploymentsLoading(false);
    }
  }, []);

  const fetchLocationEntities = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/map/location-entities`, { withCredentials: true });
      setLocationEntities(res.data);
    } catch (err) {
      console.error('Error fetching location entities:', err);
    }
  }, []);

  const fetchMarkers = useCallback(async () => {
    setMarkersLoading(true);
    try {
      const res = await axios.get(`${API}/map/nato-markers`, { withCredentials: true });
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
      const res = await axios.get(`${API}/map/nato-reference`, { withCredentials: true });
      setNatoReference(res.data);
    } catch (err) {
      console.error('Error fetching NATO reference:', err);
    }
  }, []);

  const fetchDivisionLocation = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/map/division-location`, { withCredentials: true });
      setDivisionLocation(res.data);
    } catch (err) {
      console.error('Error fetching division location:', err);
    }
  }, []);

  useEffect(() => {
    fetchDeployments();
    fetchAlliedDeployments();
    fetchLocationEntities();
    fetchMarkers();
    fetchNatoReference();
    fetchDivisionLocation();
  }, [fetchDeployments, fetchAlliedDeployments, fetchLocationEntities, fetchMarkers, fetchNatoReference, fetchDivisionLocation]);

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

  const handleEntityPickOrigin = (entityId) => {
    if (!entityId || entityId === '__manual__') return;
    const entity = (locationEntities || []).find((e) => String(e.entity_id) === String(entityId));
    if (!entity) return;
    setDeploymentForm({
      ...deploymentForm,
      start_location_name: entity.name || '',
      start_latitude: entity.latitude ?? '',
      start_longitude: entity.longitude ?? '',
    });
  };

  const handleEntityPickDestination = (entityId) => {
    if (!entityId || entityId === '__manual__') return;
    const entity = (locationEntities || []).find((e) => String(e.entity_id) === String(entityId));
    if (!entity) return;
    setDeploymentForm({
      ...deploymentForm,
      destination_name: entity.name || '',
      destination_latitude: entity.latitude ?? '',
      destination_longitude: entity.longitude ?? '',
    });
  };

  const handleEntityPickWaypoint = (entityId, idx) => {
    if (!entityId || entityId === '__manual__') return;
    const entity = (locationEntities || []).find((e) => String(e.entity_id) === String(entityId));
    if (!entity) return;
    const wps = [...deploymentForm.waypoints];
    wps[idx] = {
      ...wps[idx],
      name: entity.name || '',
      latitude: entity.latitude ?? '',
      longitude: entity.longitude ?? '',
    };
    setDeploymentForm({ ...deploymentForm, waypoints: wps });
  };

  // --- Waypoint reorder helpers ---

  const swapWaypoints = (idx, targetIdx) => {
    const wps = [...deploymentForm.waypoints];
    if (targetIdx < 0 || targetIdx >= wps.length) return;
    [wps[idx], wps[targetIdx]] = [wps[targetIdx], wps[idx]];
    setDeploymentForm({ ...deploymentForm, waypoints: wps });
  };

  const moveWaypointUp = (idx) => swapWaypoints(idx, idx - 1);
  const moveWaypointDown = (idx) => swapWaypoints(idx, idx + 1);

  // --- Deployment handlers ---

  const openNewDeployment = (type = '25th_id') => {
    setEditingDeployment(null);
    setDeploymentForm({ ...EMPTY_DEPLOYMENT, deployment_type: type });
    setDeploymentDialogOpen(true);
  };

  const openNewAlliedDeployment = () => {
    openNewDeployment('allied');
  };

  const openEditDeployment = (dep) => {
    setEditingDeployment(dep);
    setDeploymentForm({
      title: dep.title || '',
      description: dep.description || '',
      status: dep.status || 'planning',
      deployment_type: dep.deployment_type || '25th_id',
      unit_name: dep.unit_name || '',
      partner_unit_id: dep.partner_unit_id || null,
      start_location_name: dep.start_location_name || 'Schofield Barracks, HI',
      start_latitude: dep.start_latitude ?? 21.4959,
      start_longitude: dep.start_longitude ?? -158.0648,
      destination_name: dep.destination_name || '',
      destination_latitude: dep.destination_latitude ?? '',
      destination_longitude: dep.destination_longitude ?? '',
      start_date: toDatetimeLocalValue(dep.start_date),
      estimated_arrival: toDatetimeLocalValue(dep.estimated_arrival),
      waypoints: Array.isArray(dep.waypoints) ? dep.waypoints : [],
      notes: dep.notes || '',
      is_active: dep.is_active ?? true,
    });
    setDeploymentDialogOpen(true);
  };

  const handleDeploymentSubmit = async (e) => {
    e.preventDefault();
    try {
      // Safely parse a numeric field: returns null for empty/null/NaN, otherwise a float
      const safeFloat = (v) => {
        if (v === '' || v == null) return null;
        const n = parseFloat(v);
        return isNaN(n) ? null : n;
      };

      const payload = {
        title: deploymentForm.title,
        description: deploymentForm.description || '',
        status: deploymentForm.status || 'planning',
        deployment_type: deploymentForm.deployment_type || '25th_id',
        unit_name: deploymentForm.unit_name || '',
        start_location_name: deploymentForm.start_location_name || 'Schofield Barracks, HI',
        start_latitude: safeFloat(deploymentForm.start_latitude),
        start_longitude: safeFloat(deploymentForm.start_longitude),
        destination_name: deploymentForm.destination_name || '',
        destination_latitude: safeFloat(deploymentForm.destination_latitude),
        destination_longitude: safeFloat(deploymentForm.destination_longitude),
        start_date: deploymentForm.start_date || null,
        estimated_arrival: deploymentForm.estimated_arrival || null,
        is_active: deploymentForm.is_active ?? true,
        notes: deploymentForm.notes || '',
        waypoints: (deploymentForm.waypoints || []).map((wp) => ({
          name: wp.name || '',
          latitude: safeFloat(wp.latitude),
          longitude: safeFloat(wp.longitude),
          description: wp.description || '',
          stop_duration_hours: safeFloat(wp.stop_duration_hours),
        })).filter((wp) => wp.latitude != null && wp.longitude != null),
      };

      if (editingDeployment) {
        await axios.put(`${API}/admin/map/deployments/${editingDeployment.id}`, payload, { withCredentials: true });
      } else {
        await axios.post(`${API}/admin/map/deployments`, payload, { withCredentials: true });
      }

      setDeploymentDialogOpen(false);
      setEditingDeployment(null);
      setDeploymentForm({ ...EMPTY_DEPLOYMENT });
      await fetchDeployments();
      await fetchAlliedDeployments();
    } catch (err) {
      console.error('Error saving deployment:', err);
      alert(formatApiError(err, 'Error saving deployment'));
    }
  };

  const handleDeploymentStatusChange = async (dep, newStatus) => {
    try {
      await axios.put(`${API}/admin/map/deployments/${dep.id}`, { status: newStatus }, { withCredentials: true });
      await fetchDeployments();
      await fetchAlliedDeployments();
      await fetchDivisionLocation();
    } catch (err) {
      console.error('Error updating status:', err);
      alert('Error updating deployment status');
    }
  };

  const handleDeleteDeployment = async (id) => {
    if (!window.confirm('Are you sure you want to delete this deployment? This action cannot be undone.')) return;
    try {
      await axios.delete(`${API}/admin/map/deployments/${id}`, { withCredentials: true });
      // Refetch to confirm deletion was persisted rather than relying on optimistic removal
      await fetchDeployments();
      await fetchAlliedDeployments();
    } catch (err) {
      console.error('Error deleting deployment:', err);
      alert(err.response?.data?.detail || 'Error deleting deployment');
      // Refetch to sync state after failure
      await fetchDeployments();
      await fetchAlliedDeployments();
    }
  };

  // --- NATO Marker handlers ---

  const openNewMarker = () => {
    setEditingMarker(null);
    setMarkerForm({ ...EMPTY_MARKER });
    setMarkerDialogOpen(true);
  };

  const openEditMarker = (marker) => {
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
  };

  const handleMarkerSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...markerForm,
        latitude: markerForm.latitude === '' ? null : parseFloat(markerForm.latitude),
        longitude: markerForm.longitude === '' ? null : parseFloat(markerForm.longitude),
      };

      if (editingMarker) {
        await axios.put(`${API}/admin/map/nato-markers/${editingMarker.id}`, payload, { withCredentials: true });
      } else {
        await axios.post(`${API}/admin/map/nato-markers`, payload, { withCredentials: true });
      }

      setMarkerDialogOpen(false);
      setEditingMarker(null);
      setMarkerForm({ ...EMPTY_MARKER });
      await fetchMarkers();
    } catch (err) {
      console.error('Error saving marker:', err);
      alert(formatApiError(err, 'Error saving marker'));
    }
  };

  const handleDeleteMarker = async (id) => {
    if (!window.confirm('Are you sure you want to delete this NATO marker?')) return;
    try {
      await axios.delete(`${API}/admin/map/nato-markers/${id}`, { withCredentials: true });
      await fetchMarkers();
    } catch (err) {
      console.error('Error deleting marker:', err);
      alert('Error deleting marker');
    }
  };

  // --- Division location handler ---

  const openDivisionDialog = () => {
    setDivisionForm({
      name: divisionLocation?.current_location_name || '',
      latitude: divisionLocation?.current_latitude ?? '',
      longitude: divisionLocation?.current_longitude ?? '',
    });
    setDivisionDialogOpen(true);
  };

  const handleDivisionSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`${API}/admin/map/division-location`, {
        current_location_name: divisionForm.name,
        current_latitude: parseFloat(divisionForm.latitude),
        current_longitude: parseFloat(divisionForm.longitude),
      }, { withCredentials: true });
      setDivisionDialogOpen(false);
      await fetchDivisionLocation();
    } catch (err) {
      console.error('Error updating division location:', err);
      alert(err.response?.data?.detail || 'Error updating division location');
    }
  };

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
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-tropic-gold tracking-wider" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
            DEPLOYMENT MANAGER
          </h1>
        </div>

        {/* Division Location Card */}
        <Card className="bg-black/60 border-gray-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5 text-tropic-gold" />
                <div>
                  <div className="text-xs text-gray-500 tracking-wider font-bold">DIVISION HQ LOCATION</div>
                  <div className="text-sm text-white">
                    {divisionLocation
                      ? `${divisionLocation.current_location_name || 'Unknown'} (${divisionLocation.current_latitude?.toFixed(4)}, ${divisionLocation.current_longitude?.toFixed(4)})`
                      : 'Not set'}
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-tropic-gold/50 text-tropic-gold hover:bg-tropic-gold/10"
                onClick={openDivisionDialog}
              >
                <Edit className="w-3 h-3 mr-1" />
                Update
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tab Navigation */}
        <div className="flex gap-2 border-b border-gray-800 pb-2">
          <button
            className={`px-4 py-2 text-sm font-bold tracking-wider transition-colors ${
              activeTab === 'deployments'
                ? 'text-tropic-gold border-b-2 border-tropic-gold'
                : 'text-gray-500 hover:text-gray-300'
            }`}
            onClick={() => setActiveTab('deployments')}
          >
            DEPLOYMENTS
          </button>
          <button
            className={`px-4 py-2 text-sm font-bold tracking-wider transition-colors ${
              activeTab === 'allied'
                ? 'text-tropic-gold border-b-2 border-tropic-gold'
                : 'text-gray-500 hover:text-gray-300'
            }`}
            onClick={() => setActiveTab('allied')}
          >
            ALLIED DEPLOYMENTS
          </button>
          <button
            className={`px-4 py-2 text-sm font-bold tracking-wider transition-colors ${
              activeTab === 'nato-markers'
                ? 'text-tropic-gold border-b-2 border-tropic-gold'
                : 'text-gray-500 hover:text-gray-300'
            }`}
            onClick={() => setActiveTab('nato-markers')}
          >
            NATO MARKERS
          </button>
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
              <p className="text-gray-400 text-sm">{deployments.length} deployment(s)</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-gray-700 text-gray-400 hover:text-white"
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
              <div className="text-center text-gray-500 py-12">Loading deployments...</div>
            ) : deployments.length === 0 ? (
              <div className="text-center text-gray-600 py-12">No deployments found. Create your first deployment.</div>
            ) : (
              <div className="space-y-3">
                {deployments.map((dep) => (
                  <Card key={dep.id} className="bg-black/40 border-gray-800 hover:border-gray-700 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-bold text-white truncate" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                              {dep.title}
                            </h3>
                            <Badge className={STATUS_COLORS[dep.status] || 'bg-gray-600'}>
                              {dep.status?.toUpperCase()}
                            </Badge>
                            {dep.is_active && (
                              <Badge variant="outline" className="border-green-500/50 text-green-400 text-[10px]">
                                ACTIVE
                              </Badge>
                            )}
                          </div>
                          {dep.description && (
                            <p className="text-gray-400 text-sm mb-2 line-clamp-2">{dep.description}</p>
                          )}
                          <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {dep.start_location_name || 'Origin not set'}
                            </span>
                            {dep.destination_name && (
                              <span className="flex items-center gap-1">
                                <Navigation className="w-3 h-3" />
                                {dep.destination_name}
                              </span>
                            )}
                            {Array.isArray(dep.waypoints) && dep.waypoints.length > 0 && (
                              <span className="text-tropic-gold/70">
                                via {dep.waypoints.map((wp) => wp.name || 'waypoint').join(' → ')}
                              </span>
                            )}
                            {dep.start_date && (
                              <span>Start: {new Date(dep.start_date).toLocaleDateString()}</span>
                            )}
                            {dep.estimated_arrival && (
                              <span>ETA: {new Date(dep.estimated_arrival).toLocaleDateString()}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Select
                            value={dep.status}
                            onValueChange={(val) => handleDeploymentStatusChange(dep, val)}
                          >
                            <SelectTrigger className="w-full sm:w-[130px] bg-black border-gray-700 text-xs h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-gray-900 border-gray-700">
                              {DEPLOYMENT_STATUSES.map((s) => (
                                <SelectItem key={s} value={s} className="text-xs">
                                  {s.toUpperCase()}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-gray-700 text-gray-400 hover:text-white h-8"
                            onClick={() => openEditDeployment(dep)}
                          >
                            <Edit className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-red-800/50 text-red-400 hover:text-red-300 hover:bg-red-900/20 h-8"
                            onClick={() => handleDeleteDeployment(dep.id)}
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
              <p className="text-gray-400 text-sm">{alliedDeployments.length} allied deployment(s)</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-gray-700 text-gray-400 hover:text-white"
                  onClick={fetchAlliedDeployments}
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

            {alliedDeploymentsLoading ? (
              <div className="text-center text-gray-500 py-12">Loading allied deployments...</div>
            ) : alliedDeployments.length === 0 ? (
              <div className="text-center text-gray-600 py-12">No allied deployments found. Create your first allied deployment.</div>
            ) : (
              <div className="space-y-3">
                {alliedDeployments.map((dep) => (
                  <Card key={dep.id} className="bg-black/40 border-gray-800 hover:border-gray-700 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-bold text-white truncate" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                              {dep.title}
                            </h3>
                            <Badge className={STATUS_COLORS[dep.status] || 'bg-gray-600'}>
                              {dep.status?.toUpperCase()}
                            </Badge>
                            {dep.unit_name && (
                              <Badge variant="outline" className="border-blue-500/50 text-blue-400 text-[10px]">
                                {dep.unit_name}
                              </Badge>
                            )}
                            {dep.is_active && (
                              <Badge variant="outline" className="border-green-500/50 text-green-400 text-[10px]">
                                ACTIVE
                              </Badge>
                            )}
                          </div>
                          {dep.description && (
                            <p className="text-gray-400 text-sm mb-2 line-clamp-2">{dep.description}</p>
                          )}
                          <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {dep.start_location_name || 'Origin not set'}
                            </span>
                            {dep.destination_name && (
                              <span className="flex items-center gap-1">
                                <Navigation className="w-3 h-3" />
                                {dep.destination_name}
                              </span>
                            )}
                            {Array.isArray(dep.waypoints) && dep.waypoints.length > 0 && (
                              <span className="text-tropic-gold/70">
                                via {dep.waypoints.map((wp) => wp.name || 'waypoint').join(' → ')}
                              </span>
                            )}
                            {dep.start_date && (
                              <span>Start: {new Date(dep.start_date).toLocaleDateString()}</span>
                            )}
                            {dep.estimated_arrival && (
                              <span>ETA: {new Date(dep.estimated_arrival).toLocaleDateString()}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Select
                            value={dep.status}
                            onValueChange={(val) => handleDeploymentStatusChange(dep, val)}
                          >
                            <SelectTrigger className="w-full sm:w-[130px] bg-black border-gray-700 text-xs h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-gray-900 border-gray-700">
                              {DEPLOYMENT_STATUSES.map((s) => (
                                <SelectItem key={s} value={s} className="text-xs">
                                  {s.toUpperCase()}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-gray-700 text-gray-400 hover:text-white h-8"
                            onClick={() => openEditDeployment(dep)}
                          >
                            <Edit className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-red-800/50 text-red-400 hover:text-red-300 hover:bg-red-900/20 h-8"
                            onClick={() => handleDeleteDeployment(dep.id)}
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
              <p className="text-gray-400 text-sm">{markers.length} marker(s)</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-gray-700 text-gray-400 hover:text-white"
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
              <div className="text-center text-gray-500 py-12">Loading NATO markers...</div>
            ) : markers.length === 0 ? (
              <div className="text-center text-gray-600 py-12">No NATO markers found. Create your first marker.</div>
            ) : (
              <div className="space-y-3">
                {markers.map((marker) => (
                  <Card key={marker.id} className="bg-black/40 border-gray-800 hover:border-gray-700 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-bold text-white truncate" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                              {marker.title}
                            </h3>
                            <Badge className={AFFILIATION_COLORS[marker.affiliation] || 'bg-gray-600'}>
                              {marker.affiliation?.toUpperCase()}
                            </Badge>
                            <Badge variant="outline" className="border-gray-600 text-gray-300 text-[10px]">
                              {formatLabel(marker.symbol_type || 'unknown')}
                            </Badge>
                            {marker.echelon && marker.echelon !== 'none' && (
                              <Badge variant="outline" className="border-tropic-gold/40 text-tropic-gold text-[10px]">
                                {formatLabel(marker.echelon)}
                              </Badge>
                            )}
                          </div>
                          {marker.description && (
                            <p className="text-gray-400 text-sm mb-2 line-clamp-2">{marker.description}</p>
                          )}
                          <div className="flex flex-wrap gap-4 text-xs text-gray-500">
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
                            className="border-gray-700 text-gray-400 hover:text-white h-8"
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

        {/* ===================== DEPLOYMENT DIALOG ===================== */}
        <Dialog open={deploymentDialogOpen} onOpenChange={(open) => {
          setDeploymentDialogOpen(open);
          if (!open) { setEditingDeployment(null); setDeploymentForm({ ...EMPTY_DEPLOYMENT }); }
        }}>
          <DialogContent className="bg-gray-900 text-white border-gray-800 max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                {editingDeployment ? 'EDIT DEPLOYMENT' : 'CREATE NEW DEPLOYMENT'}
                {deploymentForm.deployment_type === 'allied' && (
                  <Badge variant="outline" className="ml-3 border-blue-500/50 text-blue-400 text-[10px] align-middle">
                    ALLIED
                  </Badge>
                )}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleDeploymentSubmit} className="space-y-4">
              <div>
                <Label>Title *</Label>
                <Input
                  required
                  value={deploymentForm.title}
                  onChange={(e) => setDeploymentForm({ ...deploymentForm, title: e.target.value })}
                  className="bg-black border-gray-700"
                  placeholder="e.g., Operation Pacific Shield"
                />
              </div>

              <div>
                <Label>Description</Label>
                <Textarea
                  rows={3}
                  value={deploymentForm.description}
                  onChange={(e) => setDeploymentForm({ ...deploymentForm, description: e.target.value })}
                  className="bg-black border-gray-700"
                  placeholder="Deployment description"
                />
              </div>

              {deploymentForm.deployment_type === 'allied' && (
                <div>
                  <Label>Unit Name</Label>
                  <Input
                    value={deploymentForm.unit_name}
                    onChange={(e) => setDeploymentForm({ ...deploymentForm, unit_name: e.target.value })}
                    className="bg-black border-gray-700"
                    placeholder="e.g., NATO Response Force, USAF 18th Wing"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Status</Label>
                  <Select
                    value={deploymentForm.status}
                    onValueChange={(val) => setDeploymentForm({ ...deploymentForm, status: val })}
                  >
                    <SelectTrigger className="bg-black border-gray-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-900 border-gray-700">
                      {DEPLOYMENT_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{formatLabel(s)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={deploymentForm.is_active}
                      onChange={(e) => setDeploymentForm({ ...deploymentForm, is_active: e.target.checked })}
                      className="rounded border-gray-700"
                    />
                    Active Deployment
                  </label>
                </div>
              </div>

              {/* Origin */}
              <div className="border border-gray-800 rounded-lg p-3 space-y-3">
                <div className="text-xs text-tropic-gold tracking-wider font-bold">ORIGIN</div>
                {(locationEntities || []).length > 0 && (
                  <div>
                    <Label className="text-[10px] text-gray-500 flex items-center gap-1">
                      <Search className="w-3 h-3" />
                      Pick from existing location
                    </Label>
                    <Select onValueChange={handleEntityPickOrigin}>
                      <SelectTrigger className="bg-black border-gray-700 h-8 text-xs">
                        <SelectValue placeholder="— Manual entry —" />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-900 border-gray-700 max-h-[300px]">
                        <SelectItem value="__manual__" className="text-xs text-gray-400">— Manual entry —</SelectItem>
                        {Object.entries(groupedEntities).map(([type, entities]) => (
                          <React.Fragment key={type}>
                            <div className="px-2 py-1 text-[10px] text-tropic-gold/70 font-bold tracking-wider uppercase border-t border-gray-800 mt-1">
                              {type}
                            </div>
                            {entities.map((entity) => (
                              <SelectItem key={`origin-${type}-${entity.entity_id}`} value={String(entity.entity_id)} className="text-xs">
                                {entity.name} ({entity.latitude?.toFixed(2)}, {entity.longitude?.toFixed(2)})
                              </SelectItem>
                            ))}
                          </React.Fragment>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label>Location Name</Label>
                  <Input
                    value={deploymentForm.start_location_name}
                    onChange={(e) => setDeploymentForm({ ...deploymentForm, start_location_name: e.target.value })}
                    className="bg-black border-gray-700"
                    placeholder="Schofield Barracks, HI"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Latitude</Label>
                    <Input
                      type="number"
                      step="any"
                      value={deploymentForm.start_latitude}
                      onChange={(e) => setDeploymentForm({ ...deploymentForm, start_latitude: e.target.value })}
                      className="bg-black border-gray-700"
                    />
                  </div>
                  <div>
                    <Label>Longitude</Label>
                    <Input
                      type="number"
                      step="any"
                      value={deploymentForm.start_longitude}
                      onChange={(e) => setDeploymentForm({ ...deploymentForm, start_longitude: e.target.value })}
                      className="bg-black border-gray-700"
                    />
                  </div>
                </div>
              </div>

              {/* Destination */}
              <div className="border border-gray-800 rounded-lg p-3 space-y-3">
                <div className="text-xs text-tropic-gold tracking-wider font-bold">DESTINATION</div>
                {(locationEntities || []).length > 0 && (
                  <div>
                    <Label className="text-[10px] text-gray-500 flex items-center gap-1">
                      <Search className="w-3 h-3" />
                      Pick from existing location
                    </Label>
                    <Select onValueChange={handleEntityPickDestination}>
                      <SelectTrigger className="bg-black border-gray-700 h-8 text-xs">
                        <SelectValue placeholder="— Manual entry —" />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-900 border-gray-700 max-h-[300px]">
                        <SelectItem value="__manual__" className="text-xs text-gray-400">— Manual entry —</SelectItem>
                        {Object.entries(groupedEntities).map(([type, entities]) => (
                          <React.Fragment key={type}>
                            <div className="px-2 py-1 text-[10px] text-tropic-gold/70 font-bold tracking-wider uppercase border-t border-gray-800 mt-1">
                              {type}
                            </div>
                            {entities.map((entity) => (
                              <SelectItem key={`dest-${type}-${entity.entity_id}`} value={String(entity.entity_id)} className="text-xs">
                                {entity.name} ({entity.latitude?.toFixed(2)}, {entity.longitude?.toFixed(2)})
                              </SelectItem>
                            ))}
                          </React.Fragment>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label>Destination Name</Label>
                  <Input
                    value={deploymentForm.destination_name}
                    onChange={(e) => setDeploymentForm({ ...deploymentForm, destination_name: e.target.value })}
                    className="bg-black border-gray-700"
                    placeholder="e.g., Camp Humphreys, South Korea"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Latitude</Label>
                    <Input
                      type="number"
                      step="any"
                      value={deploymentForm.destination_latitude}
                      onChange={(e) => setDeploymentForm({ ...deploymentForm, destination_latitude: e.target.value })}
                      className="bg-black border-gray-700"
                    />
                  </div>
                  <div>
                    <Label>Longitude</Label>
                    <Input
                      type="number"
                      step="any"
                      value={deploymentForm.destination_longitude}
                      onChange={(e) => setDeploymentForm({ ...deploymentForm, destination_longitude: e.target.value })}
                      className="bg-black border-gray-700"
                    />
                  </div>
                </div>
              </div>

              {/* Waypoints – intermediate stops */}
              <div className="border border-gray-800 rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-tropic-gold tracking-wider font-bold">WAYPOINTS (Intermediate Stops)</div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-tropic-gold/50 text-tropic-gold hover:bg-tropic-gold/10 h-7 text-xs"
                    onClick={() => setDeploymentForm({
                      ...deploymentForm,
                      waypoints: [...(deploymentForm.waypoints || []), { name: '', latitude: '', longitude: '', description: '', stop_duration_hours: '' }],
                    })}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Stop
                  </Button>
                </div>
                {(deploymentForm.waypoints || []).length === 0 && (
                  <p className="text-xs text-gray-600 italic">No intermediate stops. Add waypoints for multi-leg routes (e.g., a stop in Germany).</p>
                )}
                {(deploymentForm.waypoints || []).map((wp, idx) => (
                  <div key={idx} className="border border-gray-800/60 rounded p-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-tropic-gold font-bold tracking-wider">Stop {idx + 1}</span>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-gray-700 text-gray-400 hover:text-white h-6 w-6 p-0 shrink-0"
                          onClick={() => moveWaypointUp(idx)}
                          disabled={idx === 0}
                        >
                          <ChevronUp className="w-3 h-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-gray-700 text-gray-400 hover:text-white h-6 w-6 p-0 shrink-0"
                          onClick={() => moveWaypointDown(idx)}
                          disabled={idx === (deploymentForm.waypoints || []).length - 1}
                        >
                          <ChevronDown className="w-3 h-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-red-800/50 text-red-400 hover:text-red-300 hover:bg-red-900/20 h-6 w-6 p-0 shrink-0"
                          onClick={() => {
                            const wps = deploymentForm.waypoints.filter((_, i) => i !== idx);
                            setDeploymentForm({ ...deploymentForm, waypoints: wps });
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    {(locationEntities || []).length > 0 && (
                      <div>
                        <Label className="text-[10px] text-gray-500 flex items-center gap-1">
                          <Search className="w-3 h-3" />
                          Use existing location
                        </Label>
                        <Select onValueChange={(val) => handleEntityPickWaypoint(val, idx)}>
                          <SelectTrigger className="bg-black border-gray-700 h-7 text-xs">
                            <SelectValue placeholder="— Manual entry —" />
                          </SelectTrigger>
                          <SelectContent className="bg-gray-900 border-gray-700 max-h-[250px]">
                            <SelectItem value="__manual__" className="text-xs text-gray-400">— Manual entry —</SelectItem>
                            {Object.entries(groupedEntities).map(([type, entities]) => (
                              <React.Fragment key={type}>
                                <div className="px-2 py-1 text-[10px] text-tropic-gold/70 font-bold tracking-wider uppercase border-t border-gray-800 mt-1">
                                  {type}
                                </div>
                                {entities.map((entity) => (
                                  <SelectItem key={`wp${idx}-${type}-${entity.entity_id}`} value={String(entity.entity_id)} className="text-xs">
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
                        <Label className="text-[10px] text-gray-500">Stop Name</Label>
                        <Input
                          value={wp.name || ''}
                          onChange={(e) => {
                            const wps = [...deploymentForm.waypoints];
                            wps[idx] = { ...wps[idx], name: e.target.value };
                            setDeploymentForm({ ...deploymentForm, waypoints: wps });
                          }}
                          className="bg-black border-gray-700 h-8 text-xs"
                          placeholder="e.g., Ramstein, Germany"
                        />
                      </div>
                      <div className="w-24 space-y-1">
                        <Label className="text-[10px] text-gray-500">Lat</Label>
                        <Input
                          type="number"
                          step="any"
                          value={wp.latitude ?? ''}
                          onChange={(e) => {
                            const wps = [...deploymentForm.waypoints];
                            wps[idx] = { ...wps[idx], latitude: e.target.value };
                            setDeploymentForm({ ...deploymentForm, waypoints: wps });
                          }}
                          className="bg-black border-gray-700 h-8 text-xs"
                        />
                      </div>
                      <div className="w-24 space-y-1">
                        <Label className="text-[10px] text-gray-500">Lng</Label>
                        <Input
                          type="number"
                          step="any"
                          value={wp.longitude ?? ''}
                          onChange={(e) => {
                            const wps = [...deploymentForm.waypoints];
                            wps[idx] = { ...wps[idx], longitude: e.target.value };
                            setDeploymentForm({ ...deploymentForm, waypoints: wps });
                          }}
                          className="bg-black border-gray-700 h-8 text-xs"
                        />
                      </div>
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1 space-y-1">
                        <Label className="text-[10px] text-gray-500">Description</Label>
                        <Input
                          value={wp.description || ''}
                          onChange={(e) => {
                            const wps = [...deploymentForm.waypoints];
                            wps[idx] = { ...wps[idx], description: e.target.value };
                            setDeploymentForm({ ...deploymentForm, waypoints: wps });
                          }}
                          className="bg-black border-gray-700 h-8 text-xs"
                          placeholder="Optional description"
                        />
                      </div>
                      <div className="w-28 space-y-1">
                        <Label className="text-[10px] text-gray-500">Stop Duration (h)</Label>
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          value={wp.stop_duration_hours ?? ''}
                          onChange={(e) => {
                            const wps = [...deploymentForm.waypoints];
                            wps[idx] = { ...wps[idx], stop_duration_hours: e.target.value };
                            setDeploymentForm({ ...deploymentForm, waypoints: wps });
                          }}
                          className="bg-black border-gray-700 h-8 text-xs"
                          placeholder="Hours"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Start Date & Time</Label>
                  <Input
                    type="datetime-local"
                    value={deploymentForm.start_date}
                    onChange={(e) => setDeploymentForm({ ...deploymentForm, start_date: e.target.value })}
                    className="bg-black border-gray-700"
                  />
                </div>
                <div>
                  <Label>Estimated Arrival</Label>
                  <Input
                    type="datetime-local"
                    value={deploymentForm.estimated_arrival}
                    onChange={(e) => setDeploymentForm({ ...deploymentForm, estimated_arrival: e.target.value })}
                    className="bg-black border-gray-700"
                  />
                </div>
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea
                  rows={2}
                  value={deploymentForm.notes}
                  onChange={(e) => setDeploymentForm({ ...deploymentForm, notes: e.target.value })}
                  className="bg-black border-gray-700"
                  placeholder="Internal notes"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="border-gray-700 text-gray-400"
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
          <DialogContent className="bg-gray-900 text-white border-gray-800 max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle style={{ fontFamily: 'Rajdhani, sans-serif' }}>
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
                  className="bg-black border-gray-700"
                  placeholder="e.g., Alpha Company Forward Position"
                />
              </div>

              <div>
                <Label>Description</Label>
                <Textarea
                  rows={2}
                  value={markerForm.description}
                  onChange={(e) => setMarkerForm({ ...markerForm, description: e.target.value })}
                  className="bg-black border-gray-700"
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
                    <SelectTrigger className="bg-black border-gray-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-900 border-gray-700 max-h-[300px]">
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
                    <SelectTrigger className="bg-black border-gray-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-900 border-gray-700 max-h-[300px]">
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
                    <SelectTrigger className="bg-black border-gray-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-900 border-gray-700 max-h-[300px]">
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
                  className="bg-black border-gray-700"
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
                    className="bg-black border-gray-700"
                  />
                </div>
                <div>
                  <Label>Longitude</Label>
                  <Input
                    type="number"
                    step="any"
                    value={markerForm.longitude}
                    onChange={(e) => setMarkerForm({ ...markerForm, longitude: e.target.value })}
                    className="bg-black border-gray-700"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="border-gray-700 text-gray-400"
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
          <DialogContent className="bg-gray-900 text-white border-gray-800 max-w-md">
            <DialogHeader>
              <DialogTitle style={{ fontFamily: 'Rajdhani, sans-serif' }}>
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
                  className="bg-black border-gray-700"
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
                    className="bg-black border-gray-700"
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
                    className="bg-black border-gray-700"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="border-gray-700 text-gray-400"
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
    </AdminLayout>
  );
};

export default DeploymentManager;

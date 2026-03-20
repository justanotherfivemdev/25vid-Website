import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, Users, Calendar, Clock, ChevronDown, ChevronUp, CheckCircle, HelpCircle, Shield } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ImageUpload from '@/components/admin/ImageUpload';
import ThreatMap from '@/components/map/ThreatMap';

import { BACKEND_URL, API } from '@/utils/api';

const RSVP_STATUS_CFG = {
  attending: { label: 'ATTENDING', color: 'text-green-400', icon: CheckCircle },
  tentative: { label: 'TENTATIVE', color: 'text-yellow-400', icon: HelpCircle },
  waitlisted: { label: 'WAITLISTED', color: 'text-orange-400', icon: Clock },
};

const resolveImg = (url) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  if (url.startsWith('/uploads/')) return `${BACKEND_URL}/api${url}`;
  return `${BACKEND_URL}${url}`;
};

const RosterPanel = ({ operationId }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/operations/${operationId}/roster`)
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [operationId]);

  if (loading) return <div className="text-sm text-gray-500 py-3 text-center">Loading roster...</div>;
  if (!data) return <div className="text-sm text-gray-600 py-3 text-center">Failed to load roster</div>;

  const { rsvps, counts, mos_summary } = data;

  return (
    <div className="space-y-4 pt-2" data-testid={`roster-panel-${operationId}`}>
      {/* Summary Bar */}
      <div className="flex items-center gap-6 bg-black/40 rounded-lg p-3 border border-gray-800/50">
        <div className="text-center"><div className="text-xl font-bold text-green-400">{counts.attending}</div><div className="text-[9px] text-gray-500 tracking-wider">ATTENDING</div></div>
        <div className="text-center"><div className="text-xl font-bold text-yellow-400">{counts.tentative}</div><div className="text-[9px] text-gray-500 tracking-wider">TENTATIVE</div></div>
        <div className="text-center"><div className="text-xl font-bold text-orange-400">{counts.waitlisted}</div><div className="text-[9px] text-gray-500 tracking-wider">WAITLISTED</div></div>
        <div className="text-center ml-auto"><div className="text-xl font-bold text-gray-300">{counts.total}</div><div className="text-[9px] text-gray-500 tracking-wider">TOTAL</div></div>
      </div>

      {/* MOS Summary */}
      {mos_summary && Object.keys(mos_summary).length > 0 && (
        <div className="bg-black/40 rounded-lg p-3 border border-gray-800/50">
          <div className="text-[10px] text-tropic-gold tracking-wider font-bold mb-2">MANPOWER BY MOS</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(mos_summary).sort((a, b) => b[1] - a[1]).map(([mos, count]) => (
              <div key={mos} className="bg-black/40 border border-gray-800 rounded px-3 py-1.5 text-xs">
                <span className="font-mono text-tropic-gold">{mos}</span>
                <span className="text-white ml-2 font-bold">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Roster Groups */}
      {['attending', 'tentative', 'waitlisted'].map(status => {
        const list = rsvps[status] || [];
        if (list.length === 0) return null;
        const cfg = RSVP_STATUS_CFG[status];
        const Icon = cfg.icon;
        return (
          <div key={status}>
            <div className={`flex items-center gap-2 mb-2 ${cfg.color}`}>
              <Icon className="w-4 h-4" />
              <span className="text-xs font-bold tracking-wider">{cfg.label} ({list.length})</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] text-gray-600 tracking-wider border-b border-gray-800">
                    <th className="text-left py-1.5 px-2">OPERATOR</th>
                    <th className="text-left py-1.5 px-2">RANK</th>
                    <th className="text-left py-1.5 px-2">MOS</th>
                    <th className="text-left py-1.5 px-2">COMPANY</th>
                    <th className="text-left py-1.5 px-2">PLATOON</th>
                    <th className="text-left py-1.5 px-2">BILLET</th>
                    <th className="text-left py-1.5 px-2">ROLE NOTES</th>
                    <th className="text-left py-1.5 px-2">STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r, i) => (
                    <tr key={r.user_id || i} className="border-b border-gray-800/30 hover:bg-gray-800/30 transition-colors" data-testid={`roster-row-${r.user_id}`}>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-2">
                          {r.avatar_url ? (
                            <img src={resolveImg(r.avatar_url)} alt="" className="w-6 h-6 rounded object-cover border border-gray-700" />
                          ) : (
                            <div className="w-6 h-6 rounded bg-gray-800 flex items-center justify-center text-[10px] font-bold text-gray-500">{r.username?.[0]?.toUpperCase()}</div>
                          )}
                          <Link to={`/admin/users/${r.user_id}`} className="hover:text-tropic-gold transition-colors font-medium">{r.username}</Link>
                        </div>
                      </td>
                      <td className="py-2 px-2 text-gray-400">{r.rank || '—'}</td>
                      <td className="py-2 px-2">{r.mos_code ? <span className="text-[10px] text-tropic-gold bg-tropic-gold/10 border border-tropic-gold/30 px-1.5 py-0.5 rounded font-mono">{r.mos_code}</span> : <span className="text-gray-700">—</span>}</td>
                      <td className="py-2 px-2 text-tropic-gold">{r.company || '—'}</td>
                      <td className="py-2 px-2 text-green-400">{r.platoon || '—'}</td>
                      <td className="py-2 px-2 text-tropic-gold">{r.billet || '—'}</td>
                      <td className="py-2 px-2">
                        {r.role_notes ? <Badge variant="outline" className="border-tropic-gold/40 text-tropic-gold text-[10px]">{r.role_notes}</Badge> : <span className="text-gray-700">—</span>}
                      </td>
                      <td className="py-2 px-2 text-gray-500 capitalize text-xs">{r.member_status || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const OperationsManager = () => {
  const [operations, setOperations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingOp, setEditingOp] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [expandedOp, setExpandedOp] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    operation_type: 'combat',
    date: '',
    time: '',
    max_participants: '',
    logo_url: '',
    campaign_id: '',
    objective_id: '',
    theater: '',
    region_label: '',
    grid_ref: '',
    lat: '',
    lng: '',
    severity: 'medium',
    is_public_recruiting: false,
    activity_state: 'planned',
  });

  useEffect(() => {
    fetchOperations();
  }, []);

  const fetchOperations = async () => {
    try {
      const response = await axios.get(`${API}/operations`);
      setOperations(response.data);
    } catch (error) {
      console.error('Error fetching operations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const parsedLat = formData.lat === '' ? null : parseFloat(formData.lat);
      const parsedLng = formData.lng === '' ? null : parseFloat(formData.lng);

      const latValue =
        parsedLat === null || Number.isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90
          ? null
          : parsedLat;

      const lngValue =
        parsedLng === null || Number.isNaN(parsedLng) || parsedLng < -180 || parsedLng > 180
          ? null
          : parsedLng;

      const payload = {
        ...formData,
        max_participants: formData.max_participants ? parseInt(formData.max_participants) : null,
        lat: latValue,
        lng: lngValue,
      };

      if (editingOp) {
        await axios.put(`${API}/admin/operations/${editingOp.id}`, payload);
      } else {
        await axios.post(`${API}/operations`, payload);
      }

      await fetchOperations();
      resetForm();
      setIsDialogOpen(false);
    } catch (error) {
      console.error('Error saving operation:', error);
      alert(error.response?.data?.detail || 'Error saving operation');
    }
  };

  const handleEdit = (op) => {
    setEditingOp(op);
    setFormData({
      title: op.title,
      description: op.description,
      operation_type: op.operation_type,
      date: op.date,
      time: op.time,
      max_participants: op.max_participants || '',
      logo_url: op.logo_url || '',
      campaign_id: op.campaign_id || '',
      objective_id: op.objective_id || '',
      theater: op.theater || '',
      region_label: op.region_label || '',
      grid_ref: op.grid_ref || '',
      lat: op.lat ?? '',
      lng: op.lng ?? '',
      severity: op.severity || 'medium',
      is_public_recruiting: !!op.is_public_recruiting,
      activity_state: op.activity_state || 'planned',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this operation?')) return;
    
    try {
      await axios.delete(`${API}/admin/operations/${id}`);
      // Immediately remove from local state so UI updates even if refetch is slow
      setOperations(prev => prev.filter(op => op.id !== id));
      // Close expanded panel if the deleted operation was expanded
      if (expandedOp === id) setExpandedOp(null);
    } catch (error) {
      console.error('Error deleting operation:', error);
      alert(error.response?.data?.detail || 'Error deleting operation');
      // Refetch to ensure UI is in sync after a failed delete
      await fetchOperations();
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      operation_type: 'combat',
      date: '',
      time: '',
      max_participants: '',
      logo_url: '',
      campaign_id: '',
      objective_id: '',
      theater: '',
      region_label: '',
      grid_ref: '',
      lat: '',
      lng: '',
      severity: 'medium',
      is_public_recruiting: false,
      activity_state: 'planned',
    });
    setEditingOp(null);
  };

  const getTypeColor = (type) => {
    const colors = {
      combat: 'bg-tropic-gold text-black',
      training: 'bg-tropic-gold-dark',
      recon: 'bg-green-600',
      support: 'bg-yellow-600'
    };
    return colors[type] || 'bg-gray-600';
  };

  const previewLat = formData.lat === '' ? null : Number(formData.lat);
  const previewLng = formData.lng === '' ? null : Number(formData.lng);
  const hasPreviewCoords = Number.isFinite(previewLat) && Number.isFinite(previewLng);
  const previewMarkers = hasPreviewCoords
    ? [{
        id: 'operation-preview-marker',
        name: formData.title || 'Operation Marker',
        description: formData.region_label || formData.theater || 'Map placement preview',
        severity: formData.severity || 'medium',
        lat: previewLat,
        lng: previewLng,
      }]
    : [];

  const handleMapPlacement = ({ lat, lng }) => {
    setFormData((prev) => ({
      ...prev,
      lat: lat.toFixed(6),
      lng: lng.toFixed(6),
    }));
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
              OPERATIONS MANAGEMENT
            </h1>
            <p className="text-gray-400 mt-2">Create and manage tactical operations</p>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="bg-tropic-gold hover:bg-tropic-gold-dark text-black">
                <Plus className="w-4 h-4 mr-2" />
                New Operation
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-gray-900 text-white border-gray-800 max-w-2xl">
              <DialogHeader>
                <DialogTitle style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                  {editingOp ? 'Edit Operation' : 'Create New Operation'}
                </DialogTitle>
              </DialogHeader>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Operation Title</Label>
                  <Input
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    className="bg-black border-gray-700"
                    placeholder="e.g., Operation Night Storm"
                  />
                </div>
                
                <div>
                  <Label>Description</Label>
                  <Textarea
                    required
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    className="bg-black border-gray-700"
                    placeholder="Brief description of the operation"
                  />
                </div>
                
                {/* Operation Logo/Badge Field */}
                <div className="space-y-2 border border-tropic-gold/50 p-4 rounded-lg bg-tropic-gold/10">
                  <ImageUpload
                    value={formData.logo_url}
                    onChange={(url) => setFormData({...formData, logo_url: url})}
                    label="Operation Logo/Badge (Optional)"
                    description="Appears on operation card. Identifies country, faction, or region. Recommended: 64x64px PNG with transparency."
                    previewClass="w-12 h-12 object-contain"
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Type</Label>
                    <Select
                      value={formData.operation_type}
                      onValueChange={(value) => setFormData({...formData, operation_type: value})}
                    >
                      <SelectTrigger className="bg-black border-gray-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-900 border-gray-700">
                        <SelectItem value="combat">Combat</SelectItem>
                        <SelectItem value="training">Training</SelectItem>
                        <SelectItem value="recon">Recon</SelectItem>
                        <SelectItem value="support">Support</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label>Max Participants</Label>
                    <Input
                      type="number"
                      value={formData.max_participants}
                      onChange={(e) => setFormData({...formData, max_participants: e.target.value})}
                      className="bg-black border-gray-700"
                      placeholder="Optional"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Date</Label>
                    <Input
                      type="date"
                      required
                      value={formData.date}
                      onChange={(e) => setFormData({...formData, date: e.target.value})}
                      className="bg-black border-gray-700"
                    />
                  </div>
                  
                  <div>
                    <Label>Time</Label>
                    <Input
                      type="time"
                      required
                      value={formData.time}
                      onChange={(e) => setFormData({...formData, time: e.target.value})}
                      className="bg-black border-gray-700"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Campaign ID (optional)</Label>
                    <Input value={formData.campaign_id} onChange={(e) => setFormData({...formData, campaign_id: e.target.value})} className="bg-black border-gray-700" placeholder="Campaign UUID" />
                  </div>
                  <div>
                    <Label>Objective ID (optional)</Label>
                    <Input value={formData.objective_id} onChange={(e) => setFormData({...formData, objective_id: e.target.value})} className="bg-black border-gray-700" placeholder="Objective UUID" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Theater Label</Label>
                    <Input value={formData.theater} onChange={(e) => setFormData({...formData, theater: e.target.value})} className="bg-black border-gray-700" placeholder="e.g., Pacific AO" />
                  </div>
                  <div>
                    <Label>Region Label</Label>
                    <Input value={formData.region_label} onChange={(e) => setFormData({...formData, region_label: e.target.value})} className="bg-black border-gray-700" placeholder="e.g., Manila Corridor" />
                  </div>
                </div>

                <div>
                  <Label>Grid Reference</Label>
                  <Input value={formData.grid_ref} onChange={(e) => setFormData({...formData, grid_ref: e.target.value})} className="bg-black border-gray-700" placeholder="e.g., H7-22" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Latitude</Label>
                    <Input value={formData.lat} onChange={(e) => setFormData({...formData, lat: e.target.value})} className="bg-black border-gray-700" placeholder="14.5995" />
                  </div>
                  <div>
                    <Label>Longitude</Label>
                    <Input value={formData.lng} onChange={(e) => setFormData({...formData, lng: e.target.value})} className="bg-black border-gray-700" placeholder="120.9842" />
                  </div>
                  <div>
                    <Label>Threat Severity</Label>
                    <Select value={formData.severity} onValueChange={(value) => setFormData({...formData, severity: value})}>
                      <SelectTrigger className="bg-black border-gray-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-900 border-gray-700">
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="border border-gray-800 rounded-lg p-3 bg-black/30 space-y-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <Label className="text-tropic-gold">Campaign Map Placement Preview</Label>
                    <span className="text-[11px] text-gray-500">Click map to set coordinates or enter lat/lng manually.</span>
                  </div>
                  <ThreatMap
                    markers={previewMarkers}
                    selectedMarkerId={previewMarkers[0]?.id || null}
                    onMapClick={handleMapPlacement}
                    height="280px"
                  />
                  {hasPreviewCoords ? (
                    <p className="text-[11px] text-gray-500">Preview marker: {previewLat.toFixed(6)}, {previewLng.toFixed(6)}</p>
                  ) : (
                    <p className="text-[11px] text-gray-600">No valid coordinates yet. Click the map to place a marker.</p>
                  )}
                </div>

                <div>
                  <Label>Activity State</Label>
                  <Select value={formData.activity_state} onValueChange={(value) => setFormData({...formData, activity_state: value})}>
                    <SelectTrigger className="bg-black border-gray-700"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-gray-900 border-gray-700">
                      <SelectItem value="planned">Planned</SelectItem>
                      <SelectItem value="ongoing">Ongoing</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input type="checkbox" checked={formData.is_public_recruiting} onChange={(e) => setFormData({...formData, is_public_recruiting: e.target.checked})} />
                  Allow recruiting/public map visibility for this operation
                </label>
                
                <div className="flex justify-end space-x-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                    className="border-gray-700"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-tropic-gold hover:bg-tropic-gold-dark text-black">
                    {editingOp ? 'Update' : 'Create'} Operation
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="text-center py-12">Loading operations...</div>
        ) : operations.length === 0 ? (
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="py-12 text-center text-gray-400">
              No operations yet. Create your first operation!
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {operations.map((op) => {
              const rsvpCount = op.rsvps?.length || 0;
              const attendingCount = op.rsvps?.filter(r => r.status === 'attending').length || 0;
              const isExpanded = expandedOp === op.id;
              return (
                <Card key={op.id} className="bg-gray-900 border-gray-800" data-testid={`op-card-${op.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <span className={`${getTypeColor(op.operation_type)} px-3 py-1 rounded text-xs font-bold uppercase`}>
                            {op.operation_type}
                          </span>
                          <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${op.activity_state === 'ongoing' ? 'bg-tropic-red/20 text-tropic-red border border-tropic-red/40' : op.activity_state === 'completed' ? 'bg-green-700/20 text-green-400 border border-green-700/40' : 'bg-gray-700/40 text-gray-300 border border-gray-700/40'}`}>
                            {op.activity_state || 'planned'}
                          </span>
                          <span className="text-sm text-gray-400">
                            <Users className="inline w-4 h-4 mr-1" />
                            {attendingCount}{op.max_participants ? `/${op.max_participants}` : ''} attending
                            {rsvpCount > attendingCount && <span className="text-gray-600"> ({rsvpCount} total RSVPs)</span>}
                          </span>
                        </div>
                        <CardTitle className="text-2xl" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                          {op.title}
                        </CardTitle>
                        <p className="text-gray-400 mt-2 whitespace-pre-wrap line-clamp-2">{op.description}</p>
                        {(op.theater || op.region_label || op.grid_ref) && (
                          <p className="text-xs text-gray-500 mt-2">{op.theater || 'Theater'}{op.region_label ? ` • ${op.region_label}` : ''}{op.grid_ref ? ` • Grid ${op.grid_ref}` : ''}</p>
                        )}
                        <div className="flex items-center space-x-4 mt-3 text-sm text-gray-500">
                          <span className="flex items-center"><Calendar className="w-4 h-4 mr-1" />{op.date}</span>
                          <span className="flex items-center"><Clock className="w-4 h-4 mr-1" />{op.time}</span>
                        </div>
                      </div>
                      
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setExpandedOp(isExpanded ? null : op.id)}
                          className={`border-gray-700 ${isExpanded ? 'bg-tropic-gold/10 text-tropic-gold border-tropic-gold/40' : ''}`}
                          data-testid={`toggle-roster-${op.id}`}
                        >
                          <Users className="w-4 h-4 mr-1" />
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(op)}
                          className="border-gray-700"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelete(op.id)}
                          className="border-tropic-red/60 text-tropic-red hover:bg-tropic-red/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  {isExpanded && (
                    <CardContent className="border-t border-gray-800 pt-4">
                      <RosterPanel operationId={op.id} />
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default OperationsManager;

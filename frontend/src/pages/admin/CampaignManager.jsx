import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Edit, Trash2, MapPin, Target, ChevronDown, ChevronUp, Calendar, X, Globe } from 'lucide-react';
import CampaignLocationPicker from '@/components/map/CampaignLocationPicker';

import { API } from '@/utils/api';

const STATUSES = [
  { value: 'planning', label: 'PLANNING', color: 'bg-[#111a24] text-[#8a9aa8]' },
  { value: 'active', label: 'ACTIVE', color: 'bg-tropic-red text-white' },
  { value: 'complete', label: 'COMPLETE', color: 'bg-green-700 text-white' },
  { value: 'archived', label: 'ARCHIVED', color: 'bg-[#111a24] text-[#4a6070]' },
];

const OBJ_STATUSES = ['pending', 'in_progress', 'complete', 'failed'];
const PHASE_STATUSES = ['planned', 'active', 'complete'];
const PRIORITIES = ['primary', 'secondary', 'tertiary'];

// Grid coordinate types supported by map.army
const GRID_REF_TYPES = [
  { value: 'none',  label: 'None' },
  { value: 'wgs84', label: 'WGS84' },
  { value: 'mgrs',  label: 'MGRS' },
  { value: 'utm',   label: 'UTM' },
  { value: 'gars',  label: 'GARS' },
  { value: 'bng',   label: 'BNG (UK only)' },
  { value: 'lv95',  label: 'LV95 (CH only)' },
  { value: 'lv03',  label: 'LV03 (CH only)' },
  { value: 'hex',   label: 'Hexagonal Grid' },
];

// Format hints displayed below the grid ref input
const GRID_REF_HINTS = {
  none:  '',
  wgs84: 'e.g. 14.500000, 120.900000',
  mgrs:  'e.g. 33UXP0123456789',
  utm:   'e.g. 33U 401234 5678901',
  gars:  'e.g. 360KK3718',
  bng:   'e.g. TQ 30023 80397 (UK only)',
  lv95:  'e.g. 2600000 1200000 (Switzerland only)',
  lv03:  'e.g. 600000 200000 (Switzerland only)',
  hex:   'e.g. A1-3 (hex grid cell reference)',
};

const statusBadge = (s) => STATUSES.find(st => st.value === s) || STATUSES[0];

/** Returns a placeholder string for the grid ref input based on the selected type. */
const getGridRefPlaceholder = (type) => {
  if (!type || type === 'none') return 'Grid ref (optional)';
  return GRID_REF_HINTS[type] || 'Grid ref';
};

const CampaignManager = () => {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [form, setForm] = useState({
    name: '', description: '', theater: '', status: 'planning',
    situation: '', commander_notes: '', phases: [], objectives: [],
    lat: '', lng: '', region: '', map_description: '', threat_level: 'medium'
  });

  useEffect(() => { fetchCampaigns(); }, []);

  const fetchCampaigns = async () => {
    try {
      const res = await axios.get(`${API}/campaigns`);
      setCampaigns(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const resetForm = () => {
    setForm({ name: '', description: '', theater: '', status: 'planning', situation: '', commander_notes: '', phases: [], objectives: [], lat: '', lng: '', region: '', map_description: '', threat_level: 'medium' });
    setEditing(null);
  };

  const handleEdit = (c) => {
    setEditing(c);
    setForm({
      name: c.name, description: c.description || '', theater: c.theater || '',
      status: c.status, situation: c.situation || '', commander_notes: c.commander_notes || '',
      phases: c.phases || [], objectives: c.objectives || [],
      lat: c.lat ?? '', lng: c.lng ?? '', region: c.region || '',
      map_description: c.map_description || '', threat_level: c.threat_level || 'medium'
    });
    setDialogOpen(true);
  };

  const normalizeCoordinate = (value) => {
    if (value === '' || value === null || value === undefined) {
      return null;
    }
    const num = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(num) ? num : null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        lat: normalizeCoordinate(form.lat),
        lng: normalizeCoordinate(form.lng),
        objectives: (form.objectives || []).map((obj) => ({
          ...obj,
          lat: normalizeCoordinate(obj.lat),
          lng: normalizeCoordinate(obj.lng),
        })),
      };
      if (editing) {
        await axios.put(`${API}/admin/campaigns/${editing.id}`, payload);
      } else {
        await axios.post(`${API}/admin/campaigns`, payload);
      }
      await fetchCampaigns();
      setDialogOpen(false);
      resetForm();
    } catch (e) { alert(e.response?.data?.detail || 'Error saving campaign'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this campaign?')) return;
    try {
      await axios.delete(`${API}/admin/campaigns/${id}`);
      await fetchCampaigns();
    } catch (e) { alert('Delete failed'); }
  };

  // Phase helpers
  const addPhase = () => setForm({ ...form, phases: [...form.phases, { name: '', description: '', status: 'planned', start_date: '', end_date: '' }] });
  const updatePhase = (idx, field, val) => {
    const ph = [...form.phases];
    ph[idx] = { ...ph[idx], [field]: val };
    setForm({ ...form, phases: ph });
  };
  const removePhase = (idx) => setForm({ ...form, phases: form.phases.filter((_, i) => i !== idx) });

  // Objective helpers
  const addObjective = () => setForm({ ...form, objectives: [...form.objectives, { name: '', description: '', status: 'pending', grid_ref: '', grid_ref_type: 'none', assigned_to: '', priority: 'secondary', notes: '', region_label: '', lat: '', lng: '', severity: 'medium', linked_operation_id: '', is_public_recruiting: false }] });
  const updateObj = (idx, field, val) => {
    const ob = [...form.objectives];
    ob[idx] = { ...ob[idx], [field]: val };
    setForm({ ...form, objectives: ob });
  };
  const removeObj = (idx) => setForm({ ...form, objectives: form.objectives.filter((_, i) => i !== idx) });

  return (
    <>
      <div className="space-y-6">
        <div className="relative corner-bracket border border-[rgba(201,162,39,0.15)] bg-[radial-gradient(circle_at_top,rgba(201,162,39,0.06),#050a0e_58%)] px-6 py-7 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#c9a227]" style={{ fontFamily: "'Oswald', sans-serif" }}>Strategic Planning</p>
              <h1 className="mt-3 text-4xl font-black uppercase tracking-[0.12em] text-[#e8c547]" style={{ fontFamily: "'Share Tech', sans-serif" }} data-testid="campaign-manager-title">CAMPAIGNS</h1>
              <p className="mt-2 text-sm text-[#8a9aa8]" style={{ fontFamily: "'Inter', sans-serif" }}>Manage campaigns, phases, and objectives</p>
            </div>
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="bg-tropic-gold hover:bg-tropic-gold-dark text-black" data-testid="new-campaign-btn">
                <Plus className="w-4 h-4 mr-2" />New Campaign
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#0c1117] text-white border-[rgba(201,162,39,0.12)] max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle style={{ fontFamily: "'Share Tech', sans-serif" }}>{editing ? 'Edit Campaign' : 'New Campaign'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><Label>Campaign Name</Label><Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" data-testid="campaign-name-input" /></div>
                  <div><Label>Theater</Label><Input value={form.theater} onChange={e => setForm({ ...form, theater: e.target.value })} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" placeholder="e.g. Pacific AO" data-testid="campaign-theater-input" /></div>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                    <SelectTrigger className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]">
                      {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" data-testid="campaign-desc-input" /></div>
                <div><Label>Situation (SITUP)</Label><Textarea value={form.situation} onChange={e => setForm({ ...form, situation: e.target.value })} rows={3} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] font-mono text-sm" placeholder="Current operational situation..." /></div>
                <div><Label>Commander's Notes</Label><Textarea value={form.commander_notes} onChange={e => setForm({ ...form, commander_notes: e.target.value })} rows={3} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] font-mono text-sm" /></div>

                {/* Phases */}
                <div className="border border-[rgba(201,162,39,0.12)] rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-tropic-gold tracking-wider">PHASES</Label>
                    <Button type="button" size="sm" onClick={addPhase} className="bg-[#111a24] hover:bg-[#111a24]"><Plus className="w-3 h-3 mr-1" />Add Phase</Button>
                  </div>
                  {form.phases.map((p, i) => (
                    <div key={i} className="bg-[#050a0e]/30 rounded p-3 mb-2 space-y-2">
                      {/* Row 1: Name, Description, Status */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <Label className="text-[10px] text-[#4a6070] mb-0.5 block">Phase Name</Label>
                          <Input value={p.name} onChange={e => updatePhase(i, 'name', e.target.value)} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-sm" placeholder="Phase name" />
                        </div>
                        <div>
                          <Label className="text-[10px] text-[#4a6070] mb-0.5 block">Description</Label>
                          <Input value={p.description} onChange={e => updatePhase(i, 'description', e.target.value)} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-sm" placeholder="Description" />
                        </div>
                        <div>
                          <Label className="text-[10px] text-[#4a6070] mb-0.5 block">Status</Label>
                          <Select value={p.status} onValueChange={v => updatePhase(i, 'status', v)}>
                            <SelectTrigger className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]">{PHASE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      </div>
                      {/* Row 2: Start Date, End Date, Remove */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                        <div>
                          <Label className="text-[10px] text-[#4a6070] mb-0.5 block">Start Date</Label>
                          <Input type="date" value={p.start_date || ''} onChange={e => updatePhase(i, 'start_date', e.target.value)} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-sm w-full" />
                        </div>
                        <div>
                          <Label className="text-[10px] text-[#4a6070] mb-0.5 block">End Date</Label>
                          <Input type="date" value={p.end_date || ''} onChange={e => updatePhase(i, 'end_date', e.target.value)} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-sm w-full" />
                        </div>
                        <div className="flex items-end">
                          <Button type="button" size="sm" variant="outline" onClick={() => removePhase(i)} className="border-red-800 text-red-500 w-full mt-auto">
                            <X className="w-3 h-3 mr-1" />Remove Phase
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {form.phases.length === 0 && <p className="text-xs text-[#4a6070]">No phases defined</p>}
                </div>

                {/* Objectives */}
                <div className="border border-[rgba(201,162,39,0.12)] rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-tropic-gold tracking-wider">OBJECTIVES</Label>
                    <Button type="button" size="sm" onClick={addObjective} className="bg-[#111a24] hover:bg-[#111a24]"><Plus className="w-3 h-3 mr-1" />Add Objective</Button>
                  </div>
                  {form.objectives.map((o, i) => (
                    <div key={i} className="bg-[#050a0e]/30 rounded p-3 mb-2 space-y-2">
                      {/* Row 1: Name, Grid Ref Type, Status, Priority, Remove */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] text-[#4a6070] mb-0.5 block">Objective Name</Label>
                          <Input value={o.name} onChange={e => updateObj(i, 'name', e.target.value)} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-sm" placeholder="Objective name" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[10px] text-[#4a6070] mb-0.5 block">Status</Label>
                            <Select value={o.status} onValueChange={v => updateObj(i, 'status', v)}>
                              <SelectTrigger className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]">{OBJ_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-[10px] text-[#4a6070] mb-0.5 block">Priority</Label>
                            <Select value={o.priority} onValueChange={v => updateObj(i, 'priority', v)}>
                              <SelectTrigger className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]">{PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                      {/* Row 2: Grid Ref Type + Grid Ref */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] text-[#4a6070] mb-0.5 block">Coordinate Type</Label>
                          <Select value={o.grid_ref_type || 'none'} onValueChange={v => updateObj(i, 'grid_ref_type', v)}>
                            <SelectTrigger className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]">
                              {GRID_REF_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-[10px] text-[#4a6070] mb-0.5 block">Grid Reference</Label>
                          <Input
                            value={o.grid_ref}
                            onChange={e => updateObj(i, 'grid_ref', e.target.value)}
                            className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-sm"
                            placeholder={getGridRefPlaceholder(o.grid_ref_type)}
                            disabled={!o.grid_ref_type || o.grid_ref_type === 'none'}
                          />
                          {o.grid_ref_type && o.grid_ref_type !== 'none' && GRID_REF_HINTS[o.grid_ref_type] && (
                            <p className="text-[10px] text-[#4a6070] mt-0.5">{GRID_REF_HINTS[o.grid_ref_type]}</p>
                          )}
                        </div>
                      </div>
                      {/* Row 3: Assigned To, Description */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] text-[#4a6070] mb-0.5 block">Assigned To</Label>
                          <Input value={o.assigned_to} onChange={e => updateObj(i, 'assigned_to', e.target.value)} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-sm" placeholder="Unit / element" />
                        </div>
                        <div>
                          <Label className="text-[10px] text-[#4a6070] mb-0.5 block">Description</Label>
                          <Input value={o.description} onChange={e => updateObj(i, 'description', e.target.value)} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-sm" placeholder="Description" />
                        </div>
                      </div>
                      {/* Row 4: Region Label, Linked Op */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] text-[#4a6070] mb-0.5 block">Region Label</Label>
                          <Input value={o.region_label || ''} onChange={e => updateObj(i, 'region_label', e.target.value)} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-sm" placeholder="Region label (optional)" />
                        </div>
                        <div>
                          <Label className="text-[10px] text-[#4a6070] mb-0.5 block">Linked Operation ID</Label>
                          <Input value={o.linked_operation_id || ''} onChange={e => updateObj(i, 'linked_operation_id', e.target.value)} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-sm" placeholder="Linked operation ID (optional)" />
                        </div>
                      </div>
                      {/* Row 5: Lat, Lng, Severity */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        <div>
                          <Label className="text-[10px] text-[#4a6070] mb-0.5 block">Latitude</Label>
                          <Input value={o.lat ?? ''} onChange={e => updateObj(i, 'lat', e.target.value)} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-sm" placeholder="Latitude" />
                        </div>
                        <div>
                          <Label className="text-[10px] text-[#4a6070] mb-0.5 block">Longitude</Label>
                          <Input value={o.lng ?? ''} onChange={e => updateObj(i, 'lng', e.target.value)} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-sm" placeholder="Longitude" />
                        </div>
                        <div>
                          <Label className="text-[10px] text-[#4a6070] mb-0.5 block">Severity</Label>
                          <Select value={o.severity || 'medium'} onValueChange={v => updateObj(i, 'severity', v)}>
                            <SelectTrigger className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]">
                              <SelectItem value="low">low</SelectItem>
                              <SelectItem value="medium">medium</SelectItem>
                              <SelectItem value="high">high</SelectItem>
                              <SelectItem value="critical">critical</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {/* Row 6: Public recruiting + Remove */}
                      <div className="flex items-center justify-between pt-1">
                        <label className="flex items-center gap-2 text-xs text-[#8a9aa8]">
                          <input type="checkbox" checked={!!o.is_public_recruiting} onChange={e => updateObj(i, 'is_public_recruiting', e.target.checked)} />
                          Public recruiting / world map marker
                        </label>
                        <Button type="button" size="sm" variant="outline" onClick={() => removeObj(i)} className="border-red-800 text-red-500 hover:bg-red-950/30">
                          <X className="w-3 h-3 mr-1" />Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                  {form.objectives.length === 0 && <p className="text-xs text-[#4a6070]">No objectives defined</p>}
                </div>

                {/* Global Threat Map Placement */}
                <div className="border border-tropic-gold/30 rounded-lg p-4 space-y-3">
                  <Label className="text-tropic-gold tracking-wider flex items-center gap-2">
                    <Globe className="w-4 h-4" />GLOBAL THREAT MAP PLACEMENT
                  </Label>
                  <p className="text-xs text-[#4a6070]">Set coordinates to pin this campaign on the Global Threat Map. Click the map to place, or enter manually.</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Latitude</Label>
                      <Input value={form.lat} onChange={e => setForm({ ...form, lat: e.target.value })} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-sm" placeholder="e.g. 14.5" />
                    </div>
                    <div>
                      <Label className="text-xs">Longitude</Label>
                      <Input value={form.lng} onChange={e => setForm({ ...form, lng: e.target.value })} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-sm" placeholder="e.g. 120.9" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Region Label</Label>
                      <Input value={form.region} onChange={e => setForm({ ...form, region: e.target.value })} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-sm" placeholder="e.g. Pacific AO" />
                    </div>
                    <div>
                      <Label className="text-xs">Threat Level</Label>
                      <Select value={form.threat_level} onValueChange={v => setForm({ ...form, threat_level: v })}>
                        <SelectTrigger className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]">
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Map Description</Label>
                    <Input value={form.map_description} onChange={e => setForm({ ...form, map_description: e.target.value })} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-sm" placeholder="Brief description shown on map popup" />
                  </div>
                  {/* Mini map preview – Mapbox (Global Threat Map style) */}
                  <CampaignLocationPicker
                    lat={form.lat}
                    lng={form.lng}
                    severity={form.threat_level || 'medium'}
                    label={form.name || 'Campaign marker'}
                    onMapClick={({ lat, lng }) => setForm(f => ({ ...f, lat: lat.toFixed(5), lng: lng.toFixed(5) }))}
                    height="240px"
                  />
                  {form.lat !== '' && form.lng !== '' && (
                    <p className="text-xs text-tropic-gold/70 flex items-center gap-2">
                      <MapPin className="w-3 h-3" />Pinned at {Number(form.lat).toFixed(4)}, {Number(form.lng).toFixed(4)}
                      <button type="button" className="text-tropic-red/70 hover:text-tropic-red" onClick={() => setForm(f => ({ ...f, lat: '', lng: '' }))}>
                        <X className="w-3 h-3 inline" /> Clear
                      </button>
                    </p>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="border-[rgba(201,162,39,0.15)]">Cancel</Button>
                  <Button type="submit" className="bg-tropic-gold hover:bg-tropic-gold-dark text-black" data-testid="campaign-submit-btn">{editing ? 'Update' : 'Create'} Campaign</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {/* Campaign Cards */}
        {loading ? (
          <div className="text-center py-12 text-[#4a6070]">Loading campaigns...</div>
        ) : campaigns.length === 0 ? (
          <Card className="bg-[#0c1117] border-[rgba(201,162,39,0.12)]">
            <CardContent className="py-12 text-center text-[#8a9aa8]">
              <MapPin className="w-12 h-12 mx-auto mb-4 opacity-30" />
              No campaigns. Create your first campaign to track operations.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {campaigns.map(c => {
              const sb = statusBadge(c.status);
              const isExpanded = expanded === c.id;
              const objDone = (c.objectives || []).filter(o => o.status === 'complete').length;
              const phaseActive = (c.phases || []).find(p => p.status === 'active');
              return (
                <Card key={c.id} className="bg-[#0c1117] border-[rgba(201,162,39,0.12)]" data-testid={`campaign-card-${c.id}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className={`${sb.color} text-[10px] tracking-wider`}>{sb.label}</Badge>
                          {c.theater && <Badge variant="outline" className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8] text-[10px]">{c.theater}</Badge>}
                          {phaseActive && <Badge variant="outline" className="border-tropic-gold/50 text-tropic-gold text-[10px]">Phase: {phaseActive.name}</Badge>}
                        </div>
                        <h3 className="text-xl font-bold tracking-wide" style={{ fontFamily: "'Share Tech', sans-serif" }}>{c.name}</h3>
                        <p className="text-sm text-[#4a6070] mt-1 line-clamp-2">{c.description}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-[#4a6070]">
                          <span>{(c.phases || []).length} phases</span>
                          <span><Target className="inline w-3 h-3 mr-1" />{objDone}/{(c.objectives || []).length} objectives</span>
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" variant="outline" onClick={() => setExpanded(isExpanded ? null : c.id)} className={`border-[rgba(201,162,39,0.15)] ${isExpanded ? 'bg-tropic-gold/10 border-tropic-gold/50' : ''}`} data-testid={`expand-campaign-${c.id}`}>
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleEdit(c)} className="border-[rgba(201,162,39,0.15)]"><Edit className="w-4 h-4" /></Button>
                        <Button size="sm" variant="outline" onClick={() => handleDelete(c.id)} className="border-tropic-red/60 text-tropic-red hover:bg-tropic-red/10"><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-[rgba(201,162,39,0.12)] space-y-4">
                        {c.situation && <div><h4 className="text-[10px] text-[#4a6070] tracking-wider mb-1">SITUATION</h4><p className="text-sm text-[#8a9aa8] whitespace-pre-wrap">{c.situation}</p></div>}
                        {c.commander_notes && <div><h4 className="text-[10px] text-[#4a6070] tracking-wider mb-1">CDR NOTES</h4><p className="text-sm text-[#8a9aa8] whitespace-pre-wrap">{c.commander_notes}</p></div>}
                        {(c.phases || []).length > 0 && (
                          <div>
                            <h4 className="text-[10px] text-tropic-gold tracking-wider mb-2">PHASES</h4>
                            <div className="space-y-1">
                              {c.phases.map((p, i) => (
                                <div key={i} className="flex items-center gap-3 bg-[#050a0e]/30 rounded px-3 py-2 text-sm">
                                  <div className={`w-2 h-2 rounded-full ${p.status === 'active' ? 'bg-tropic-red animate-pulse' : p.status === 'complete' ? 'bg-green-500' : 'bg-[#4a6070]'}`}></div>
                                  <span className="font-medium">{p.name}</span>
                                  <span className="text-[#4a6070] text-xs">{p.description}</span>
                                  <span className="ml-auto text-[10px] text-[#4a6070] capitalize">{p.status}</span>
                                  {p.start_date && <span className="text-[10px] text-[#4a6070]"><Calendar className="inline w-2.5 h-2.5 mr-0.5" />{p.start_date}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {(c.objectives || []).length > 0 && (
                          <div>
                            <h4 className="text-[10px] text-tropic-gold tracking-wider mb-2">OBJECTIVES</h4>
                            <div className="space-y-1">
                              {c.objectives.map((o, i) => (
                                <div key={i} className="flex items-center gap-3 bg-[#050a0e]/30 rounded px-3 py-2 text-sm">
                                  <div className={`w-2 h-2 rounded-full ${o.status === 'in_progress' ? 'bg-tropic-gold animate-pulse' : o.status === 'complete' ? 'bg-green-500' : o.status === 'failed' ? 'bg-tropic-red' : 'bg-[#4a6070]'}`}></div>
                                  <Badge variant="outline" className={`text-[9px] ${o.priority === 'primary' ? 'border-tropic-red text-tropic-red' : o.priority === 'secondary' ? 'border-tropic-gold text-tropic-gold' : 'border-[rgba(201,162,39,0.2)] text-[#8a9aa8]'}`}>{o.priority}</Badge>
                                  <span className="font-medium">{o.name}</span>
                                  {o.grid_ref && (
                                    <span className="text-[10px] text-[#4a6070] flex items-center gap-0.5">
                                      <MapPin className="inline w-2.5 h-2.5" />
                                      {o.grid_ref_type && o.grid_ref_type !== 'none'
                                        ? `${(GRID_REF_TYPES.find(t => t.value === o.grid_ref_type) || {}).label || o.grid_ref_type}: `
                                        : ''}{o.grid_ref}
                                    </span>
                                  )}
                                  {o.assigned_to && <span className="text-[10px] text-green-600">{o.assigned_to}</span>}
                                  {o.region_label && <span className="text-[10px] text-blue-400">{o.region_label}</span>}
                                  {(o.lat !== undefined && o.lat !== null && o.lng !== undefined && o.lng !== null) && <span className="text-[10px] text-[#4a6070]">{o.lat}, {o.lng}</span>}
                                  <span className="ml-auto text-[10px] text-[#4a6070] capitalize">{o.status.replace('_', ' ')}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};

export default CampaignManager;

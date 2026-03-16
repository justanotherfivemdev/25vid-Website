import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Edit, Trash2, MapPin, Target, ChevronDown, ChevronUp, Calendar, X } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUSES = [
  { value: 'planning', label: 'PLANNING', color: 'bg-gray-700 text-gray-300' },
  { value: 'active', label: 'ACTIVE', color: 'bg-tropic-red text-white' },
  { value: 'complete', label: 'COMPLETE', color: 'bg-green-700 text-white' },
  { value: 'archived', label: 'ARCHIVED', color: 'bg-gray-800 text-gray-500' },
];

const OBJ_STATUSES = ['pending', 'in_progress', 'complete', 'failed'];
const PHASE_STATUSES = ['planned', 'active', 'complete'];
const PRIORITIES = ['primary', 'secondary', 'tertiary'];

const statusBadge = (s) => STATUSES.find(st => st.value === s) || STATUSES[0];

const CampaignManager = () => {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [form, setForm] = useState({
    name: '', description: '', theater: '', status: 'planning',
    situation: '', commander_notes: '', phases: [], objectives: []
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
    setForm({ name: '', description: '', theater: '', status: 'planning', situation: '', commander_notes: '', phases: [], objectives: [] });
    setEditing(null);
  };

  const handleEdit = (c) => {
    setEditing(c);
    setForm({
      name: c.name, description: c.description || '', theater: c.theater || '',
      status: c.status, situation: c.situation || '', commander_notes: c.commander_notes || '',
      phases: c.phases || [], objectives: c.objectives || []
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
  const addObjective = () => setForm({ ...form, objectives: [...form.objectives, { name: '', description: '', status: 'pending', grid_ref: '', assigned_to: '', priority: 'secondary', notes: '', region_label: '', lat: '', lng: '', severity: 'medium', linked_operation_id: '', is_public_recruiting: false }] });
  const updateObj = (idx, field, val) => {
    const ob = [...form.objectives];
    ob[idx] = { ...ob[idx], [field]: val };
    setForm({ ...form, objectives: ob });
  };
  const removeObj = (idx) => setForm({ ...form, objectives: form.objectives.filter((_, i) => i !== idx) });

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }} data-testid="campaign-manager-title">
              CAMPAIGN THEATER
            </h1>
            <p className="text-gray-400 mt-2">Manage campaigns, operational phases, and objectives</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="bg-amber-700 hover:bg-amber-800" data-testid="new-campaign-btn">
                <Plus className="w-4 h-4 mr-2" />New Campaign
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-gray-900 text-white border-gray-800 max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle style={{ fontFamily: 'Rajdhani, sans-serif' }}>{editing ? 'Edit Campaign' : 'New Campaign'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Campaign Name</Label><Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="bg-black border-gray-700" data-testid="campaign-name-input" /></div>
                  <div><Label>Theater</Label><Input value={form.theater} onChange={e => setForm({ ...form, theater: e.target.value })} className="bg-black border-gray-700" placeholder="e.g. Pacific AO" data-testid="campaign-theater-input" /></div>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                    <SelectTrigger className="bg-black border-gray-700"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-gray-900 border-gray-700">
                      {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} className="bg-black border-gray-700" data-testid="campaign-desc-input" /></div>
                <div><Label>Situation (SITUP)</Label><Textarea value={form.situation} onChange={e => setForm({ ...form, situation: e.target.value })} rows={3} className="bg-black border-gray-700 font-mono text-sm" placeholder="Current operational situation..." /></div>
                <div><Label>Commander's Notes</Label><Textarea value={form.commander_notes} onChange={e => setForm({ ...form, commander_notes: e.target.value })} rows={3} className="bg-black border-gray-700 font-mono text-sm" /></div>

                {/* Phases */}
                <div className="border border-gray-800 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-tropic-gold tracking-wider">PHASES</Label>
                    <Button type="button" size="sm" onClick={addPhase} className="bg-gray-800 hover:bg-gray-700"><Plus className="w-3 h-3 mr-1" />Add Phase</Button>
                  </div>
                  {form.phases.map((p, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 mb-2 items-end">
                      <div className="col-span-3"><Input value={p.name} onChange={e => updatePhase(i, 'name', e.target.value)} className="bg-black border-gray-700 text-sm" placeholder="Phase name" /></div>
                      <div className="col-span-3"><Input value={p.description} onChange={e => updatePhase(i, 'description', e.target.value)} className="bg-black border-gray-700 text-sm" placeholder="Description" /></div>
                      <div className="col-span-2">
                        <Select value={p.status} onValueChange={v => updatePhase(i, 'status', v)}>
                          <SelectTrigger className="bg-black border-gray-700 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-gray-900 border-gray-700">{PHASE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-1.5"><Input type="date" value={p.start_date || ''} onChange={e => updatePhase(i, 'start_date', e.target.value)} className="bg-black border-gray-700 text-xs" /></div>
                      <div className="col-span-1.5"><Input type="date" value={p.end_date || ''} onChange={e => updatePhase(i, 'end_date', e.target.value)} className="bg-black border-gray-700 text-xs" /></div>
                      <div className="col-span-1"><Button type="button" size="sm" variant="outline" onClick={() => removePhase(i)} className="border-red-800 text-red-500 w-full"><X className="w-3 h-3" /></Button></div>
                    </div>
                  ))}
                  {form.phases.length === 0 && <p className="text-xs text-gray-600">No phases defined</p>}
                </div>

                {/* Objectives */}
                <div className="border border-gray-800 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-tropic-gold tracking-wider">OBJECTIVES</Label>
                    <Button type="button" size="sm" onClick={addObjective} className="bg-gray-800 hover:bg-gray-700"><Plus className="w-3 h-3 mr-1" />Add Objective</Button>
                  </div>
                  {form.objectives.map((o, i) => (
                    <div key={i} className="bg-black/30 rounded p-3 mb-2">
                      <div className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-4"><Input value={o.name} onChange={e => updateObj(i, 'name', e.target.value)} className="bg-black border-gray-700 text-sm" placeholder="Objective name" /></div>
                        <div className="col-span-2"><Input value={o.grid_ref} onChange={e => updateObj(i, 'grid_ref', e.target.value)} className="bg-black border-gray-700 text-sm" placeholder="Grid ref" /></div>
                        <div className="col-span-2">
                          <Select value={o.status} onValueChange={v => updateObj(i, 'status', v)}>
                            <SelectTrigger className="bg-black border-gray-700 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent className="bg-gray-900 border-gray-700">{OBJ_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-2">
                          <Select value={o.priority} onValueChange={v => updateObj(i, 'priority', v)}>
                            <SelectTrigger className="bg-black border-gray-700 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent className="bg-gray-900 border-gray-700">{PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-2"><Button type="button" size="sm" variant="outline" onClick={() => removeObj(i)} className="border-red-800 text-red-500 w-full"><X className="w-3 h-3" /></Button></div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <Input value={o.assigned_to} onChange={e => updateObj(i, 'assigned_to', e.target.value)} className="bg-black border-gray-700 text-sm" placeholder="Assigned to (unit/element)" />
                        <Input value={o.description} onChange={e => updateObj(i, 'description', e.target.value)} className="bg-black border-gray-700 text-sm" placeholder="Description" />
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <Input value={o.region_label || ''} onChange={e => updateObj(i, 'region_label', e.target.value)} className="bg-black border-gray-700 text-sm" placeholder="Region label (optional)" />
                        <Input value={o.linked_operation_id || ''} onChange={e => updateObj(i, 'linked_operation_id', e.target.value)} className="bg-black border-gray-700 text-sm" placeholder="Linked operation ID (optional)" />
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        <Input value={o.lat ?? ''} onChange={e => updateObj(i, 'lat', e.target.value)} className="bg-black border-gray-700 text-sm" placeholder="Latitude" />
                        <Input value={o.lng ?? ''} onChange={e => updateObj(i, 'lng', e.target.value)} className="bg-black border-gray-700 text-sm" placeholder="Longitude" />
                        <Select value={o.severity || 'medium'} onValueChange={v => updateObj(i, 'severity', v)}>
                          <SelectTrigger className="bg-black border-gray-700 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-gray-900 border-gray-700">
                            <SelectItem value="low">low</SelectItem>
                            <SelectItem value="medium">medium</SelectItem>
                            <SelectItem value="high">high</SelectItem>
                            <SelectItem value="critical">critical</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <label className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                        <input type="checkbox" checked={!!o.is_public_recruiting} onChange={e => updateObj(i, 'is_public_recruiting', e.target.checked)} />
                        Public recruiting/world map marker
                      </label>
                    </div>
                  ))}
                  {form.objectives.length === 0 && <p className="text-xs text-gray-600">No objectives defined</p>}
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="border-gray-700">Cancel</Button>
                  <Button type="submit" className="bg-amber-700 hover:bg-amber-800" data-testid="campaign-submit-btn">{editing ? 'Update' : 'Create'} Campaign</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Campaign Cards */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading campaigns...</div>
        ) : campaigns.length === 0 ? (
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="py-12 text-center text-gray-400">
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
                <Card key={c.id} className="bg-gray-900 border-gray-800" data-testid={`campaign-card-${c.id}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className={`${sb.color} text-[10px] tracking-wider`}>{sb.label}</Badge>
                          {c.theater && <Badge variant="outline" className="border-gray-700 text-gray-400 text-[10px]">{c.theater}</Badge>}
                          {phaseActive && <Badge variant="outline" className="border-tropic-gold/50 text-tropic-gold text-[10px]">Phase: {phaseActive.name}</Badge>}
                        </div>
                        <h3 className="text-xl font-bold tracking-wide" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{c.name}</h3>
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">{c.description}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
                          <span>{(c.phases || []).length} phases</span>
                          <span><Target className="inline w-3 h-3 mr-1" />{objDone}/{(c.objectives || []).length} objectives</span>
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" variant="outline" onClick={() => setExpanded(isExpanded ? null : c.id)} className={`border-gray-700 ${isExpanded ? 'bg-amber-700/10 border-amber-700/50' : ''}`} data-testid={`expand-campaign-${c.id}`}>
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleEdit(c)} className="border-gray-700"><Edit className="w-4 h-4" /></Button>
                        <Button size="sm" variant="outline" onClick={() => handleDelete(c.id)} className="border-amber-700 text-amber-500 hover:bg-amber-700/10"><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-gray-800 space-y-4">
                        {c.situation && <div><h4 className="text-[10px] text-gray-500 tracking-wider mb-1">SITUATION</h4><p className="text-sm text-gray-400 whitespace-pre-wrap">{c.situation}</p></div>}
                        {c.commander_notes && <div><h4 className="text-[10px] text-gray-500 tracking-wider mb-1">CDR NOTES</h4><p className="text-sm text-gray-400 whitespace-pre-wrap">{c.commander_notes}</p></div>}
                        {(c.phases || []).length > 0 && (
                          <div>
                            <h4 className="text-[10px] text-tropic-gold tracking-wider mb-2">PHASES</h4>
                            <div className="space-y-1">
                              {c.phases.map((p, i) => (
                                <div key={i} className="flex items-center gap-3 bg-black/30 rounded px-3 py-2 text-sm">
                                  <div className={`w-2 h-2 rounded-full ${p.status === 'active' ? 'bg-tropic-red animate-pulse' : p.status === 'complete' ? 'bg-green-500' : 'bg-gray-600'}`}></div>
                                  <span className="font-medium">{p.name}</span>
                                  <span className="text-gray-600 text-xs">{p.description}</span>
                                  <span className="ml-auto text-[10px] text-gray-600 capitalize">{p.status}</span>
                                  {p.start_date && <span className="text-[10px] text-gray-700"><Calendar className="inline w-2.5 h-2.5 mr-0.5" />{p.start_date}</span>}
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
                                <div key={i} className="flex items-center gap-3 bg-black/30 rounded px-3 py-2 text-sm">
                                  <div className={`w-2 h-2 rounded-full ${o.status === 'in_progress' ? 'bg-amber-500 animate-pulse' : o.status === 'complete' ? 'bg-green-500' : o.status === 'failed' ? 'bg-red-500' : 'bg-gray-600'}`}></div>
                                  <Badge variant="outline" className={`text-[9px] ${o.priority === 'primary' ? 'border-tropic-red text-tropic-red' : o.priority === 'secondary' ? 'border-tropic-gold text-tropic-gold' : 'border-gray-600 text-gray-400'}`}>{o.priority}</Badge>
                                  <span className="font-medium">{o.name}</span>
                                  {o.grid_ref && <span className="text-[10px] text-gray-600"><MapPin className="inline w-2.5 h-2.5 mr-0.5" />{o.grid_ref}</span>}
                                  {o.assigned_to && <span className="text-[10px] text-green-600">{o.assigned_to}</span>}
                                  {o.region_label && <span className="text-[10px] text-blue-400">{o.region_label}</span>}
                                  {(o.lat !== undefined && o.lat !== null && o.lng !== undefined && o.lng !== null) && <span className="text-[10px] text-gray-500">{o.lat}, {o.lng}</span>}
                                  <span className="ml-auto text-[10px] text-gray-600 capitalize">{o.status.replace('_', ' ')}</span>
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
    </AdminLayout>
  );
};

export default CampaignManager;

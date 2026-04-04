import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Edit, Trash2, FileText, Search, X, Tag, Eye, ChevronDown, ChevronUp, User, Clock, MapPin } from 'lucide-react';
import ThreatMap from '@/components/map/ThreatMap';

import { API } from '@/utils/api';

const CATEGORIES = [
  { value: 'intel_update', label: 'Intel Update' },
  { value: 'commanders_intent', label: "Commander's Intent" },
  { value: 'operational_order', label: 'Operational Order' },
  { value: 'after_action_report', label: 'After Action Report' },
  { value: 'training_bulletin', label: 'Training Bulletin' },
];

const CLASSIFICATIONS = [
  { value: 'routine', label: 'ROUTINE', color: 'bg-[#111a24] text-[#8a9aa8]' },
  { value: 'priority', label: 'PRIORITY', color: 'bg-tropic-gold-dark text-white' },
  { value: 'immediate', label: 'IMMEDIATE', color: 'bg-orange-700 text-white' },
  { value: 'flash', label: 'FLASH', color: 'bg-tropic-red text-white' },
];

const VISIBILITY_SCOPES = [
  { value: 'members', label: 'Members' },
  { value: 'admin_only', label: 'Admin Only' },
];

const getClassBadge = (c) => CLASSIFICATIONS.find(cl => cl.value === c) || CLASSIFICATIONS[0];
const getCatLabel = (c) => CATEGORIES.find(cat => cat.value === c)?.label || c;

const AckPanel = ({ briefingId }) => {
  const [acks, setAcks] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/admin/intel/${briefingId}/acknowledgments`)
      .then(r => setAcks(r.data))
      .catch(() => setAcks([]))
      .finally(() => setLoading(false));
  }, [briefingId]);

  if (loading) return <div className="text-xs text-[#4a6070] py-2">Loading...</div>;
  if (!acks || acks.length === 0) return <div className="text-xs text-[#4a6070] py-2">No acknowledgments yet</div>;

  return (
    <div className="space-y-1 pt-1" data-testid={`ack-panel-${briefingId}`}>
      {acks.map((a, i) => (
        <div key={i} className="flex items-center justify-between text-xs px-2 py-1.5 bg-[#050a0e]/30 rounded">
          <div className="flex items-center gap-2">
            <User className="w-3 h-3 text-[#4a6070]" />
            <span className="text-[#8a9aa8] font-medium">{a.username}</span>
            {a.rank && <span className="text-[#4a6070]">{a.rank}</span>}
            {a.company && <span className="text-tropic-gold/60">{a.company}</span>}
          </div>
          <span className="text-[#4a6070] flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />{new Date(a.acknowledged_at).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
};

const IntelManager = () => {
  const [briefings, setBriefings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filterCat, setFilterCat] = useState('');
  const [search, setSearch] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [expandedAck, setExpandedAck] = useState(null);
  const [form, setForm] = useState({
    title: '', content: '', category: 'intel_update', classification: 'routine', visibility_scope: 'members', tags: [],
    campaign_id: '', objective_id: '', operation_id: '',
    theater: '', region_label: '', grid_ref: '',
    lat: '', lng: '', severity: 'medium',
  });

  const fetchBriefings = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterCat) params.append('category', filterCat);
      if (search) params.append('search', search);
      const res = await axios.get(`${API}/intel?${params}`);
      setBriefings(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filterCat, search]);

  useEffect(() => { fetchBriefings(); }, [fetchBriefings]);

  const resetForm = () => {
    setForm({
      title: '', content: '', category: 'intel_update', classification: 'routine', visibility_scope: 'members', tags: [],
      campaign_id: '', objective_id: '', operation_id: '', theater: '', region_label: '', grid_ref: '', lat: '', lng: '', severity: 'medium',
    });
    setEditing(null);
    setTagInput('');
  };

  const handleEdit = (b) => {
    setEditing(b);
    setForm({
      title: b.title,
      content: b.content,
      category: b.category,
      classification: b.classification,
      visibility_scope: b.visibility_scope || 'members',
      tags: b.tags || [],
      campaign_id: b.campaign_id || '',
      objective_id: b.objective_id || '',
      operation_id: b.operation_id || '',
      theater: b.theater || '',
      region_label: b.region_label || '',
      grid_ref: b.grid_ref || '',
      lat: b.lat ?? '',
      lng: b.lng ?? '',
      severity: b.severity || 'medium',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        lat: form.lat === '' ? null : Number(form.lat),
        lng: form.lng === '' ? null : Number(form.lng),
      };
      if (editing) {
        await axios.put(`${API}/admin/intel/${editing.id}`, payload);
      } else {
        await axios.post(`${API}/admin/intel`, payload);
      }
      await fetchBriefings();
      setDialogOpen(false);
      resetForm();
    } catch (e) { alert(e.response?.data?.detail || 'Error saving briefing'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this briefing?')) return;
    try {
      await axios.delete(`${API}/admin/intel/${id}`);
      await fetchBriefings();
    } catch (e) { alert('Delete failed'); }
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !form.tags.includes(t)) {
      setForm({ ...form, tags: [...form.tags, t] });
    }
    setTagInput('');
  };

  const removeTag = (tag) => {
    setForm({ ...form, tags: form.tags.filter(t => t !== tag) });
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold" style={{ fontFamily: "'Share Tech', sans-serif" }} data-testid="intel-manager-title">
              INTEL & BRIEFINGS
            </h1>
            <p className="text-[#8a9aa8] mt-2">Manage intelligence updates, orders, and after-action reports</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="bg-tropic-gold hover:bg-tropic-gold-dark text-black" data-testid="new-briefing-btn">
                <Plus className="w-4 h-4 mr-2" />New Briefing
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#0c1117] text-white border-[rgba(201,162,39,0.12)] max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle style={{ fontFamily: "'Share Tech', sans-serif" }}>
                  {editing ? 'Edit Briefing' : 'New Briefing'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Title</Label>
                  <Input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" placeholder="Briefing title" data-testid="intel-title-input" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Category</Label>
                    <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                      <SelectTrigger className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]">
                        {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Classification</Label>
                    <Select value={form.classification} onValueChange={v => setForm({ ...form, classification: v })}>
                      <SelectTrigger className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]">
                        {CLASSIFICATIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Visibility</Label>
                    <Select value={form.visibility_scope} onValueChange={v => setForm({ ...form, visibility_scope: v })}>
                      <SelectTrigger className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]">
                        {VISIBILITY_SCOPES.map(v => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Severity</Label>
                    <Select value={form.severity} onValueChange={v => setForm({ ...form, severity: v })}>
                      <SelectTrigger className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]">
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div><Label>Campaign ID</Label><Input value={form.campaign_id} onChange={e => setForm({ ...form, campaign_id: e.target.value })} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" placeholder="Optional" /></div>
                  <div><Label>Objective ID</Label><Input value={form.objective_id} onChange={e => setForm({ ...form, objective_id: e.target.value })} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" placeholder="Optional" /></div>
                  <div><Label>Operation ID</Label><Input value={form.operation_id} onChange={e => setForm({ ...form, operation_id: e.target.value })} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" placeholder="Optional" /></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div><Label>Theater</Label><Input value={form.theater} onChange={e => setForm({ ...form, theater: e.target.value })} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" placeholder="Pacific" /></div>
                  <div><Label>Region Label</Label><Input value={form.region_label} onChange={e => setForm({ ...form, region_label: e.target.value })} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" placeholder="South China Sea" /></div>
                  <div><Label>Grid Ref</Label><Input value={form.grid_ref} onChange={e => setForm({ ...form, grid_ref: e.target.value })} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" placeholder="G-17" /></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Latitude</Label>
                    <Input type="number" step="any" value={form.lat} onChange={e => setForm({ ...form, lat: e.target.value })} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" placeholder="Optional" />
                  </div>
                  <div>
                    <Label>Longitude</Label>
                    <Input type="number" step="any" value={form.lng} onChange={e => setForm({ ...form, lng: e.target.value })} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" placeholder="Optional" />
                  </div>
                </div>
                {/* Mini map preview — click to place marker */}
                <div className="space-y-1">
                  <Label className="flex items-center gap-1.5 text-tropic-gold">
                    <MapPin className="w-3.5 h-3.5" />
                    Map Placement Preview — click map to set coordinates
                  </Label>
                  <ThreatMap
                    height="260px"
                    markers={
                      form.lat !== '' && form.lng !== '' && !isNaN(Number(form.lat)) && !isNaN(Number(form.lng))
                        ? [{ id: '__preview__', lat: Number(form.lat), lng: Number(form.lng), severity: form.severity || 'medium', name: form.title || 'Intel marker' }]
                        : []
                    }
                    onMapClick={({ lat, lng }) => setForm(f => ({ ...f, lat: lat.toFixed(5), lng: lng.toFixed(5) }))}
                  />
                  {form.lat !== '' && form.lng !== '' && (
                    <p className="text-xs text-tropic-gold/70">
                      Pinned at {Number(form.lat).toFixed(4)}, {Number(form.lng).toFixed(4)}
                      <button type="button" className="ml-2 text-tropic-red/70 hover:text-tropic-red" onClick={() => setForm(f => ({ ...f, lat: '', lng: '' }))}>
                        <X className="w-3 h-3 inline" /> Clear
                      </button>
                    </p>
                  )}
                </div>
                <div>
                  <Label>Content</Label>
                  <Textarea required value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} rows={10} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] font-mono text-sm" placeholder="Briefing content... Paragraph breaks are preserved." data-testid="intel-content-input" />
                </div>
                <div>
                  <Label>Tags</Label>
                  <div className="flex gap-2 mb-2">
                    <Input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] flex-1" placeholder="Add tag and press Enter" data-testid="intel-tag-input" />
                    <Button type="button" onClick={addTag} className="bg-[#111a24] hover:bg-[#4a6070]"><Plus className="w-4 h-4" /></Button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {form.tags.map(t => (
                      <Badge key={t} variant="outline" className="bg-tropic-gold/10 border-tropic-gold/50 text-tropic-gold px-2 py-1 text-xs">
                        {t} <button type="button" onClick={() => removeTag(t)} className="ml-1 hover:text-red-400"><X className="w-3 h-3" /></button>
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="border-[rgba(201,162,39,0.15)]">Cancel</Button>
                  <Button type="submit" className="bg-tropic-gold hover:bg-tropic-gold-dark text-black" data-testid="intel-submit-btn">{editing ? 'Update' : 'Publish'} Briefing</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#4a6070]" />
            <Input value={search} onChange={e => setSearch(e.target.value)} className="bg-[#0c1117] border-[rgba(201,162,39,0.15)] pl-10" placeholder="Search briefings..." data-testid="intel-search" />
          </div>
          <Select value={filterCat || '__all__'} onValueChange={v => setFilterCat(v === '__all__' ? '' : v)}>
            <SelectTrigger className="bg-[#0c1117] border-[rgba(201,162,39,0.15)] w-48"><SelectValue placeholder="All categories" /></SelectTrigger>
            <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]">
              <SelectItem value="__all__">All Categories</SelectItem>
              {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Briefings List */}
        {loading ? (
          <div className="text-center py-12 text-[#4a6070]">Loading briefings...</div>
        ) : briefings.length === 0 ? (
          <Card className="bg-[#0c1117] border-[rgba(201,162,39,0.12)]">
            <CardContent className="py-12 text-center text-[#8a9aa8]">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-30" />
              No briefings found. Create your first intel briefing.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {briefings.map(b => {
              const cls = getClassBadge(b.classification);
              const isAckExpanded = expandedAck === b.id;
              return (
                <Card key={b.id} className="bg-[#0c1117] border-[rgba(201,162,39,0.12)] hover:border-[rgba(201,162,39,0.15)] transition-colors" data-testid={`intel-card-${b.id}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <Badge className={`${cls.color} text-[10px] tracking-wider`}>{cls.label}</Badge>
                          <Badge variant="outline" className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8] text-[10px]">{getCatLabel(b.category)}</Badge>
                          {(b.tags || []).map(t => (
                            <Badge key={t} variant="outline" className="border-tropic-gold/40 text-tropic-gold text-[10px]">
                              <Tag className="w-2.5 h-2.5 mr-1" />{t}
                            </Badge>
                          ))}
                        </div>
                        <h3 className="text-lg font-bold tracking-wide truncate" style={{ fontFamily: "'Share Tech', sans-serif" }}>{b.title}</h3>
                        <p className="text-sm text-[#4a6070] mt-1 line-clamp-2">{b.content}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-[#4a6070]">
                          <span>By {b.author_name}</span>
                          <span>{new Date(b.created_at).toLocaleDateString()}</span>
                          {b.updated_at && <span className="text-tropic-gold/70">(edited)</span>}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0 items-center">
                        <Button size="sm" variant="outline"
                          onClick={() => setExpandedAck(isAckExpanded ? null : b.id)}
                          className={`border-[rgba(201,162,39,0.15)] text-xs ${isAckExpanded ? 'bg-green-900/20 border-green-700' : ''}`}
                          data-testid={`ack-toggle-${b.id}`}>
                          <Eye className="w-3.5 h-3.5 mr-1" />{b.ack_count || 0}
                          {isAckExpanded ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleEdit(b)} className="border-[rgba(201,162,39,0.15)]" data-testid={`edit-intel-${b.id}`}><Edit className="w-4 h-4" /></Button>
                        <Button size="sm" variant="outline" onClick={() => handleDelete(b.id)} className="border-tropic-red/60 text-tropic-red hover:bg-tropic-red/10" data-testid={`delete-intel-${b.id}`}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                    {isAckExpanded && (
                      <div className="mt-3 pt-3 border-t border-[rgba(201,162,39,0.12)]">
                        <AckPanel briefingId={b.id} />
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

export default IntelManager;

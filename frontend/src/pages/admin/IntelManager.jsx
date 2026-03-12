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
import { Plus, Edit, Trash2, FileText, Search, X, Tag, Eye, ChevronDown, ChevronUp, User, Clock } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CATEGORIES = [
  { value: 'intel_update', label: 'Intel Update' },
  { value: 'commanders_intent', label: "Commander's Intent" },
  { value: 'operational_order', label: 'Operational Order' },
  { value: 'after_action_report', label: 'After Action Report' },
  { value: 'training_bulletin', label: 'Training Bulletin' },
];

const CLASSIFICATIONS = [
  { value: 'routine', label: 'ROUTINE', color: 'bg-gray-700 text-gray-300' },
  { value: 'priority', label: 'PRIORITY', color: 'bg-tropic-gold-dark text-white' },
  { value: 'immediate', label: 'IMMEDIATE', color: 'bg-orange-700 text-white' },
  { value: 'flash', label: 'FLASH', color: 'bg-tropic-red text-white' },
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

  if (loading) return <div className="text-xs text-gray-500 py-2">Loading...</div>;
  if (!acks || acks.length === 0) return <div className="text-xs text-gray-600 py-2">No acknowledgments yet</div>;

  return (
    <div className="space-y-1 pt-1" data-testid={`ack-panel-${briefingId}`}>
      {acks.map((a, i) => (
        <div key={i} className="flex items-center justify-between text-xs px-2 py-1.5 bg-black/30 rounded">
          <div className="flex items-center gap-2">
            <User className="w-3 h-3 text-gray-500" />
            <span className="text-gray-300 font-medium">{a.username}</span>
            {a.rank && <span className="text-gray-600">{a.rank}</span>}
            {a.company && <span className="text-tropic-gold/60">{a.company}</span>}
          </div>
          <span className="text-gray-600 flex items-center gap-1">
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
    title: '', content: '', category: 'intel_update', classification: 'routine', tags: []
  });

  useEffect(() => { fetchBriefings(); }, [filterCat, search]);

  const fetchBriefings = async () => {
    try {
      const params = new URLSearchParams();
      if (filterCat) params.append('category', filterCat);
      if (search) params.append('search', search);
      const res = await axios.get(`${API}/intel?${params}`);
      setBriefings(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const resetForm = () => {
    setForm({ title: '', content: '', category: 'intel_update', classification: 'routine', tags: [] });
    setEditing(null);
    setTagInput('');
  };

  const handleEdit = (b) => {
    setEditing(b);
    setForm({ title: b.title, content: b.content, category: b.category, classification: b.classification, tags: b.tags || [] });
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await axios.put(`${API}/admin/intel/${editing.id}`, form);
      } else {
        await axios.post(`${API}/admin/intel`, form);
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
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }} data-testid="intel-manager-title">
              INTEL & BRIEFINGS
            </h1>
            <p className="text-gray-400 mt-2">Manage intelligence updates, orders, and after-action reports</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="bg-amber-700 hover:bg-amber-800" data-testid="new-briefing-btn">
                <Plus className="w-4 h-4 mr-2" />New Briefing
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-gray-900 text-white border-gray-800 max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                  {editing ? 'Edit Briefing' : 'New Briefing'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Title</Label>
                  <Input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="bg-black border-gray-700" placeholder="Briefing title" data-testid="intel-title-input" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Category</Label>
                    <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                      <SelectTrigger className="bg-black border-gray-700"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-gray-900 border-gray-700">
                        {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Classification</Label>
                    <Select value={form.classification} onValueChange={v => setForm({ ...form, classification: v })}>
                      <SelectTrigger className="bg-black border-gray-700"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-gray-900 border-gray-700">
                        {CLASSIFICATIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Content</Label>
                  <Textarea required value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} rows={10} className="bg-black border-gray-700 font-mono text-sm" placeholder="Briefing content... Paragraph breaks are preserved." data-testid="intel-content-input" />
                </div>
                <div>
                  <Label>Tags</Label>
                  <div className="flex gap-2 mb-2">
                    <Input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} className="bg-black border-gray-700 flex-1" placeholder="Add tag and press Enter" data-testid="intel-tag-input" />
                    <Button type="button" onClick={addTag} className="bg-gray-700 hover:bg-gray-600"><Plus className="w-4 h-4" /></Button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {form.tags.map(t => (
                      <Badge key={t} variant="outline" className="bg-amber-900/30 border-amber-700/50 text-amber-300 px-2 py-1 text-xs">
                        {t} <button type="button" onClick={() => removeTag(t)} className="ml-1 hover:text-red-400"><X className="w-3 h-3" /></button>
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="border-gray-700">Cancel</Button>
                  <Button type="submit" className="bg-amber-700 hover:bg-amber-800" data-testid="intel-submit-btn">{editing ? 'Update' : 'Publish'} Briefing</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <Input value={search} onChange={e => setSearch(e.target.value)} className="bg-gray-900 border-gray-700 pl-10" placeholder="Search briefings..." data-testid="intel-search" />
          </div>
          <Select value={filterCat || '__all__'} onValueChange={v => setFilterCat(v === '__all__' ? '' : v)}>
            <SelectTrigger className="bg-gray-900 border-gray-700 w-48"><SelectValue placeholder="All categories" /></SelectTrigger>
            <SelectContent className="bg-gray-900 border-gray-700">
              <SelectItem value="__all__">All Categories</SelectItem>
              {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Briefings List */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading briefings...</div>
        ) : briefings.length === 0 ? (
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="py-12 text-center text-gray-400">
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
                <Card key={b.id} className="bg-gray-900 border-gray-800 hover:border-gray-700 transition-colors" data-testid={`intel-card-${b.id}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <Badge className={`${cls.color} text-[10px] tracking-wider`}>{cls.label}</Badge>
                          <Badge variant="outline" className="border-gray-700 text-gray-400 text-[10px]">{getCatLabel(b.category)}</Badge>
                          {(b.tags || []).map(t => (
                            <Badge key={t} variant="outline" className="border-tropic-gold/40 text-tropic-gold text-[10px]">
                              <Tag className="w-2.5 h-2.5 mr-1" />{t}
                            </Badge>
                          ))}
                        </div>
                        <h3 className="text-lg font-bold tracking-wide truncate" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{b.title}</h3>
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">{b.content}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
                          <span>By {b.author_name}</span>
                          <span>{new Date(b.created_at).toLocaleDateString()}</span>
                          {b.updated_at && <span className="text-amber-600">(edited)</span>}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0 items-center">
                        <Button size="sm" variant="outline"
                          onClick={() => setExpandedAck(isAckExpanded ? null : b.id)}
                          className={`border-gray-700 text-xs ${isAckExpanded ? 'bg-green-900/20 border-green-700' : ''}`}
                          data-testid={`ack-toggle-${b.id}`}>
                          <Eye className="w-3.5 h-3.5 mr-1" />{b.ack_count || 0}
                          {isAckExpanded ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleEdit(b)} className="border-gray-700" data-testid={`edit-intel-${b.id}`}><Edit className="w-4 h-4" /></Button>
                        <Button size="sm" variant="outline" onClick={() => handleDelete(b.id)} className="border-amber-700 text-amber-500 hover:bg-amber-700/10" data-testid={`delete-intel-${b.id}`}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                    {isAckExpanded && (
                      <div className="mt-3 pt-3 border-t border-gray-800">
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
    </AdminLayout>
  );
};

export default IntelManager;

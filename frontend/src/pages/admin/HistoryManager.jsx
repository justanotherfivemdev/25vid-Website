import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, GripVertical } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ImageUpload from '@/components/admin/ImageUpload';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CAMPAIGN_TYPES = [
  { value: 'campaign', label: 'Campaign' },
  { value: 'operation', label: 'Operation' },
  { value: 'milestone', label: 'Milestone' },
];

const resolveImg = (url) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  if (url.startsWith('/uploads/')) return `${BACKEND_URL}/api${url}`;
  return `${BACKEND_URL}${url}`;
};

const HistoryManager = () => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({
    title: '', year: '', description: '', image_url: '',
    campaign_type: 'campaign', sort_order: 0
  });

  useEffect(() => { fetchEntries(); }, []);

  const fetchEntries = async () => {
    try {
      const res = await axios.get(`${API}/unit-history`);
      setEntries(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await axios.put(`${API}/admin/unit-history/${editing.id}`, form);
      } else {
        await axios.post(`${API}/admin/unit-history`, form);
      }
      await fetchEntries();
      resetForm();
      setIsOpen(false);
    } catch (err) {
      alert(err.response?.data?.detail || 'Error saving entry');
    }
  };

  const handleEdit = (entry) => {
    setEditing(entry);
    setForm({
      title: entry.title, year: entry.year, description: entry.description,
      image_url: entry.image_url || '', campaign_type: entry.campaign_type,
      sort_order: entry.sort_order
    });
    setIsOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this history entry?')) return;
    try {
      await axios.delete(`${API}/admin/unit-history/${id}`);
      await fetchEntries();
    } catch (err) { alert('Error deleting'); }
  };

  const resetForm = () => {
    setForm({ title: '', year: '', description: '', image_url: '', campaign_type: 'campaign', sort_order: 0 });
    setEditing(null);
  };

  const typeColor = (t) => ({
    campaign: 'bg-amber-700', operation: 'bg-blue-600', milestone: 'bg-emerald-600'
  }[t] || 'bg-gray-600');

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }} data-testid="history-manager-title">UNIT HISTORY</h1>
            <p className="text-gray-400 mt-2">Manage the 25th Infantry Division timeline</p>
          </div>
          <Dialog open={isOpen} onOpenChange={(o) => { setIsOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="bg-amber-700 hover:bg-amber-800" data-testid="new-history-btn">
                <Plus className="w-4 h-4 mr-2" />Add Entry
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-gray-900 text-white border-gray-800 max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                  {editing ? 'Edit History Entry' : 'Add History Entry'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4" data-testid="history-form">
                <div>
                  <Label>Title</Label>
                  <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="bg-black border-gray-700" placeholder="e.g., Guadalcanal Campaign"
                    data-testid="history-title-input" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Year / Date Range</Label>
                    <Input required value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })}
                      className="bg-black border-gray-700" placeholder="e.g., 1942-1943"
                      data-testid="history-year-input" />
                  </div>
                  <div>
                    <Label>Type</Label>
                    <Select value={form.campaign_type} onValueChange={(v) => setForm({ ...form, campaign_type: v })}>
                      <SelectTrigger className="bg-black border-gray-700" data-testid="history-type-select"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-gray-900 border-gray-700">
                        {CAMPAIGN_TYPES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea required rows={4} value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="bg-black border-gray-700" placeholder="Describe this campaign or milestone..."
                    data-testid="history-description-input" />
                </div>
                <div>
                  <Label>Sort Order</Label>
                  <Input type="number" value={form.sort_order}
                    onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                    className="bg-black border-gray-700" placeholder="Lower = earlier in timeline"
                    data-testid="history-order-input" />
                </div>
                <ImageUpload value={form.image_url} onChange={(url) => setForm({ ...form, image_url: url })}
                  label="Campaign Image (Optional)" description="Upload or paste URL."
                  previewClass="w-full h-48 object-cover" />
                <div className="flex justify-end space-x-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsOpen(false)} className="border-gray-700">Cancel</Button>
                  <Button type="submit" className="bg-amber-700 hover:bg-amber-800" data-testid="history-submit-btn">
                    {editing ? 'Update' : 'Add Entry'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <p className="text-sm text-gray-500">
          Entries are displayed in order of their sort value. Lower numbers appear first on the timeline.
        </p>

        {loading ? <div className="text-center py-12">Loading...</div> : entries.length === 0 ? (
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="py-12 text-center text-gray-400">
              No history entries yet. Add the first chapter of your unit's story.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {entries.map((entry, idx) => (
              <Card key={entry.id} className="bg-gray-900 border-gray-800" data-testid={`history-entry-${entry.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex items-center gap-2 text-gray-600 pt-1">
                      <GripVertical className="w-4 h-4" />
                      <span className="text-xs font-mono w-6 text-center">{entry.sort_order}</span>
                    </div>
                    {entry.image_url && (
                      <img src={resolveImg(entry.image_url)} alt={entry.title}
                        className="w-20 h-20 object-cover rounded border border-gray-700 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={`${typeColor(entry.campaign_type)} text-white text-xs`}>
                          {entry.campaign_type.toUpperCase()}
                        </Badge>
                        <span className="text-amber-500 font-bold text-sm">{entry.year}</span>
                      </div>
                      <h3 className="font-bold text-lg">{entry.title}</h3>
                      <p className="text-gray-400 text-sm line-clamp-2 mt-1 whitespace-pre-wrap">{entry.description}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => handleEdit(entry)}
                        className="border-gray-700" data-testid={`history-edit-${entry.id}`}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDelete(entry.id)}
                        className="border-amber-700 text-amber-500" data-testid={`history-delete-${entry.id}`}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default HistoryManager;

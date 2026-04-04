import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Plus, Edit, Trash2, Clock, User } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import ImageUpload from '@/components/admin/ImageUpload';

import { BACKEND_URL, API } from '@/utils/api';

const TrainingManager = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', instructor: '', schedule: '', duration: '', image_url: '' });

  useEffect(() => { fetchItems(); }, []);

  const fetchItems = async () => {
    try {
      const res = await axios.get(`${API}/training`);
      setItems(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await axios.put(`${API}/admin/training/${editing.id}`, form);
      } else {
        await axios.post(`${API}/training`, form);
      }
      await fetchItems();
      resetForm();
      setIsOpen(false);
    } catch (err) {
      alert(err.response?.data?.detail || 'Error saving training');
    }
  };

  const handleEdit = (item) => {
    setEditing(item);
    setForm({ title: item.title, description: item.description, instructor: item.instructor, schedule: item.schedule, duration: item.duration, image_url: item.image_url || '' });
    setIsOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this training program?')) return;
    try {
      await axios.delete(`${API}/admin/training/${id}`);
      setItems(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      alert(err.response?.data?.detail || 'Error deleting training');
      await fetchItems();
    }
  };

  const resetForm = () => {
    setForm({ title: '', description: '', instructor: '', schedule: '', duration: '', image_url: '' });
    setEditing(null);
  };

  return (
    <>
      <div className="space-y-6">
        {/* Hero banner */}
        <div className="relative corner-bracket border border-[rgba(201,162,39,0.15)] bg-[radial-gradient(circle_at_top,rgba(201,162,39,0.06),#050a0e_58%)] px-6 py-7 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#c9a227]" style={{ fontFamily: "'Oswald', sans-serif" }}>Training Programs</p>
              <h1 className="mt-3 text-4xl font-black uppercase tracking-[0.12em] text-[#e8c547]" style={{ fontFamily: "'Share Tech', sans-serif" }} data-testid="training-manager-title">TRAINING MANAGEMENT</h1>
              <p className="mt-2 text-sm text-[#8a9aa8]" style={{ fontFamily: "'Inter', sans-serif" }}>Create and manage training programs</p>
            </div>
            <Dialog open={isOpen} onOpenChange={(o) => { setIsOpen(o); if (!o) resetForm(); }}>
              <DialogTrigger asChild>
                <Button className="tactical-button bg-[#c9a227] hover:bg-[#e8c547] text-[#050a0e] font-bold text-xs tracking-[0.15em]" style={{ fontFamily: "'Oswald', sans-serif" }} data-testid="new-training-btn"><Plus className="w-4 h-4 mr-2" />New Training</Button>
              </DialogTrigger>
              <DialogContent className="bg-[#0c1117] text-[#d0d8e0] border-[rgba(201,162,39,0.2)] max-w-2xl max-h-[90vh] overflow-y-auto rounded-none">
                <DialogHeader>
                  <DialogTitle className="text-[#e8c547] uppercase tracking-wider" style={{ fontFamily: "'Share Tech', sans-serif" }}>{editing ? 'Edit Training' : 'Create Training Program'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div><Label className="text-xs text-[#8a9aa8] uppercase tracking-wider" style={{ fontFamily: "'Oswald', sans-serif" }}>Title</Label><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-[#d0d8e0] rounded-none" placeholder="e.g., Advanced CQB Training" data-testid="training-title-input" /></div>
                  <div><Label className="text-xs text-[#8a9aa8] uppercase tracking-wider" style={{ fontFamily: "'Oswald', sans-serif" }}>Description</Label><Textarea required rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-[#d0d8e0] rounded-none" data-testid="training-desc-input" /></div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><Label className="text-xs text-[#8a9aa8] uppercase tracking-wider" style={{ fontFamily: "'Oswald', sans-serif" }}>Instructor</Label><Input required value={form.instructor} onChange={(e) => setForm({ ...form, instructor: e.target.value })} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-[#d0d8e0] rounded-none" placeholder="e.g., SGT Miller" data-testid="training-instructor-input" /></div>
                    <div><Label className="text-xs text-[#8a9aa8] uppercase tracking-wider" style={{ fontFamily: "'Oswald', sans-serif" }}>Duration</Label><Input required value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-[#d0d8e0] rounded-none" placeholder="e.g., 2 hours" data-testid="training-duration-input" /></div>
                  </div>
                  <div><Label className="text-xs text-[#8a9aa8] uppercase tracking-wider" style={{ fontFamily: "'Oswald', sans-serif" }}>Schedule</Label><Input required value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-[#d0d8e0] rounded-none" placeholder="e.g., Every Saturday 1800 UTC" data-testid="training-schedule-input" /></div>
                  <div className="border border-[rgba(201,162,39,0.3)] p-4 bg-[rgba(201,162,39,0.04)]">
                    <ImageUpload value={form.image_url} onChange={(url) => setForm({ ...form, image_url: url })} label="Training Image (Optional)" description="Shown on training card. Recommended: 800x450px landscape." previewClass="w-full h-32 object-cover" />
                  </div>
                  <div className="flex justify-end space-x-3 pt-4">
                    <Button type="button" variant="outline" onClick={() => setIsOpen(false)} className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8]">Cancel</Button>
                    <button type="submit" className="tactical-button px-6 py-2 text-xs font-bold uppercase tracking-wider bg-[#111a24] text-[#e8c547] border border-[rgba(201,162,39,0.3)] hover:bg-[rgba(201,162,39,0.08)] hover:border-[rgba(201,162,39,0.5)] transition-colors" style={{ fontFamily: "'Oswald', sans-serif" }} data-testid="training-submit-btn">{editing ? 'Update' : 'Create'}</button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-[#e8c547]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            <span className="animate-pulse">■</span> Loading training programs...
          </div>
        ) : items.length === 0 ? (
          <div className="border border-[rgba(201,162,39,0.12)] bg-[#0c1117] p-12 text-center text-[#4a6070]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>No training programs. Create your first one!</div>
        ) : (
          <div className="grid gap-4">
            {items.map((t) => (
              <div key={t.id} className="relative border border-[rgba(201,162,39,0.12)] bg-[#0c1117] shadow-xl p-5 hover:border-[rgba(201,162,39,0.3)] transition-colors" data-testid={`training-item-${t.id}`}>
                <div className="corner-bracket" />
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-[#e8c547] uppercase tracking-wider" style={{ fontFamily: "'Share Tech', sans-serif" }}>{t.title}</h3>
                    <p className="text-[#8a9aa8] mt-2 whitespace-pre-wrap text-sm" style={{ fontFamily: "'Inter', sans-serif" }}>{t.description}</p>
                    <div className="flex flex-wrap gap-4 mt-3 text-sm text-[#4a6070]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      <span className="flex items-center"><User className="w-4 h-4 mr-1 text-[#e8c547]" />{t.instructor}</span>
                      <span className="flex items-center"><Clock className="w-4 h-4 mr-1 text-[#e8c547]" />{t.duration}</span>
                      <span>{t.schedule}</span>
                    </div>
                  </div>
                  <div className="flex space-x-2 ml-4">
                    <Button size="sm" variant="outline" onClick={() => handleEdit(t)} className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8] hover:text-[#e8c547] hover:border-[rgba(201,162,39,0.3)]"><Edit className="w-4 h-4" /></Button>
                    <Button size="sm" variant="outline" onClick={() => handleDelete(t.id)} className="border-[rgba(255,51,51,0.3)] text-[#ff3333] hover:bg-[rgba(255,51,51,0.08)]"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default TrainingManager;

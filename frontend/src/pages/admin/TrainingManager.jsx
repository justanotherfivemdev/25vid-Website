import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Plus, Edit, Trash2, Clock, User } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import ImageUpload from '@/components/admin/ImageUpload';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

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
    const token = localStorage.getItem('token');
    const config = { headers: { Authorization: `Bearer ${token}` } };
    try {
      if (editing) {
        await axios.put(`${API}/admin/training/${editing.id}`, form, config);
      } else {
        await axios.post(`${API}/training`, form, config);
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
    const token = localStorage.getItem('token');
    try {
      await axios.delete(`${API}/admin/training/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      await fetchItems();
    } catch (err) { alert('Error deleting'); }
  };

  const resetForm = () => {
    setForm({ title: '', description: '', instructor: '', schedule: '', duration: '', image_url: '' });
    setEditing(null);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }} data-testid="training-manager-title">TRAINING MANAGEMENT</h1>
            <p className="text-gray-400 mt-2">Create and manage training programs</p>
          </div>
          <Dialog open={isOpen} onOpenChange={(o) => { setIsOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="bg-amber-700 hover:bg-amber-800" data-testid="new-training-btn"><Plus className="w-4 h-4 mr-2" />New Training</Button>
            </DialogTrigger>
            <DialogContent className="bg-gray-900 text-white border-gray-800 max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle style={{ fontFamily: 'Rajdhani, sans-serif' }}>{editing ? 'Edit Training' : 'Create Training Program'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div><Label>Title</Label><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="bg-black border-gray-700" placeholder="e.g., Advanced CQB Training" data-testid="training-title-input" /></div>
                <div><Label>Description</Label><Textarea required rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="bg-black border-gray-700" data-testid="training-desc-input" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Instructor</Label><Input required value={form.instructor} onChange={(e) => setForm({ ...form, instructor: e.target.value })} className="bg-black border-gray-700" placeholder="e.g., SGT Miller" data-testid="training-instructor-input" /></div>
                  <div><Label>Duration</Label><Input required value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} className="bg-black border-gray-700" placeholder="e.g., 2 hours" data-testid="training-duration-input" /></div>
                </div>
                <div><Label>Schedule</Label><Input required value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} className="bg-black border-gray-700" placeholder="e.g., Every Saturday 1800 UTC" data-testid="training-schedule-input" /></div>
                <div className="border border-blue-700 p-4 rounded-lg bg-blue-900/10">
                  <ImageUpload value={form.image_url} onChange={(url) => setForm({ ...form, image_url: url })} label="Training Image (Optional)" description="Shown on training card. Recommended: 800x450px landscape." previewClass="w-full h-32 object-cover" />
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsOpen(false)} className="border-gray-700">Cancel</Button>
                  <Button type="submit" className="bg-amber-700 hover:bg-amber-800" data-testid="training-submit-btn">{editing ? 'Update' : 'Create'}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? <div className="text-center py-12">Loading...</div> : items.length === 0 ? (
          <Card className="bg-gray-900 border-gray-800"><CardContent className="py-12 text-center text-gray-400">No training programs. Create your first one!</CardContent></Card>
        ) : (
          <div className="grid gap-4">
            {items.map((t) => (
              <Card key={t.id} className="bg-gray-900 border-gray-800" data-testid={`training-item-${t.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-2xl" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{t.title}</CardTitle>
                      <p className="text-gray-400 mt-2">{t.description}</p>
                      <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-500">
                        <span className="flex items-center"><User className="w-4 h-4 mr-1" />{t.instructor}</span>
                        <span className="flex items-center"><Clock className="w-4 h-4 mr-1" />{t.duration}</span>
                        <span>{t.schedule}</span>
                      </div>
                    </div>
                    <div className="flex space-x-2 ml-4">
                      <Button size="sm" variant="outline" onClick={() => handleEdit(t)} className="border-gray-700"><Edit className="w-4 h-4" /></Button>
                      <Button size="sm" variant="outline" onClick={() => handleDelete(t.id)} className="border-amber-700 text-amber-500 hover:bg-amber-700/10"><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default TrainingManager;

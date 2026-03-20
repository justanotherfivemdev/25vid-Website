import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, Image as ImageIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ImageUpload from '@/components/admin/ImageUpload';

import { BACKEND_URL, API } from '@/utils/api';

const resolveImg = (url) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  if (url.startsWith('/uploads/')) return `${BACKEND_URL}/api${url}`;
  return `${BACKEND_URL}${url}`;
};

const CATEGORIES = [
  { value: 'operation', label: 'Operation' },
  { value: 'training', label: 'Training' },
  { value: 'team', label: 'Team' },
  { value: 'equipment', label: 'Equipment' },
];

const GalleryManager = () => {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState({ title: '', image_url: '', category: 'operation' });

  useEffect(() => { fetchImages(); }, []);

  const fetchImages = async () => {
    try {
      const res = await axios.get(`${API}/gallery`);
      setImages(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await axios.put(`${API}/admin/gallery/${editing.id}`, form);
      } else {
        await axios.post(`${API}/gallery`, form);
      }
      await fetchImages();
      resetForm();
      setIsOpen(false);
    } catch (err) {
      alert(err.response?.data?.detail || 'Error saving image');
    }
  };

  const handleEdit = (img) => {
    setEditing(img);
    setForm({ title: img.title, image_url: img.image_url, category: img.category });
    setIsOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this gallery image?')) return;
    try {
      await axios.delete(`${API}/admin/gallery/${id}`);
      // Immediately remove from local state
      setImages(prev => prev.filter(img => img.id !== id));
    } catch (err) {
      alert(err.response?.data?.detail || 'Error deleting image');
      // Refetch to sync state after failed delete
      await fetchImages();
    }
  };

  const resetForm = () => {
    setForm({ title: '', image_url: '', category: 'operation' });
    setEditing(null);
  };

  const filtered = filter === 'all' ? images : images.filter(i => i.category === filter);

  const getCatColor = (c) => ({ operation: 'bg-tropic-red', training: 'bg-tropic-gold-dark', team: 'bg-green-600', equipment: 'bg-gray-600' }[c] || 'bg-gray-600');

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }} data-testid="gallery-manager-title">GALLERY MANAGEMENT</h1>
            <p className="text-gray-400 mt-2">Upload and manage mission photos</p>
          </div>
          <Dialog open={isOpen} onOpenChange={(o) => { setIsOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="bg-tropic-gold hover:bg-tropic-gold-dark text-black" data-testid="new-gallery-btn"><Plus className="w-4 h-4 mr-2" />Add Image</Button>
            </DialogTrigger>
            <DialogContent className="bg-gray-900 text-white border-gray-800 max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle style={{ fontFamily: 'Rajdhani, sans-serif' }}>{editing ? 'Edit Image' : 'Add Gallery Image'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div><Label>Title</Label><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="bg-black border-gray-700" placeholder="e.g., Operation Night Storm - Team Alpha" data-testid="gallery-title-input" /></div>
                <div><Label>Category</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger className="bg-black border-gray-700" data-testid="gallery-category-select"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-gray-900 border-gray-700">
                      {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <ImageUpload value={form.image_url} onChange={(url) => setForm({ ...form, image_url: url })} label="Image" description="Upload a file. Recommended: 600x600px or larger. Max 10MB." previewClass="w-full h-48 object-cover" />
                <div className="flex justify-end space-x-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsOpen(false)} className="border-gray-700">Cancel</Button>
                  <Button type="submit" className="bg-tropic-gold hover:bg-tropic-gold-dark text-black" data-testid="gallery-submit-btn">{editing ? 'Update' : 'Add'}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Category filter */}
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant={filter === 'all' ? 'default' : 'outline'} onClick={() => setFilter('all')} className={filter === 'all' ? 'bg-tropic-gold text-black' : 'border-gray-700'} data-testid="gallery-filter-all">All</Button>
          {CATEGORIES.map(c => (
            <Button key={c.value} size="sm" variant={filter === c.value ? 'default' : 'outline'} onClick={() => setFilter(c.value)} className={filter === c.value ? getCatColor(c.value) : 'border-gray-700'} data-testid={`gallery-filter-${c.value}`}>{c.label}</Button>
          ))}
        </div>

        {loading ? <div className="text-center py-12">Loading...</div> : filtered.length === 0 ? (
          <Card className="bg-gray-900 border-gray-800"><CardContent className="py-12 text-center text-gray-400">No images{filter !== 'all' ? ` in ${filter}` : ''}. Add your first!</CardContent></Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((img) => (
              <Card key={img.id} className="bg-gray-900 border-gray-800 overflow-hidden group" data-testid={`gallery-item-${img.id}`}>
                <div className="aspect-square relative">
                  <img src={resolveImg(img.image_url)} alt={img.title} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleEdit(img)} className="border-white/50 text-white"><Edit className="w-4 h-4" /></Button>
                    <Button size="sm" variant="outline" onClick={() => handleDelete(img.id)} className="border-tropic-red/60 text-tropic-red"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
                <CardContent className="p-3">
                  <p className="font-medium text-sm truncate">{img.title}</p>
                  <Badge className={`${getCatColor(img.category)} text-white text-xs mt-1`}>{img.category}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default GalleryManager;

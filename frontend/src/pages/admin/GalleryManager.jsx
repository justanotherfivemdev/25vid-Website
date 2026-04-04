import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, Image as ImageIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ImageUpload from '@/components/admin/ImageUpload';
import { useAuth } from '@/context/AuthContext';
import { hasPermission, PERMISSIONS } from '@/utils/permissions';

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
  const { user: authUser } = useAuth();
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState({ title: '', image_url: '', category: 'operation' });
  const [removeAllOpen, setRemoveAllOpen] = useState(false);
  const [removingAll, setRemovingAll] = useState(false);

  const canRemoveAll = hasPermission(authUser?.role, PERMISSIONS.FULL_ACCESS);

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

  const handleRemoveAll = async () => {
    setRemovingAll(true);
    try {
      await axios.delete(`${API}/admin/gallery`);
      setImages([]);
      setRemoveAllOpen(false);
    } catch (err) {
      alert(err.response?.data?.detail || 'Error removing all images');
    } finally {
      setRemovingAll(false);
    }
  };

  const resetForm = () => {
    setForm({ title: '', image_url: '', category: 'operation' });
    setEditing(null);
  };

  const filtered = filter === 'all' ? images : images.filter(i => i.category === filter);

  const getCatColor = (c) => ({ operation: 'bg-tropic-red', training: 'bg-tropic-gold-dark', team: 'bg-green-600', equipment: 'bg-[#4a6070]' }[c] || 'bg-[#4a6070]');

  return (
    <>
      <div className="space-y-6">
        <div className="relative corner-bracket border border-[rgba(201,162,39,0.15)] bg-[radial-gradient(circle_at_top,rgba(201,162,39,0.06),#050a0e_58%)] px-6 py-7 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#c9a227]" style={{ fontFamily: "'Oswald', sans-serif" }}>Media Operations</p>
              <h1 className="mt-3 text-4xl font-black uppercase tracking-[0.12em] text-[#e8c547]" style={{ fontFamily: "'Share Tech', sans-serif" }} data-testid="gallery-manager-title">GALLERY MANAGEMENT</h1>
              <p className="mt-2 text-sm text-[#8a9aa8]" style={{ fontFamily: "'Inter', sans-serif" }}>Upload and manage mission photos</p>
            </div>
          <div className="flex items-center gap-2">
            {canRemoveAll && images.length > 0 && (
              <Button
                variant="outline"
                className="border-tropic-red/60 text-tropic-red hover:bg-tropic-red/10"
                onClick={() => setRemoveAllOpen(true)}
                data-testid="gallery-remove-all-btn"
              >
                <Trash2 className="w-4 h-4 mr-2" />Remove All
              </Button>
            )}
            <Dialog open={isOpen} onOpenChange={(o) => { setIsOpen(o); if (!o) resetForm(); }}>
              <DialogTrigger asChild>
                <Button className="bg-tropic-gold hover:bg-tropic-gold-dark text-black" data-testid="new-gallery-btn"><Plus className="w-4 h-4 mr-2" />Add Image</Button>
              </DialogTrigger>
              <DialogContent className="bg-[#0c1117] text-white border-[rgba(201,162,39,0.12)] max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle style={{ fontFamily: "'Share Tech', sans-serif" }}>{editing ? 'Edit Image' : 'Add Gallery Image'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div><Label>Title</Label><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" placeholder="e.g., Operation Night Storm - Team Alpha" data-testid="gallery-title-input" /></div>
                  <div><Label>Category</Label>
                    <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                      <SelectTrigger className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" data-testid="gallery-category-select"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]">
                        {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <ImageUpload value={form.image_url} onChange={(url) => setForm({ ...form, image_url: url })} label="Image" description="Upload a file. Recommended: 600x600px or larger. Max 10MB." previewClass="w-full h-48 object-cover" />
                  <div className="flex justify-end space-x-3 pt-4">
                    <Button type="button" variant="outline" onClick={() => setIsOpen(false)} className="border-[rgba(201,162,39,0.15)]">Cancel</Button>
                    <Button type="submit" className="bg-tropic-gold hover:bg-tropic-gold-dark text-black" data-testid="gallery-submit-btn">{editing ? 'Update' : 'Add'}</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          </div>
        </div>

        {/* Remove All confirmation dialog */}
        <Dialog open={removeAllOpen} onOpenChange={setRemoveAllOpen}>
          <DialogContent className="bg-[#0c1117] text-white border-[rgba(201,162,39,0.12)]">
            <DialogHeader>
              <DialogTitle className="text-tropic-red" style={{ fontFamily: "'Share Tech', sans-serif" }}>REMOVE ALL IMAGES</DialogTitle>
              <DialogDescription className="text-[#8a9aa8]">
                Are you sure you want to delete <strong>ALL {images.length}</strong> gallery images? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setRemoveAllOpen(false)} className="border-[rgba(201,162,39,0.15)]" disabled={removingAll}>Cancel</Button>
              <Button onClick={handleRemoveAll} className="bg-tropic-red hover:bg-tropic-red/80 text-white" disabled={removingAll} data-testid="gallery-confirm-remove-all">
                {removingAll ? 'Removing...' : 'Yes, Remove All'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Category filter */}
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant={filter === 'all' ? 'default' : 'outline'} onClick={() => setFilter('all')} className={filter === 'all' ? 'bg-tropic-gold text-black' : 'border-[rgba(201,162,39,0.15)]'} data-testid="gallery-filter-all">All</Button>
          {CATEGORIES.map(c => (
            <Button key={c.value} size="sm" variant={filter === c.value ? 'default' : 'outline'} onClick={() => setFilter(c.value)} className={filter === c.value ? getCatColor(c.value) : 'border-[rgba(201,162,39,0.15)]'} data-testid={`gallery-filter-${c.value}`}>{c.label}</Button>
          ))}
        </div>

        {loading ? <div className="text-center py-12">Loading...</div> : filtered.length === 0 ? (
          <Card className="bg-[#0c1117] border-[rgba(201,162,39,0.12)]"><CardContent className="py-12 text-center text-[#8a9aa8]">No images{filter !== 'all' ? ` in ${filter}` : ''}. Add your first!</CardContent></Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((img) => (
              <Card key={img.id} className="bg-[#0c1117] border-[rgba(201,162,39,0.12)] overflow-hidden group" data-testid={`gallery-item-${img.id}`}>
                <div className="aspect-square relative">
                  <img src={resolveImg(img.image_url)} alt={img.title} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-[#050a0e]/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
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
    </>
  );
};

export default GalleryManager;

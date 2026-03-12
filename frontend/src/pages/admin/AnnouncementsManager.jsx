import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, Megaphone } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ImageUpload from '@/components/admin/ImageUpload';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AnnouncementsManager = () => {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingAnn, setEditingAnn] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    priority: 'normal',
    badge_url: ''
  });

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    try {
      const response = await axios.get(`${API}/announcements`);
      setAnnouncements(response.data);
    } catch (error) {
      console.error('Error fetching announcements:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {

      if (editingAnn) {
        await axios.put(`${API}/admin/announcements/${editingAnn.id}`, formData);
      } else {
        await axios.post(`${API}/announcements`, formData);
      }

      await fetchAnnouncements();
      resetForm();
      setIsDialogOpen(false);
    } catch (error) {
      console.error('Error saving announcement:', error);
      alert(error.response?.data?.detail || 'Error saving announcement');
    }
  };

  const handleEdit = (ann) => {
    setEditingAnn(ann);
    setFormData({
      title: ann.title,
      content: ann.content,
      priority: ann.priority,
      badge_url: ann.badge_url || ''
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this announcement?')) return;
    try {
      await axios.delete(`${API}/admin/announcements/${id}`);
      await fetchAnnouncements();
    } catch (error) {
      console.error('Error deleting announcement:', error);
      alert('Error deleting announcement');
    }
  };

  const resetForm = () => {
    setFormData({ title: '', content: '', priority: 'normal', badge_url: '' });
    setEditingAnn(null);
  };

  const getPriorityColor = (p) => {
    const c = { urgent: 'bg-tropic-red', high: 'bg-orange-600', normal: 'bg-tropic-gold-dark', low: 'bg-gray-600' };
    return c[p] || 'bg-gray-600';
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }} data-testid="announcements-manager-title">
              ANNOUNCEMENTS MANAGEMENT
            </h1>
            <p className="text-gray-400 mt-2">Create and manage intel announcements</p>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="bg-amber-700 hover:bg-amber-800" data-testid="new-announcement-btn">
                <Plus className="w-4 h-4 mr-2" />
                New Announcement
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-gray-900 text-white border-gray-800 max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                  {editingAnn ? 'Edit Announcement' : 'Create New Announcement'}
                </DialogTitle>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Title</Label>
                  <Input
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="bg-black border-gray-700"
                    placeholder="e.g., New Training Schedule Released"
                    data-testid="announcement-title-input"
                  />
                </div>

                <div>
                  <Label>Content</Label>
                  <Textarea
                    required
                    rows={4}
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    className="bg-black border-gray-700"
                    placeholder="Announcement details..."
                    data-testid="announcement-content-input"
                  />
                </div>

                <div>
                  <Label>Priority</Label>
                  <Select
                    value={formData.priority}
                    onValueChange={(value) => setFormData({ ...formData, priority: value })}
                  >
                    <SelectTrigger className="bg-black border-gray-700" data-testid="announcement-priority-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-900 border-gray-700">
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 border border-tropic-gold/50 p-4 rounded-lg bg-tropic-gold/10">
                  <ImageUpload
                    value={formData.badge_url}
                    onChange={(url) => setFormData({ ...formData, badge_url: url })}
                    label="Announcement Badge/Logo (Optional)"
                    description="Appears on the announcement card in Latest Intel section. Recommended: 64x64px PNG with transparency. Example: faction emblem, unit badge, event logo."
                    previewClass="w-12 h-12 object-contain"
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} className="border-gray-700">
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-amber-700 hover:bg-amber-800" data-testid="announcement-submit-btn">
                    {editingAnn ? 'Update' : 'Create'} Announcement
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="text-center py-12">Loading announcements...</div>
        ) : announcements.length === 0 ? (
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="py-12 text-center text-gray-400">
              No announcements yet. Create your first announcement!
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {announcements.map((ann) => (
              <Card key={ann.id} className="bg-gray-900 border-gray-800" data-testid={`announcement-item-${ann.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <Badge className={`${getPriorityColor(ann.priority)} text-white`}>
                          {ann.priority.toUpperCase()}
                        </Badge>
                        <span className="text-sm text-gray-500">
                          {new Date(ann.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <CardTitle className="text-2xl" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                        {ann.title}
                      </CardTitle>
                      <p className="text-gray-400 mt-2 whitespace-pre-wrap">{ann.content}</p>
                      <div className="flex items-center mt-3 text-sm text-gray-500">
                        <Megaphone className="w-4 h-4 mr-1" />
                        Posted by {ann.author_name}
                        {ann.badge_url && (
                          <img src={ann.badge_url.startsWith('http') ? ann.badge_url : `${BACKEND_URL}${ann.badge_url}`} alt="badge" className="w-6 h-6 ml-3 object-contain" />
                        )}
                      </div>
                    </div>

                    <div className="flex space-x-2">
                      <Button size="sm" variant="outline" onClick={() => handleEdit(ann)} className="border-gray-700" data-testid={`edit-announcement-${ann.id}`}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDelete(ann.id)} className="border-amber-700 text-amber-500 hover:bg-amber-700/10" data-testid={`delete-announcement-${ann.id}`}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
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

export default AnnouncementsManager;

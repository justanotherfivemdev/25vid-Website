import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, MessageSquare, ArrowLeft, Shield, Home, LogOut } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'operations', label: 'Operations' },
  { value: 'training', label: 'Training' },
  { value: 'feedback', label: 'Feedback' },
];

const DiscussionForum = () => {
  const [discussions, setDiscussions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState({ category: 'general', title: '', content: '' });
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => { fetchDiscussions(); }, []);

  const fetchDiscussions = async () => {
    try {
      const res = await axios.get(`${API}/discussions`);
      setDiscussions(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/discussions`, form, { headers: { Authorization: `Bearer ${token}` } });
      await fetchDiscussions();
      setForm({ category: 'general', title: '', content: '' });
      setIsOpen(false);
    } catch (err) {
      alert(err.response?.data?.detail || 'Error creating discussion');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this discussion?')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/admin/discussions/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      await fetchDiscussions();
    } catch (err) { alert('Error deleting'); }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  const filtered = filter === 'all' ? discussions : discussions.filter(d => d.category === filter);

  const getCatColor = (c) => ({ general: 'border-gray-500 text-gray-400', operations: 'border-red-500 text-red-400', training: 'border-blue-500 text-blue-400', feedback: 'border-green-500 text-green-400' }[c] || 'border-gray-500 text-gray-400');

  return (
    <div className="min-h-screen bg-black text-white">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur border-b border-red-900/30">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/hub"><Button size="sm" variant="outline" className="border-gray-700"><ArrowLeft className="w-4 h-4 mr-1" />Hub</Button></Link>
            <h1 className="text-xl font-bold tracking-wider" style={{ fontFamily: 'Rajdhani, sans-serif' }}>DISCUSSION FORUM</h1>
          </div>
          <div className="flex items-center space-x-3">
            {user?.role === 'admin' && <Link to="/admin"><Button size="sm" variant="outline" className="border-red-700 text-red-500 hover:bg-red-700/10"><Shield className="w-4 h-4 mr-1" />Admin</Button></Link>}
            <Link to="/"><Button size="sm" variant="outline" className="border-gray-700"><Home className="w-4 h-4" /></Button></Link>
            <Button size="sm" variant="outline" onClick={handleLogout} className="border-gray-700"><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </nav>

      <div className="pt-20 pb-12 px-6">
        <div className="container mx-auto max-w-5xl space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }} data-testid="discussion-forum-title">UNIT DISCUSSIONS</h2>
              <p className="text-gray-400 mt-1">Share intel, feedback, and coordinate with your unit</p>
            </div>
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
              <DialogTrigger asChild>
                <Button className="bg-red-700 hover:bg-red-800" data-testid="new-discussion-btn"><Plus className="w-4 h-4 mr-2" />New Thread</Button>
              </DialogTrigger>
              <DialogContent className="bg-gray-900 text-white border-gray-800 max-w-lg">
                <DialogHeader><DialogTitle style={{ fontFamily: 'Rajdhani, sans-serif' }}>Start New Discussion</DialogTitle></DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div><Label>Category</Label>
                    <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                      <SelectTrigger className="bg-black border-gray-700" data-testid="discussion-category-select"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-gray-900 border-gray-700">
                        {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Title</Label><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="bg-black border-gray-700" placeholder="Discussion topic..." data-testid="discussion-title-input" /></div>
                  <div><Label>Content</Label><Textarea required rows={4} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} className="bg-black border-gray-700" placeholder="Share your thoughts..." data-testid="discussion-content-input" /></div>
                  <div className="flex justify-end gap-3">
                    <Button type="button" variant="outline" onClick={() => setIsOpen(false)} className="border-gray-700">Cancel</Button>
                    <Button type="submit" className="bg-red-700 hover:bg-red-800" data-testid="discussion-submit-btn">Post</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Category filter */}
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant={filter === 'all' ? 'default' : 'outline'} onClick={() => setFilter('all')} className={filter === 'all' ? 'bg-red-700' : 'border-gray-700'} data-testid="disc-filter-all">All</Button>
            {CATEGORIES.map(c => (
              <Button key={c.value} size="sm" variant={filter === c.value ? 'default' : 'outline'} onClick={() => setFilter(c.value)} className={filter === c.value ? 'bg-gray-700' : 'border-gray-700'} data-testid={`disc-filter-${c.value}`}>{c.label}</Button>
            ))}
          </div>

          {loading ? <div className="text-center py-12">Loading...</div> : filtered.length === 0 ? (
            <Card className="bg-gray-900 border-gray-800"><CardContent className="py-12 text-center text-gray-400">No discussions yet. Start one!</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {filtered.map((d) => (
                <div key={d.id} className="flex items-center gap-2">
                  <Link to={`/hub/discussions/${d.id}`} className="flex-1">
                    <Card className="bg-gray-900 border-gray-800 hover:border-red-700/30 transition-colors" data-testid={`discussion-item-${d.id}`}>
                      <CardContent className="py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className={`text-xs ${getCatColor(d.category)}`}>{d.category}</Badge>
                          <span className="font-medium">{d.title}</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span className="hidden sm:inline">by {d.author_name}</span>
                          <span className="flex items-center"><MessageSquare className="w-3 h-3 mr-1" />{d.replies?.length || 0}</span>
                          <span>{new Date(d.created_at).toLocaleDateString()}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                  {user?.role === 'admin' && (
                    <Button size="sm" variant="outline" onClick={() => handleDelete(d.id)} className="border-red-700 text-red-500 hover:bg-red-700/10 shrink-0" data-testid={`delete-discussion-${d.id}`}>Delete</Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DiscussionForum;

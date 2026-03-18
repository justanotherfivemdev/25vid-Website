import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, MessageSquare, ArrowLeft, Shield, Home, LogOut, Pin, PinOff, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';

import { BACKEND_URL, API } from '@/utils/api';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  // Detect partner mode from URL path
  const isPartnerMode = location.pathname.startsWith('/partner/');
  const hubPath = isPartnerMode ? '/partner' : '/hub';
  const discussionBasePath = isPartnerMode ? '/partner/discussions' : '/hub/discussions';

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
      await axios.post(`${API}/discussions`, form);
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
      await axios.delete(`${API}/admin/discussions/${id}`);
      await fetchDiscussions();
    } catch (err) { alert('Error deleting'); }
  };

  const handleTogglePin = async (id) => {
    try {
      await axios.put(`${API}/admin/discussions/${id}/pin`, {});
      await fetchDiscussions();
    } catch (err) { alert(err.response?.data?.detail || 'Error toggling pin'); }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery || searchQuery.length < 2) return;
    setSearching(true);
    try {
      const res = await axios.get(`${API}/search?q=${encodeURIComponent(searchQuery)}`);
      setSearchResults(res.data.discussions || []);
    } catch (err) { console.error(err); }
    finally { setSearching(false); }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const filtered = filter === 'all' ? discussions : discussions.filter(d => d.category === filter);

  const getCatColor = (c) => ({ general: 'border-gray-500 text-gray-400', operations: 'border-tropic-red text-tropic-red', training: 'border-tropic-gold text-tropic-gold', feedback: 'border-green-500 text-green-400' }[c] || 'border-gray-500 text-gray-400');

  return (
    <div className="min-h-screen bg-black text-white">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/92 backdrop-blur-xl border-b border-tropic-gold/15">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to={hubPath}><Button size="sm" variant="outline" className="border-gray-700"><ArrowLeft className="w-4 h-4 mr-1" />{isPartnerMode ? 'Partner Hub' : 'Hub'}</Button></Link>
            <h1 className="text-xl font-bold tracking-wider" style={{ fontFamily: 'Rajdhani, sans-serif' }}>DISCUSSION FORUM</h1>
          </div>
          <div className="flex items-center space-x-3">
            {!isPartnerMode && user?.role === 'admin' && <Link to="/admin"><Button size="sm" variant="outline" className="border-tropic-gold/60 text-tropic-gold hover:bg-tropic-gold/10"><Shield className="w-4 h-4 mr-1" />Admin</Button></Link>}
            <Link to="/"><Button size="sm" variant="outline" className="border-gray-700"><Home className="w-4 h-4" /></Button></Link>
            <Button size="sm" variant="outline" onClick={handleLogout} className="border-gray-700"><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </nav>

      <div className="pt-20 pb-12 px-6">
        <div className="container mx-auto max-w-5xl space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-3xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }} data-testid="discussion-forum-title">UNIT DISCUSSIONS</h2>
              <p className="text-gray-400 mt-1">Share intel, feedback, and coordinate with your unit</p>
            </div>
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
              <DialogTrigger asChild>
                <Button className="bg-tropic-gold hover:bg-tropic-gold-dark text-black" data-testid="new-discussion-btn"><Plus className="w-4 h-4 mr-2" />New Thread</Button>
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
                    <Button type="submit" className="bg-tropic-gold hover:bg-tropic-gold-dark text-black" data-testid="discussion-submit-btn">Post</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Search bar */}
          <form onSubmit={handleSearch} className="flex gap-2" data-testid="discussion-search-form">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search discussions..."
                className="bg-gray-900 border-gray-700 pl-10"
                data-testid="discussion-search-input"
              />
            </div>
            <Button type="submit" disabled={searching || searchQuery.length < 2} className="bg-tropic-gold hover:bg-tropic-gold-dark text-black" data-testid="discussion-search-btn">
              {searching ? '...' : 'Search'}
            </Button>
            {searchResults && <Button type="button" variant="outline" onClick={clearSearch} className="border-gray-700" data-testid="discussion-search-clear">Clear</Button>}
          </form>

          {/* Category filter */}
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant={filter === 'all' ? 'default' : 'outline'} onClick={() => setFilter('all')} className={filter === 'all' ? 'bg-tropic-gold text-black' : 'border-gray-700'} data-testid="disc-filter-all">All</Button>
            {CATEGORIES.map(c => (
              <Button key={c.value} size="sm" variant={filter === c.value ? 'default' : 'outline'} onClick={() => setFilter(c.value)} className={filter === c.value ? 'bg-gray-700' : 'border-gray-700'} data-testid={`disc-filter-${c.value}`}>{c.label}</Button>
            ))}
          </div>

          {/* Search results */}
          {searchResults ? (
            searchResults.length === 0 ? (
              <Card className="bg-gray-900 border-gray-800"><CardContent className="py-8 text-center text-gray-400">No discussions found for "{searchQuery}".</CardContent></Card>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">{searchResults.length} result(s) found</p>
                {searchResults.map((d) => (
                  <div key={d.id} className="flex items-center gap-2">
                    <Link to={`${discussionBasePath}/${d.id}`} className="flex-1">
                      <Card className={`bg-gray-900 border-gray-800 hover:border-tropic-gold/30 transition-colors ${d.pinned ? 'border-l-2 border-l-tropic-gold' : ''}`} data-testid={`search-discussion-${d.id}`}>
                        <CardContent className="py-4 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {d.pinned && <Pin className="w-3.5 h-3.5 text-yellow-500 shrink-0" />}
                            <Badge variant="outline" className={`text-xs ${getCatColor(d.category)}`}>{d.category}</Badge>
                            <span className="font-medium">{d.title}</span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-500">
                            <span className="hidden sm:inline">by {d.author_name}</span>
                            <span className="flex items-center"><MessageSquare className="w-3 h-3 mr-1" />{d.replies?.length || 0}</span>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  </div>
                ))}
              </div>
            )
          ) : loading ? <div className="text-center py-12">Loading...</div> : filtered.length === 0 ? (
            <Card className="bg-gray-900 border-gray-800"><CardContent className="py-12 text-center text-gray-400">No discussions yet. Start one!</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {filtered.map((d) => (
                <div key={d.id} className="flex items-center gap-2">
                  <Link to={`${discussionBasePath}/${d.id}`} className="flex-1">
                    <Card className={`bg-gray-900 border-gray-800 hover:border-tropic-gold/30 transition-colors ${d.pinned ? 'border-l-2 border-l-tropic-gold bg-gray-900/90' : ''}`} data-testid={`discussion-item-${d.id}`}>
                      <CardContent className="py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {d.pinned && <Pin className="w-3.5 h-3.5 text-yellow-500 shrink-0" />}
                          <Badge variant="outline" className={`text-xs ${getCatColor(d.category)}`}>{d.category}</Badge>
                          <span className="font-medium">{d.title}</span>
                          {d.pinned && <Badge className="bg-yellow-700/30 text-yellow-400 text-[10px] px-1.5">PINNED</Badge>}
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
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => handleTogglePin(d.id)} className={`${d.pinned ? 'border-yellow-700 text-yellow-500 hover:bg-yellow-700/10' : 'border-gray-700 text-gray-400 hover:bg-gray-700/10'}`} title={d.pinned ? 'Unpin thread' : 'Pin thread'} data-testid={`pin-discussion-${d.id}`}>
                        {d.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDelete(d.id)} className="border-tropic-gold/60 text-tropic-gold hover:bg-tropic-gold/10" data-testid={`delete-discussion-${d.id}`}>Del</Button>
                    </div>
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

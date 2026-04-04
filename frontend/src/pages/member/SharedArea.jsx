import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Home, LogOut, Handshake, Megaphone, Target, Users, MessageSquare, Pin, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/context/AuthContext';
import { isStaff } from '@/utils/permissions';
import { API } from '@/utils/api';
import { useMemberLayout } from '@/components/MemberLayout';

const TYPE_ICONS = { announcement: Megaphone, coordination: MessageSquare, joint_operation: Target, planning: Handshake };
const TYPE_COLORS = { announcement: 'bg-tropic-gold/20 text-tropic-gold', coordination: 'bg-blue-500/20 text-blue-400', joint_operation: 'bg-tropic-red/20 text-tropic-red', planning: 'bg-green-500/20 text-green-400' };

const SharedArea = () => {
  const inLayout = useMemberLayout();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [createDialog, setCreateDialog] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', post_type: 'announcement', visibility: 'all', is_pinned: false });

  useEffect(() => { fetchData(); }, [typeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      const params = typeFilter ? `?post_type=${typeFilter}` : '';
      const [postsRes, contactsRes, statsRes] = await Promise.all([
        axios.get(`${API}/shared/posts${params}`),
        axios.get(`${API}/shared/contacts`),
        axios.get(`${API}/shared/stats`),
      ]);
      setPosts(postsRes.data);
      setContacts(contactsRes.data);
      setStats(statsRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/shared/posts`, form);
      setCreateDialog(false);
      setForm({ title: '', content: '', post_type: 'announcement', visibility: 'all', is_pinned: false });
      fetchData();
    } catch (e) { alert(e.response?.data?.detail || 'Failed to create post'); }
  };

  const handleLogout = async () => { await logout(); navigate('/'); };

  if (loading) return <div className="min-h-screen bg-[#050a0e] text-white flex items-center justify-center">Loading...</div>;

  return (
    <div className={inLayout ? '' : 'min-h-screen bg-[#050a0e] text-white'}>
      {!inLayout && (
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#050a0e]/92 backdrop-blur-xl border-b border-tropic-gold/15">
        <div className="container mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/hub"><Button size="sm" variant="outline" className="border-[rgba(201,162,39,0.15)]"><ArrowLeft className="w-4 h-4 mr-1" />Hub</Button></Link>
            <h1 className="text-xl font-bold tracking-widest" style={{ fontFamily: "'Share Tech', sans-serif" }}>SHARED COORDINATION</h1>
          </div>
          <div className="flex items-center space-x-3">
            {isStaff(user?.role) && (
              <Button size="sm" onClick={() => setCreateDialog(true)} className="bg-tropic-gold hover:bg-tropic-gold-light text-black"><Plus className="w-4 h-4 mr-1" />New Post</Button>
            )}
            <Link to="/"><Button size="sm" variant="outline" className="border-[rgba(201,162,39,0.15)]"><Home className="w-4 h-4" /></Button></Link>
            <Button size="sm" variant="outline" onClick={handleLogout} className="border-[rgba(201,162,39,0.15)]"><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </nav>
      )}

      <div className={`${inLayout ? 'pt-4' : 'pt-20'} pb-12 px-4 md:px-6`}>
        <div className="container mx-auto max-w-4xl space-y-6">
          {/* Stats Bar */}
          {stats && (
            <div className="flex flex-wrap gap-3">
              {Object.entries(stats).map(([type, count]) => (
                <button key={type} onClick={() => setTypeFilter(typeFilter === type ? '' : type)}
                  className={`px-3 py-1.5 rounded text-xs border transition-colors ${typeFilter === type ? 'border-tropic-gold bg-tropic-gold/10 text-tropic-gold' : 'border-[rgba(201,162,39,0.12)] text-[#8a9aa8] hover:border-[rgba(201,162,39,0.15)]'}`}>
                  {type.replace(/_/g, ' ').toUpperCase()}: {count}
                </button>
              ))}
            </div>
          )}

          {/* Liaison Contacts */}
          {contacts.length > 0 && (
            <Card className="bg-[#0c1117]/80 border-[rgba(201,162,39,0.12)]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm tracking-wider flex items-center gap-2"><Users className="w-4 h-4 text-tropic-gold" />LIAISON CONTACTS</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {contacts.map(c => (
                    <div key={c.id} className="bg-[#050a0e]/30 border border-[rgba(201,162,39,0.12)] rounded p-3">
                      <div className="font-bold text-sm">{c.name}</div>
                      <div className="text-xs text-tropic-gold">{c.role}</div>
                      <div className="text-xs text-[#4a6070]">{c.unit}</div>
                      {c.discord_username && <div className="text-xs text-[#5865F2] mt-1">@{c.discord_username}</div>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Posts */}
          <div className="space-y-4">
            {posts.length === 0 ? (
              <Card className="bg-[#0c1117]/80 border-[rgba(201,162,39,0.12)]"><CardContent className="py-12 text-center text-[#8a9aa8]">No shared posts yet.</CardContent></Card>
            ) : posts.map(post => {
              const Icon = TYPE_ICONS[post.post_type] || Megaphone;
              return (
                <Card key={post.id} className="bg-[#0c1117]/80 border-[rgba(201,162,39,0.12)]">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Icon className="w-5 h-5 text-tropic-gold mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-bold text-sm">{post.title}</span>
                          {post.is_pinned && <Pin className="w-3 h-3 text-tropic-gold" />}
                          <Badge className={`text-[9px] ${TYPE_COLORS[post.post_type] || 'bg-[#111a24]'}`}>{post.post_type.replace(/_/g, ' ').toUpperCase()}</Badge>
                        </div>
                        <p className="text-xs text-[#8a9aa8] whitespace-pre-wrap">{post.content}</p>
                        <div className="flex items-center gap-3 mt-2 text-[10px] text-[#4a6070]">
                          <span>{post.author_name}</span>
                          {post.author_unit && <span>• {post.author_unit}</span>}
                          <span>• {post.created_at?.split('T')[0]}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Create Dialog */}
          <Dialog open={createDialog} onOpenChange={setCreateDialog}>
            <DialogContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)] text-white">
              <DialogHeader>
                <DialogTitle className="tracking-wider">NEW SHARED POST</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div><Label>Title</Label><Input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" /></div>
                <div><Label>Content</Label><Textarea required value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" rows={4} /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Type</Label>
                    <Select value={form.post_type} onValueChange={v => setForm({ ...form, post_type: v })}>
                      <SelectTrigger className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]">
                        <SelectItem value="announcement">Announcement</SelectItem>
                        <SelectItem value="coordination">Coordination</SelectItem>
                        <SelectItem value="joint_operation">Joint Operation</SelectItem>
                        <SelectItem value="planning">Planning</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Visibility</Label>
                    <Select value={form.visibility} onValueChange={v => setForm({ ...form, visibility: v })}>
                      <SelectTrigger className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]">
                        <SelectItem value="all">All (Shared)</SelectItem>
                        <SelectItem value="25th_only">25th ID Only</SelectItem>
                        <SelectItem value="partners_only">Partners Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button type="submit" className="bg-tropic-gold hover:bg-tropic-gold-light text-black w-full">Publish Post</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
};

export default SharedArea;

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Users, Calendar, Megaphone, MessageSquare, Image, TrendingUp, Star, X } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const resolveImg = (url) => { if (!url) return ''; if (url.startsWith('http')) return url; if (url.startsWith('/uploads/')) return `${BACKEND_URL}/api${url}`; return `${BACKEND_URL}${url}`; };

const AdminDashboard = () => {
  const [stats, setStats] = useState({
    operations: 0,
    announcements: 0,
    discussions: 0,
    gallery: 0,
    users: 0
  });
  const [loading, setLoading] = useState(true);
  const [motw, setMotw] = useState(null);
  const [motwOpen, setMotwOpen] = useState(false);
  const [motwForm, setMotwForm] = useState({ user_id: '', reason: '' });
  const [memberList, setMemberList] = useState([]);
  const [memberSearch, setMemberSearch] = useState('');
  
  useEffect(() => {
    fetchStats();
    fetchMotw();
  }, []);
  
  const fetchStats = async () => {
    try {
      
      const [ops, ann, disc, gal, users] = await Promise.all([
        axios.get(`${API}/operations`),
        axios.get(`${API}/announcements`),
        axios.get(`${API}/discussions`),
        axios.get(`${API}/gallery`),
        axios.get(`${API}/admin/users`)
      ]);
      
      setStats({
        operations: ops.data.length,
        announcements: ann.data.length,
        discussions: disc.data.length,
        gallery: gal.data.length,
        users: users.data.length
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const statCards = [
    { label: 'Total Operations', value: stats.operations, icon: Calendar, color: 'red' },
    { label: 'Announcements', value: stats.announcements, icon: Megaphone, color: 'blue' },
    { label: 'Discussions', value: stats.discussions, icon: MessageSquare, color: 'green' },
    { label: 'Gallery Images', value: stats.gallery, icon: Image, color: 'purple' },
    { label: 'Members', value: stats.users, icon: Users, color: 'yellow' }
  ];

  const fetchMotw = async () => {
    try {
      const res = await axios.get(`${API}/member-of-the-week`);
      setMotw(res.data);
    } catch {}
  };

  const openMotwDialog = async () => {
    try {
      const res = await axios.get(`${API}/admin/users`);
      setMemberList(res.data);
    } catch {}
    setMotwOpen(true);
  };

  const handleSetMotw = async () => {
    if (!motwForm.user_id) return;
    try {
      const res = await axios.put(`${API}/admin/member-of-the-week`, motwForm);
      setMotw(res.data);
      setMotwOpen(false);
      setMotwForm({ user_id: '', reason: '' });
    } catch (err) { alert(err.response?.data?.detail || 'Error'); }
  };

  const handleClearMotw = async () => {
    if (!window.confirm('Clear Member of the Week?')) return;
    try {
      await axios.delete(`${API}/admin/member-of-the-week`);
      setMotw(null);
    } catch {}
  };

  const filteredMembers = memberList.filter(m =>
    m.username?.toLowerCase().includes(memberSearch.toLowerCase()) ||
    m.email?.toLowerCase().includes(memberSearch.toLowerCase())
  );
  
  return (
    <AdminLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-4xl font-bold mb-2" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
            DASHBOARD
          </h1>
          <p className="text-gray-400">Welcome to the 25th Infantry Division Admin Panel</p>
        </div>
        
        {loading ? (
          <div className="text-center py-12">Loading statistics...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {statCards.map((stat, idx) => {
              const Icon = stat.icon;
              return (
                <Card key={idx} className="bg-gray-900 border-gray-800">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-gray-400">
                      {stat.label}
                    </CardTitle>
                    <Icon className={`w-5 h-5 text-${stat.color}-500`} />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                      {stat.value}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        
        {/* Member of the Week Management */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Star className="w-5 h-5 text-amber-500" />Member of the Week</CardTitle>
              <CardDescription>Highlight an outstanding unit member — visible to all in the Hub</CardDescription>
            </div>
            <div className="flex gap-2">
              <Dialog open={motwOpen} onOpenChange={setMotwOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-amber-700 hover:bg-amber-800" onClick={openMotwDialog} data-testid="set-motw-btn">
                    <Star className="w-4 h-4 mr-1" />{motw ? 'Change' : 'Set'}
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-gray-900 text-white border-gray-800 max-w-lg max-h-[80vh] overflow-y-auto">
                  <DialogHeader><DialogTitle style={{ fontFamily: 'Rajdhani, sans-serif' }}>Set Member of the Week</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Search Members</Label>
                      <Input value={memberSearch} onChange={e => setMemberSearch(e.target.value)}
                        placeholder="Search by name or email..." className="bg-black border-gray-700" data-testid="motw-search" />
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1 border border-gray-800 rounded p-2">
                      {filteredMembers.map(m => (
                        <button key={m.id} type="button"
                          onClick={() => setMotwForm({ ...motwForm, user_id: m.id })}
                          className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 transition-colors ${motwForm.user_id === m.id ? 'bg-amber-700/30 border border-amber-600' : 'hover:bg-gray-800'}`}
                          data-testid={`motw-member-${m.id}`}>
                          <span className="font-medium">{m.username}</span>
                          <span className="text-gray-500 text-xs">{m.rank || ''}</span>
                        </button>
                      ))}
                      {filteredMembers.length === 0 && <p className="text-gray-500 text-sm text-center py-2">No members found</p>}
                    </div>
                    <div>
                      <Label>Reason / Citation (optional)</Label>
                      <Textarea rows={3} value={motwForm.reason}
                        onChange={e => setMotwForm({ ...motwForm, reason: e.target.value })}
                        className="bg-black border-gray-700"
                        placeholder="Outstanding performance during Operation Thunderbolt..."
                        data-testid="motw-reason" />
                    </div>
                    <Button disabled={!motwForm.user_id} onClick={handleSetMotw}
                      className="w-full bg-amber-700 hover:bg-amber-800" data-testid="motw-confirm-btn">
                      Confirm Member of the Week
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              {motw && (
                <Button size="sm" variant="outline" className="border-gray-700 text-gray-400" onClick={handleClearMotw} data-testid="clear-motw-btn">
                  <X className="w-4 h-4 mr-1" />Clear
                </Button>
              )}
            </div>
          </CardHeader>
          {motw && (
            <CardContent className="pt-0">
              <div className="flex items-center gap-4 p-3 bg-amber-900/15 rounded-lg border border-amber-700/30">
                <div className="w-12 h-12 rounded-full border-2 border-amber-500 overflow-hidden bg-gray-800 flex items-center justify-center shrink-0">
                  {motw.avatar_url ? (
                    <img src={resolveImg(motw.avatar_url)} alt={motw.username} className="w-full h-full object-cover" />
                  ) : (
                    <Star className="w-6 h-6 text-amber-500" />
                  )}
                </div>
                <div>
                  <div className="font-bold">{motw.username} {motw.rank && <span className="text-gray-400 font-normal text-sm ml-1">({motw.rank})</span>}</div>
                  {motw.reason && <p className="text-sm text-gray-400 mt-0.5 whitespace-pre-wrap">{motw.reason}</p>}
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common administrative tasks</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <a href="/admin/operations" className="p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors text-center">
              <Calendar className="w-8 h-8 mx-auto mb-2 text-amber-500" />
              <div className="font-medium">Manage Operations</div>
            </a>
            <a href="/admin/announcements" className="p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors text-center">
              <Megaphone className="w-8 h-8 mx-auto mb-2 text-tropic-gold" />
              <div className="font-medium">Post Announcement</div>
            </a>
            <a href="/admin/users" className="p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors text-center">
              <Users className="w-8 h-8 mx-auto mb-2 text-yellow-500" />
              <div className="font-medium">Manage Members</div>
            </a>
            <a href="/admin/site-content" className="p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors text-center">
              <TrendingUp className="w-8 h-8 mx-auto mb-2 text-green-500" />
              <div className="font-medium">Edit Site Content</div>
            </a>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
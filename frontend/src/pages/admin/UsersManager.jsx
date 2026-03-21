import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Trash2, Search, ChevronRight, UserPlus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

import { BACKEND_URL, API } from '@/utils/api';
const resolveImg = (url) => { if (!url) return ''; if (url.startsWith('http')) return url; if (url.startsWith('/uploads/')) return `${BACKEND_URL}/api${url}`; return `${BACKEND_URL}${url}`; };
const STATUS_COLORS = { recruit: 'bg-tropic-gold-dark', active: 'bg-green-700', reserve: 'bg-tropic-gold/60', staff: 'bg-purple-700', command: 'bg-tropic-red', inactive: 'bg-gray-700' };

const UsersManager = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [preCreateOpen, setPreCreateOpen] = useState(false);
  const [preCreateForm, setPreCreateForm] = useState({
    username: '', email: '', rank: '', specialization: '', status: 'member', role: 'member',
    company: '', platoon: '', squad: '', billet: '', discord_id: '', discord_username: ''
  });
  const [preCreateMsg, setPreCreateMsg] = useState({ type: '', text: '' });
  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${API}/admin/users`);
      setUsers(response.data);
    } catch (error) { console.error(error); }
    finally { setLoading(false); }
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm('Delete this user permanently?')) return;
    try {
      await axios.delete(`${API}/admin/users/${id}`);
      await fetchUsers();
    } catch (error) { alert(error.response?.data?.detail || 'Error'); }
  };

  const handlePreCreate = async (e) => {
    e.preventDefault();
    setPreCreateMsg({ type: '', text: '' });
    try {
      const payload = { ...preCreateForm };
      Object.keys(payload).forEach(k => { if (payload[k] === '') delete payload[k]; });
      if (!payload.username || !payload.email) {
        setPreCreateMsg({ type: 'error', text: 'Username and email are required.' });
        return;
      }
      const res = await axios.post(`${API}/admin/users/precreate`, payload);
      setPreCreateMsg({ type: 'success', text: res.data.message });
      setPreCreateForm({ username: '', email: '', rank: '', specialization: '', status: 'member', role: 'member', company: '', platoon: '', squad: '', billet: '', discord_id: '', discord_username: '' });
      fetchUsers();
    } catch (e) {
      setPreCreateMsg({ type: 'error', text: e.response?.data?.detail || 'Pre-creation failed.' });
    }
  };

  const filtered = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }} data-testid="users-manager-title">MEMBER MANAGEMENT</h1>
            <p className="text-gray-400 mt-2">{users.length} total members. Click a member to edit their full profile, history, and awards.</p>
          </div>
          <Button onClick={() => setPreCreateOpen(true)} className="bg-tropic-gold hover:bg-tropic-gold-light text-black">
            <UserPlus className="w-4 h-4 mr-2" />Pre-Create Member
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email..." className="bg-gray-900 border-gray-700 pl-10" data-testid="user-search-input" />
        </div>

        {loading ? <div className="text-center py-12">Loading...</div> : filtered.length === 0 ? (
          <Card className="bg-gray-900 border-gray-800"><CardContent className="py-12 text-center text-gray-400">No members found.</CardContent></Card>
        ) : (
          <div className="grid gap-2">
            {filtered.map((u) => (
              <Link to={`/admin/users/${u.id}`} key={u.id}>
                <Card className="bg-gray-900 border-gray-800 hover:border-tropic-gold/25 transition-colors group" data-testid={`user-card-${u.id}`}>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {u.avatar_url ? (
                          <img src={resolveImg(u.avatar_url)} alt="" className="w-9 h-9 rounded-lg object-cover border border-gray-700" />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center text-sm font-bold text-gray-500 border border-gray-700">{u.username[0]?.toUpperCase()}</div>
                        )}
                        <div>
                          <div className="font-bold text-sm tracking-wide group-hover:text-tropic-gold transition-colors" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{u.username}</div>
                          <div className="text-xs text-gray-500">{u.email}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {u.rank && <span className="text-xs text-gray-400 hidden sm:block">{u.rank}</span>}
                        <Badge className={`${STATUS_COLORS[u.status] || 'bg-gray-700'} text-white text-[10px] px-2`}>{(u.status || 'recruit').toUpperCase()}</Badge>
                        {u.role === 'admin' && <Badge className="bg-tropic-gold/20 text-tropic-gold text-[10px]">ADMIN</Badge>}
                        <Button size="sm" variant="ghost" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteUser(u.id); }} className="text-tropic-red hover:bg-tropic-red/10 shrink-0" data-testid={`delete-user-${u.id}`}><Trash2 className="w-3 h-3" /></Button>
                        <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-tropic-gold transition-colors" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
        <Dialog open={preCreateOpen} onOpenChange={setPreCreateOpen}>
          <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="tracking-wider">PRE-CREATE MEMBER ACCOUNT</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-gray-500 mb-2">Create an account for an existing unit member. They can claim it via the login page or by logging in with Discord.</p>
            {preCreateMsg.text && (
              <div className={`text-sm p-2 rounded ${preCreateMsg.type === 'success' ? 'bg-green-900/20 text-green-400 border border-green-700' : 'bg-red-900/20 text-red-400 border border-red-700'}`}>{preCreateMsg.text}</div>
            )}
            <form onSubmit={handlePreCreate} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><Label className="text-xs">Username *</Label><Input required value={preCreateForm.username} onChange={e => setPreCreateForm({...preCreateForm, username: e.target.value})} className="bg-black border-gray-700" /></div>
                <div><Label className="text-xs">Email *</Label><Input type="email" required value={preCreateForm.email} onChange={e => setPreCreateForm({...preCreateForm, email: e.target.value})} className="bg-black border-gray-700" /></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><Label className="text-xs">Rank</Label><Input value={preCreateForm.rank} onChange={e => setPreCreateForm({...preCreateForm, rank: e.target.value})} className="bg-black border-gray-700" /></div>
                <div><Label className="text-xs">Specialization</Label><Input value={preCreateForm.specialization} onChange={e => setPreCreateForm({...preCreateForm, specialization: e.target.value})} className="bg-black border-gray-700" /></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Role</Label>
                  <select value={preCreateForm.role} onChange={e => setPreCreateForm({...preCreateForm, role: e.target.value})} className="w-full bg-black border border-gray-700 rounded-md px-3 py-2 text-sm text-white">
                    <option value="member">Member</option>
                    <option value="admin">Admin (S-1)</option>
                    <option value="s1_personnel">S-1 Personnel</option>
                    <option value="s2_intelligence">S-2 Intelligence</option>
                    <option value="s3_operations">S-3 Operations</option>
                    <option value="s4_logistics">S-4 Logistics</option>
                    <option value="s5_civil_affairs">S-5 Civil Affairs</option>
                    <option value="s6_communications">S-6 Communications</option>
                    <option value="training_staff">Training Staff</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Status</Label>
                  <select value={preCreateForm.status} onChange={e => setPreCreateForm({...preCreateForm, status: e.target.value})} className="w-full bg-black border border-gray-700 rounded-md px-3 py-2 text-sm text-white">
                    <option value="member">Member</option>
                    <option value="recruit">Recruit</option>
                    <option value="active">Active</option>
                    <option value="reserve">Reserve</option>
                    <option value="staff">Staff</option>
                    <option value="command">Command</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div><Label className="text-xs">Company</Label><Input value={preCreateForm.company} onChange={e => setPreCreateForm({...preCreateForm, company: e.target.value})} className="bg-black border-gray-700" /></div>
                <div><Label className="text-xs">Platoon</Label><Input value={preCreateForm.platoon} onChange={e => setPreCreateForm({...preCreateForm, platoon: e.target.value})} className="bg-black border-gray-700" /></div>
                <div><Label className="text-xs">Squad</Label><Input value={preCreateForm.squad} onChange={e => setPreCreateForm({...preCreateForm, squad: e.target.value})} className="bg-black border-gray-700" /></div>
              </div>
              <div><Label className="text-xs">Billet</Label><Input value={preCreateForm.billet} onChange={e => setPreCreateForm({...preCreateForm, billet: e.target.value})} className="bg-black border-gray-700" placeholder="e.g., Squad Leader" /></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><Label className="text-xs">Discord ID</Label><Input value={preCreateForm.discord_id} onChange={e => setPreCreateForm({...preCreateForm, discord_id: e.target.value})} className="bg-black border-gray-700" /></div>
                <div><Label className="text-xs">Discord Username</Label><Input value={preCreateForm.discord_username} onChange={e => setPreCreateForm({...preCreateForm, discord_username: e.target.value})} className="bg-black border-gray-700" /></div>
              </div>
              <Button type="submit" className="bg-tropic-gold hover:bg-tropic-gold-light text-black w-full mt-2">
                <UserPlus className="w-4 h-4 mr-2" />Create Pre-Registered Account
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default UsersManager;

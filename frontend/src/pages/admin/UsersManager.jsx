import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Trash2, Search, ChevronRight } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const resolveImg = (url) => { if (!url) return ''; if (url.startsWith('http')) return url; if (url.startsWith('/uploads/')) return `${BACKEND_URL}/api${url}`; return `${BACKEND_URL}${url}`; };
const STATUS_COLORS = { recruit: 'bg-yellow-700', active: 'bg-green-700', reserve: 'bg-blue-700', staff: 'bg-purple-700', command: 'bg-amber-700', inactive: 'bg-gray-700' };

const UsersManager = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

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

  const filtered = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }} data-testid="users-manager-title">MEMBER MANAGEMENT</h1>
          <p className="text-gray-400 mt-2">{users.length} total members. Click a member to edit their full profile, history, and awards.</p>
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
                <Card className="bg-gray-900 border-gray-800 hover:border-amber-700/30 transition-colors group" data-testid={`user-card-${u.id}`}>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {u.avatar_url ? (
                          <img src={resolveImg(u.avatar_url)} alt="" className="w-9 h-9 rounded-lg object-cover border border-gray-700" />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center text-sm font-bold text-gray-500 border border-gray-700">{u.username[0]?.toUpperCase()}</div>
                        )}
                        <div>
                          <div className="font-bold text-sm tracking-wide group-hover:text-amber-400 transition-colors" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{u.username}</div>
                          <div className="text-xs text-gray-500">{u.email}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {u.rank && <span className="text-xs text-gray-400 hidden sm:block">{u.rank}</span>}
                        <Badge className={`${STATUS_COLORS[u.status] || 'bg-gray-700'} text-white text-[10px] px-2`}>{(u.status || 'recruit').toUpperCase()}</Badge>
                        {u.role === 'admin' && <Badge className="bg-amber-900/50 text-amber-400 text-[10px]">ADMIN</Badge>}
                        <Button size="sm" variant="ghost" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteUser(u.id); }} className="text-amber-500 hover:bg-amber-700/10 shrink-0" data-testid={`delete-user-${u.id}`}><Trash2 className="w-3 h-3" /></Button>
                        <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-amber-500 transition-colors" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default UsersManager;

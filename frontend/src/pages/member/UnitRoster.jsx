import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Shield, Home, LogOut, Users, ChevronRight } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const resolveImg = (url) => { if (!url) return ''; if (url.startsWith('http')) return url; if (url.startsWith('/uploads/')) return `${BACKEND_URL}/api${url}`; return `${BACKEND_URL}${url}`; };

const STATUS_COLORS = { recruit: 'bg-yellow-700', active: 'bg-green-700', reserve: 'bg-blue-700', staff: 'bg-purple-700', command: 'bg-amber-700', inactive: 'bg-gray-700' };

const UnitRoster = () => {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [rankFilter, setRankFilter] = useState('all');
  const [specFilter, setSpecFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [squadFilter, setSquadFilter] = useState('all');
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  useEffect(() => {
    axios.get(`${API}/roster`)
      .then(r => setMembers(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const ranks = [...new Set(members.map(m => m.rank).filter(Boolean))].sort();
  const specs = [...new Set(members.map(m => m.specialization).filter(Boolean))].sort();
  const statuses = [...new Set(members.map(m => m.status).filter(Boolean))].sort();
  const squads = [...new Set(members.map(m => m.squad).filter(Boolean))].sort();

  const filtered = members.filter(m => {
    if (search && !m.username.toLowerCase().includes(search.toLowerCase())) return false;
    if (rankFilter !== 'all' && m.rank !== rankFilter) return false;
    if (specFilter !== 'all' && m.specialization !== specFilter) return false;
    if (statusFilter !== 'all' && m.status !== statusFilter) return false;
    if (squadFilter !== 'all' && m.squad !== squadFilter) return false;
    return true;
  });

  const handleLogout = async () => { await logout(); navigate('/'); };

  return (
    <div className="min-h-screen bg-black text-white">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur border-b border-amber-700/30">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/hub"><Button size="sm" variant="outline" className="border-gray-700">Hub</Button></Link>
            <h1 className="text-xl font-bold tracking-widest" style={{ fontFamily: 'Rajdhani, sans-serif' }}>UNIT ROSTER</h1>
          </div>
          <div className="flex items-center space-x-3">
            {user?.role === 'admin' && <Link to="/admin"><Button size="sm" variant="outline" className="border-amber-700 text-amber-500 hover:bg-amber-700/10"><Shield className="w-4 h-4" /></Button></Link>}
            <Link to="/"><Button size="sm" variant="outline" className="border-gray-700"><Home className="w-4 h-4" /></Button></Link>
            <Button size="sm" variant="outline" onClick={handleLogout} className="border-gray-700"><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </nav>

      <div className="pt-20 pb-12 px-6">
        <div className="container mx-auto max-w-7xl space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-8 h-8 text-amber-500" />
            <div>
              <h2 className="text-3xl font-bold tracking-wider" style={{ fontFamily: 'Rajdhani, sans-serif' }} data-testid="roster-title">PERSONNEL DIRECTORY</h2>
              <p className="text-sm text-gray-500">{filtered.length} of {members.length} operators</p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 bg-gray-900/50 border border-gray-800 rounded-lg p-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name..." className="bg-black border-gray-700 pl-10" data-testid="roster-search" />
              </div>
            </div>
            {ranks.length > 0 && (
              <Select value={rankFilter} onValueChange={setRankFilter}>
                <SelectTrigger className="bg-black border-gray-700 w-[150px]" data-testid="roster-filter-rank"><SelectValue placeholder="Rank" /></SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-700"><SelectItem value="all">All Ranks</SelectItem>{ranks.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            )}
            {specs.length > 0 && (
              <Select value={specFilter} onValueChange={setSpecFilter}>
                <SelectTrigger className="bg-black border-gray-700 w-[170px]"><SelectValue placeholder="Specialization" /></SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-700"><SelectItem value="all">All Specs</SelectItem>{specs.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            )}
            {statuses.length > 0 && (
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="bg-black border-gray-700 w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-700"><SelectItem value="all">All Status</SelectItem>{statuses.map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent>
              </Select>
            )}
            {squads.length > 0 && (
              <Select value={squadFilter} onValueChange={setSquadFilter}>
                <SelectTrigger className="bg-black border-gray-700 w-[140px]"><SelectValue placeholder="Squad" /></SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-700"><SelectItem value="all">All Squads</SelectItem>{squads.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </div>

          {/* Roster Grid */}
          {loading ? <div className="text-center py-12 text-gray-500">Loading roster...</div> : filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-600 border border-dashed border-gray-800 rounded-lg">No operators match your filters.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map(m => (
                <Link to={`/roster/${m.id}`} key={m.id}>
                  <Card className="bg-gray-900/80 border-gray-800 hover:border-amber-700/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-amber-900/10 group" data-testid={`roster-card-${m.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        {m.avatar_url ? (
                          <img src={resolveImg(m.avatar_url)} alt="" className="w-12 h-12 rounded-lg object-cover border border-gray-700" />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-gray-800 flex items-center justify-center text-lg font-bold text-gray-500 border border-gray-700" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{m.username[0]?.toUpperCase()}</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-base tracking-wide truncate group-hover:text-amber-400 transition-colors" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{m.username}</div>
                          {m.rank && <div className="text-xs text-gray-400">{m.rank}</div>}
                          {m.specialization && <div className="text-xs text-gray-500">{m.specialization}</div>}
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-amber-500 transition-colors shrink-0 mt-1" />
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        <Badge className={`${STATUS_COLORS[m.status] || 'bg-gray-700'} text-white text-[10px] px-2 py-0`}>{(m.status || 'recruit').toUpperCase()}</Badge>
                        {m.squad && <span className="text-[10px] text-gray-500 border border-gray-800 px-1.5 py-0 rounded">{m.squad}</span>}
                        {m.role === 'admin' && <Badge className="bg-amber-900/50 text-amber-400 text-[10px] px-2 py-0">ADMIN</Badge>}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UnitRoster;

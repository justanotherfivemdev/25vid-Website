import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Users, Calendar, Megaphone, MessageSquare, Image, TrendingUp, Star, X } from 'lucide-react';

import { BACKEND_URL, API } from '@/utils/api';
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
    { label: 'Total Operations', value: stats.operations, icon: Calendar, color: 'tropic-red' },
    { label: 'Announcements', value: stats.announcements, icon: Megaphone, color: 'tropic-gold' },
    { label: 'Discussions', value: stats.discussions, icon: MessageSquare, color: 'tropic-red' },
    { label: 'Gallery Images', value: stats.gallery, icon: Image, color: 'tropic-gold' },
    { label: 'Members', value: stats.users, icon: Users, color: 'tropic-gold' }
  ];

  const fetchMotw = async () => {
    try {
      const res = await axios.get(`${API}/soldier-of-the-month`);
      setMotw(res.data);
    } catch (err) { console.error('Failed to fetch Soldier of the Month:', err); }
  };

  const openMotwDialog = async () => {
    try {
      const res = await axios.get(`${API}/admin/users`);
      setMemberList(res.data);
    } catch (err) { console.error('Failed to fetch member list:', err); }
    setMotwOpen(true);
  };

  const handleSetMotw = async () => {
    if (!motwForm.user_id) return;
    try {
      const res = await axios.put(`${API}/admin/soldier-of-the-month`, motwForm);
      setMotw(res.data);
      setMotwOpen(false);
      setMotwForm({ user_id: '', reason: '' });
    } catch (err) { alert(err.response?.data?.detail || 'Error'); }
  };

  const handleClearMotw = async () => {
    if (!window.confirm('Clear Soldier of the Month?')) return;
    try {
      await axios.delete(`${API}/admin/soldier-of-the-month`);
      setMotw(null);
    } catch (err) { alert(err.response?.data?.detail || 'Error clearing Soldier of the Month'); }
  };

  const filteredMembers = memberList.filter(m =>
    m.username?.toLowerCase().includes(memberSearch.toLowerCase()) ||
    m.email?.toLowerCase().includes(memberSearch.toLowerCase())
  );
  
  return (
    <>
      <div className="space-y-8">
        {/* Hero banner */}
        <div className="relative corner-bracket border border-[rgba(201,162,39,0.15)] bg-[radial-gradient(circle_at_top,rgba(201,162,39,0.06),#050a0e_58%)] px-6 py-7 shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#c9a227]" style={{ fontFamily: "'Oswald', sans-serif" }}>Force Readiness Overview</p>
          <h1 className="mt-3 text-4xl font-black uppercase tracking-[0.12em] text-[#e8c547]" style={{ fontFamily: "'Share Tech', sans-serif" }}>
            COMMAND DASHBOARD
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-[#8a9aa8]" style={{ fontFamily: "'Inter', sans-serif" }}>
            Command-center summary for personnel, operations tempo, content flow, and member recognition.
          </p>
        </div>

        {/* Stat cards */}
        {loading ? (
          <div className="text-center py-12 text-[#e8c547]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            <span className="animate-pulse">■</span> Loading statistics...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {statCards.map((stat, idx) => {
              const Icon = stat.icon;
              return (
                <div key={idx} className="relative border border-[rgba(201,162,39,0.12)] bg-[#0c1117] shadow-xl p-0">
                  <div className="corner-bracket" />
                  <div className="flex items-center justify-between px-5 pt-4 pb-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4a6070]" style={{ fontFamily: "'Oswald', sans-serif" }}>
                      {stat.label}
                    </span>
                    <div className="border border-[rgba(201,162,39,0.15)] bg-[#050a0e] p-2">
                      <Icon className="w-5 h-5 text-[#00aaff]" />
                    </div>
                  </div>
                  <div className="px-5 pb-5">
                    <div className="text-4xl font-bold text-[#e8c547]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {stat.value}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Soldier of the Month Management */}
        <div className="relative border border-[rgba(201,162,39,0.12)] bg-[#0c1117] shadow-xl">
          <div className="corner-bracket" />
          <div className="flex flex-row items-center justify-between px-5 pt-5 pb-3">
            <div>
              <h3 className="flex items-center gap-2 text-[#e8c547] font-bold uppercase tracking-wider text-sm" style={{ fontFamily: "'Share Tech', sans-serif" }}>
                <Star className="w-5 h-5 text-[#e8c547]" />Soldier of the Month
              </h3>
              <p className="text-xs text-[#4a6070] mt-1" style={{ fontFamily: "'Inter', sans-serif" }}>Highlight an outstanding unit member — visible to all in the Hub. Auto-clears after 30 days.</p>
            </div>
            <div className="flex gap-2">
              <Dialog open={motwOpen} onOpenChange={setMotwOpen}>
                <DialogTrigger asChild>
                  <button className="tactical-button px-4 py-2 text-xs font-bold uppercase tracking-wider bg-[#111a24] text-[#e8c547] border border-[rgba(201,162,39,0.3)] hover:bg-[rgba(201,162,39,0.08)] hover:border-[rgba(201,162,39,0.5)] transition-colors" style={{ fontFamily: "'Oswald', sans-serif" }} onClick={openMotwDialog} data-testid="set-motw-btn">
                    <Star className="w-4 h-4 mr-1 inline-block" />{motw ? 'Change' : 'Set'}
                  </button>
                </DialogTrigger>
                <DialogContent className="bg-[#0c1117] text-[#d0d8e0] border-[rgba(201,162,39,0.2)] max-w-lg max-h-[80vh] overflow-y-auto rounded-none">
                  <DialogHeader>
                    <DialogTitle className="text-[#e8c547] uppercase tracking-wider" style={{ fontFamily: "'Share Tech', sans-serif" }}>Set Soldier of the Month</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label className="text-[#8a9aa8] text-xs uppercase tracking-wider" style={{ fontFamily: "'Oswald', sans-serif" }}>Search Members</Label>
                      <Input value={memberSearch} onChange={e => setMemberSearch(e.target.value)}
                        placeholder="Search by name or email..." className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-[#d0d8e0] rounded-none" style={{ fontFamily: "'JetBrains Mono', monospace" }} data-testid="motw-search" />
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1 border border-[rgba(201,162,39,0.1)] p-2 bg-[#050a0e]">
                      {filteredMembers.map(m => (
                        <button key={m.id} type="button"
                          onClick={() => setMotwForm({ ...motwForm, user_id: m.id })}
                          className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${motwForm.user_id === m.id ? 'bg-[rgba(201,162,39,0.08)] border border-[rgba(201,162,39,0.4)]' : 'hover:bg-[#111a24]'}`}
                          style={{ fontFamily: "'JetBrains Mono', monospace" }}
                          data-testid={`motw-member-${m.id}`}>
                          <span className="font-medium text-[#d0d8e0]">{m.username}</span>
                          <span className="text-[#4a6070] text-xs">{m.rank || ''}</span>
                        </button>
                      ))}
                      {filteredMembers.length === 0 && <p className="text-[#4a6070] text-sm text-center py-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>No members found</p>}
                    </div>
                    <div>
                      <Label className="text-[#8a9aa8] text-xs uppercase tracking-wider" style={{ fontFamily: "'Oswald', sans-serif" }}>Reason / Citation (optional)</Label>
                      <Textarea rows={3} value={motwForm.reason}
                        onChange={e => setMotwForm({ ...motwForm, reason: e.target.value })}
                        className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-[#d0d8e0] rounded-none"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                        placeholder="Outstanding performance during Operation Thunderbolt..."
                        data-testid="motw-reason" />
                    </div>
                    <button disabled={!motwForm.user_id} onClick={handleSetMotw}
                      className="tactical-button w-full px-4 py-3 text-xs font-bold uppercase tracking-wider bg-[#111a24] text-[#e8c547] border border-[rgba(201,162,39,0.3)] hover:bg-[rgba(201,162,39,0.08)] hover:border-[rgba(201,162,39,0.5)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors" style={{ fontFamily: "'Oswald', sans-serif" }} data-testid="motw-confirm-btn">
                      Confirm Soldier of the Month
                    </button>
                  </div>
                </DialogContent>
              </Dialog>
              {motw && (
                <button className="tactical-button px-4 py-2 text-xs font-bold uppercase tracking-wider bg-[#111a24] text-[#ff3333] border border-[rgba(255,51,51,0.3)] hover:bg-[rgba(255,51,51,0.08)] hover:border-[rgba(255,51,51,0.5)] transition-colors" style={{ fontFamily: "'Oswald', sans-serif" }} onClick={handleClearMotw} data-testid="clear-motw-btn">
                  <X className="w-4 h-4 mr-1 inline-block" />Clear
                </button>
              )}
            </div>
          </div>
          {motw && (
            <div className="px-5 pb-5">
              <div className="flex items-center gap-4 p-4 bg-[rgba(201,162,39,0.04)] border border-[rgba(201,162,39,0.15)]">
                <div className="w-12 h-12 border-2 border-[rgba(201,162,39,0.3)] overflow-hidden bg-[#050a0e] flex items-center justify-center shrink-0">
                  {motw.avatar_url ? (
                    <img src={resolveImg(motw.avatar_url)} alt={motw.username} className="w-full h-full object-cover" />
                  ) : (
                    <Star className="w-6 h-6 text-[#e8c547]" />
                  )}
                </div>
                <div>
                  <div className="font-bold text-[#e8c547]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {motw.username} {motw.rank && <span className="text-[#4a6070] font-normal text-xs ml-1">({motw.rank})</span>}
                  </div>
                  {motw.reason && <p className="text-sm text-[#8a9aa8] mt-0.5 whitespace-pre-wrap" style={{ fontFamily: "'Inter', sans-serif" }}>{motw.reason}</p>}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="relative border border-[rgba(201,162,39,0.12)] bg-[#0c1117] shadow-xl">
          <div className="corner-bracket" />
          <div className="px-5 pt-5 pb-3">
            <h3 className="text-[#e8c547] font-bold uppercase tracking-wider text-sm" style={{ fontFamily: "'Share Tech', sans-serif" }}>Quick Actions</h3>
            <p className="text-xs text-[#4a6070] mt-1" style={{ fontFamily: "'Inter', sans-serif" }}>Common administrative tasks</p>
          </div>
          <div className="px-5 pb-5 grid grid-cols-2 md:grid-cols-5 gap-4">
            <Link to="/admin/operations" className="border border-[rgba(201,162,39,0.1)] bg-[#050a0e] p-4 text-center transition-colors hover:border-[rgba(201,162,39,0.35)] hover:bg-[rgba(201,162,39,0.03)]">
              <Calendar className="w-8 h-8 mx-auto mb-2 text-[#00aaff]" />
              <div className="font-medium text-[#d0d8e0] text-sm" style={{ fontFamily: "'Oswald', sans-serif" }}>Manage Operations</div>
            </Link>
            <Link to="/admin/announcements" className="border border-[rgba(201,162,39,0.1)] bg-[#050a0e] p-4 text-center transition-colors hover:border-[rgba(201,162,39,0.35)] hover:bg-[rgba(201,162,39,0.03)]">
              <Megaphone className="w-8 h-8 mx-auto mb-2 text-[#e8c547]" />
              <div className="font-medium text-[#d0d8e0] text-sm" style={{ fontFamily: "'Oswald', sans-serif" }}>Post Announcement</div>
            </Link>
            <Link to="/admin/users" className="border border-[rgba(201,162,39,0.1)] bg-[#050a0e] p-4 text-center transition-colors hover:border-[rgba(201,162,39,0.35)] hover:bg-[rgba(201,162,39,0.03)]">
              <Users className="w-8 h-8 mx-auto mb-2 text-[#e8c547]" />
              <div className="font-medium text-[#d0d8e0] text-sm" style={{ fontFamily: "'Oswald', sans-serif" }}>Manage Members</div>
            </Link>
            <Link to="/admin/site-content" className="border border-[rgba(201,162,39,0.1)] bg-[#050a0e] p-4 text-center transition-colors hover:border-[rgba(201,162,39,0.35)] hover:bg-[rgba(201,162,39,0.03)]">
              <TrendingUp className="w-8 h-8 mx-auto mb-2 text-[#e8c547]" />
              <div className="font-medium text-[#d0d8e0] text-sm" style={{ fontFamily: "'Oswald', sans-serif" }}>Edit Site Content</div>
            </Link>
            <Link to="/admin/gallery" className="border border-[rgba(201,162,39,0.1)] bg-[#050a0e] p-4 text-center transition-colors hover:border-[rgba(201,162,39,0.35)] hover:bg-[rgba(201,162,39,0.03)]">
              <Image className="w-8 h-8 mx-auto mb-2 text-[#ff3333]" />
              <div className="font-medium text-[#d0d8e0] text-sm" style={{ fontFamily: "'Oswald', sans-serif" }}>Manage Gallery</div>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default AdminDashboard;

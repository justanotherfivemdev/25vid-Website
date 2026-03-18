import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Shield, Users, LogOut, Home, Copy, Trash2, ChevronRight, Plus, FileText } from 'lucide-react';
import { BACKEND_URL, API } from '@/utils/api';

const PartnerAdmin = () => {
  const [user, setUser] = useState(null);
  const [unit, setUnit] = useState(null);
  const [invites, setInvites] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('members');
  const [editingMember, setEditingMember] = useState(null);
  const [editForm, setEditForm] = useState({ rank: '', billet: '', status: 'active' });
  const navigate = useNavigate();

  useEffect(() => {
    axios.get(`${API}/auth/partner/me`)
      .then(res => {
        if (res.data?.account_type !== 'partner' || res.data?.partner_role !== 'partner_admin') {
          navigate('/partner', { replace: true });
          return;
        }
        setUser(res.data);
        fetchData();
      })
      .catch(() => navigate('/partner-login', { replace: true }));
  }, [navigate]);

  const fetchData = async () => {
    try {
      const [unitRes, invitesRes, logRes] = await Promise.all([
        axios.get(`${API}/partner/admin/unit`),
        axios.get(`${API}/partner/admin/invites`),
        axios.get(`${API}/partner/admin/audit-log`),
      ]);
      setUnit(unitRes.data);
      setInvites(invitesRes.data);
      setAuditLog(logRes.data.slice(0, 50));
    } catch (err) {
      console.error('Failed to fetch partner admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try { await axios.post(`${API}/auth/logout`); } catch {}
    localStorage.removeItem('partner_user');
    navigate('/partner-login', { replace: true });
  };

  const generateInvite = async () => {
    try {
      const res = await axios.post(`${API}/partner/admin/invites`);
      setInvites(prev => [{ code: res.data.code, id: res.data.id, use_count: 0, max_uses: 1 }, ...prev]);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to generate invite');
    }
  };

  const copyInviteCode = (code) => {
    navigator.clipboard.writeText(code).catch(() => {});
  };

  const startEdit = (member) => {
    setEditingMember(member.id);
    setEditForm({ rank: member.rank || '', billet: member.billet || '', status: member.status || 'active' });
  };

  const saveEdit = async (memberId) => {
    try {
      await axios.put(`${API}/partner/admin/members/${memberId}`, editForm);
      setEditingMember(null);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to update member');
    }
  };

  const removeMember = async (memberId) => {
    if (!window.confirm('Are you sure you want to remove this member?')) return;
    try {
      await axios.delete(`${API}/partner/admin/members/${memberId}`);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to remove member');
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-gray-900 border-b border-tropic-olive/30">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center space-x-4">
            <img src={`${BACKEND_URL}/api/uploads/25th_id_patch.png`} alt="25th ID" className="w-8 h-8 object-contain" />
            <div>
              <h1 className="text-xl font-bold text-tropic-gold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                PARTNER ADMIN
              </h1>
              <p className="text-[10px] text-tropic-olive tracking-widest">
                {unit?.name || 'Partner Unit'} — S-5 LIAISON
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Badge className="bg-tropic-olive/20 text-tropic-olive border border-tropic-olive/40 text-[10px]">
              PARTNER ADMIN
            </Badge>
            <Link to="/partner">
              <Button variant="outline" size="sm" className="border-tropic-olive/60 text-tropic-olive hover:bg-tropic-olive/10">
                <Shield className="w-4 h-4 mr-2" />Partner Hub
              </Button>
            </Link>
            <Link to="/">
              <Button variant="outline" size="sm" className="border-gray-700 text-gray-400 hover:bg-gray-700/10">
                <Home className="w-4 h-4 mr-2" />Main Site
              </Button>
            </Link>
            <Button onClick={handleLogout} variant="outline" size="sm" className="border-tropic-red/50 text-tropic-red-light hover:bg-tropic-red/10">
              <LogOut className="w-4 h-4 mr-2" />Logout
            </Button>
          </div>
        </div>
      </div>

      <div className="pt-20 px-6 pb-12">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Unit Info Card */}
          <Card className="bg-gray-900/80 border-tropic-olive/30">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-tropic-gold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                    {unit?.name}
                  </h2>
                  {unit?.abbreviation && <p className="text-sm text-gray-400">{unit.abbreviation}</p>}
                  {unit?.description && <p className="text-sm text-gray-500 mt-1">{unit.description}</p>}
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-tropic-gold">{unit?.members?.length || 0}</div>
                  <div className="text-xs text-gray-500">Members</div>
                  <Badge className={`mt-1 text-[10px] ${unit?.status === 'active' ? 'bg-green-900 text-green-400' : 'bg-gray-700'}`}>
                    {unit?.status?.toUpperCase()}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabs */}
          <div className="flex gap-2 border-b border-gray-800 pb-2">
            {['members', 'invites', 'audit'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${
                  activeTab === tab ? 'bg-tropic-olive/20 text-tropic-gold border-b-2 border-tropic-gold' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {tab === 'members' && <><Users className="w-4 h-4 inline mr-1" />Members</>}
                {tab === 'invites' && <><Copy className="w-4 h-4 inline mr-1" />Invites</>}
                {tab === 'audit' && <><FileText className="w-4 h-4 inline mr-1" />Audit Log</>}
              </button>
            ))}
          </div>

          {/* Members Tab */}
          {activeTab === 'members' && (
            <div className="space-y-3">
              {(!unit?.members || unit.members.length === 0) ? (
                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="p-8 text-center text-gray-500">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No members yet. Generate an invite code to get started.</p>
                  </CardContent>
                </Card>
              ) : (
                unit.members.map(member => (
                  <Card key={member.id} className="bg-gray-900/80 border-gray-800">
                    <CardContent className="p-4">
                      {editingMember === member.id ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="text-xs text-gray-500">Rank</label>
                              <Input className="bg-black/50 border-white/20 mt-1" value={editForm.rank} onChange={e => setEditForm({ ...editForm, rank: e.target.value })} />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500">Billet</label>
                              <Input className="bg-black/50 border-white/20 mt-1" value={editForm.billet} onChange={e => setEditForm({ ...editForm, billet: e.target.value })} />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500">Status</label>
                              <select className="w-full bg-black/50 border border-white/20 rounded px-2 py-2 mt-1 text-sm" value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })}>
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                              </select>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => saveEdit(member.id)} className="bg-tropic-olive">Save</Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingMember(null)} className="border-gray-700">Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center text-tropic-gold font-bold">
                              {member.username?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div>
                              <div className="font-bold text-sm">{member.username}</div>
                              <div className="text-xs text-gray-500">
                                {member.rank && <span className="mr-2">{member.rank}</span>}
                                {member.billet && <span className="text-tropic-olive">{member.billet}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={`text-[10px] ${member.partner_role === 'partner_admin' ? 'bg-tropic-gold/20 text-tropic-gold' : 'bg-gray-700'}`}>
                              {member.partner_role === 'partner_admin' ? 'ADMIN' : 'MEMBER'}
                            </Badge>
                            <Badge className={`text-[10px] ${member.status === 'active' ? 'bg-green-900/50 text-green-400' : 'bg-gray-700'}`}>
                              {member.status?.toUpperCase()}
                            </Badge>
                            {member.id !== user?.id && (
                              <>
                                <Button size="sm" variant="outline" className="border-gray-700 text-xs" onClick={() => startEdit(member)}>Edit</Button>
                                <Button size="sm" variant="outline" className="border-tropic-red/40 text-tropic-red text-xs" onClick={() => removeMember(member.id)}>
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}

          {/* Invites Tab */}
          {activeTab === 'invites' && (
            <div className="space-y-4">
              <Button onClick={generateInvite} className="bg-tropic-olive hover:bg-tropic-olive/80">
                <Plus className="w-4 h-4 mr-2" />Generate Invite Code
              </Button>
              {invites.length === 0 ? (
                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="p-6 text-center text-gray-500">No invite codes yet</CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {invites.map(inv => (
                    <Card key={inv.id || inv.code} className="bg-gray-900/80 border-gray-800">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <code className="text-tropic-gold font-mono text-sm">{inv.code}</code>
                          <p className="text-[10px] text-gray-500 mt-1">
                            Used: {inv.use_count || 0} / {inv.max_uses || 1}
                          </p>
                        </div>
                        <Button size="sm" variant="outline" className="border-gray-700" onClick={() => copyInviteCode(inv.code)}>
                          <Copy className="w-3 h-3 mr-1" />Copy
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Audit Log Tab */}
          {activeTab === 'audit' && (
            <div className="space-y-2">
              {auditLog.length === 0 ? (
                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="p-6 text-center text-gray-500">No audit log entries</CardContent>
                </Card>
              ) : (
                auditLog.map((log, idx) => (
                  <Card key={idx} className="bg-gray-900/80 border-gray-800">
                    <CardContent className="p-3 flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-gray-300">{log.action?.replace(/_/g, ' ')}</span>
                        <span className="text-xs text-gray-500 ml-2">by {log.performed_by_type}</span>
                      </div>
                      <span className="text-[10px] text-gray-600">{log.timestamp}</span>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PartnerAdmin;

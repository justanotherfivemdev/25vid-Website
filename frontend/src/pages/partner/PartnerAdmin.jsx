import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Shield, Users, LogOut, Home, Copy, Trash2, ChevronRight, Plus, FileText, Calendar, Radio, Clock, Pencil, Navigation, MapPin } from 'lucide-react';
import { BACKEND_URL, API } from '@/utils/api';
import { formatApiError } from '@/utils/errorMessages';
import { formatDeploymentDateTime } from '@/utils/deploymentDateTime';

const PartnerAdmin = () => {
  const [user, setUser] = useState(null);
  const [unit, setUnit] = useState(null);
  const [invites, setInvites] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [operations, setOperations] = useState([]);
  const [intelItems, setIntelItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('members');
  const [editingMember, setEditingMember] = useState(null);
  const [editForm, setEditForm] = useState({ rank: '', billet: '', status: 'active' });
  const [showOpForm, setShowOpForm] = useState(false);
  const [editingOp, setEditingOp] = useState(null);
  const [opForm, setOpForm] = useState({ title: '', description: '', operation_type: 'combat', date: '', time: '', location: '' });
  const [showIntelForm, setShowIntelForm] = useState(false);
  const [editingIntel, setEditingIntel] = useState(null);
  const [intelForm, setIntelForm] = useState({ title: '', content: '', classification: 'unclassified', region: '', threat_level: 'low' });
  const [partnerDeployments, setPartnerDeployments] = useState([]);
  const [showDepForm, setShowDepForm] = useState(false);
  const [editingDep, setEditingDep] = useState(null);
  const [depForm, setDepForm] = useState({
    title: '', status: 'planning',
    total_duration_hours: 24, route_points: [], notes: '',
  });
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
      const [unitRes, invitesRes, logRes, opsRes, intelRes, depRes] = await Promise.all([
        axios.get(`${API}/partner/admin/unit`),
        axios.get(`${API}/partner/admin/invites`),
        axios.get(`${API}/partner/admin/audit-log`),
        axios.get(`${API}/partner/admin/operations`),
        axios.get(`${API}/partner/admin/intel`),
        axios.get(`${API}/partner/admin/deployments`),
      ]);
      setUnit(unitRes.data);
      setInvites(invitesRes.data);
      setAuditLog(logRes.data.slice(0, 50));
      setOperations(opsRes.data || []);
      setIntelItems(intelRes.data || []);
      setPartnerDeployments(depRes.data || []);
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

  // === Operations CRUD ===
  const resetOpForm = () => {
    setOpForm({ title: '', description: '', operation_type: 'combat', date: '', time: '', location: '' });
    setEditingOp(null);
    setShowOpForm(false);
  };

  const startEditOp = (op) => {
    setOpForm({ title: op.title || '', description: op.description || '', operation_type: op.operation_type || 'combat', date: op.date || '', time: op.time || '', location: op.location || '' });
    setEditingOp(op.id);
    setShowOpForm(true);
  };

  const saveOperation = async (e) => {
    e.preventDefault();
    try {
      if (editingOp) {
        await axios.put(`${API}/partner/admin/operations/${editingOp}`, opForm);
      } else {
        await axios.post(`${API}/partner/admin/operations`, opForm);
      }
      resetOpForm();
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to save operation');
    }
  };

  const deleteOperation = async (opId) => {
    if (!window.confirm('Delete this operation?')) return;
    try {
      await axios.delete(`${API}/partner/admin/operations/${opId}`);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete operation');
    }
  };

  // === Intel CRUD ===
  const resetIntelForm = () => {
    setIntelForm({ title: '', content: '', classification: 'unclassified', region: '', threat_level: 'low' });
    setEditingIntel(null);
    setShowIntelForm(false);
  };

  const startEditIntel = (item) => {
    setIntelForm({ title: item.title || '', content: item.content || '', classification: item.classification || 'unclassified', region: item.region || '', threat_level: item.threat_level || 'low' });
    setEditingIntel(item.id);
    setShowIntelForm(true);
  };

  const saveIntel = async (e) => {
    e.preventDefault();
    try {
      if (editingIntel) {
        await axios.put(`${API}/partner/admin/intel/${editingIntel}`, intelForm);
      } else {
        await axios.post(`${API}/partner/admin/intel`, intelForm);
      }
      resetIntelForm();
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to save intel');
    }
  };

  const deleteIntel = async (intelId) => {
    if (!window.confirm('Delete this intel report?')) return;
    try {
      await axios.delete(`${API}/partner/admin/intel/${intelId}`);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete intel');
    }
  };

  const getTypeColor = (t) => ({
    combat: 'bg-tropic-red', training: 'bg-tropic-gold-dark',
    recon: 'bg-green-600', support: 'bg-[#4a6070]'
  }[t] || 'bg-[#4a6070]');

  if (loading) {
    return <div className="min-h-screen bg-[#050a0e] text-white flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-[#050a0e] text-white">
      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-[#0c1117] border-b border-tropic-olive/30">
        <div className="flex items-center justify-between px-4 md:px-6 py-4">
          <div className="flex items-center space-x-4">
            <img src={`${BACKEND_URL}/api/uploads/25th_id_patch.png`} alt="25th ID" className="w-8 h-8 object-contain" />
            <div>
              <h1 className="text-xl font-bold text-tropic-gold" style={{ fontFamily: "'Share Tech', sans-serif" }}>
                PARTNER ADMIN
              </h1>
              <p className="text-[10px] text-tropic-olive tracking-widest">
                {unit?.name || 'Partner Unit'} — S-5 LIAISON
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 md:space-x-3">
            <Badge className="bg-tropic-olive/20 text-tropic-olive border border-tropic-olive/40 text-[10px] hidden sm:inline-flex">
              PARTNER ADMIN
            </Badge>
            <Link to="/partner">
              <Button variant="outline" size="sm" className="border-tropic-olive/60 text-tropic-olive hover:bg-tropic-olive/10">
                <Shield className="w-4 h-4 md:mr-2" /><span className="hidden md:inline">Partner Hub</span>
              </Button>
            </Link>
            <Link to="/">
              <Button variant="outline" size="sm" className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8] hover:bg-[#111a24]/10">
                <Home className="w-4 h-4 md:mr-2" /><span className="hidden md:inline">Main Site</span>
              </Button>
            </Link>
            <Button onClick={handleLogout} variant="outline" size="sm" className="border-tropic-red/50 text-tropic-red-light hover:bg-tropic-red/10">
              <LogOut className="w-4 h-4 md:mr-2" /><span className="hidden md:inline">Logout</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="pt-20 px-4 md:px-6 pb-12">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Unit Info Card */}
          <Card className="bg-[#0c1117]/80 border-tropic-olive/30">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-tropic-gold" style={{ fontFamily: "'Share Tech', sans-serif" }}>
                    {unit?.name}
                  </h2>
                  {unit?.abbreviation && <p className="text-sm text-[#8a9aa8]">{unit.abbreviation}</p>}
                  {unit?.description && <p className="text-sm text-[#4a6070] mt-1">{unit.description}</p>}
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-tropic-gold">{unit?.members?.length || 0}</div>
                  <div className="text-xs text-[#4a6070]">Members</div>
                  <Badge className={`mt-1 text-[10px] ${unit?.status === 'active' ? 'bg-green-900 text-green-400' : 'bg-[#111a24]'}`}>
                    {unit?.status?.toUpperCase()}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabs */}
          <div className="flex gap-2 border-b border-[rgba(201,162,39,0.12)] pb-2 overflow-x-auto">
            {['members', 'operations', 'intel', 'deployments', 'invites', 'audit'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium rounded-t transition-colors whitespace-nowrap ${
                  activeTab === tab ? 'bg-tropic-olive/20 text-tropic-gold border-b-2 border-tropic-gold' : 'text-[#4a6070] hover:text-[#8a9aa8]'
                }`}
              >
                {tab === 'members' && <><Users className="w-4 h-4 inline mr-1" />Members</>}
                {tab === 'operations' && <><Calendar className="w-4 h-4 inline mr-1" />Operations</>}
                {tab === 'intel' && <><Radio className="w-4 h-4 inline mr-1" />Intel</>}
                {tab === 'deployments' && <><Navigation className="w-4 h-4 inline mr-1" />Deployments</>}
                {tab === 'invites' && <><Copy className="w-4 h-4 inline mr-1" />Invites</>}
                {tab === 'audit' && <><FileText className="w-4 h-4 inline mr-1" />Audit Log</>}
              </button>
            ))}
          </div>

          {/* Members Tab */}
          {activeTab === 'members' && (
            <div className="space-y-3">
              {(!unit?.members || unit.members.length === 0) ? (
                <Card className="bg-[#0c1117]/50 border-[rgba(201,162,39,0.12)]">
                  <CardContent className="p-8 text-center text-[#4a6070]">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No members yet. Generate an invite code to get started.</p>
                  </CardContent>
                </Card>
              ) : (
                unit.members.map(member => (
                  <Card key={member.id} className="bg-[#0c1117]/80 border-[rgba(201,162,39,0.12)]">
                    <CardContent className="p-4">
                      {editingMember === member.id ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="text-xs text-[#4a6070]">Rank</label>
                              <Input className="bg-[#050a0e]/50 border-white/20 mt-1" value={editForm.rank} onChange={e => setEditForm({ ...editForm, rank: e.target.value })} />
                            </div>
                            <div>
                              <label className="text-xs text-[#4a6070]">Billet</label>
                              <Input className="bg-[#050a0e]/50 border-white/20 mt-1" value={editForm.billet} onChange={e => setEditForm({ ...editForm, billet: e.target.value })} />
                            </div>
                            <div>
                              <label className="text-xs text-[#4a6070]">Status</label>
                              <select className="w-full bg-[#050a0e]/50 border border-white/20 rounded px-2 py-2 mt-1 text-sm" value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })}>
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                              </select>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => saveEdit(member.id)} className="bg-tropic-olive">Save</Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingMember(null)} className="border-[rgba(201,162,39,0.15)]">Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-[#111a24] flex items-center justify-center text-tropic-gold font-bold">
                              {member.username?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div>
                              <div className="font-bold text-sm">{member.username}</div>
                              <div className="text-xs text-[#4a6070]">
                                {member.rank && <span className="mr-2">{member.rank}</span>}
                                {member.billet && <span className="text-tropic-olive">{member.billet}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={`text-[10px] ${member.partner_role === 'partner_admin' ? 'bg-tropic-gold/20 text-tropic-gold' : 'bg-[#111a24]'}`}>
                              {member.partner_role === 'partner_admin' ? 'ADMIN' : 'MEMBER'}
                            </Badge>
                            <Badge className={`text-[10px] ${member.status === 'active' ? 'bg-green-900/50 text-green-400' : 'bg-[#111a24]'}`}>
                              {member.status?.toUpperCase()}
                            </Badge>
                            {member.id !== user?.id && (
                              <>
                                <Button size="sm" variant="outline" className="border-[rgba(201,162,39,0.15)] text-xs" onClick={() => startEdit(member)}>Edit</Button>
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

          {/* Operations Tab */}
          {activeTab === 'operations' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-[#8a9aa8]">Manage your unit's operations</p>
                <Button onClick={() => { resetOpForm(); setShowOpForm(true); }} className="bg-tropic-olive hover:bg-tropic-olive/80">
                  <Plus className="w-4 h-4 mr-2" />New Operation
                </Button>
              </div>

              {showOpForm && (
                <Card className="bg-[#0c1117]/80 border-tropic-olive/30">
                  <CardContent className="p-4">
                    <form onSubmit={saveOperation} className="space-y-3">
                      <h4 className="text-sm font-bold text-tropic-gold">{editingOp ? 'Edit Operation' : 'Create Operation'}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-[#4a6070]">Title *</label>
                          <Input className="bg-[#050a0e]/50 border-white/20 mt-1" value={opForm.title} onChange={e => setOpForm({ ...opForm, title: e.target.value })} required />
                        </div>
                        <div>
                          <label className="text-xs text-[#4a6070]">Type</label>
                          <select className="w-full bg-[#050a0e]/50 border border-white/20 rounded px-2 py-2 mt-1 text-sm" value={opForm.operation_type} onChange={e => setOpForm({ ...opForm, operation_type: e.target.value })}>
                            <option value="combat">Combat</option>
                            <option value="training">Training</option>
                            <option value="recon">Recon</option>
                            <option value="support">Support</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-[#4a6070]">Description</label>
                        <Textarea className="bg-[#050a0e]/50 border-white/20 mt-1" rows={2} value={opForm.description} onChange={e => setOpForm({ ...opForm, description: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="text-xs text-[#4a6070]">Date</label>
                          <Input type="date" className="bg-[#050a0e]/50 border-white/20 mt-1" value={opForm.date} onChange={e => setOpForm({ ...opForm, date: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-xs text-[#4a6070]">Time</label>
                          <Input type="time" className="bg-[#050a0e]/50 border-white/20 mt-1" value={opForm.time} onChange={e => setOpForm({ ...opForm, time: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-xs text-[#4a6070]">Location</label>
                          <Input className="bg-[#050a0e]/50 border-white/20 mt-1" value={opForm.location} onChange={e => setOpForm({ ...opForm, location: e.target.value })} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit" size="sm" className="bg-tropic-olive">{editingOp ? 'Update' : 'Create'}</Button>
                        <Button type="button" size="sm" variant="outline" className="border-[rgba(201,162,39,0.15)]" onClick={resetOpForm}>Cancel</Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              )}

              {operations.length === 0 && !showOpForm ? (
                <Card className="bg-[#0c1117]/50 border-[rgba(201,162,39,0.12)]">
                  <CardContent className="p-8 text-center text-[#4a6070]">
                    <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No operations created yet for your unit.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {operations.map(op => (
                    <Card key={op.id} className="bg-[#0c1117]/80 border-[rgba(201,162,39,0.12)]">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-bold text-sm">{op.title}</h4>
                            <Badge className={`${getTypeColor(op.operation_type)} text-[10px]`}>{op.operation_type?.toUpperCase()}</Badge>
                          </div>
                          <p className="text-xs text-[#8a9aa8] line-clamp-1">{op.description}</p>
                          <div className="flex items-center gap-3 text-[10px] text-[#4a6070] mt-1">
                            {op.date && <span><Calendar className="w-3 h-3 inline mr-1" />{op.date}</span>}
                            {op.time && <span><Clock className="w-3 h-3 inline mr-1" />{op.time}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-3">
                          <Button size="sm" variant="outline" className="border-[rgba(201,162,39,0.15)] text-xs" onClick={() => startEditOp(op)}>
                            <Pencil className="w-3 h-3 mr-1" />Edit
                          </Button>
                          <Button size="sm" variant="outline" className="border-tropic-red/40 text-tropic-red text-xs" onClick={() => deleteOperation(op.id)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Intel Tab */}
          {activeTab === 'intel' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-[#8a9aa8]">Manage your unit's intelligence reports</p>
                <Button onClick={() => { resetIntelForm(); setShowIntelForm(true); }} className="bg-tropic-olive hover:bg-tropic-olive/80">
                  <Plus className="w-4 h-4 mr-2" />New Intel Report
                </Button>
              </div>

              {showIntelForm && (
                <Card className="bg-[#0c1117]/80 border-tropic-olive/30">
                  <CardContent className="p-4">
                    <form onSubmit={saveIntel} className="space-y-3">
                      <h4 className="text-sm font-bold text-tropic-gold">{editingIntel ? 'Edit Intel Report' : 'Create Intel Report'}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-[#4a6070]">Title *</label>
                          <Input className="bg-[#050a0e]/50 border-white/20 mt-1" value={intelForm.title} onChange={e => setIntelForm({ ...intelForm, title: e.target.value })} required />
                        </div>
                        <div>
                          <label className="text-xs text-[#4a6070]">Classification</label>
                          <select className="w-full bg-[#050a0e]/50 border border-white/20 rounded px-2 py-2 mt-1 text-sm" value={intelForm.classification} onChange={e => setIntelForm({ ...intelForm, classification: e.target.value })}>
                            <option value="unclassified">Unclassified</option>
                            <option value="confidential">Confidential</option>
                            <option value="secret">Secret</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-[#4a6070]">Content *</label>
                        <Textarea className="bg-[#050a0e]/50 border-white/20 mt-1" rows={3} value={intelForm.content} onChange={e => setIntelForm({ ...intelForm, content: e.target.value })} required />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-[#4a6070]">Region</label>
                          <Input className="bg-[#050a0e]/50 border-white/20 mt-1" value={intelForm.region} onChange={e => setIntelForm({ ...intelForm, region: e.target.value })} placeholder="e.g. Pacific Theater" />
                        </div>
                        <div>
                          <label className="text-xs text-[#4a6070]">Threat Level</label>
                          <select className="w-full bg-[#050a0e]/50 border border-white/20 rounded px-2 py-2 mt-1 text-sm" value={intelForm.threat_level} onChange={e => setIntelForm({ ...intelForm, threat_level: e.target.value })}>
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="critical">Critical</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit" size="sm" className="bg-tropic-olive">{editingIntel ? 'Update' : 'Create'}</Button>
                        <Button type="button" size="sm" variant="outline" className="border-[rgba(201,162,39,0.15)]" onClick={resetIntelForm}>Cancel</Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              )}

              {intelItems.length === 0 && !showIntelForm ? (
                <Card className="bg-[#0c1117]/50 border-[rgba(201,162,39,0.12)]">
                  <CardContent className="p-8 text-center text-[#4a6070]">
                    <Radio className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No intel reports created yet for your unit.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {intelItems.map(item => (
                    <Card key={item.id} className="bg-[#0c1117]/80 border-[rgba(201,162,39,0.12)]">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-bold text-sm">{item.title}</h4>
                            <Badge className="bg-[#111a24] text-[10px]">{item.classification?.toUpperCase()}</Badge>
                            {item.threat_level && (
                              <Badge className={`text-[10px] ${
                                item.threat_level === 'critical' ? 'bg-red-900 text-red-300' :
                                item.threat_level === 'high' ? 'bg-orange-900 text-orange-300' :
                                item.threat_level === 'medium' ? 'bg-yellow-900 text-yellow-300' :
                                'bg-green-900 text-green-300'
                              }`}>{item.threat_level?.toUpperCase()}</Badge>
                            )}
                          </div>
                          <p className="text-xs text-[#8a9aa8] line-clamp-1">{item.content}</p>
                          {item.region && <p className="text-[10px] text-[#4a6070] mt-1">Region: {item.region}</p>}
                        </div>
                        <div className="flex items-center gap-2 ml-3">
                          <Button size="sm" variant="outline" className="border-[rgba(201,162,39,0.15)] text-xs" onClick={() => startEditIntel(item)}>
                            <Pencil className="w-3 h-3 mr-1" />Edit
                          </Button>
                          <Button size="sm" variant="outline" className="border-tropic-red/40 text-tropic-red text-xs" onClick={() => deleteIntel(item.id)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Deployments Tab */}
          {activeTab === 'deployments' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-tropic-gold">Unit Deployments</h3>
                <Button onClick={() => { setShowDepForm(true); setEditingDep(null); setDepForm({
                  title: '', status: 'planning',
                  total_duration_hours: 24, route_points: [], notes: '',
                }); }} className="bg-tropic-olive hover:bg-tropic-olive/80">
                  <Plus className="w-4 h-4 mr-2" />New Deployment
                </Button>
              </div>

              {showDepForm && (
                <Card className="bg-[#0c1117]/50 border-[rgba(201,162,39,0.12)]">
                  <CardContent className="p-4 space-y-3">
                    <h4 className="text-sm font-bold text-tropic-gold">{editingDep ? 'Edit Deployment' : 'Create Deployment'}</h4>
                    <Input placeholder="Title" value={depForm.title} onChange={e => setDepForm(p => ({ ...p, title: e.target.value }))} className="bg-[#050a0e]/50 border-[rgba(201,162,39,0.15)] text-white" />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-[#8a9aa8] mb-1 block">Status</label>
                        <select value={depForm.status} onChange={e => setDepForm(p => ({ ...p, status: e.target.value }))} className="w-full bg-[#050a0e]/50 border border-[rgba(201,162,39,0.15)] text-white rounded px-3 py-2 text-sm">
                          {['planning', 'deploying', 'deployed', 'endex', 'rtb', 'completed', 'cancelled'].map(s => (
                            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-[#8a9aa8] mb-1 block">Total Duration (hours)</label>
                        <Input type="number" step="any" min="0" value={depForm.total_duration_hours} onChange={e => setDepForm(p => ({ ...p, total_duration_hours: parseFloat(e.target.value) || 0 }))} className="bg-[#050a0e]/50 border-[rgba(201,162,39,0.15)] text-white" />
                      </div>
                    </div>

                    {/* Route Points */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-[#8a9aa8] font-bold uppercase tracking-wider">Route Points</label>
                        <Button type="button" variant="outline" size="sm" className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8] hover:text-white h-7 text-xs" onClick={() => {
                          setDepForm(p => ({
                            ...p,
                            route_points: [...p.route_points, { order: p.route_points.length, name: '', latitude: '', longitude: '', description: '', stop_duration_hours: 0 }],
                          }));
                        }}>
                          <Plus className="w-3 h-3 mr-1" />Add Stop
                        </Button>
                      </div>
                      {depForm.route_points.map((rp, idx) => (
                        <div key={idx} className="border border-[rgba(201,162,39,0.12)]/60 rounded p-2 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-tropic-gold font-bold">Stop {idx + 1}</span>
                            <Button type="button" variant="outline" size="sm" className="border-red-900/50 text-red-400 h-6 w-6 p-0" onClick={() => {
                              setDepForm(p => ({ ...p, route_points: p.route_points.filter((_, i) => i !== idx).map((rp2, i) => ({ ...rp2, order: i })) }));
                            }}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                          <Input placeholder="Name" value={rp.name} onChange={e => { const v = e.target.value; setDepForm(p => ({ ...p, route_points: p.route_points.map((r, i) => i === idx ? { ...r, name: v } : r) })); }} className="bg-[#050a0e]/50 border-[rgba(201,162,39,0.15)] text-white text-xs" />
                          <div className="grid grid-cols-3 gap-1">
                            <Input placeholder="Latitude" type="number" step="any" value={rp.latitude} onChange={e => { const v = e.target.value; setDepForm(p => ({ ...p, route_points: p.route_points.map((r, i) => i === idx ? { ...r, latitude: v } : r) })); }} className="bg-[#050a0e]/50 border-[rgba(201,162,39,0.15)] text-white text-xs" />
                            <Input placeholder="Longitude" type="number" step="any" value={rp.longitude} onChange={e => { const v = e.target.value; setDepForm(p => ({ ...p, route_points: p.route_points.map((r, i) => i === idx ? { ...r, longitude: v } : r) })); }} className="bg-[#050a0e]/50 border-[rgba(201,162,39,0.15)] text-white text-xs" />
                            <Input placeholder="Stop (hrs)" type="number" step="any" min="0" value={rp.stop_duration_hours} onChange={e => { const v = parseFloat(e.target.value) || 0; setDepForm(p => ({ ...p, route_points: p.route_points.map((r, i) => i === idx ? { ...r, stop_duration_hours: v } : r) })); }} className="bg-[#050a0e]/50 border-[rgba(201,162,39,0.15)] text-white text-xs" />
                          </div>
                        </div>
                      ))}
                    </div>

                    <Textarea placeholder="Notes" value={depForm.notes} onChange={e => setDepForm(p => ({ ...p, notes: e.target.value }))} className="bg-[#050a0e]/50 border-[rgba(201,162,39,0.15)] text-white" rows={2} />
                    <div className="flex gap-2">
                      <Button onClick={async () => {
                        try {
                          const payload = {
                            title: depForm.title,
                            status: depForm.status,
                            total_duration_hours: depForm.total_duration_hours,
                            route_points: depForm.route_points.map((rp, idx) => ({
                              order: idx,
                              name: rp.name || `Stop ${idx + 1}`,
                              latitude: parseFloat(rp.latitude) || 0,
                              longitude: parseFloat(rp.longitude) || 0,
                              description: rp.description || '',
                              stop_duration_hours: rp.stop_duration_hours || 0,
                            })),
                            notes: depForm.notes,
                          };
                          if (editingDep) {
                            await axios.put(`${API}/partner/admin/deployments/${editingDep}`, payload);
                          } else {
                            await axios.post(`${API}/partner/admin/deployments`, payload);
                          }
                          setShowDepForm(false);
                          setEditingDep(null);
                          fetchData();
                        } catch (err) {
                          alert(formatApiError(err, 'Failed to save deployment'));
                        }
                      }} className="bg-tropic-gold text-black hover:bg-tropic-gold/80">
                        {editingDep ? 'Update' : 'Create'}
                      </Button>
                      <Button variant="outline" onClick={() => { setShowDepForm(false); setEditingDep(null); }} className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8]">Cancel</Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {partnerDeployments.length === 0 ? (
                <Card className="bg-[#0c1117]/50 border-[rgba(201,162,39,0.12)]">
                  <CardContent className="p-6 text-center text-[#4a6070]">No deployments created yet</CardContent>
                </Card>
              ) : (
                partnerDeployments.map(dep => (
                  <Card key={dep.id} className="bg-[#0c1117]/50 border-[rgba(201,162,39,0.12)]">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-bold text-white">{dep.title}</h4>
                            <Badge className={`text-[10px] ${
                              dep.status === 'planning' ? 'bg-[#4a6070]' :
                              dep.status === 'deploying' ? 'bg-yellow-600' :
                              dep.status === 'deployed' ? 'bg-green-600' :
                              dep.status === 'endex' ? 'bg-orange-600' :
                              dep.status === 'rtb' ? 'bg-blue-600' :
                              dep.status === 'completed' ? 'bg-purple-600' : 'bg-red-600'
                            }`}>{dep.status?.toUpperCase()}</Badge>
                            {dep.is_active && <Badge className="bg-green-600/20 text-green-400 text-[10px]">ACTIVE</Badge>}
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs text-[#4a6070] mt-1">
                            {dep.route_points && dep.route_points.length > 0 && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {dep.route_points[0]?.name || 'Origin'} → {dep.route_points[dep.route_points.length - 1]?.name || 'Destination'}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />{dep.total_duration_hours || 0}h total
                            </span>
                            {dep.route_points && (
                              <span className="text-[#4a6070]">{dep.route_points.length} stops</span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1 ml-2">
                          <Button size="sm" variant="outline" className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8] h-7 w-7 p-0" onClick={() => {
                            setDepForm({
                              title: dep.title || '',
                              status: dep.status || 'planning',
                              total_duration_hours: dep.total_duration_hours || 24,
                              route_points: (dep.route_points || []).map((rp, i) => ({
                                order: rp.order ?? i,
                                name: rp.name || '',
                                latitude: rp.latitude ?? '',
                                longitude: rp.longitude ?? '',
                                description: rp.description || '',
                                stop_duration_hours: rp.stop_duration_hours || 0,
                              })),
                              notes: dep.notes || '',
                            });
                            setEditingDep(dep.id);
                            setShowDepForm(true);
                          }}>
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="outline" className="border-red-900/50 text-red-400 h-7 w-7 p-0" onClick={async () => {
                            if (!window.confirm('Delete this deployment? This action cannot be undone.')) return;
                            try {
                              await axios.delete(`${API}/partner/admin/deployments/${dep.id}`);
                              fetchData();
                            } catch (err) {
                              alert(err.response?.data?.detail || 'Failed to delete deployment');
                            }
                          }}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
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
                <Card className="bg-[#0c1117]/50 border-[rgba(201,162,39,0.12)]">
                  <CardContent className="p-6 text-center text-[#4a6070]">No invite codes yet</CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {invites.map(inv => (
                    <Card key={inv.id || inv.code} className="bg-[#0c1117]/80 border-[rgba(201,162,39,0.12)]">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <code className="text-tropic-gold font-mono text-sm">{inv.code}</code>
                          <p className="text-[10px] text-[#4a6070] mt-1">
                            Used: {inv.use_count || 0} / {inv.max_uses || 1}
                          </p>
                        </div>
                        <Button size="sm" variant="outline" className="border-[rgba(201,162,39,0.15)]" onClick={() => copyInviteCode(inv.code)}>
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
                <Card className="bg-[#0c1117]/50 border-[rgba(201,162,39,0.12)]">
                  <CardContent className="p-6 text-center text-[#4a6070]">No audit log entries</CardContent>
                </Card>
              ) : (
                auditLog.map((log, idx) => (
                  <Card key={idx} className="bg-[#0c1117]/80 border-[rgba(201,162,39,0.12)]">
                    <CardContent className="p-3 flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-[#8a9aa8]">{log.action?.replace(/_/g, ' ')}</span>
                        <span className="text-xs text-[#4a6070] ml-2">by {log.performed_by_type}</span>
                      </div>
                      <span className="text-[10px] text-[#4a6070]">{log.timestamp}</span>
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

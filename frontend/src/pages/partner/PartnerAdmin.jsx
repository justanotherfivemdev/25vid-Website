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
import { toDeploymentApiValue, toDeploymentInputValue, formatDeploymentDateTime } from '@/utils/deploymentDateTime';

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
    title: '', description: '', status: 'planning',
    start_location_name: '', start_latitude: '', start_longitude: '',
    destination_name: '', destination_latitude: '', destination_longitude: '',
    start_date: '', estimated_arrival: '', notes: '',
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
    recon: 'bg-green-600', support: 'bg-gray-600'
  }[t] || 'bg-gray-600');

  if (loading) {
    return <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-gray-900 border-b border-tropic-olive/30">
        <div className="flex items-center justify-between px-4 md:px-6 py-4">
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
              <Button variant="outline" size="sm" className="border-gray-700 text-gray-400 hover:bg-gray-700/10">
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
          <div className="flex gap-2 border-b border-gray-800 pb-2 overflow-x-auto">
            {['members', 'operations', 'intel', 'deployments', 'invites', 'audit'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium rounded-t transition-colors whitespace-nowrap ${
                  activeTab === tab ? 'bg-tropic-olive/20 text-tropic-gold border-b-2 border-tropic-gold' : 'text-gray-500 hover:text-gray-300'
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
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

          {/* Operations Tab */}
          {activeTab === 'operations' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-400">Manage your unit's operations</p>
                <Button onClick={() => { resetOpForm(); setShowOpForm(true); }} className="bg-tropic-olive hover:bg-tropic-olive/80">
                  <Plus className="w-4 h-4 mr-2" />New Operation
                </Button>
              </div>

              {showOpForm && (
                <Card className="bg-gray-900/80 border-tropic-olive/30">
                  <CardContent className="p-4">
                    <form onSubmit={saveOperation} className="space-y-3">
                      <h4 className="text-sm font-bold text-tropic-gold">{editingOp ? 'Edit Operation' : 'Create Operation'}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-500">Title *</label>
                          <Input className="bg-black/50 border-white/20 mt-1" value={opForm.title} onChange={e => setOpForm({ ...opForm, title: e.target.value })} required />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Type</label>
                          <select className="w-full bg-black/50 border border-white/20 rounded px-2 py-2 mt-1 text-sm" value={opForm.operation_type} onChange={e => setOpForm({ ...opForm, operation_type: e.target.value })}>
                            <option value="combat">Combat</option>
                            <option value="training">Training</option>
                            <option value="recon">Recon</option>
                            <option value="support">Support</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Description</label>
                        <Textarea className="bg-black/50 border-white/20 mt-1" rows={2} value={opForm.description} onChange={e => setOpForm({ ...opForm, description: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="text-xs text-gray-500">Date</label>
                          <Input type="date" className="bg-black/50 border-white/20 mt-1" value={opForm.date} onChange={e => setOpForm({ ...opForm, date: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Time</label>
                          <Input type="time" className="bg-black/50 border-white/20 mt-1" value={opForm.time} onChange={e => setOpForm({ ...opForm, time: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Location</label>
                          <Input className="bg-black/50 border-white/20 mt-1" value={opForm.location} onChange={e => setOpForm({ ...opForm, location: e.target.value })} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit" size="sm" className="bg-tropic-olive">{editingOp ? 'Update' : 'Create'}</Button>
                        <Button type="button" size="sm" variant="outline" className="border-gray-700" onClick={resetOpForm}>Cancel</Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              )}

              {operations.length === 0 && !showOpForm ? (
                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="p-8 text-center text-gray-500">
                    <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No operations created yet for your unit.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {operations.map(op => (
                    <Card key={op.id} className="bg-gray-900/80 border-gray-800">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-bold text-sm">{op.title}</h4>
                            <Badge className={`${getTypeColor(op.operation_type)} text-[10px]`}>{op.operation_type?.toUpperCase()}</Badge>
                          </div>
                          <p className="text-xs text-gray-400 line-clamp-1">{op.description}</p>
                          <div className="flex items-center gap-3 text-[10px] text-gray-500 mt-1">
                            {op.date && <span><Calendar className="w-3 h-3 inline mr-1" />{op.date}</span>}
                            {op.time && <span><Clock className="w-3 h-3 inline mr-1" />{op.time}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-3">
                          <Button size="sm" variant="outline" className="border-gray-700 text-xs" onClick={() => startEditOp(op)}>
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
                <p className="text-sm text-gray-400">Manage your unit's intelligence reports</p>
                <Button onClick={() => { resetIntelForm(); setShowIntelForm(true); }} className="bg-tropic-olive hover:bg-tropic-olive/80">
                  <Plus className="w-4 h-4 mr-2" />New Intel Report
                </Button>
              </div>

              {showIntelForm && (
                <Card className="bg-gray-900/80 border-tropic-olive/30">
                  <CardContent className="p-4">
                    <form onSubmit={saveIntel} className="space-y-3">
                      <h4 className="text-sm font-bold text-tropic-gold">{editingIntel ? 'Edit Intel Report' : 'Create Intel Report'}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-500">Title *</label>
                          <Input className="bg-black/50 border-white/20 mt-1" value={intelForm.title} onChange={e => setIntelForm({ ...intelForm, title: e.target.value })} required />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Classification</label>
                          <select className="w-full bg-black/50 border border-white/20 rounded px-2 py-2 mt-1 text-sm" value={intelForm.classification} onChange={e => setIntelForm({ ...intelForm, classification: e.target.value })}>
                            <option value="unclassified">Unclassified</option>
                            <option value="confidential">Confidential</option>
                            <option value="secret">Secret</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Content *</label>
                        <Textarea className="bg-black/50 border-white/20 mt-1" rows={3} value={intelForm.content} onChange={e => setIntelForm({ ...intelForm, content: e.target.value })} required />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-500">Region</label>
                          <Input className="bg-black/50 border-white/20 mt-1" value={intelForm.region} onChange={e => setIntelForm({ ...intelForm, region: e.target.value })} placeholder="e.g. Pacific Theater" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Threat Level</label>
                          <select className="w-full bg-black/50 border border-white/20 rounded px-2 py-2 mt-1 text-sm" value={intelForm.threat_level} onChange={e => setIntelForm({ ...intelForm, threat_level: e.target.value })}>
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="critical">Critical</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit" size="sm" className="bg-tropic-olive">{editingIntel ? 'Update' : 'Create'}</Button>
                        <Button type="button" size="sm" variant="outline" className="border-gray-700" onClick={resetIntelForm}>Cancel</Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              )}

              {intelItems.length === 0 && !showIntelForm ? (
                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="p-8 text-center text-gray-500">
                    <Radio className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No intel reports created yet for your unit.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {intelItems.map(item => (
                    <Card key={item.id} className="bg-gray-900/80 border-gray-800">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-bold text-sm">{item.title}</h4>
                            <Badge className="bg-gray-700 text-[10px]">{item.classification?.toUpperCase()}</Badge>
                            {item.threat_level && (
                              <Badge className={`text-[10px] ${
                                item.threat_level === 'critical' ? 'bg-red-900 text-red-300' :
                                item.threat_level === 'high' ? 'bg-orange-900 text-orange-300' :
                                item.threat_level === 'medium' ? 'bg-yellow-900 text-yellow-300' :
                                'bg-green-900 text-green-300'
                              }`}>{item.threat_level?.toUpperCase()}</Badge>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 line-clamp-1">{item.content}</p>
                          {item.region && <p className="text-[10px] text-gray-500 mt-1">Region: {item.region}</p>}
                        </div>
                        <div className="flex items-center gap-2 ml-3">
                          <Button size="sm" variant="outline" className="border-gray-700 text-xs" onClick={() => startEditIntel(item)}>
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
                  title: '', description: '', status: 'planning',
                  start_location_name: '', start_latitude: '', start_longitude: '',
                  destination_name: '', destination_latitude: '', destination_longitude: '',
                  start_date: '', estimated_arrival: '', notes: '',
                }); }} className="bg-tropic-olive hover:bg-tropic-olive/80">
                  <Plus className="w-4 h-4 mr-2" />New Deployment
                </Button>
              </div>

              {showDepForm && (
                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="p-4 space-y-3">
                    <h4 className="text-sm font-bold text-tropic-gold">{editingDep ? 'Edit Deployment' : 'Create Deployment'}</h4>
                    <Input placeholder="Title" value={depForm.title} onChange={e => setDepForm(p => ({ ...p, title: e.target.value }))} className="bg-black/50 border-gray-700 text-white" />
                    <Textarea placeholder="Description" value={depForm.description} onChange={e => setDepForm(p => ({ ...p, description: e.target.value }))} className="bg-black/50 border-gray-700 text-white" rows={2} />
                    <select value={depForm.status} onChange={e => setDepForm(p => ({ ...p, status: e.target.value }))} className="w-full bg-black/50 border border-gray-700 text-white rounded px-3 py-2 text-sm">
                      {['planning', 'deploying', 'deployed', 'returning', 'completed', 'cancelled'].map(s => (
                        <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                      ))}
                    </select>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <Input placeholder="Start Location Name" value={depForm.start_location_name} onChange={e => setDepForm(p => ({ ...p, start_location_name: e.target.value }))} className="bg-black/50 border-gray-700 text-white" />
                      <Input placeholder="Start Latitude" type="number" step="any" value={depForm.start_latitude} onChange={e => setDepForm(p => ({ ...p, start_latitude: e.target.value }))} className="bg-black/50 border-gray-700 text-white" />
                      <Input placeholder="Start Longitude" type="number" step="any" value={depForm.start_longitude} onChange={e => setDepForm(p => ({ ...p, start_longitude: e.target.value }))} className="bg-black/50 border-gray-700 text-white" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <Input placeholder="Destination Name" value={depForm.destination_name} onChange={e => setDepForm(p => ({ ...p, destination_name: e.target.value }))} className="bg-black/50 border-gray-700 text-white" />
                      <Input placeholder="Destination Latitude" type="number" step="any" value={depForm.destination_latitude} onChange={e => setDepForm(p => ({ ...p, destination_latitude: e.target.value }))} className="bg-black/50 border-gray-700 text-white" />
                      <Input placeholder="Destination Longitude" type="number" step="any" value={depForm.destination_longitude} onChange={e => setDepForm(p => ({ ...p, destination_longitude: e.target.value }))} className="bg-black/50 border-gray-700 text-white" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">Start Date & Time</label>
                        <Input type="datetime-local" value={depForm.start_date} onChange={e => setDepForm(p => ({ ...p, start_date: e.target.value }))} className="bg-black/50 border-gray-700 text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">Estimated Arrival</label>
                        <Input type="datetime-local" value={depForm.estimated_arrival} onChange={e => setDepForm(p => ({ ...p, estimated_arrival: e.target.value }))} className="bg-black/50 border-gray-700 text-white" />
                      </div>
                    </div>
                    <Textarea placeholder="Notes" value={depForm.notes} onChange={e => setDepForm(p => ({ ...p, notes: e.target.value }))} className="bg-black/50 border-gray-700 text-white" rows={2} />
                    <div className="flex gap-2">
                      <Button onClick={async () => {
                        try {
                          const startDate = toDeploymentApiValue(depForm.start_date);
                          const estimatedArrival = toDeploymentApiValue(depForm.estimated_arrival);
                          if (startDate && estimatedArrival && new Date(estimatedArrival).getTime() <= new Date(startDate).getTime()) {
                            alert('Estimated arrival must be after the start date.');
                            return;
                          }

                          const payload = {
                            ...depForm,
                            start_date: startDate,
                            estimated_arrival: estimatedArrival,
                            start_latitude: depForm.start_latitude ? parseFloat(depForm.start_latitude) : 0,
                            start_longitude: depForm.start_longitude ? parseFloat(depForm.start_longitude) : 0,
                            destination_latitude: depForm.destination_latitude ? parseFloat(depForm.destination_latitude) : null,
                            destination_longitude: depForm.destination_longitude ? parseFloat(depForm.destination_longitude) : null,
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
                      <Button variant="outline" onClick={() => { setShowDepForm(false); setEditingDep(null); }} className="border-gray-700 text-gray-400">Cancel</Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {partnerDeployments.length === 0 ? (
                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="p-6 text-center text-gray-500">No deployments created yet</CardContent>
                </Card>
              ) : (
                partnerDeployments.map(dep => (
                  <Card key={dep.id} className="bg-gray-900/50 border-gray-800">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-bold text-white">{dep.title}</h4>
                            <Badge className={`text-[10px] ${
                              dep.status === 'planning' ? 'bg-gray-600' :
                              dep.status === 'deploying' ? 'bg-yellow-600' :
                              dep.status === 'deployed' ? 'bg-green-600' :
                              dep.status === 'returning' ? 'bg-blue-600' :
                              dep.status === 'completed' ? 'bg-purple-600' : 'bg-red-600'
                            }`}>{dep.status?.toUpperCase()}</Badge>
                          </div>
                          {dep.description && <p className="text-xs text-gray-400 mb-1">{dep.description}</p>}
                          <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-1">
                            {dep.start_location_name && (
                              <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />From: {dep.start_location_name}</span>
                            )}
                            {dep.destination_name && (
                              <span className="flex items-center gap-1"><Navigation className="w-3 h-3" />To: {dep.destination_name}</span>
                            )}
                            {dep.start_date && (
                              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Start: {formatDeploymentDateTime(dep.start_date, { includeTime: true })}</span>
                            )}
                            {dep.estimated_arrival && (
                              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />ETA: {formatDeploymentDateTime(dep.estimated_arrival, { includeTime: true })}</span>
                            )}
                          </div>
                          {dep.start_latitude != null && dep.start_longitude != null && (
                            <p className="text-[10px] text-gray-600 mt-1">Origin: {dep.start_latitude}, {dep.start_longitude}</p>
                          )}
                          {dep.destination_latitude != null && dep.destination_longitude != null && (
                            <p className="text-[10px] text-gray-600">Dest: {dep.destination_latitude}, {dep.destination_longitude}</p>
                          )}
                        </div>
                        <div className="flex gap-1 ml-2">
                          <Button size="sm" variant="outline" className="border-gray-700 text-gray-400 h-7 w-7 p-0" onClick={() => {
                            setDepForm({
                              title: dep.title || '', description: dep.description || '',
                              status: dep.status || 'planning',
                              start_location_name: dep.start_location_name || '',
                              start_latitude: dep.start_latitude ?? '',
                              start_longitude: dep.start_longitude ?? '',
                              destination_name: dep.destination_name || '',
                              destination_latitude: dep.destination_latitude ?? '',
                              destination_longitude: dep.destination_longitude ?? '',
                              start_date: toDeploymentInputValue(dep.start_date),
                              estimated_arrival: toDeploymentInputValue(dep.estimated_arrival),
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

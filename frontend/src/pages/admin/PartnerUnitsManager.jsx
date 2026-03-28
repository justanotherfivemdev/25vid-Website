import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Users, Plus, Copy, Trash2, ChevronDown, ChevronRight, Shield, Check, X } from 'lucide-react';
import { API } from '@/utils/api';

const PartnerUnitsManager = () => {
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);
  const [expandedUnit, setExpandedUnit] = useState(null);
  const [unitDetail, setUnitDetail] = useState(null);
  const [unitInvites, setUnitInvites] = useState([]);
  const [formData, setFormData] = useState({
    name: '', abbreviation: '', description: '', contact_email: '', max_members: 50
  });

  useEffect(() => { fetchUnits(); }, []);

  const fetchUnits = async () => {
    try {
      const res = await axios.get(`${API}/partner-units`);
      setUnits(res.data);
    } catch (err) {
      console.error('Failed to fetch partner units:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingUnit) {
        await axios.put(`${API}/partner-units/${editingUnit}`, formData);
      } else {
        await axios.post(`${API}/partner-units`, formData);
      }
      setShowForm(false);
      setEditingUnit(null);
      setFormData({ name: '', abbreviation: '', description: '', contact_email: '', max_members: 50 });
      fetchUnits();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to save partner unit');
    }
  };

  const startEdit = (unit) => {
    setEditingUnit(unit.id);
    setFormData({
      name: unit.name || '',
      abbreviation: unit.abbreviation || '',
      description: unit.description || '',
      contact_email: unit.contact_email || '',
      max_members: unit.max_members || 50,
    });
    setShowForm(true);
  };

  const deleteUnit = async (unitId) => {
    if (!window.confirm('Delete this partner unit and all associated accounts? This cannot be undone.')) return;
    try {
      await axios.delete(`${API}/partner-units/${unitId}`);
      fetchUnits();
      if (expandedUnit === unitId) setExpandedUnit(null);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete partner unit');
    }
  };

  const setUnitStatus = async (unitId, status) => {
    try {
      await axios.put(`${API}/partner-units/${unitId}/status`, { status });
      fetchUnits();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to update status');
    }
  };

  const expandUnit = async (unitId) => {
    if (expandedUnit === unitId) {
      setExpandedUnit(null);
      return;
    }
    try {
      const [detailRes, invitesRes] = await Promise.all([
        axios.get(`${API}/partner-units/${unitId}`),
        axios.get(`${API}/partner-units/${unitId}/invites`),
      ]);
      setUnitDetail(detailRes.data);
      setUnitInvites(invitesRes.data);
      setExpandedUnit(unitId);
    } catch (err) {
      console.error('Failed to fetch unit details:', err);
    }
  };

  const generateInvite = async (unitId) => {
    try {
      const res = await axios.post(`${API}/partner-units/${unitId}/invites`);
      setUnitInvites(prev => [{ code: res.data.code, id: res.data.id, use_count: 0, max_uses: 1 }, ...prev]);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to generate invite');
    }
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code).catch(() => {});
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-tropic-gold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
              <Shield className="w-6 h-6 inline mr-2" />PARTNER UNITS
            </h1>
            <p className="text-sm text-gray-500 mt-1">S-5 Liaison — Manage allied/partner unit enrollment</p>
          </div>
          <Button onClick={() => { setShowForm(!showForm); setEditingUnit(null); setFormData({ name: '', abbreviation: '', description: '', contact_email: '', max_members: 50 }); }}
            className="bg-tropic-gold hover:bg-tropic-gold-light text-black">
            <Plus className="w-4 h-4 mr-2" />{showForm ? 'Cancel' : 'Enroll Partner Unit'}
          </Button>
        </div>

        {/* Create/Edit Form */}
        {showForm && (
          <Card className="bg-gray-900/80 border-tropic-gold/30">
            <CardHeader>
              <CardTitle className="text-lg text-tropic-gold">
                {editingUnit ? 'Edit Partner Unit' : 'Enroll New Partner Unit'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-400 mb-1 block">Unit Name *</label>
                    <Input required className="bg-black/50 border-white/20" value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-sm text-gray-400 mb-1 block">Abbreviation</label>
                    <Input className="bg-black/50 border-white/20" value={formData.abbreviation}
                      onChange={e => setFormData({ ...formData, abbreviation: e.target.value })} placeholder="e.g., 101AB" />
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Description</label>
                  <Textarea className="bg-black/50 border-white/20" value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-400 mb-1 block">Contact Email</label>
                    <Input type="email" className="bg-black/50 border-white/20" value={formData.contact_email}
                      onChange={e => setFormData({ ...formData, contact_email: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-sm text-gray-400 mb-1 block">Max Members</label>
                    <Input type="number" min={1} className="bg-black/50 border-white/20" value={formData.max_members}
                      onChange={e => setFormData({ ...formData, max_members: parseInt(e.target.value) || 50 })} />
                  </div>
                </div>
                <Button type="submit" className="bg-tropic-gold hover:bg-tropic-gold-light text-black">
                  {editingUnit ? 'Update Unit' : 'Enroll Unit'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Units List */}
        {loading ? (
          <div className="text-center text-gray-500 py-12">Loading partner units...</div>
        ) : units.length === 0 ? (
          <Card className="bg-gray-900/50 border-gray-800">
            <CardContent className="p-12 text-center text-gray-500">
              <Shield className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="text-lg mb-2">No partner units enrolled</p>
              <p className="text-sm">Click "Enroll Partner Unit" to add allied units to the platform.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {units.map(unit => (
              <div key={unit.id}>
                <Card className="bg-gray-900/80 border-gray-800 hover:border-tropic-gold/30 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 cursor-pointer" onClick={() => expandUnit(unit.id)}>
                        {expandedUnit === unit.id ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                        <div>
                          <div className="font-bold text-sm">
                            {unit.name}
                            {unit.abbreviation && <span className="text-gray-500 ml-2">({unit.abbreviation})</span>}
                          </div>
                          <div className="text-xs text-gray-500">
                            <Users className="w-3 h-3 inline mr-1" />{unit.member_count || 0} members
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={`text-[10px] ${
                          unit.status === 'active' ? 'bg-green-900/50 text-green-400' :
                          unit.status === 'pending' ? 'bg-yellow-900/50 text-yellow-400' :
                          'bg-gray-700 text-gray-400'
                        }`}>
                          {unit.status?.toUpperCase()}
                        </Badge>
                        {unit.status !== 'active' && (
                          <Button size="sm" variant="outline" className="border-green-700 text-green-400 text-xs"
                            onClick={() => setUnitStatus(unit.id, 'active')}>
                            <Check className="w-3 h-3 mr-1" />Activate
                          </Button>
                        )}
                        {unit.status === 'active' && (
                          <Button size="sm" variant="outline" className="border-yellow-700 text-yellow-400 text-xs"
                            onClick={() => setUnitStatus(unit.id, 'inactive')}>
                            <X className="w-3 h-3 mr-1" />Deactivate
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="border-gray-700 text-xs" onClick={() => startEdit(unit)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="outline" className="border-tropic-red/40 text-tropic-red text-xs"
                          onClick={() => deleteUnit(unit.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Expanded Unit Detail */}
                {expandedUnit === unit.id && unitDetail && (
                  <Card className="bg-gray-800/50 border-gray-700 mt-1 ml-6">
                    <CardContent className="p-4 space-y-4">
                      {/* Members */}
                      <div>
                        <h4 className="text-sm font-bold text-tropic-gold mb-2">Members ({unitDetail.members?.length || 0})</h4>
                        {(!unitDetail.members || unitDetail.members.length === 0) ? (
                          <p className="text-xs text-gray-500">No members yet. Generate an invite code below.</p>
                        ) : (
                          <div className="space-y-1">
                            {unitDetail.members.map(m => (
                              <div key={m.id} className="flex items-center justify-between bg-gray-900/50 rounded px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm">{m.username}</span>
                                  {m.rank && <span className="text-xs text-gray-500">{m.rank}</span>}
                                </div>
                                <Badge className={`text-[10px] ${m.partner_role === 'partner_admin' ? 'bg-tropic-gold/20 text-tropic-gold' : 'bg-gray-700'}`}>
                                  {m.partner_role === 'partner_admin' ? 'ADMIN' : 'MEMBER'}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Invites */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-bold text-tropic-gold">Invite Codes</h4>
                          <Button size="sm" className="bg-tropic-gold hover:bg-tropic-gold-light text-black text-xs" onClick={() => generateInvite(unit.id)}>
                            <Plus className="w-3 h-3 mr-1" />Generate
                          </Button>
                        </div>
                        {unitInvites.length === 0 ? (
                          <p className="text-xs text-gray-500">No invite codes generated.</p>
                        ) : (
                          <div className="space-y-1">
                            {unitInvites.map(inv => (
                              <div key={inv.id || inv.code} className="flex items-center justify-between bg-gray-900/50 rounded px-3 py-2">
                                <code className="text-tropic-gold font-mono text-xs">{inv.code}</code>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-gray-500">Used: {inv.use_count || 0}/{inv.max_uses || 1}</span>
                                  <Button size="sm" variant="outline" className="border-gray-700 text-xs h-6 px-2" onClick={() => copyCode(inv.code)}>
                                    <Copy className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default PartnerUnitsManager;

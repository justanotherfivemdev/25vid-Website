import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Shield, Users, ArrowLeft, LogOut, Save, Trash2, Crown } from 'lucide-react';
import { API } from '@/utils/api';

const PartnerAdminPage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [unit, setUnit] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editForm, setEditForm] = useState({ description: '', contact_email: '', abbreviation: '' });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/partner/admin/unit`),
      axios.get(`${API}/partner/admin/members`),
    ]).then(([unitRes, membersRes]) => {
      setUnit(unitRes.data);
      setEditForm({ description: unitRes.data.description || '', contact_email: unitRes.data.contact_email || '', abbreviation: unitRes.data.abbreviation || '' });
      setMembers(membersRes.data);
    }).catch(() => navigate('/partner'))
    .finally(() => setLoading(false));
  }, [navigate]);

  const handleSave = async () => {
    setError(''); setNotice(''); setSaving(true);
    try {
      await axios.put(`${API}/partner/admin/unit`, editForm);
      setNotice('Unit information updated.');
    } catch (err) {
      setError(err.response?.data?.detail || 'Update failed.');
    } finally { setSaving(false); }
  };

  const handleRemoveMember = async (memberId, username) => {
    if (!window.confirm(`Remove ${username} from the unit?`)) return;
    try {
      await axios.delete(`${API}/partner/admin/members/${memberId}`);
      setMembers(prev => prev.filter(m => m.id !== memberId));
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not remove member.');
    }
  };

  const handleToggleAdmin = async (member) => {
    const newRole = member.partner_role === 'partner_admin' ? 'partner_member' : 'partner_admin';
    try {
      await axios.put(`${API}/partner/admin/members/${member.id}`, { partner_role: newRole });
      setMembers(prev => prev.map(m => m.id === member.id ? { ...m, partner_role: newRole } : m));
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not update member role.');
    }
  };

  const handleLogout = async () => { await logout(); navigate('/'); };

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-tropic-gold border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-black text-white">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur border-b border-tropic-gold/40">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/partner"><Button size="sm" variant="outline" className="border-gray-700"><ArrowLeft className="w-4 h-4" /></Button></Link>
            <Shield className="w-5 h-5 text-tropic-gold" />
            <div>
              <h1 className="text-base font-bold tracking-wider text-tropic-gold leading-none" style={{ fontFamily: 'Rajdhani, sans-serif' }}>PARTNER ADMIN</h1>
              <p className="text-[10px] text-gray-500 tracking-widest leading-none">UNIT MANAGEMENT</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-tropic-gold/20 text-tropic-gold border border-tropic-gold/40 text-[10px]">UNIT ADMIN</Badge>
            <Button size="sm" variant="outline" onClick={handleLogout} className="border-gray-700"><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </nav>

      <div className="pt-20 pb-12 px-6">
        <div className="container mx-auto max-w-4xl space-y-8">

          {/* Unit Info */}
          <Card className="bg-gray-900/80 border-tropic-gold/30">
            <CardHeader><CardTitle className="text-tropic-gold tracking-wider" style={{ fontFamily: 'Rajdhani, sans-serif' }}>UNIT INFORMATION — {unit?.name}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-300">Abbreviation</label>
                  <Input className="bg-black/50 border-gray-700" value={editForm.abbreviation} onChange={e => setEditForm({...editForm, abbreviation: e.target.value})} placeholder="e.g., 3ID" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-300">Contact Email</label>
                  <Input type="email" className="bg-black/50 border-gray-700" value={editForm.contact_email} onChange={e => setEditForm({...editForm, contact_email: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-300">Description</label>
                <Input className="bg-black/50 border-gray-700" value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} placeholder="Brief description of your unit" />
              </div>
              {notice && <p className="text-green-400 text-sm">{notice}</p>}
              {error && <p className="text-tropic-gold text-sm">{error}</p>}
              <Button onClick={handleSave} disabled={saving} className="bg-tropic-gold hover:bg-tropic-gold-light text-black font-bold tracking-wider">
                <Save className="w-4 h-4 mr-2" />{saving ? 'Saving...' : 'SAVE CHANGES'}
              </Button>
            </CardContent>
          </Card>

          {/* Members */}
          <Card className="bg-gray-900/80 border-gray-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-tropic-gold tracking-wider flex items-center gap-2" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                  <Users className="w-5 h-5" />UNIT MEMBERS ({members.length})
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No members yet. Share your invite token to onboard members.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {members.map(m => (
                    <div key={m.id} className="flex items-center justify-between bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm font-bold text-tropic-gold">
                          {m.username?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <span className="font-semibold text-sm">{m.username}</span>
                          {m.rank && <span className="text-gray-400 text-xs ml-2">{m.rank}</span>}
                        </div>
                        <Badge className={`text-[10px] ${m.partner_role === 'partner_admin' ? 'bg-tropic-gold/20 text-tropic-gold border-tropic-gold/40' : 'bg-gray-700 text-gray-400 border-gray-600'} border`}>
                          {m.partner_role === 'partner_admin' ? 'ADMIN' : 'MEMBER'}
                        </Badge>
                      </div>
                      {m.id !== user?.id && (
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => handleToggleAdmin(m)} className="border-tropic-gold/30 text-tropic-gold hover:bg-tropic-gold/10 h-7 px-2">
                            <Crown className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleRemoveMember(m.id, m.username)} className="border-red-900/50 text-red-400 hover:bg-red-900/20 h-7 px-2">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="text-xs text-gray-600 text-center">
            Partner Admin access is scoped to your unit only. You cannot access or modify 25th ID member data or other partner units.
          </div>
        </div>
      </div>
    </div>
  );
};

export default PartnerAdminPage;

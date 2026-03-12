import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Calendar, Clock, Users, Shield, Home, LogOut, CheckCircle, HelpCircle, XCircle, ChevronUp } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STATUS_ICON = { attending: CheckCircle, tentative: HelpCircle, waitlisted: Clock };
const STATUS_COLOR = { attending: 'text-green-400', tentative: 'text-yellow-400', waitlisted: 'text-orange-400' };
const TYPE_CFG = { combat: 'bg-amber-800/80', training: 'bg-blue-700/80', recon: 'bg-emerald-700/80', support: 'bg-amber-700/80' };

const OperationDetail = () => {
  const { id } = useParams();
  const [operation, setOperation] = useState(null);
  const [rsvpData, setRsvpData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [roleNotes, setRoleNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  useEffect(() => { fetchData(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      const [opRes, rsvpRes] = await Promise.all([
        axios.get(`${API}/operations`),
        axios.get(`${API}/operations/${id}/rsvp`)
      ]);
      const op = opRes.data.find(o => o.id === id);
      if (!op) { navigate('/hub'); return; }
      setOperation(op);
      setRsvpData(rsvpRes.data);
      // Pre-fill role notes if user already RSVPed
      const allRsvps = [...(rsvpRes.data.attending || []), ...(rsvpRes.data.tentative || []), ...(rsvpRes.data.waitlisted || [])];
      const myRsvp = allRsvps.find(r => r.user_id === user.id);
      if (myRsvp) setRoleNotes(myRsvp.role_notes || '');
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const myStatus = () => {
    if (!rsvpData) return null;
    const all = [...(rsvpData.attending || []), ...(rsvpData.tentative || []), ...(rsvpData.waitlisted || [])];
    return all.find(r => r.user_id === user.id)?.status || null;
  };

  const handleRSVP = async (status) => {
    setSubmitting(true);
    try {
      await axios.post(`${API}/operations/${id}/rsvp`, { status, role_notes: roleNotes });
      await fetchData();
    } catch (e) { alert(e.response?.data?.detail || 'RSVP failed'); }
    finally { setSubmitting(false); }
  };

  const handleCancel = async () => {
    setSubmitting(true);
    try {
      await axios.delete(`${API}/operations/${id}/rsvp`);
      setRoleNotes('');
      await fetchData();
    } catch (e) { alert('Cancel failed'); }
    finally { setSubmitting(false); }
  };

  const handlePromote = async (userId) => {
    try {
      await axios.put(`${API}/admin/operations/${id}/rsvp/${userId}/promote`, {});
      await fetchData();
    } catch (e) { alert(e.response?.data?.detail || 'Promote failed'); }
  };

  const handleLogout = async () => { await logout(); navigate('/'); };

  if (loading) return <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading...</div>;
  if (!operation) return <div className="min-h-screen bg-black text-white flex items-center justify-center">Operation not found</div>;

  const currentStatus = myStatus();
  const counts = rsvpData?.counts || {};
  const maxP = rsvpData?.max_participants;

  return (
    <div className="min-h-screen bg-black text-white">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur border-b border-amber-700/30">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/hub"><Button size="sm" variant="outline" className="border-gray-700"><ArrowLeft className="w-4 h-4 mr-1" />Hub</Button></Link>
            <h1 className="text-xl font-bold tracking-widest truncate" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{operation.title}</h1>
          </div>
          <div className="flex items-center space-x-3">
            {user?.role === 'admin' && <Link to="/admin/operations"><Button size="sm" variant="outline" className="border-amber-700 text-amber-500"><Shield className="w-4 h-4" /></Button></Link>}
            <Link to="/"><Button size="sm" variant="outline" className="border-gray-700"><Home className="w-4 h-4" /></Button></Link>
            <Button size="sm" variant="outline" onClick={handleLogout} className="border-gray-700"><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </nav>

      <div className="pt-20 pb-12 px-6">
        <div className="container mx-auto max-w-4xl space-y-6">
          {/* Op Header */}
          <Card className="bg-gray-900/80 border-gray-800 overflow-hidden" data-testid="operation-detail-header">
            <div className={`h-2 ${TYPE_CFG[operation.operation_type] || 'bg-gray-700'}`}></div>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <Badge className={`${TYPE_CFG[operation.operation_type] || 'bg-gray-600'} text-white tracking-wider`}>{operation.operation_type.toUpperCase()}</Badge>
                <div className="flex items-center gap-4 text-sm text-gray-400">
                  <span className="flex items-center"><Calendar className="w-4 h-4 mr-1 text-amber-600" />{operation.date}</span>
                  <span className="flex items-center"><Clock className="w-4 h-4 mr-1 text-amber-600" />{operation.time}</span>
                </div>
              </div>
              <h2 className="text-3xl font-bold tracking-wider" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{operation.title}</h2>
              <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{operation.description}</p>
              {/* Attendance summary */}
              <div className="flex items-center gap-6 bg-black/30 rounded-lg p-4 border border-gray-800/50">
                <div className="text-center"><div className="text-2xl font-bold text-green-400">{counts.attending || 0}</div><div className="text-[10px] text-gray-500 tracking-wider">ATTENDING</div></div>
                <div className="text-center"><div className="text-2xl font-bold text-yellow-400">{counts.tentative || 0}</div><div className="text-[10px] text-gray-500 tracking-wider">TENTATIVE</div></div>
                {maxP && <div className="text-center"><div className="text-2xl font-bold text-orange-400">{counts.waitlisted || 0}</div><div className="text-[10px] text-gray-500 tracking-wider">WAITLISTED</div></div>}
                {maxP && <div className="text-center ml-auto"><div className="text-2xl font-bold text-gray-300">{maxP}</div><div className="text-[10px] text-gray-500 tracking-wider">CAPACITY</div></div>}
              </div>
            </CardContent>
          </Card>

          {/* RSVP Actions */}
          <Card className="bg-gray-900/80 border-gray-800" data-testid="rsvp-actions">
            <CardHeader className="pb-3"><CardTitle className="text-lg tracking-wider">YOUR RSVP</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {currentStatus && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-400">Current status:</span>
                  <Badge className={`${currentStatus === 'attending' ? 'bg-green-700' : currentStatus === 'tentative' ? 'bg-yellow-700' : 'bg-orange-700'} text-white`}>{currentStatus.toUpperCase()}</Badge>
                </div>
              )}
              <div>
                <label className="text-xs text-gray-500 block mb-1">Role / Slot Notes (optional)</label>
                <Input value={roleNotes} onChange={e => setRoleNotes(e.target.value)} className="bg-black border-gray-700" placeholder="e.g., Squad Lead, Medic, DMR" data-testid="rsvp-role-notes" />
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => handleRSVP('attending')} disabled={submitting} className={`${currentStatus === 'attending' ? 'bg-green-700 ring-2 ring-green-500' : 'bg-green-800/60 hover:bg-green-700'}`} data-testid="rsvp-attending"><CheckCircle className="w-4 h-4 mr-2" />Attending</Button>
                <Button onClick={() => handleRSVP('tentative')} disabled={submitting} className={`${currentStatus === 'tentative' ? 'bg-yellow-700 ring-2 ring-yellow-500' : 'bg-yellow-800/60 hover:bg-yellow-700'}`} data-testid="rsvp-tentative"><HelpCircle className="w-4 h-4 mr-2" />Tentative</Button>
                {currentStatus && <Button onClick={handleCancel} disabled={submitting} variant="outline" className="border-amber-700 text-amber-500 hover:bg-amber-700/10" data-testid="rsvp-cancel"><XCircle className="w-4 h-4 mr-2" />Cancel RSVP</Button>}
              </div>
            </CardContent>
          </Card>

          {/* Attending Roster */}
          {rsvpData && (
            <div className="space-y-4">
              {[
                { label: 'ATTENDING', list: rsvpData.attending, color: 'text-green-400', icon: CheckCircle },
                { label: 'TENTATIVE', list: rsvpData.tentative, color: 'text-yellow-400', icon: HelpCircle },
                { label: 'WAITLISTED', list: rsvpData.waitlisted, color: 'text-orange-400', icon: Clock },
              ].filter(g => g.list?.length > 0).map(group => (
                <Card key={group.label} className="bg-gray-900/80 border-gray-800">
                  <CardHeader className="pb-2">
                    <CardTitle className={`text-sm tracking-wider flex items-center gap-2 ${group.color}`}>
                      <group.icon className="w-4 h-4" /> {group.label} ({group.list.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      {group.list.map((r, i) => (
                        <div key={r.user_id || i} className="flex items-center justify-between py-2 px-3 bg-black/20 rounded border border-gray-800/30" data-testid={`rsvp-entry-${r.user_id}`}>
                          <div className="flex items-center gap-3">
                            <Link to={`/roster/${r.user_id}`} className="font-medium text-sm hover:text-amber-400 transition-colors">{r.username}</Link>
                            {r.role_notes && <span className="text-xs text-gray-500 border border-gray-800 px-1.5 py-0.5 rounded">{r.role_notes}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-600">{new Date(r.rsvp_time).toLocaleDateString()}</span>
                            {user?.role === 'admin' && group.label === 'WAITLISTED' && (
                              <Button size="sm" onClick={() => handlePromote(r.user_id)} className="bg-green-700 hover:bg-green-600 text-xs px-2 py-1 h-auto" data-testid={`promote-${r.user_id}`}><ChevronUp className="w-3 h-3 mr-1" />Promote</Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OperationDetail;

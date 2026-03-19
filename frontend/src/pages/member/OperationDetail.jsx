import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Calendar, Clock, Shield, Home, LogOut, CheckCircle, HelpCircle, XCircle, ChevronUp, ChevronDown, Globe, MapPin } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import MapMiniView from '@/components/MapMiniView';
import { colors } from '@/theme/theme';

import { BACKEND_URL, API } from '@/utils/api';
const resolveImg = (url) => { if (!url) return ''; if (url.startsWith('http')) return url; if (url.startsWith('/uploads/')) return `${BACKEND_URL}/api${url}`; return `${BACKEND_URL}${url}`; };

const STATUS_ICON = { attending: CheckCircle, tentative: HelpCircle, waitlisted: Clock };
const STATUS_COLOR = { attending: 'text-green-400', tentative: 'text-yellow-400', waitlisted: 'text-orange-400' };
const TYPE_CFG = { combat: 'bg-tropic-red/80', training: 'bg-tropic-gold-dark/80', recon: 'bg-emerald-700/80', support: 'bg-gray-600/80' };

const RsvpMemberRow = ({ r, user, group, onPromote }) => {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <div className="border border-gray-800/50 rounded overflow-hidden" data-testid={`rsvp-entry-${r.user_id}`}>
      <div 
        className="flex items-center justify-between py-2 px-3 bg-black/30 cursor-pointer hover:bg-black/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {r.avatar_url ? (
            <img src={resolveImg(r.avatar_url)} alt="" className="w-8 h-8 rounded object-cover border border-gray-700" />
          ) : (
            <div className="w-8 h-8 rounded bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-500">{r.username?.[0]?.toUpperCase()}</div>
          )}
          <div>
            <Link to={`/roster/${r.user_id}`} className="font-medium text-sm hover:text-tropic-gold transition-colors" onClick={e => e.stopPropagation()}>{r.username}</Link>
            {r.rank && <span className="text-xs text-gray-500 ml-2">{r.rank}</span>}
          </div>
          {r.mos_code && (
            <span className="text-[10px] text-tropic-gold bg-tropic-gold/10 border border-tropic-gold/30 px-1.5 py-0.5 rounded font-mono">
              {r.mos_code}
            </span>
          )}
          {r.role_notes && <span className="text-xs text-tropic-gold/80 border border-tropic-gold/30 px-1.5 py-0.5 rounded bg-tropic-gold/10">{r.role_notes}</span>}
        </div>
        <div className="flex items-center gap-2">
          {r.specialization && <span className="text-[10px] text-tropic-gold hidden sm:inline">{r.specialization}</span>}
          {user?.role === 'admin' && group.label === 'WAITLISTED' && (
            <Button size="sm" onClick={(e) => { e.stopPropagation(); onPromote(r.user_id); }} className="bg-green-700 hover:bg-green-600 text-xs px-2 py-1 h-auto" data-testid={`promote-${r.user_id}`}><ChevronUp className="w-3 h-3 mr-1" />Promote</Button>
          )}
          <ChevronDown className={`w-4 h-4 text-gray-600 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </div>
      {expanded && (
        <div className="px-3 py-2 bg-gray-900/50 border-t border-gray-800/30 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {r.company && <div><span className="text-gray-600">Company:</span> <span className="text-tropic-gold">{r.company}</span></div>}
          {r.platoon && <div><span className="text-gray-600">Platoon:</span> <span className="text-green-400">{r.platoon}</span></div>}
          {r.squad && <div><span className="text-gray-600">Squad:</span> <span className="text-gray-400">{r.squad}</span></div>}
          {r.mos_title && <div><span className="text-gray-600">MOS:</span> <span className="text-tropic-gold">{r.mos_code} — {r.mos_title}</span></div>}
          {r.billet && (
            <div><span className="text-gray-600">Billet:</span>{' '}
              <span className="text-tropic-gold">{r.billet_acronym ? `${r.billet_acronym} — ${r.billet}` : r.billet}</span>
            </div>
          )}
          {r.member_status && <div><span className="text-gray-600">Status:</span> <span className="text-gray-400 capitalize">{r.member_status}</span></div>}
          {r.rsvp_time && <div><span className="text-gray-600">RSVPed:</span> <span className="text-gray-500">{new Date(r.rsvp_time).toLocaleDateString()}</span></div>}
        </div>
      )}
    </div>
  );
};

const OperationDetail = () => {
  const { id } = useParams();
  const [operation, setOperation] = useState(null);
  const [rosterData, setRosterData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [roleNotes, setRoleNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  useEffect(() => { fetchData(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      const [opRes, rosterRes] = await Promise.all([
        axios.get(`${API}/operations/${id}`),
        axios.get(`${API}/operations/${id}/roster`)
      ]);
      const op = opRes.data;
      if (!op) { navigate('/hub'); return; }
      setOperation(op);
      setRosterData(rosterRes.data);
      // Pre-fill role notes if user already RSVPed
      const rsvps = rosterRes.data?.rsvps || {};
      const allRsvps = [...(rsvps.attending || []), ...(rsvps.tentative || []), ...(rsvps.waitlisted || [])];
      const myRsvp = allRsvps.find(r => r.user_id === user.id);
      if (myRsvp) setRoleNotes(myRsvp.role_notes || '');
    } catch (e) {
      console.error(e);
      if (e.response?.status === 404) { navigate('/hub'); return; }
    }
    finally { setLoading(false); }
  };

  const myStatus = () => {
    if (!rosterData?.rsvps) return null;
    const rsvps = rosterData.rsvps;
    const all = [...(rsvps.attending || []), ...(rsvps.tentative || []), ...(rsvps.waitlisted || [])];
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
  const counts = rosterData?.counts || {};
  const maxP = rosterData?.max_participants;
  const rsvps = rosterData?.rsvps || {};

  return (
    <div className="min-h-screen bg-black text-white">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/92 backdrop-blur-xl border-b border-tropic-gold/15">
        <div className="container mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/hub"><Button size="sm" variant="outline" className="border-gray-700"><ArrowLeft className="w-4 h-4 mr-1" />Hub</Button></Link>
            <h1 className="text-xl font-bold tracking-widest truncate" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{operation.title}</h1>
          </div>
          <div className="flex items-center space-x-3">
            {user?.role === 'admin' && <Link to="/admin/operations"><Button size="sm" variant="outline" className="border-tropic-gold/60 text-tropic-gold hover:bg-tropic-gold/10"><Shield className="w-4 h-4" /></Button></Link>}
            <Link to="/"><Button size="sm" variant="outline" className="border-gray-700"><Home className="w-4 h-4" /></Button></Link>
            <Button size="sm" variant="outline" onClick={handleLogout} className="border-gray-700"><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </nav>

      <div className="pt-20 pb-12 px-4 md:px-6">
        <div className="container mx-auto max-w-4xl space-y-6">
          {/* Op Header */}
          <Card className="bg-gray-900/80 border-gray-800 overflow-hidden" data-testid="operation-detail-header">
            <div className={`h-2 ${TYPE_CFG[operation.operation_type] || 'bg-gray-700'}`}></div>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <Badge className={`${TYPE_CFG[operation.operation_type] || 'bg-gray-600'} text-white tracking-wider`}>{operation.operation_type.toUpperCase()}</Badge>
                <Badge variant="outline" className={`${operation.activity_state === 'ongoing' ? 'border-tropic-red text-tropic-red' : operation.activity_state === 'completed' ? 'border-green-600 text-green-500' : 'border-gray-700 text-gray-400'} tracking-wider`}>{(operation.activity_state || 'planned').toUpperCase()}</Badge>
                <div className="flex items-center gap-4 text-sm text-gray-400">
                  <span className="flex items-center"><Calendar className="w-4 h-4 mr-1 text-tropic-gold" />{operation.date}</span>
                  <span className="flex items-center"><Clock className="w-4 h-4 mr-1 text-tropic-gold" />{operation.time}</span>
                </div>
              </div>
              <h2 className="text-3xl font-bold tracking-wider" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{operation.title}</h2>
              <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{operation.description}</p>
              {(operation.theater || operation.region_label || operation.grid_ref || operation.campaign_id) && (
                <div className="bg-black/40 border border-gray-800 rounded-lg p-3 text-xs text-gray-300 flex flex-wrap items-center gap-3">
                  {operation.theater && <span className="flex items-center gap-1"><Globe className="w-3.5 h-3.5 text-tropic-gold" />{operation.theater}</span>}
                  {operation.region_label && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-tropic-gold-light" />{operation.region_label}</span>}
                  {operation.grid_ref && <span className="text-gray-400">GRID {operation.grid_ref}</span>}
                  <Link to="/hub/campaign" className="text-tropic-gold hover:underline ml-auto">View on Campaign Map</Link>
                </div>
              )}
              {/* Attendance summary */}
              <div className="flex items-center gap-6 bg-black/30 rounded-lg p-4 border border-gray-800/50">
                <div className="text-center"><div className="text-2xl font-bold text-green-400">{counts.attending || 0}</div><div className="text-[10px] text-gray-500 tracking-wider">ATTENDING</div></div>
                <div className="text-center"><div className="text-2xl font-bold text-yellow-400">{counts.tentative || 0}</div><div className="text-[10px] text-gray-500 tracking-wider">TENTATIVE</div></div>
                {maxP && <div className="text-center"><div className="text-2xl font-bold text-orange-400">{counts.waitlisted || 0}</div><div className="text-[10px] text-gray-500 tracking-wider">WAITLISTED</div></div>}
                {maxP && <div className="text-center ml-auto"><div className="text-2xl font-bold text-gray-300">{maxP}</div><div className="text-[10px] text-gray-500 tracking-wider">CAPACITY</div></div>}
              </div>
            </CardContent>
          </Card>

          {/* Mini-Map */}
          {operation.lat != null && operation.lng != null && (
            <Card className="bg-gray-900/80 border-gray-800 overflow-hidden">
              <CardContent className="p-0">
                <MapMiniView
                  latitude={operation.lat}
                  longitude={operation.lng}
                  zoom={8}
                  height="220px"
                  markers={[
                    { id: operation.id, latitude: operation.lat, longitude: operation.lng, color: colors.markerOperation, label: operation.title },
                  ]}
                />
              </CardContent>
            </Card>
          )}

          {/* MOS Summary */}
          {rosterData?.mos_summary && Object.keys(rosterData.mos_summary).length > 0 && (
            <Card className="bg-gray-900/80 border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm tracking-wider text-tropic-gold">MANPOWER BY MOS</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(rosterData.mos_summary).sort((a, b) => b[1] - a[1]).map(([mos, count]) => (
                    <div key={mos} className="bg-black/40 border border-gray-800 rounded px-3 py-1.5 text-xs">
                      <span className="font-mono text-tropic-gold">{mos}</span>
                      <span className="text-white ml-2 font-bold">{count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

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
                {currentStatus && <Button onClick={handleCancel} disabled={submitting} variant="outline" className="border-tropic-gold/60 text-tropic-gold hover:bg-tropic-gold/10" data-testid="rsvp-cancel"><XCircle className="w-4 h-4 mr-2" />Cancel RSVP</Button>}
              </div>
            </CardContent>
          </Card>

          {/* Attending Roster with Full Details */}
          {rosterData && (
            <div className="space-y-4">
              {[
                { label: 'ATTENDING', list: rsvps.attending, color: 'text-green-400', icon: CheckCircle },
                { label: 'TENTATIVE', list: rsvps.tentative, color: 'text-yellow-400', icon: HelpCircle },
                { label: 'WAITLISTED', list: rsvps.waitlisted, color: 'text-orange-400', icon: Clock },
              ].filter(g => g.list?.length > 0).map(group => (
                <Card key={group.label} className="bg-gray-900/80 border-gray-800">
                  <CardHeader className="pb-2">
                    <CardTitle className={`text-sm tracking-wider flex items-center gap-2 ${group.color}`}>
                      <group.icon className="w-4 h-4" /> {group.label} ({group.list.length})
                    </CardTitle>
                    <p className="text-[10px] text-gray-600">Click a row to see unit assignment details</p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {group.list.map((r, i) => (
                        <RsvpMemberRow key={r.user_id || i} r={r} user={user} group={group} onPromote={handlePromote} />
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

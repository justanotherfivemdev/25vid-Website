import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Calendar, Clock, Shield, Home, LogOut, CheckCircle, HelpCircle, XCircle, ChevronUp, ChevronDown, Globe, MapPin, Network, UserCheck, UserX } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { isStaff } from '@/utils/permissions';
import MapMiniView from '@/components/MapMiniView';
import { colors } from '@/theme/theme';

import { BACKEND_URL, API } from '@/utils/api';
import { useMemberLayout } from '@/components/MemberLayout';
const resolveImg = (url) => { if (!url) return ''; if (url.startsWith('http')) return url; if (url.startsWith('/uploads/')) return `${BACKEND_URL}/api${url}`; return `${BACKEND_URL}${url}`; };

const STATUS_ICON = { attending: CheckCircle, tentative: HelpCircle, waitlisted: Clock };
const STATUS_COLOR = { attending: 'text-green-400', tentative: 'text-yellow-400', waitlisted: 'text-orange-400' };
const TYPE_CFG = { combat: 'bg-tropic-red/80', training: 'bg-tropic-gold-dark/80', recon: 'bg-emerald-700/80', support: 'bg-[#4a6070]/80' };

const RsvpMemberRow = ({ r, user, group, onPromote }) => {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <div className="border border-[rgba(201,162,39,0.06)] rounded overflow-hidden" data-testid={`rsvp-entry-${r.user_id}`}>
      <div 
        className="flex items-center justify-between py-2 px-3 bg-[#050a0e]/30 cursor-pointer hover:bg-[#050a0e]/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {r.avatar_url ? (
            <img src={resolveImg(r.avatar_url)} alt="" className="w-8 h-8 rounded object-cover border border-[rgba(201,162,39,0.15)]" />
          ) : (
            <div className="w-8 h-8 rounded bg-[#111a24] flex items-center justify-center text-xs font-bold text-[#4a6070]">{r.username?.[0]?.toUpperCase()}</div>
          )}
          <div>
            <Link to={`/roster/${r.user_id}`} className="font-medium text-sm hover:text-tropic-gold transition-colors" onClick={e => e.stopPropagation()}>{r.username}</Link>
            {r.rank && <span className="text-xs text-[#4a6070] ml-2">{r.rank}</span>}
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
          {isStaff(user?.role) && group.label === 'WAITLISTED' && (
            <Button size="sm" onClick={(e) => { e.stopPropagation(); onPromote(r.user_id); }} className="bg-green-700 hover:bg-green-600 text-xs px-2 py-1 h-auto" data-testid={`promote-${r.user_id}`}><ChevronUp className="w-3 h-3 mr-1" />Promote</Button>
          )}
          <ChevronDown className={`w-4 h-4 text-[#4a6070] transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </div>
      {expanded && (
        <div className="px-3 py-2 bg-[#0c1117]/50 border-t border-[rgba(201,162,39,0.036)] grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {r.company && <div><span className="text-[#4a6070]">Company:</span> <span className="text-tropic-gold">{r.company}</span></div>}
          {r.platoon && <div><span className="text-[#4a6070]">Platoon:</span> <span className="text-green-400">{r.platoon}</span></div>}
          {r.squad && <div><span className="text-[#4a6070]">Squad:</span> <span className="text-[#8a9aa8]">{r.squad}</span></div>}
          {r.mos_title && <div><span className="text-[#4a6070]">MOS:</span> <span className="text-tropic-gold">{r.mos_code} — {r.mos_title}</span></div>}
          {r.billet && (
            <div><span className="text-[#4a6070]">Billet:</span>{' '}
              <span className="text-tropic-gold">{r.billet_acronym ? `${r.billet_acronym} — ${r.billet}` : r.billet}</span>
            </div>
          )}
          {r.member_status && <div><span className="text-[#4a6070]">Status:</span> <span className="text-[#8a9aa8] capitalize">{r.member_status}</span></div>}
          {r.rsvp_time && <div><span className="text-[#4a6070]">RSVPed:</span> <span className="text-[#4a6070]">{new Date(r.rsvp_time).toLocaleDateString()}</span></div>}
        </div>
      )}
    </div>
  );
};

const OperationDetail = () => {
  const inLayout = useMemberLayout();
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

  if (loading) return <div className="min-h-screen bg-[#050a0e] text-white flex items-center justify-center">Loading...</div>;
  if (!operation) return <div className="min-h-screen bg-[#050a0e] text-white flex items-center justify-center">Operation not found</div>;

  const currentStatus = myStatus();
  const counts = rosterData?.counts || {};
  const maxP = rosterData?.max_participants;
  const rsvps = rosterData?.rsvps || {};

  return (
    <div className={inLayout ? '' : 'min-h-screen bg-[#050a0e] text-white'}>
      {!inLayout && (
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#050a0e]/92 backdrop-blur-xl border-b border-tropic-gold/15">
        <div className="container mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/hub"><Button size="sm" variant="outline" className="border-[rgba(201,162,39,0.15)]"><ArrowLeft className="w-4 h-4 mr-1" />Hub</Button></Link>
            <h1 className="text-xl font-bold tracking-widest truncate" style={{ fontFamily: "'Share Tech', sans-serif" }}>{operation.title}</h1>
          </div>
          <div className="flex items-center space-x-3">
            {isStaff(user?.role) && <Link to="/admin/operations"><Button size="sm" variant="outline" className="border-tropic-gold/60 text-tropic-gold hover:bg-tropic-gold/10"><Shield className="w-4 h-4" /></Button></Link>}
            <Link to="/"><Button size="sm" variant="outline" className="border-[rgba(201,162,39,0.15)]"><Home className="w-4 h-4" /></Button></Link>
            <Button size="sm" variant="outline" onClick={handleLogout} className="border-[rgba(201,162,39,0.15)]"><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </nav>
      )}

      <div className={`${inLayout ? 'pt-4' : 'pt-20'} pb-12 px-4 md:px-6`}>
        <div className="container mx-auto max-w-4xl space-y-6">
          {/* Op Header */}
          <Card className="bg-[#0c1117]/80 border-[rgba(201,162,39,0.12)] overflow-hidden" data-testid="operation-detail-header">
            <div className={`h-2 ${TYPE_CFG[operation.operation_type] || 'bg-[#111a24]'}`}></div>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <Badge className={`${TYPE_CFG[operation.operation_type] || 'bg-[#4a6070]'} text-white tracking-wider`}>{operation.operation_type.toUpperCase()}</Badge>
                <Badge variant="outline" className={`${operation.activity_state === 'ongoing' ? 'border-tropic-red text-tropic-red' : operation.activity_state === 'completed' ? 'border-green-600 text-green-500' : 'border-[rgba(201,162,39,0.15)] text-[#8a9aa8]'} tracking-wider`}>{(operation.activity_state || 'planned').toUpperCase()}</Badge>
                <div className="flex items-center gap-4 text-sm text-[#8a9aa8]">
                  <span className="flex items-center"><Calendar className="w-4 h-4 mr-1 text-tropic-gold" />{operation.date}</span>
                  <span className="flex items-center"><Clock className="w-4 h-4 mr-1 text-tropic-gold" />{operation.time}</span>
                </div>
              </div>
              <h2 className="text-3xl font-bold tracking-wider" style={{ fontFamily: "'Share Tech', sans-serif" }}>{operation.title}</h2>
              <p className="text-[#8a9aa8] leading-relaxed whitespace-pre-wrap">{operation.description}</p>
              {(operation.theater || operation.region_label || operation.grid_ref || operation.campaign_id) && (
                <div className="bg-[#050a0e]/40 border border-[rgba(201,162,39,0.12)] rounded-lg p-3 text-xs text-[#8a9aa8] flex flex-wrap items-center gap-3">
                  {operation.theater && <span className="flex items-center gap-1"><Globe className="w-3.5 h-3.5 text-tropic-gold" />{operation.theater}</span>}
                  {operation.region_label && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-tropic-gold-light" />{operation.region_label}</span>}
                  {operation.grid_ref && <span className="text-[#8a9aa8]">GRID {operation.grid_ref}</span>}
                  <Link to="/hub/campaign" className="text-tropic-gold hover:underline ml-auto">View on Campaign Map</Link>
                </div>
              )}
              {/* ORBAT Creator link */}
              <Link
                to={`/hub/orbat-mapper/${id}`}
                className="flex items-center gap-2 text-xs text-[#C9A227] hover:text-[#b8931f] transition bg-[#C9A227]/10 border border-[#C9A227]/30 rounded-lg px-3 py-2"
              >
                <Network className="w-4 h-4" />
                <span className="font-semibold tracking-wider">Open ORBAT Creator</span>
                <span className="text-[#4a6070] ml-1">— Build order of battle for this operation</span>
              </Link>
              {/* Attendance summary */}
              {operation.external_id ? (() => {
                const accepted = (operation.attendees || []).filter(a => a.status === 'accepted');
                const declined = (operation.attendees || []).filter(a => a.status === 'declined');
                const tentativeAtt = (operation.attendees || []).filter(a => a.status === 'tentative');
                return (
                  <div className="flex items-center gap-6 bg-[#050a0e]/30 rounded-lg p-4 border border-[rgba(201,162,39,0.06)]">
                    <div className="text-center"><div className="text-2xl font-bold text-green-400">{accepted.length}</div><div className="text-[10px] text-[#4a6070] tracking-wider">ACCEPTED</div></div>
                    <div className="text-center"><div className="text-2xl font-bold text-red-400">{declined.length}</div><div className="text-[10px] text-[#4a6070] tracking-wider">DECLINED</div></div>
                    {tentativeAtt.length > 0 && <div className="text-center"><div className="text-2xl font-bold text-yellow-400">{tentativeAtt.length}</div><div className="text-[10px] text-[#4a6070] tracking-wider">TENTATIVE</div></div>}
                    <div className="ml-auto text-[10px] text-[#4a6070] tracking-wider">SYNCED VIA DISCORD</div>
                  </div>
                );
              })() : (
                <div className="flex items-center gap-6 bg-[#050a0e]/30 rounded-lg p-4 border border-[rgba(201,162,39,0.06)]">
                  <div className="text-center"><div className="text-2xl font-bold text-green-400">{counts.attending || 0}</div><div className="text-[10px] text-[#4a6070] tracking-wider">ATTENDING</div></div>
                  <div className="text-center"><div className="text-2xl font-bold text-yellow-400">{counts.tentative || 0}</div><div className="text-[10px] text-[#4a6070] tracking-wider">TENTATIVE</div></div>
                  {maxP && <div className="text-center"><div className="text-2xl font-bold text-orange-400">{counts.waitlisted || 0}</div><div className="text-[10px] text-[#4a6070] tracking-wider">WAITLISTED</div></div>}
                  {maxP && <div className="text-center ml-auto"><div className="text-2xl font-bold text-[#8a9aa8]">{maxP}</div><div className="text-[10px] text-[#4a6070] tracking-wider">CAPACITY</div></div>}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Mini-Map */}
          {operation.lat != null && operation.lng != null && (
            <Card className="bg-[#0c1117]/80 border-[rgba(201,162,39,0.12)] overflow-hidden">
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
            <Card className="bg-[#0c1117]/80 border-[rgba(201,162,39,0.12)]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm tracking-wider text-tropic-gold">MANPOWER BY MOS</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(rosterData.mos_summary).sort((a, b) => b[1] - a[1]).map(([mos, count]) => (
                    <div key={mos} className="bg-[#050a0e]/40 border border-[rgba(201,162,39,0.12)] rounded px-3 py-1.5 text-xs">
                      <span className="font-mono text-tropic-gold">{mos}</span>
                      <span className="text-white ml-2 font-bold">{count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Discord Attendance Display (when synced via Discord) */}
          {operation.external_id && operation.attendees?.length > 0 && (() => {
            const accepted = operation.attendees.filter(a => a.status === 'accepted');
            const declined = operation.attendees.filter(a => a.status === 'declined');
            const tentativeAtt = operation.attendees.filter(a => a.status === 'tentative');
            return (
              <div className="space-y-4" data-testid="discord-attendance">
                {accepted.length > 0 && (
                  <Card className="bg-[#0c1117]/80 border-[rgba(201,162,39,0.12)]">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm tracking-wider flex items-center gap-2 text-green-400">
                        <UserCheck className="w-4 h-4" /> ACCEPTED ({accepted.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1">
                        {accepted.map((a, i) => (
                          <div key={a.discord_id || i} className="flex items-center gap-3 py-2 px-3 bg-[#050a0e]/30 rounded border border-[rgba(201,162,39,0.06)]">
                            <div className="w-8 h-8 rounded bg-green-900/40 flex items-center justify-center text-xs font-bold text-green-400">{(a.display_name || '?')[0].toUpperCase()}</div>
                            <span className="text-sm font-medium">{a.display_name}</span>
                            {a.user_id && <Badge variant="outline" className="text-[10px] border-tropic-gold/40 text-tropic-gold">LINKED</Badge>}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
                {declined.length > 0 && (
                  <Card className="bg-[#0c1117]/80 border-[rgba(201,162,39,0.12)]">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm tracking-wider flex items-center gap-2 text-red-400">
                        <UserX className="w-4 h-4" /> DECLINED ({declined.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1">
                        {declined.map((a, i) => (
                          <div key={a.discord_id || i} className="flex items-center gap-3 py-2 px-3 bg-[#050a0e]/30 rounded border border-[rgba(201,162,39,0.06)]">
                            <div className="w-8 h-8 rounded bg-red-900/40 flex items-center justify-center text-xs font-bold text-red-400">{(a.display_name || '?')[0].toUpperCase()}</div>
                            <span className="text-sm font-medium text-[#8a9aa8]">{a.display_name}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
                {tentativeAtt.length > 0 && (
                  <Card className="bg-[#0c1117]/80 border-[rgba(201,162,39,0.12)]">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm tracking-wider flex items-center gap-2 text-yellow-400">
                        <HelpCircle className="w-4 h-4" /> TENTATIVE ({tentativeAtt.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1">
                        {tentativeAtt.map((a, i) => (
                          <div key={a.discord_id || i} className="flex items-center gap-3 py-2 px-3 bg-[#050a0e]/30 rounded border border-[rgba(201,162,39,0.06)]">
                            <div className="w-8 h-8 rounded bg-yellow-900/40 flex items-center justify-center text-xs font-bold text-yellow-400">{(a.display_name || '?')[0].toUpperCase()}</div>
                            <span className="text-sm font-medium">{a.display_name}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            );
          })()}

          {/* RSVP Actions — hidden for Discord-synced operations */}
          {!operation.external_id && (
          <Card className="bg-[#0c1117]/80 border-[rgba(201,162,39,0.12)]" data-testid="rsvp-actions">
            <CardHeader className="pb-3"><CardTitle className="text-lg tracking-wider">YOUR RSVP</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {currentStatus && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-[#8a9aa8]">Current status:</span>
                  <Badge className={`${currentStatus === 'attending' ? 'bg-green-700' : currentStatus === 'tentative' ? 'bg-yellow-700' : 'bg-orange-700'} text-white`}>{currentStatus.toUpperCase()}</Badge>
                </div>
              )}
              <div>
                <label className="text-xs text-[#4a6070] block mb-1">Role / Slot Notes (optional)</label>
                <Input value={roleNotes} onChange={e => setRoleNotes(e.target.value)} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" placeholder="e.g., Squad Lead, Medic, DMR" data-testid="rsvp-role-notes" />
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => handleRSVP('attending')} disabled={submitting} className={`${currentStatus === 'attending' ? 'bg-green-700 ring-2 ring-green-500' : 'bg-green-800/60 hover:bg-green-700'}`} data-testid="rsvp-attending"><CheckCircle className="w-4 h-4 mr-2" />Attending</Button>
                <Button onClick={() => handleRSVP('tentative')} disabled={submitting} className={`${currentStatus === 'tentative' ? 'bg-yellow-700 ring-2 ring-yellow-500' : 'bg-yellow-800/60 hover:bg-yellow-700'}`} data-testid="rsvp-tentative"><HelpCircle className="w-4 h-4 mr-2" />Tentative</Button>
                {currentStatus && <Button onClick={handleCancel} disabled={submitting} variant="outline" className="border-tropic-gold/60 text-tropic-gold hover:bg-tropic-gold/10" data-testid="rsvp-cancel"><XCircle className="w-4 h-4 mr-2" />Cancel RSVP</Button>}
              </div>
            </CardContent>
          </Card>
          )}

          {/* Attending Roster with Full Details — for non-Discord operations */}
          {rosterData && !operation.external_id && (
            <div className="space-y-4">
              {[
                { label: 'ATTENDING', list: rsvps.attending, color: 'text-green-400', icon: CheckCircle },
                { label: 'TENTATIVE', list: rsvps.tentative, color: 'text-yellow-400', icon: HelpCircle },
                { label: 'WAITLISTED', list: rsvps.waitlisted, color: 'text-orange-400', icon: Clock },
              ].filter(g => g.list?.length > 0).map(group => (
                <Card key={group.label} className="bg-[#0c1117]/80 border-[rgba(201,162,39,0.12)]">
                  <CardHeader className="pb-2">
                    <CardTitle className={`text-sm tracking-wider flex items-center gap-2 ${group.color}`}>
                      <group.icon className="w-4 h-4" /> {group.label} ({group.list.length})
                    </CardTitle>
                    <p className="text-[10px] text-[#4a6070]">Click a row to see unit assignment details</p>
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

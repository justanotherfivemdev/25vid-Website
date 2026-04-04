import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Shield, Home, LogOut, Calendar, Clock, Award, Target, MapPin, Globe } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { isStaff } from '@/utils/permissions';

import { BACKEND_URL, API } from '@/utils/api';
import { useMemberLayout } from '@/components/MemberLayout';
const resolveImg = (url) => { if (!url) return ''; if (url.startsWith('http')) return url; if (url.startsWith('/uploads/')) return `${BACKEND_URL}/api${url}`; return `${BACKEND_URL}${url}`; };
const STATUS_COLORS = {
  recruit: 'bg-tropic-gold-dark',
  active: 'bg-tropic-red',
  reserve: 'bg-[#111a24]',
  staff: 'bg-tropic-gold-dark',
  command: 'bg-tropic-red',
  inactive: 'bg-[#111a24]'
};

const MemberProfile = () => {
  const inLayout = useMemberLayout();
  const { id } = useParams();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  useEffect(() => {
    axios.get(`${API}/roster/${id}`)
      .then(r => setProfile(r.data))
      .catch(e => { if (e.response?.status === 404) navigate('/roster'); })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const handleLogout = async () => { await logout(); navigate('/'); };

  if (loading) return <div className="min-h-screen bg-[#050a0e] text-white flex items-center justify-center">Loading profile...</div>;
  if (!profile) return <div className="min-h-screen bg-[#050a0e] text-white flex items-center justify-center">Profile not found</div>;

  const isOwnProfile = user?.id === profile.id;

  return (
    <div className={inLayout ? '' : 'min-h-screen bg-[#050a0e] text-white'}>
      {!inLayout && (
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#050a0e]/92 backdrop-blur-xl border-b border-tropic-gold/15">
        <div className="container mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/roster"><Button size="sm" variant="outline" className="border-[rgba(201,162,39,0.15)]"><ArrowLeft className="w-4 h-4 mr-1" />Roster</Button></Link>
            <h1 className="text-xl font-bold tracking-widest truncate" style={{ fontFamily: "'Share Tech', sans-serif" }}>{profile.username}</h1>
          </div>
          <div className="flex items-center space-x-3">
            {isOwnProfile && <Link to="/hub/profile"><Button size="sm" variant="outline" className="border-tropic-gold text-tropic-gold hover:bg-tropic-gold/10">Edit Profile</Button></Link>}
            {isStaff(user?.role) && <Link to={`/admin/users/${profile.id}`}><Button size="sm" variant="outline" className="border-tropic-red/60 text-tropic-red hover:bg-tropic-red/10"><Shield className="w-4 h-4 mr-1" />Admin Edit</Button></Link>}
            <Link to="/"><Button size="sm" variant="outline" className="border-[rgba(201,162,39,0.15)]"><Home className="w-4 h-4" /></Button></Link>
            <Button size="sm" variant="outline" onClick={handleLogout} className="border-[rgba(201,162,39,0.15)]"><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </nav>
      )}

      <div className={`${inLayout ? 'pt-4' : 'pt-20'} pb-12 px-4 md:px-6`}>
        <div className="container mx-auto max-w-4xl space-y-6">
          {/* Header card */}
          <Card className="bg-[#0c1117]/80 border-[rgba(201,162,39,0.12)] overflow-hidden" data-testid="profile-header">
            <div className="h-24 bg-gradient-to-r from-amber-900/40 via-[#0c1117] to-[#0c1117]"></div>
            <CardContent className="px-6 pb-6 -mt-10">
              <div className="flex items-end gap-5">
                {profile.avatar_url ? (
                  <img src={resolveImg(profile.avatar_url)} alt="" className="w-20 h-20 rounded-xl object-cover border-4 border-[rgba(201,162,39,0.15)] shadow-lg" />
                ) : (
                  <div className="w-20 h-20 rounded-xl bg-[#111a24] border-4 border-[rgba(201,162,39,0.15)] shadow-lg flex items-center justify-center text-3xl font-bold text-[#4a6070]" style={{ fontFamily: "'Share Tech', sans-serif" }}>{profile.username[0]?.toUpperCase()}</div>
                )}
                <div className="flex-1 pb-1">
                  <h2 className="text-2xl font-bold tracking-wider" style={{ fontFamily: "'Share Tech', sans-serif" }}>{profile.username}</h2>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {profile.rank && <span className="text-sm text-[#8a9aa8]">{profile.rank}</span>}
                    <Badge className={`${STATUS_COLORS[profile.status] || 'bg-[#111a24]'} text-white text-xs`}>{(profile.status || 'recruit').toUpperCase()}</Badge>
                    {profile.loa_status === 'on_loa' && <Badge className="bg-yellow-600/30 text-yellow-400 border border-yellow-600/40 text-xs">LOA</Badge>}
                    {isStaff(profile.role) && <Badge className="bg-tropic-gold/20 text-tropic-gold text-xs">STAFF</Badge>}
                    {profile.discord_linked && <Badge className="bg-[#5865F2]/20 text-[#5865F2] text-xs border border-[#5865F2]/30">{profile.discord_username || 'Discord'}</Badge>}
                  </div>
                </div>
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 bg-[#050a0e]/30 rounded-lg p-4 border border-[rgba(201,162,39,0.12)]/50">
                {profile.billet && <div><div className="text-[10px] text-[#4a6070] tracking-wider mb-0.5">BILLET / POSITION</div><div className="text-sm font-medium">{profile.billet_acronym ? `${profile.billet_acronym} — ` : ''}{profile.billet}</div></div>}
                {profile.specialization && <div><div className="text-[10px] text-[#4a6070] tracking-wider mb-0.5">SPECIALIZATION</div><div className="text-sm font-medium">{profile.specialization}</div></div>}
                {profile.display_mos && <div><div className="text-[10px] text-[#4a6070] tracking-wider mb-0.5">MOS</div><div className="text-sm font-medium font-mono text-tropic-gold">{profile.display_mos}</div></div>}
                {profile.company && <div><div className="text-[10px] text-[#4a6070] tracking-wider mb-0.5">COMPANY</div><div className="text-sm font-medium text-tropic-gold">{profile.company}</div></div>}
                {profile.platoon && <div><div className="text-[10px] text-[#4a6070] tracking-wider mb-0.5">PLATOON</div><div className="text-sm font-medium text-green-400">{profile.platoon}</div></div>}
                {profile.squad && <div><div className="text-[10px] text-[#4a6070] tracking-wider mb-0.5">SQUAD / TEAM</div><div className="text-sm font-medium">{profile.squad}</div></div>}
                {profile.timezone && <div><div className="text-[10px] text-[#4a6070] tracking-wider mb-0.5">TIMEZONE</div><div className="text-sm font-medium flex items-center gap-1"><Globe className="w-3 h-3 text-[#4a6070]" />{profile.timezone}</div></div>}
                {profile.favorite_role && <div><div className="text-[10px] text-[#4a6070] tracking-wider mb-0.5">PREFERRED ROLE</div><div className="text-sm font-medium flex items-center gap-1"><Target className="w-3 h-3 text-[#4a6070]" />{profile.favorite_role}</div></div>}
                <div><div className="text-[10px] text-[#4a6070] tracking-wider mb-0.5">JOINED</div><div className="text-sm font-medium flex items-center gap-1"><Calendar className="w-3 h-3 text-[#4a6070]" />{new Date(profile.join_date).toLocaleDateString()}</div></div>
              </div>

              {profile.bio && <p className="mt-6 text-[#8a9aa8] text-sm leading-relaxed border-l-2 border-tropic-red/40 pl-4 whitespace-pre-wrap" data-testid="profile-bio">{profile.bio}</p>}
            </CardContent>
          </Card>

          {/* Awards */}
          {profile.awards?.length > 0 && (
            <Card className="bg-[#0c1117]/80 border-[rgba(201,162,39,0.12)]" data-testid="profile-awards">
              <CardHeader className="pb-3"><CardTitle className="text-lg tracking-wider flex items-center gap-2"><Award className="w-5 h-5 text-tropic-gold" /> AWARDS & QUALIFICATIONS</CardTitle></CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {profile.awards.map((a, i) => (
                    <div key={a.id || i} className="flex items-center gap-3 bg-[#050a0e]/30 rounded-lg p-3 border border-[rgba(201,162,39,0.12)]/50">
                      <Award className="w-5 h-5 text-yellow-600 shrink-0" />
                      <div><div className="font-medium text-sm">{a.name}</div>{a.description && <div className="text-xs text-[#4a6070]">{a.description}</div>}</div>
                      {a.date && <div className="ml-auto text-xs text-[#4a6070]">{a.date}</div>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Mission History */}
          {profile.mission_history?.length > 0 && (
            <Card className="bg-[#0c1117]/80 border-[rgba(201,162,39,0.12)]" data-testid="profile-missions">
              <CardHeader className="pb-3"><CardTitle className="text-lg tracking-wider flex items-center gap-2"><Target className="w-5 h-5 text-tropic-gold" /> MISSION HISTORY</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {profile.mission_history.map((m, i) => (
                    <div key={m.id || i} className="bg-[#050a0e]/30 rounded-lg p-4 border border-[rgba(201,162,39,0.12)]/50">
                      <div className="flex items-center justify-between mb-1">
                        <div className="font-bold text-sm tracking-wide" style={{ fontFamily: "'Share Tech', sans-serif" }}>{m.operation_name}</div>
                        <div className="text-xs text-[#4a6070] flex items-center gap-1"><Calendar className="w-3 h-3" />{m.date}</div>
                      </div>
                      <div className="text-xs text-tropic-gold mb-1">Role: {m.role_performed}</div>
                      {m.notes && <div className="text-xs text-[#4a6070]">{m.notes}</div>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Training History */}
          {profile.training_history?.length > 0 && (
            <Card className="bg-[#0c1117]/80 border-[rgba(201,162,39,0.12)]" data-testid="profile-training">
              <CardHeader className="pb-3"><CardTitle className="text-lg tracking-wider flex items-center gap-2"><MapPin className="w-5 h-5 text-tropic-gold" /> TRAINING HISTORY</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {profile.training_history.map((t, i) => (
                    <div key={t.id || i} className="bg-[#050a0e]/30 rounded-lg p-4 border border-[rgba(201,162,39,0.12)]/50">
                      <div className="flex items-center justify-between mb-1">
                        <div className="font-bold text-sm tracking-wide" style={{ fontFamily: "'Share Tech', sans-serif" }}>{t.course_name}</div>
                        <div className="text-xs text-[#4a6070] flex items-center gap-1"><Clock className="w-3 h-3" />{t.completion_date}</div>
                      </div>
                      {t.instructor && <div className="text-xs text-tropic-gold">Instructor: {t.instructor}</div>}
                      {t.notes && <div className="text-xs text-[#4a6070] mt-1">{t.notes}</div>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Empty states */}
          {(!profile.mission_history?.length && !profile.training_history?.length && !profile.awards?.length) && (
            <div className="text-center py-8 text-[#4a6070] text-sm">No mission history, training records, or awards on file yet.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MemberProfile;

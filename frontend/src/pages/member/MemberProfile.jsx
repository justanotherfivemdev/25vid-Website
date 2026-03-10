import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Shield, Home, LogOut, Calendar, Clock, Award, Target, MapPin, Globe } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const resolveImg = (url) => { if (!url) return ''; if (url.startsWith('http')) return url; if (url.startsWith('/uploads/')) return `${BACKEND_URL}/api${url}`; return `${BACKEND_URL}${url}`; };
const STATUS_COLORS = { recruit: 'bg-yellow-700', active: 'bg-green-700', reserve: 'bg-blue-700', staff: 'bg-purple-700', command: 'bg-amber-700', inactive: 'bg-gray-700' };

const MemberProfile = () => {
  const { id } = useParams();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    const token = localStorage.getItem('token');
    axios.get(`${API}/roster/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setProfile(r.data))
      .catch(e => { if (e.response?.status === 404) navigate('/roster'); })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); navigate('/'); };

  if (loading) return <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading profile...</div>;
  if (!profile) return <div className="min-h-screen bg-black text-white flex items-center justify-center">Profile not found</div>;

  const isOwnProfile = user?.id === profile.id;

  return (
    <div className="min-h-screen bg-black text-white">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur border-b border-amber-700/30">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/roster"><Button size="sm" variant="outline" className="border-gray-700"><ArrowLeft className="w-4 h-4 mr-1" />Roster</Button></Link>
            <h1 className="text-xl font-bold tracking-widest truncate" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{profile.username}</h1>
          </div>
          <div className="flex items-center space-x-3">
            {isOwnProfile && <Link to="/hub/profile"><Button size="sm" variant="outline" className="border-blue-700 text-blue-400 hover:bg-blue-700/10">Edit Profile</Button></Link>}
            {user?.role === 'admin' && <Link to={`/admin/users/${profile.id}`}><Button size="sm" variant="outline" className="border-amber-700 text-amber-400 hover:bg-amber-700/10"><Shield className="w-4 h-4 mr-1" />Admin Edit</Button></Link>}
            <Link to="/"><Button size="sm" variant="outline" className="border-gray-700"><Home className="w-4 h-4" /></Button></Link>
            <Button size="sm" variant="outline" onClick={handleLogout} className="border-gray-700"><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </nav>

      <div className="pt-20 pb-12 px-6">
        <div className="container mx-auto max-w-4xl space-y-6">
          {/* Header card */}
          <Card className="bg-gray-900/80 border-gray-800 overflow-hidden" data-testid="profile-header">
            <div className="h-24 bg-gradient-to-r from-amber-900/40 via-gray-900 to-gray-900"></div>
            <CardContent className="px-6 pb-6 -mt-10">
              <div className="flex items-end gap-5">
                {profile.avatar_url ? (
                  <img src={resolveImg(profile.avatar_url)} alt="" className="w-20 h-20 rounded-xl object-cover border-4 border-gray-900 shadow-lg" />
                ) : (
                  <div className="w-20 h-20 rounded-xl bg-gray-800 border-4 border-gray-900 shadow-lg flex items-center justify-center text-3xl font-bold text-gray-500" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{profile.username[0]?.toUpperCase()}</div>
                )}
                <div className="flex-1 pb-1">
                  <h2 className="text-2xl font-bold tracking-wider" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{profile.username}</h2>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {profile.rank && <span className="text-sm text-gray-400">{profile.rank}</span>}
                    <Badge className={`${STATUS_COLORS[profile.status] || 'bg-gray-700'} text-white text-xs`}>{(profile.status || 'recruit').toUpperCase()}</Badge>
                    {profile.role === 'admin' && <Badge className="bg-amber-900/60 text-amber-400 text-xs">ADMIN</Badge>}
                    {profile.discord_linked && <Badge className="bg-[#5865F2]/20 text-[#5865F2] text-xs border border-[#5865F2]/30">{profile.discord_username || 'Discord'}</Badge>}
                  </div>
                </div>
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 bg-black/30 rounded-lg p-4 border border-gray-800/50">
                {profile.specialization && <div><div className="text-[10px] text-gray-500 tracking-wider mb-0.5">SPECIALIZATION</div><div className="text-sm font-medium">{profile.specialization}</div></div>}
                {profile.squad && <div><div className="text-[10px] text-gray-500 tracking-wider mb-0.5">SQUAD / TEAM</div><div className="text-sm font-medium">{profile.squad}</div></div>}
                {profile.timezone && <div><div className="text-[10px] text-gray-500 tracking-wider mb-0.5">TIMEZONE</div><div className="text-sm font-medium flex items-center gap-1"><Globe className="w-3 h-3 text-gray-500" />{profile.timezone}</div></div>}
                {profile.favorite_role && <div><div className="text-[10px] text-gray-500 tracking-wider mb-0.5">PREFERRED ROLE</div><div className="text-sm font-medium flex items-center gap-1"><Target className="w-3 h-3 text-gray-500" />{profile.favorite_role}</div></div>}
                <div><div className="text-[10px] text-gray-500 tracking-wider mb-0.5">JOINED</div><div className="text-sm font-medium flex items-center gap-1"><Calendar className="w-3 h-3 text-gray-500" />{new Date(profile.join_date).toLocaleDateString()}</div></div>
              </div>

              {profile.bio && <p className="mt-6 text-gray-300 text-sm leading-relaxed border-l-2 border-amber-800/40 pl-4" data-testid="profile-bio">{profile.bio}</p>}
            </CardContent>
          </Card>

          {/* Awards */}
          {profile.awards?.length > 0 && (
            <Card className="bg-gray-900/80 border-gray-800" data-testid="profile-awards">
              <CardHeader className="pb-3"><CardTitle className="text-lg tracking-wider flex items-center gap-2"><Award className="w-5 h-5 text-yellow-500" /> AWARDS & QUALIFICATIONS</CardTitle></CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {profile.awards.map((a, i) => (
                    <div key={a.id || i} className="flex items-center gap-3 bg-black/30 rounded-lg p-3 border border-gray-800/50">
                      <Award className="w-5 h-5 text-yellow-600 shrink-0" />
                      <div><div className="font-medium text-sm">{a.name}</div>{a.description && <div className="text-xs text-gray-500">{a.description}</div>}</div>
                      {a.date && <div className="ml-auto text-xs text-gray-600">{a.date}</div>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Mission History */}
          {profile.mission_history?.length > 0 && (
            <Card className="bg-gray-900/80 border-gray-800" data-testid="profile-missions">
              <CardHeader className="pb-3"><CardTitle className="text-lg tracking-wider flex items-center gap-2"><Target className="w-5 h-5 text-amber-500" /> MISSION HISTORY</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {profile.mission_history.map((m, i) => (
                    <div key={m.id || i} className="bg-black/30 rounded-lg p-4 border border-gray-800/50">
                      <div className="flex items-center justify-between mb-1">
                        <div className="font-bold text-sm tracking-wide" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{m.operation_name}</div>
                        <div className="text-xs text-gray-500 flex items-center gap-1"><Calendar className="w-3 h-3" />{m.date}</div>
                      </div>
                      <div className="text-xs text-amber-400 mb-1">Role: {m.role_performed}</div>
                      {m.notes && <div className="text-xs text-gray-500">{m.notes}</div>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Training History */}
          {profile.training_history?.length > 0 && (
            <Card className="bg-gray-900/80 border-gray-800" data-testid="profile-training">
              <CardHeader className="pb-3"><CardTitle className="text-lg tracking-wider flex items-center gap-2"><MapPin className="w-5 h-5 text-blue-500" /> TRAINING HISTORY</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {profile.training_history.map((t, i) => (
                    <div key={t.id || i} className="bg-black/30 rounded-lg p-4 border border-gray-800/50">
                      <div className="flex items-center justify-between mb-1">
                        <div className="font-bold text-sm tracking-wide" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{t.course_name}</div>
                        <div className="text-xs text-gray-500 flex items-center gap-1"><Clock className="w-3 h-3" />{t.completion_date}</div>
                      </div>
                      {t.instructor && <div className="text-xs text-blue-400">Instructor: {t.instructor}</div>}
                      {t.notes && <div className="text-xs text-gray-500 mt-1">{t.notes}</div>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Empty states */}
          {(!profile.mission_history?.length && !profile.training_history?.length && !profile.awards?.length) && (
            <div className="text-center py-8 text-gray-600 text-sm">No mission history, training records, or awards on file yet.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MemberProfile;

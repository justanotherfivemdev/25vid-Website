import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Calendar, Clock, Megaphone, MessageSquare, Users, Shield, LogOut, Home, ChevronRight, BookOpen, User, Search, Pin, Bell, CalendarCheck, Star } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const MemberHub = () => {
  const { user, logout } = useAuth();
  const [operations, setOperations] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [training, setTraining] = useState([]);
  const [discussions, setDiscussions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [mySchedule, setMySchedule] = useState([]);
  const [motw, setMotw] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      const [ops, ann, train, disc, sched, motwRes] = await Promise.all([
        axios.get(`${API}/operations`),
        axios.get(`${API}/announcements`),
        axios.get(`${API}/training`),
        axios.get(`${API}/discussions`),
        axios.get(`${API}/my-schedule`).catch(() => ({ data: [] })),
        axios.get(`${API}/member-of-the-week`).catch(() => ({ data: null })),
      ]);
      setOperations(ops.data.slice(0, 4));
      setAnnouncements(ann.data.slice(0, 4));
      setTraining(train.data.slice(0, 3));
      setDiscussions(disc.data.slice(0, 5));
      setMySchedule(sched.data || []);
      setMotw(motwRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery || searchQuery.length < 2) return;
    setSearching(true);
    try {
      const res = await axios.get(`${API}/search?q=${encodeURIComponent(searchQuery)}`);
      setSearchResults(res.data);
    } catch (err) { console.error(err); }
    finally { setSearching(false); }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const getTypeColor = (t) => ({ combat: 'bg-tropic-red', training: 'bg-tropic-gold-dark', recon: 'bg-green-600', support: 'bg-gray-600' }[t] || 'bg-gray-600');
  const getPriorityColor = (p) => ({ urgent: 'text-tropic-red border-tropic-red', high: 'text-orange-500 border-orange-500', normal: 'text-tropic-gold border-tropic-gold', low: 'text-gray-400 border-gray-400' }[p] || 'text-gray-400 border-gray-400');

  if (loading) return <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Top bar - 25th ID colors */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur border-b border-tropic-red/30" data-testid="member-nav">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={`${BACKEND_URL}/api/uploads/25th_id_patch.png`} alt="25th ID" className="w-8 h-8 object-contain" />
            <h1 className="text-xl font-bold tracking-wider text-tropic-gold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>25TH ID HUB</h1>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-400 hidden sm:block">Welcome, <span className="text-tropic-gold font-bold">{user?.username}</span></span>
            <Link to="/hub/profile"><Button size="sm" variant="outline" className="border-gray-700"><User className="w-4 h-4 mr-1" />Profile</Button></Link>
            <Link to="/roster"><Button size="sm" variant="outline" className="border-gray-700"><Users className="w-4 h-4 mr-1" />Roster</Button></Link>
            {user?.role === 'admin' && (
              <Link to="/admin"><Button size="sm" variant="outline" className="border-tropic-red/60 text-tropic-red hover:bg-tropic-red/10"><Shield className="w-4 h-4 mr-1" />Admin</Button></Link>
            )}
            <Link to="/"><Button size="sm" variant="outline" className="border-gray-700"><Home className="w-4 h-4 mr-1" />Home</Button></Link>
            <Button size="sm" variant="outline" onClick={handleLogout} className="border-gray-700" data-testid="member-logout-btn"><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </nav>

      <div className="pt-20 pb-12 px-6">
        <div className="container mx-auto max-w-7xl space-y-8">
          {/* Welcome banner with search - 25th ID colors */}
          <div className="bg-gradient-to-r from-tropic-red/20 to-gray-900 border border-tropic-red/30 rounded-lg p-6" data-testid="member-welcome-banner">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h2 className="text-3xl font-bold text-tropic-gold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>OPERATIONS HUB</h2>
                <p className="text-gray-400 mt-1">Your tactical command overview — stay informed, stay ready.</p>
              </div>
              <form onSubmit={handleSearch} className="flex gap-2 w-full md:w-auto">
                <div className="relative flex-1 md:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search operations & discussions..."
                    className="bg-black/50 border-gray-700 pl-10"
                    data-testid="hub-search-input"
                  />
                </div>
                <Button type="submit" disabled={searching || searchQuery.length < 2} className="bg-tropic-red hover:bg-tropic-red-dark" data-testid="hub-search-btn">
                  {searching ? '...' : 'Search'}
                </Button>
                {searchResults && <Button type="button" variant="outline" onClick={clearSearch} className="border-gray-700" data-testid="hub-search-clear">Clear</Button>}
              </form>
            </div>
          </div>

          {/* Search Results */}
          {searchResults && (
            <div className="space-y-4" data-testid="hub-search-results">
              <h3 className="text-xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>SEARCH RESULTS</h3>
              {searchResults.operations?.length > 0 && (
                <div>
                  <h4 className="text-sm tracking-wider text-gray-400 mb-2">OPERATIONS ({searchResults.operations.length})</h4>
                  <div className="grid md:grid-cols-2 gap-3">
                    {searchResults.operations.map(op => (
                      <Link to={`/hub/operations/${op.id}`} key={op.id}>
                        <Card className="bg-gray-900 border-gray-800 hover:border-tropic-red/30 transition-colors" data-testid={`search-op-${op.id}`}>
                          <CardContent className="py-3">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge className={`${getTypeColor(op.operation_type)} text-white text-xs`}>{op.operation_type?.toUpperCase()}</Badge>
                              <span className="text-xs text-gray-500">{op.date}</span>
                            </div>
                            <div className="font-medium">{op.title}</div>
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {searchResults.discussions?.length > 0 && (
                <div>
                  <h4 className="text-sm tracking-wider text-gray-400 mb-2">DISCUSSIONS ({searchResults.discussions.length})</h4>
                  <div className="space-y-2">
                    {searchResults.discussions.map(d => (
                      <Link to={`/hub/discussions/${d.id}`} key={d.id}>
                        <Card className="bg-gray-900 border-gray-800 hover:border-tropic-red/30 transition-colors" data-testid={`search-disc-${d.id}`}>
                          <CardContent className="py-3 flex items-center gap-3">
                            {d.pinned && <Pin className="w-3 h-3 text-yellow-500 shrink-0" />}
                            <Badge variant="outline" className="text-xs border-gray-700">{d.category}</Badge>
                            <span className="font-medium">{d.title}</span>
                            <span className="text-xs text-gray-500 ml-auto">by {d.author_name}</span>
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {(!searchResults.operations?.length && !searchResults.discussions?.length) && (
                <p className="text-gray-500 text-sm">No results found for "{searchQuery}".</p>
              )}
            </div>
          )}

          {/* Upcoming operation reminders */}
          {(() => {
            const now = new Date();
            const upcoming = mySchedule.filter(op => {
              if (!op.date) return false;
              const opDate = new Date(op.date + 'T' + (op.time?.replace(' UTC', ':00Z') || '00:00:00Z'));
              const diff = opDate - now;
              return diff > 0 && diff < 48 * 60 * 60 * 1000;
            });
            if (upcoming.length === 0) return null;
            return (
              <div className="space-y-2" data-testid="op-reminders">
                {upcoming.map(op => (
                  <Link to={`/hub/operations/${op.id}`} key={op.id} className="block">
                    <div className="bg-tropic-red/10 border border-tropic-red/40 rounded-lg p-4 flex items-center gap-4 hover:bg-tropic-red/20 transition-colors">
                      <Bell className="w-5 h-5 text-tropic-gold shrink-0 animate-pulse" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{op.title}</div>
                        <div className="text-xs text-gray-400 flex items-center gap-3 mt-0.5">
                          <span className="flex items-center"><Calendar className="w-3 h-3 mr-1" />{op.date}</span>
                          <span className="flex items-center"><Clock className="w-3 h-3 mr-1" />{op.time}</span>
                        </div>
                      </div>
                      <Badge className={`text-xs ${op.my_status === 'attending' ? 'bg-green-700' : op.my_status === 'tentative' ? 'bg-yellow-700' : 'bg-orange-700'} text-white`}>{op.my_status?.toUpperCase()}</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            );
          })()}

          {/* Member of the Week - 25th ID colors */}
          {motw && (
            <Card className="bg-gradient-to-r from-tropic-red/20 via-tropic-gold/10 to-transparent border-tropic-gold/40" data-testid="motw-card">
              <CardContent className="p-5 flex items-center gap-5">
                <div className="relative shrink-0">
                  <div className="w-16 h-16 rounded-full border-2 border-tropic-gold overflow-hidden bg-gray-800 flex items-center justify-center">
                    {motw.avatar_url ? (
                      <img src={motw.avatar_url.startsWith('http') ? motw.avatar_url : `${BACKEND_URL}/api${motw.avatar_url}`} alt={motw.username} className="w-full h-full object-cover" />
                    ) : (
                      <Star className="w-8 h-8 text-tropic-gold" />
                    )}
                  </div>
                  <div className="absolute -top-1 -right-1 w-6 h-6 bg-tropic-red rounded-full flex items-center justify-center border border-black">
                    <Star className="w-3.5 h-3.5 text-tropic-gold fill-tropic-gold" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs tracking-widest text-tropic-gold mb-0.5">MEMBER OF THE WEEK</div>
                  <div className="text-lg font-bold tracking-wide" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{motw.username}</div>
                  {motw.rank && <div className="text-xs text-gray-400">{motw.rank}</div>}
                  {motw.reason && <p className="text-sm text-gray-300 mt-1 whitespace-pre-wrap">{motw.reason}</p>}
                </div>
              </CardContent>
            </Card>
          )}

          {/* My Schedule */}
          {mySchedule.length > 0 && (
            <section data-testid="my-schedule-section">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-bold flex items-center gap-2" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                  <CalendarCheck className="w-6 h-6 text-green-500" /> MY SCHEDULE
                </h3>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                {mySchedule.map(op => (
                  <Link to={`/hub/operations/${op.id}`} key={op.id}>
                    <Card className="bg-gray-900 border-gray-800 hover:border-tropic-red/30 transition-colors h-full" data-testid={`schedule-op-${op.id}`}>
                      <CardContent className="py-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <Badge className={`${getTypeColor(op.operation_type)} text-white text-xs`}>{op.operation_type?.toUpperCase()}</Badge>
                          <Badge className={`text-xs ${op.my_status === 'attending' ? 'bg-green-700' : op.my_status === 'tentative' ? 'bg-yellow-700' : 'bg-orange-700'} text-white`}>{op.my_status?.toUpperCase()}</Badge>
                        </div>
                        <div className="font-medium text-sm">{op.title}</div>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span className="flex items-center"><Calendar className="w-3 h-3 mr-1" />{op.date}</span>
                          <span className="flex items-center"><Clock className="w-3 h-3 mr-1" />{op.time}</span>
                          {op.max_participants && <span><Users className="inline w-3 h-3 mr-1" />{op.attending_count}/{op.max_participants}</span>}
                        </div>
                        {op.my_role_notes && <div className="text-xs text-gray-600">Role: {op.my_role_notes}</div>}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Quick nav - 25th ID colors */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Link to="/hub/discussions" className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-tropic-red/50 transition-colors text-center" data-testid="hub-nav-discussions">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 text-tropic-red" /><span className="font-medium text-sm">Discussions</span>
            </Link>
            <a href="#ops" className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-tropic-red/50 transition-colors text-center">
              <Calendar className="w-8 h-8 mx-auto mb-2 text-tropic-gold" /><span className="font-medium text-sm">Operations</span>
            </a>
            <a href="#training" className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-tropic-red/50 transition-colors text-center">
              <BookOpen className="w-8 h-8 mx-auto mb-2 text-green-500" /><span className="font-medium text-sm">Training</span>
            </a>
            <Link to="/hub/intel" className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-tropic-red/50 transition-colors text-center" data-testid="hub-nav-intel">
              <Megaphone className="w-8 h-8 mx-auto mb-2 text-tropic-gold" /><span className="font-medium text-sm">Intel Board</span>
            </Link>
            <Link to="/roster" className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-tropic-red/50 transition-colors text-center" data-testid="hub-nav-roster">
              <Users className="w-8 h-8 mx-auto mb-2 text-tropic-red" /><span className="font-medium text-sm">Roster</span>
            </Link>
          </div>

          {/* Announcements */}
          <section id="intel">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-2xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>LATEST INTEL</h3>
            </div>
            {announcements.length === 0 ? <p className="text-gray-500">No announcements.</p> : (
              <div className="grid md:grid-cols-2 gap-4">
                {announcements.map((a) => (
                  <Card key={a.id} className="bg-gray-900 border-gray-800" data-testid={`hub-announcement-${a.id}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className={getPriorityColor(a.priority)}>{a.priority.toUpperCase()}</Badge>
                        <span className="text-xs text-gray-500">{new Date(a.created_at).toLocaleDateString()}</span>
                      </div>
                      <CardTitle className="text-lg" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{a.title}</CardTitle>
                    </CardHeader>
                    <CardContent><p className="text-sm text-gray-400 whitespace-pre-wrap">{a.content}</p></CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* Operations */}
          <section id="ops">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-2xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>UPCOMING OPERATIONS</h3>
            </div>
            {operations.length === 0 ? <p className="text-gray-500">No upcoming operations.</p> : (
              <div className="grid md:grid-cols-2 gap-4">
                {operations.map((op) => {
                  const attending = op.rsvps?.filter(r => r.status === 'attending').length || 0;
                  const tentative = op.rsvps?.filter(r => r.status === 'tentative').length || 0;
                  const waitlisted = op.rsvps?.filter(r => r.status === 'waitlisted').length || 0;
                  return (
                    <Card key={op.id} className="bg-gray-900 border-gray-800 hover:border-tropic-red/30 transition-colors" data-testid={`hub-operation-${op.id}`}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <Badge className={`${getTypeColor(op.operation_type)} text-white`}>{op.operation_type.toUpperCase()}</Badge>
                          {op.max_participants && <span className="text-xs text-gray-400"><Users className="inline w-3 h-3 mr-1" />{attending}/{op.max_participants}</span>}
                        </div>
                        <CardTitle className="text-lg" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{op.title}</CardTitle>
                        <CardDescription className="text-gray-500 line-clamp-2">{op.description}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-4 text-sm text-gray-400 mb-3">
                          <span className="flex items-center"><Calendar className="w-3 h-3 mr-1" />{op.date}</span>
                          <span className="flex items-center"><Clock className="w-3 h-3 mr-1" />{op.time}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                          <span className="text-green-400">{attending} attending</span>
                          {tentative > 0 && <span className="text-yellow-400">{tentative} tentative</span>}
                          {waitlisted > 0 && <span className="text-orange-400">{waitlisted} waitlisted</span>}
                        </div>
                        <Link to={`/hub/operations/${op.id}`}>
                          <Button size="sm" className="bg-tropic-red hover:bg-tropic-red-dark w-full" data-testid={`hub-rsvp-${op.id}`}>VIEW & RSVP <ChevronRight className="w-4 h-4 ml-1" /></Button>
                        </Link>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          {/* Training */}
          <section id="training">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-2xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>TRAINING PROGRAMS</h3>
            </div>
            {training.length === 0 ? <p className="text-gray-500">No training scheduled.</p> : (
              <div className="grid md:grid-cols-3 gap-4">
                {training.map((t) => (
                  <Card key={t.id} className="bg-gray-900 border-gray-800" data-testid={`hub-training-${t.id}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{t.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-400 mb-3 whitespace-pre-wrap">{t.description}</p>
                      <div className="text-xs text-gray-500 space-y-1">
                        <div>Instructor: {t.instructor}</div>
                        <div>Schedule: {t.schedule}</div>
                        <div>Duration: {t.duration}</div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* Discussions preview */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-2xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>RECENT DISCUSSIONS</h3>
              <Link to="/hub/discussions"><Button size="sm" variant="outline" className="border-gray-700" data-testid="hub-view-all-discussions">View All <ChevronRight className="w-4 h-4 ml-1" /></Button></Link>
            </div>
            {discussions.length === 0 ? <p className="text-gray-500">No discussions yet.</p> : (
              <div className="space-y-2">
                {discussions.map((d) => (
                  <Link to={`/hub/discussions/${d.id}`} key={d.id} className="block">
                    <Card className={`bg-gray-900 border-gray-800 hover:border-tropic-red/30 transition-colors ${d.pinned ? 'border-l-2 border-l-tropic-gold' : ''}`} data-testid={`hub-discussion-${d.id}`}>
                      <CardContent className="py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {d.pinned && <Pin className="w-3.5 h-3.5 text-tropic-gold shrink-0" />}
                          <Badge variant="outline" className="text-xs border-gray-700">{d.category}</Badge>
                          <span className="font-medium">{d.title}</span>
                          <span className="text-xs text-gray-500">by {d.author_name}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-gray-500">
                          <span><MessageSquare className="inline w-3 h-3 mr-1" />{d.replies?.length || 0}</span>
                          <span>{new Date(d.created_at).toLocaleDateString()}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default MemberHub;

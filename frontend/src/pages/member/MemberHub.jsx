import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Calendar, Clock, Megaphone, MessageSquare, Users, Shield, LogOut, Home, ChevronRight, BookOpen, User, Search, Pin } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const MemberHub = () => {
  const [user, setUser] = useState(null);
  const [operations, setOperations] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [training, setTraining] = useState([]);
  const [discussions, setDiscussions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem('user') || '{}');
    setUser(stored);
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      const [ops, ann, train, disc] = await Promise.all([
        axios.get(`${API}/operations`),
        axios.get(`${API}/announcements`),
        axios.get(`${API}/training`),
        axios.get(`${API}/discussions`),
      ]);
      setOperations(ops.data.slice(0, 4));
      setAnnouncements(ann.data.slice(0, 4));
      setTraining(train.data.slice(0, 3));
      setDiscussions(disc.data.slice(0, 5));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery || searchQuery.length < 2) return;
    setSearching(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API}/search?q=${encodeURIComponent(searchQuery)}`, { headers: { Authorization: `Bearer ${token}` } });
      setSearchResults(res.data);
    } catch (err) { console.error(err); }
    finally { setSearching(false); }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  const getTypeColor = (t) => ({ combat: 'bg-red-700', training: 'bg-blue-600', recon: 'bg-green-600', support: 'bg-yellow-600' }[t] || 'bg-gray-600');
  const getPriorityColor = (p) => ({ urgent: 'text-red-500 border-red-500', high: 'text-orange-500 border-orange-500', normal: 'text-blue-400 border-blue-400', low: 'text-gray-400 border-gray-400' }[p] || 'text-gray-400 border-gray-400');

  if (loading) return <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Top bar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur border-b border-red-900/30" data-testid="member-nav">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-wider" style={{ fontFamily: 'Rajdhani, sans-serif' }}>AZIMUTH OPS HUB</h1>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-400 hidden sm:block">Welcome, <span className="text-red-400 font-bold">{user?.username}</span></span>
            <Link to="/hub/profile"><Button size="sm" variant="outline" className="border-gray-700"><User className="w-4 h-4 mr-1" />Profile</Button></Link>
            <Link to="/roster"><Button size="sm" variant="outline" className="border-gray-700"><Users className="w-4 h-4 mr-1" />Roster</Button></Link>
            {user?.role === 'admin' && (
              <Link to="/admin"><Button size="sm" variant="outline" className="border-red-700 text-red-500 hover:bg-red-700/10"><Shield className="w-4 h-4 mr-1" />Admin</Button></Link>
            )}
            <Link to="/"><Button size="sm" variant="outline" className="border-gray-700"><Home className="w-4 h-4 mr-1" />Home</Button></Link>
            <Button size="sm" variant="outline" onClick={handleLogout} className="border-gray-700" data-testid="member-logout-btn"><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </nav>

      <div className="pt-20 pb-12 px-6">
        <div className="container mx-auto max-w-7xl space-y-8">
          {/* Welcome banner with search */}
          <div className="bg-gradient-to-r from-red-900/30 to-gray-900 border border-red-900/30 rounded-lg p-6" data-testid="member-welcome-banner">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h2 className="text-3xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>OPERATIONS HUB</h2>
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
                <Button type="submit" disabled={searching || searchQuery.length < 2} className="bg-red-700 hover:bg-red-800" data-testid="hub-search-btn">
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
                        <Card className="bg-gray-900 border-gray-800 hover:border-red-700/30 transition-colors" data-testid={`search-op-${op.id}`}>
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
                        <Card className="bg-gray-900 border-gray-800 hover:border-red-700/30 transition-colors" data-testid={`search-disc-${d.id}`}>
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

          {/* Quick nav */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Link to="/hub/discussions" className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-red-700/50 transition-colors text-center" data-testid="hub-nav-discussions">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 text-red-500" /><span className="font-medium text-sm">Discussions</span>
            </Link>
            <a href="#ops" className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-red-700/50 transition-colors text-center">
              <Calendar className="w-8 h-8 mx-auto mb-2 text-blue-500" /><span className="font-medium text-sm">Operations</span>
            </a>
            <a href="#training" className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-red-700/50 transition-colors text-center">
              <BookOpen className="w-8 h-8 mx-auto mb-2 text-green-500" /><span className="font-medium text-sm">Training</span>
            </a>
            <a href="#intel" className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-red-700/50 transition-colors text-center">
              <Megaphone className="w-8 h-8 mx-auto mb-2 text-yellow-500" /><span className="font-medium text-sm">Intel</span>
            </a>
            <Link to="/roster" className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-red-700/50 transition-colors text-center" data-testid="hub-nav-roster">
              <Users className="w-8 h-8 mx-auto mb-2 text-purple-500" /><span className="font-medium text-sm">Roster</span>
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
                    <CardContent><p className="text-sm text-gray-400">{a.content}</p></CardContent>
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
                    <Card key={op.id} className="bg-gray-900 border-gray-800 hover:border-red-700/30 transition-colors" data-testid={`hub-operation-${op.id}`}>
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
                          <Button size="sm" className="bg-red-700 hover:bg-red-800 w-full" data-testid={`hub-rsvp-${op.id}`}>VIEW & RSVP <ChevronRight className="w-4 h-4 ml-1" /></Button>
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
                      <p className="text-sm text-gray-400 mb-3">{t.description}</p>
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
                    <Card className={`bg-gray-900 border-gray-800 hover:border-red-700/30 transition-colors ${d.pinned ? 'border-l-2 border-l-yellow-600' : ''}`} data-testid={`hub-discussion-${d.id}`}>
                      <CardContent className="py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {d.pinned && <Pin className="w-3.5 h-3.5 text-yellow-500 shrink-0" />}
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

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Calendar, Clock, Megaphone, MessageSquare, Users, Shield, LogOut, Home, ChevronRight, BookOpen, User, Search, Pin, Bell, CalendarCheck, Star, MapPin, Image, Globe, Handshake, Menu, X, Map as MapIcon, Radio } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { isStaff, hasPermission, PERMISSIONS } from '@/utils/permissions';
import { useMemberLayout } from '@/components/MemberLayout';

import { BACKEND_URL, API } from '@/utils/api';

const MemberHub = () => {
  const { user, logout } = useAuth();
  const inLayout = useMemberLayout();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
  const [operationsPlans, setOperationsPlans] = useState([]);
  const [livePlans, setLivePlans] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      const [ops, ann, train, disc, sched, motwRes, plansRes, liveRes] = await Promise.all([
        axios.get(`${API}/operations`),
        axios.get(`${API}/announcements`),
        axios.get(`${API}/training`),
        axios.get(`${API}/discussions`),
        axios.get(`${API}/my-schedule`).catch(() => ({ data: [] })),
        axios.get(`${API}/soldier-of-the-month`).catch(() => ({ data: null })),
        axios.get(`${API}/operations-plans?published_only=true`).catch(() => ({ data: [] })),
        axios.get(`${API}/operations-plans?live_only=true`).catch(() => ({ data: [] })),
      ]);
      setOperations(ops.data.slice(0, 4));
      setAnnouncements(ann.data.slice(0, 4));
      setTraining(train.data.slice(0, 3));
      setDiscussions(disc.data.slice(0, 5));
      setMySchedule(sched.data || []);
      setMotw(motwRes.data);
      setOperationsPlans((plansRes.data || []).slice(0, 4));
      setLivePlans((liveRes.data || []).slice(0, 4));
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

  const getTypeColor = (t) => ({ combat: 'bg-[#ff3333]', training: 'bg-[#c9a227]', recon: 'bg-green-600', support: 'bg-[#4a6070]' }[t] || 'bg-[#4a6070]');
  const getPriorityColor = (p) => ({ urgent: 'text-[#ff3333] border-[#ff3333]', high: 'text-orange-500 border-orange-500', normal: 'text-[#e8c547] border-[#e8c547]', low: 'text-[#8a9aa8] border-gray-400' }[p] || 'text-[#8a9aa8] border-gray-400');

  if (loading) return <div className={`${inLayout ? '' : 'min-h-screen'} bg-[#050a0e] text-[#d0d8e0] flex items-center justify-center`}>Loading...</div>;

  return (
    <div className={inLayout ? '' : 'min-h-screen bg-[#050a0e] text-[#d0d8e0]'}>
      {/* Top bar — only when NOT inside MemberLayout sidebar */}
      {!inLayout && (
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#050a0e]/95 backdrop-blur-xl border-b border-[rgba(201,162,39,0.1)]" data-testid="member-nav">
        <div className="container mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={`${BACKEND_URL}/api/uploads/25th_id_patch.png`} alt="25th ID" className="w-8 h-8 object-contain" />
            <h1 className="text-xl font-bold tracking-[0.12em] text-[#e8c547]" style={{ fontFamily: "'Share Tech', sans-serif" }}>25TH ID HUB</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[#8a9aa8] hidden lg:block">Welcome, <span className="text-[#e8c547] font-bold">{user?.username}</span></span>
            {/* Desktop nav links */}
            <div className="hidden md:flex items-center space-x-2">
              <Link to="/hub/profile"><Button size="sm" variant="outline" className="border-[rgba(201,162,39,0.15)]"><User className="w-4 h-4 mr-1" />Profile</Button></Link>
              <Link to="/roster"><Button size="sm" variant="outline" className="border-[rgba(201,162,39,0.15)]"><Users className="w-4 h-4 mr-1" />Roster</Button></Link>
              <Link to="/hub/gallery"><Button size="sm" variant="outline" className="border-[rgba(201,162,39,0.15)]"><Image className="w-4 h-4 mr-1" />Gallery</Button></Link>
              <Link to="/hub/loa"><Button variant="ghost" size="sm" className="text-[#8a9aa8] hover:text-[#e8c547]"><Calendar className="w-4 h-4 mr-1.5" />LOA</Button></Link>
              <Link to="/hub/shared"><Button variant="ghost" size="sm" className="text-[#8a9aa8] hover:text-[#e8c547]"><Handshake className="w-4 h-4 mr-1.5" />Shared</Button></Link>
              <Link to="/hub/campaign"><Button size="sm" variant="outline" className="border-[#e8c547]/40 text-[#e8c547] hover:bg-[#e8c547]/10"><MapPin className="w-4 h-4 mr-1" />Campaigns</Button></Link>
              <Link to="/hub/threat-map"><Button size="sm" variant="outline" className="border-[#e8c547]/40 text-[#e8c547] hover:bg-[#e8c547]/10"><Globe className="w-4 h-4 mr-1" />Global Threat Map</Button></Link>
              {isStaff(user?.role) && (
                <Link to="/admin"><Button size="sm" variant="outline" className="border-[#ff3333]/40 text-[#ff3333] hover:bg-[#ff3333]/10"><Shield className="w-4 h-4 mr-1" />Admin</Button></Link>
              )}
              <Link to="/"><Button size="sm" variant="outline" className="border-[rgba(201,162,39,0.15)]"><Home className="w-4 h-4 mr-1" />Home</Button></Link>
              <Button size="sm" variant="outline" onClick={handleLogout} className="border-[rgba(201,162,39,0.15)]" data-testid="member-logout-btn"><LogOut className="w-4 h-4" /></Button>
            </div>
            {/* Mobile hamburger */}
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden text-[#e8c547] p-1" aria-label="Toggle menu">
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[rgba(201,162,39,0.1)] bg-[#050a0e]/95 backdrop-blur-xl px-4 py-3 space-y-1">
            <Link to="/hub/profile" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 px-3 py-2.5 text-sm text-[#d0d8e0] hover:text-[#e8c547] hover:bg-[#e8c547]/10"><User className="w-4 h-4" />Profile</Link>
            <Link to="/roster" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 px-3 py-2.5 text-sm text-[#d0d8e0] hover:text-[#e8c547] hover:bg-[#e8c547]/10"><Users className="w-4 h-4" />Roster</Link>
            <Link to="/hub/gallery" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 px-3 py-2.5 text-sm text-[#d0d8e0] hover:text-[#e8c547] hover:bg-[#e8c547]/10"><Image className="w-4 h-4" />Gallery</Link>
            <Link to="/hub/loa" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 px-3 py-2.5 text-sm text-[#d0d8e0] hover:text-[#e8c547] hover:bg-[#e8c547]/10"><Calendar className="w-4 h-4" />LOA</Link>
            <Link to="/hub/shared" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 px-3 py-2.5 text-sm text-[#d0d8e0] hover:text-[#e8c547] hover:bg-[#e8c547]/10"><Handshake className="w-4 h-4" />Shared</Link>
            <Link to="/hub/campaign" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 px-3 py-2.5 text-sm text-[#e8c547] hover:bg-[#e8c547]/10"><MapPin className="w-4 h-4" />Campaigns</Link>
            <Link to="/hub/threat-map" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 px-3 py-2.5 text-sm text-[#e8c547] hover:bg-[#e8c547]/10"><Globe className="w-4 h-4" />Global Threat Map</Link>
            {isStaff(user?.role) && (
              <Link to="/admin" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 px-3 py-2.5 text-sm text-[#ff3333] hover:bg-[#ff3333]/10"><Shield className="w-4 h-4" />Admin</Link>
            )}
            <Link to="/" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 px-3 py-2.5 text-sm text-[#d0d8e0] hover:text-[#e8c547] hover:bg-[#e8c547]/10"><Home className="w-4 h-4" />Home</Link>
            <button onClick={() => { handleLogout(); setMobileMenuOpen(false); }} className="flex items-center gap-2 px-3 py-2.5 text-sm text-[#d0d8e0] hover:text-[#ff3333] hover:bg-[#ff3333]/10 w-full" data-testid="member-logout-btn"><LogOut className="w-4 h-4" />Logout</button>
          </div>
        )}
      </nav>
      )}

      <div className={`${inLayout ? 'pt-4' : 'pt-20'} pb-12 px-4 md:px-6`}>
        <div className="container mx-auto max-w-7xl space-y-8">
          {/* Welcome banner with search - 25th ID colors */}
          <div className="bg-[#0c1117] border border-[rgba(201,162,39,0.15)] corner-bracket p-4 sm:p-6" data-testid="member-welcome-banner">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 sm:gap-4">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold text-[#e8c547] tracking-[0.1em]" style={{ fontFamily: "'Share Tech', sans-serif" }}>OPERATIONS HUB</h2>
                <p className="text-[#8a9aa8] mt-1 text-xs sm:text-sm tracking-wide">Your tactical command overview — stay informed, stay ready.</p>
              </div>
              <form onSubmit={handleSearch} className="flex gap-2 w-full md:w-auto">
                <div className="relative flex-1 md:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4a6070]" />
                  <Input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search operations & discussions..."
                    className="bg-[#050a0e]/50 border-[rgba(201,162,39,0.15)] pl-10"
                    data-testid="hub-search-input"
                  />
                </div>
                <Button type="submit" disabled={searching || searchQuery.length < 2} className="tactical-button bg-[#e8c547] text-[#050a0e] hover:bg-[#c9a227] shrink-0" data-testid="hub-search-btn">
                  {searching ? '...' : 'Search'}
                </Button>
                {searchResults && <Button type="button" variant="outline" onClick={clearSearch} className="border-[rgba(201,162,39,0.15)] shrink-0" data-testid="hub-search-clear">Clear</Button>}
              </form>
            </div>
          </div>

          {/* Search Results */}
          {searchResults && (
            <div className="space-y-4" data-testid="hub-search-results">
              <h3 className="text-xl font-bold text-[#e8c547]" style={{ fontFamily: "'Share Tech', sans-serif" }}>SEARCH RESULTS</h3>
              {searchResults.operations?.length > 0 && (
                <div>
                  <h4 className="text-sm tracking-[0.15em] text-[#8a9aa8] mb-2" style={{ fontFamily: "'Oswald', sans-serif" }}>OPERATIONS ({searchResults.operations.length})</h4>
                  <div className="grid md:grid-cols-2 gap-3">
                    {searchResults.operations.map(op => (
                      <Link to={`/hub/operations/${op.id}`} key={op.id}>
                        <Card className="bg-[#0c1117] border-[rgba(201,162,39,0.1)] hover:border-[#e8c547]/30 transition-colors corner-bracket" data-testid={`search-op-${op.id}`}>
                          <CardContent className="py-3">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge className={`${getTypeColor(op.operation_type)} text-white text-xs`}>{op.operation_type?.toUpperCase()}</Badge>
                              <span className="text-xs text-[#4a6070]">{op.date}</span>
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
                  <h4 className="text-sm tracking-[0.15em] text-[#8a9aa8] mb-2" style={{ fontFamily: "'Oswald', sans-serif" }}>DISCUSSIONS ({searchResults.discussions.length})</h4>
                  <div className="space-y-2">
                    {searchResults.discussions.map(d => (
                      <Link to={`/hub/discussions/${d.id}`} key={d.id}>
                        <Card className="bg-[#0c1117] border-[rgba(201,162,39,0.1)] hover:border-[#e8c547]/30 transition-colors" data-testid={`search-disc-${d.id}`}>
                          <CardContent className="py-3 flex items-center gap-3">
                            {d.pinned && <Pin className="w-3 h-3 text-[#e8c547] shrink-0" />}
                            <Badge variant="outline" className="text-xs border-[rgba(201,162,39,0.15)]">{d.category}</Badge>
                            <span className="font-medium">{d.title}</span>
                            <span className="text-xs text-[#4a6070] ml-auto">by {d.author_name}</span>
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {(!searchResults.operations?.length && !searchResults.discussions?.length) && (
                <p className="text-[#4a6070] text-sm">No results found for "{searchQuery}".</p>
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
                    <div className="bg-[#ff3333]/10 border border-[#ff3333]/40 p-4 flex items-center gap-4 hover:bg-[#ff3333]/20 transition-colors">
                      <Bell className="w-5 h-5 text-[#e8c547] shrink-0 animate-pulse" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{op.title}</div>
                        <div className="text-xs text-[#8a9aa8] flex items-center gap-3 mt-0.5">
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

          {/* Soldier of the Month - 25th ID colors */}
          {motw && (
            <Card className="bg-[#0c1117] border-[#e8c547]/40 corner-bracket" data-testid="motw-card">
              <CardContent className="p-5 flex items-center gap-5">
                <div className="relative shrink-0">
                  <div className="w-16 h-16 rounded-full border-2 border-[#e8c547] overflow-hidden bg-[#111a24] flex items-center justify-center">
                    {motw.avatar_url ? (
                      <img src={motw.avatar_url.startsWith('http') ? motw.avatar_url : `${BACKEND_URL}/api${motw.avatar_url}`} alt={motw.username} className="w-full h-full object-cover" />
                    ) : (
                      <Star className="w-8 h-8 text-[#e8c547]" />
                    )}
                  </div>
                  <div className="absolute -top-1 -right-1 w-6 h-6 bg-[#ff3333] rounded-full flex items-center justify-center border border-[#050a0e]">
                    <Star className="w-3.5 h-3.5 text-[#e8c547] fill-[#e8c547]" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs tracking-widest text-[#e8c547] mb-0.5" style={{ fontFamily: "'Oswald', sans-serif" }}>SOLDIER OF THE MONTH</div>
                  <div className="text-lg font-bold tracking-wide" style={{ fontFamily: "'Share Tech', sans-serif" }}>{motw.username}</div>
                  {motw.rank && <div className="text-xs text-[#8a9aa8]">{motw.rank}</div>}
                  {motw.reason && <p className="text-sm text-[#d0d8e0] mt-1 whitespace-pre-wrap">{motw.reason}</p>}
                </div>
              </CardContent>
            </Card>
          )}

          {/* My Schedule */}
          {mySchedule.length > 0 && (
            <section data-testid="my-schedule-section">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-bold flex items-center gap-2 text-[#e8c547]" style={{ fontFamily: "'Share Tech', sans-serif" }}>
                  <CalendarCheck className="w-6 h-6 text-[#e8c547]" /> MY SCHEDULE
                </h3>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                {mySchedule.map(op => (
                  <Link to={`/hub/operations/${op.id}`} key={op.id}>
                    <Card className="bg-[#0c1117] border-[rgba(201,162,39,0.1)] hover:border-[#e8c547]/30 transition-colors h-full" data-testid={`schedule-op-${op.id}`}>
                      <CardContent className="py-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <Badge className={`${getTypeColor(op.operation_type)} text-white text-xs`}>{op.operation_type?.toUpperCase()}</Badge>
                          <Badge className={`text-xs ${op.my_status === 'attending' ? 'bg-green-700' : op.my_status === 'tentative' ? 'bg-yellow-700' : 'bg-orange-700'} text-white`}>{op.my_status?.toUpperCase()}</Badge>
                        </div>
                        <div className="font-medium text-sm">{op.title}</div>
                        <div className="flex items-center gap-3 text-xs text-[#4a6070]">
                          <span className="flex items-center"><Calendar className="w-3 h-3 mr-1" />{op.date}</span>
                          <span className="flex items-center"><Clock className="w-3 h-3 mr-1" />{op.time}</span>
                          {op.max_participants && <span><Users className="inline w-3 h-3 mr-1" />{op.attending_count}/{op.max_participants}</span>}
                        </div>
                        {op.my_role_notes && <div className="text-xs text-[#4a6070]">Role: {op.my_role_notes}</div>}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Quick nav - 25th ID colors */}
          <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
            <Link to="/hub/discussions" className="bg-[#0c1117] border border-[rgba(201,162,39,0.1)] p-3 sm:p-4 hover:border-[#e8c547]/30 active:bg-[#111a24] transition-colors text-center" data-testid="hub-nav-discussions">
              <MessageSquare className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-1.5 sm:mb-2 text-[#e8c547]" /><span className="font-medium text-xs sm:text-sm">Discussions</span>
            </Link>
            <a href="#ops" className="bg-[#0c1117] border border-[rgba(201,162,39,0.1)] p-3 sm:p-4 hover:border-[#e8c547]/30 active:bg-[#111a24] transition-colors text-center">
              <Calendar className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-1.5 sm:mb-2 text-[#e8c547]" /><span className="font-medium text-xs sm:text-sm">Operations</span>
            </a>
            <a href="#training" className="bg-[#0c1117] border border-[rgba(201,162,39,0.1)] p-3 sm:p-4 hover:border-[#e8c547]/30 active:bg-[#111a24] transition-colors text-center">
              <BookOpen className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-1.5 sm:mb-2 text-[#e8c547]" /><span className="font-medium text-xs sm:text-sm">Training</span>
            </a>
            <Link to="/hub/intel" className="bg-[#0c1117] border border-[rgba(201,162,39,0.1)] p-3 sm:p-4 hover:border-[#e8c547]/30 active:bg-[#111a24] transition-colors text-center" data-testid="hub-nav-intel">
              <Megaphone className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-1.5 sm:mb-2 text-[#e8c547]" /><span className="font-medium text-xs sm:text-sm">Intel Board</span>
            </Link>
            <Link to="/hub/campaign" className="bg-[#0c1117] border border-[rgba(201,162,39,0.1)] p-3 sm:p-4 hover:border-[#e8c547]/30 active:bg-[#111a24] transition-colors text-center" data-testid="hub-nav-campaign">
              <MapPin className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-1.5 sm:mb-2 text-[#e8c547]" /><span className="font-medium text-xs sm:text-sm">Campaigns</span>
            </Link>
            <Link to="/hub/gallery" className="bg-[#0c1117] border border-[rgba(201,162,39,0.1)] p-3 sm:p-4 hover:border-[#e8c547]/30 active:bg-[#111a24] transition-colors text-center" data-testid="hub-nav-gallery">
              <Image className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-1.5 sm:mb-2 text-[#e8c547]" /><span className="font-medium text-xs sm:text-sm">Gallery</span>
            </Link>
          </div>

          {/* Announcements */}
          <section id="intel">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-2xl font-bold text-[#e8c547]" style={{ fontFamily: "'Share Tech', sans-serif" }}>LATEST INTEL</h3>
            </div>
            {announcements.length === 0 ? <p className="text-[#4a6070]">No announcements.</p> : (
              <div className="grid md:grid-cols-2 gap-4">
                {announcements.map((a) => (
                  <Card key={a.id} className="bg-[#0c1117] border-[rgba(201,162,39,0.1)] corner-bracket" data-testid={`hub-announcement-${a.id}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className={getPriorityColor(a.priority)}>{a.priority.toUpperCase()}</Badge>
                        <span className="text-xs text-[#4a6070]">{new Date(a.created_at).toLocaleDateString()}</span>
                      </div>
                      <CardTitle className="text-lg" style={{ fontFamily: "'Share Tech', sans-serif" }}>{a.title}</CardTitle>
                    </CardHeader>
                    <CardContent><p className="text-sm text-[#8a9aa8] whitespace-pre-wrap">{a.content}</p></CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* Operations */}
          <section id="ops">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-2xl font-bold text-[#e8c547]" style={{ fontFamily: "'Share Tech', sans-serif" }}>UPCOMING OPERATIONS</h3>
            </div>
            {operations.length === 0 ? <p className="text-[#4a6070]">No upcoming operations.</p> : (
              <div className="grid md:grid-cols-2 gap-4">
                {operations.map((op) => {
                  const isDiscordSynced = !!op.external_id;
                  const attending = isDiscordSynced
                    ? (op.attendees || []).filter(a => a.status === 'accepted').length
                    : (op.rsvps?.filter(r => r.status === 'attending').length || 0);
                  const declined = isDiscordSynced
                    ? (op.attendees || []).filter(a => a.status === 'declined').length
                    : 0;
                  const tentative = isDiscordSynced
                    ? (op.attendees || []).filter(a => a.status === 'tentative').length
                    : (op.rsvps?.filter(r => r.status === 'tentative').length || 0);
                  const waitlisted = isDiscordSynced ? 0 : (op.rsvps?.filter(r => r.status === 'waitlisted').length || 0);
                  return (
                    <Card key={op.id} className="bg-[#0c1117] border-[rgba(201,162,39,0.1)] hover:border-[#e8c547]/30 transition-colors corner-bracket" data-testid={`hub-operation-${op.id}`}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <Badge className={`${getTypeColor(op.operation_type)} text-white`}>{op.operation_type.toUpperCase()}</Badge>
                          {op.max_participants && !isDiscordSynced && <span className="text-xs text-[#8a9aa8]"><Users className="inline w-3 h-3 mr-1" />{attending}/{op.max_participants}</span>}
                        </div>
                        <CardTitle className="text-lg" style={{ fontFamily: "'Share Tech', sans-serif" }}>{op.title}</CardTitle>
                        <CardDescription className="text-[#4a6070] line-clamp-2">{op.description}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-4 text-sm text-[#8a9aa8] mb-3">
                          <span className="flex items-center"><Calendar className="w-3 h-3 mr-1" />{op.date}</span>
                          <span className="flex items-center"><Clock className="w-3 h-3 mr-1" />{op.time}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-[#4a6070] mb-3">
                          {isDiscordSynced ? (
                            <>
                              <span className="text-green-400">{attending} accepted</span>
                              {declined > 0 && <span className="text-red-400">{declined} declined</span>}
                              {tentative > 0 && <span className="text-yellow-400">{tentative} tentative</span>}
                            </>
                          ) : (
                            <>
                              <span className="text-green-400">{attending} attending</span>
                              {tentative > 0 && <span className="text-yellow-400">{tentative} tentative</span>}
                              {waitlisted > 0 && <span className="text-orange-400">{waitlisted} waitlisted</span>}
                            </>
                          )}
                        </div>
                        <Link to={`/hub/operations/${op.id}`}>
                          <Button size="sm" className="tactical-button bg-[#e8c547] text-[#050a0e] hover:bg-[#c9a227] w-full" data-testid={`hub-rsvp-${op.id}`}>{isDiscordSynced ? 'VIEW DETAILS' : 'VIEW & RSVP'} <ChevronRight className="w-4 h-4 ml-1" /></Button>
                        </Link>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          {/* Live Planning Sessions */}
          {livePlans.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-2xl font-bold text-[#e8c547]" style={{ fontFamily: "'Share Tech', sans-serif" }}>LIVE PLANNING</h3>
                  <Badge className="bg-[#ff3333]/80 text-white animate-pulse text-[10px]">
                    <Radio className="w-3 h-3 mr-1" /> LIVE
                  </Badge>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                {livePlans.map((plan) => (
                  <Card key={plan.id} className="bg-[#0c1117] border-[#ff3333]/30 hover:border-[#ff3333]/50 transition-colors relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#ff3333] animate-pulse" />
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <Badge className="bg-[#ff3333]/20 text-[#ff3333] border border-[#ff3333]/40">
                          <Radio className="w-3 h-3 mr-1" /> LIVE SESSION
                        </Badge>
                        {plan.units && <span className="text-xs text-[#8a9aa8]"><MapIcon className="inline w-3 h-3 mr-1" />{plan.units.length} units</span>}
                      </div>
                      <CardTitle className="text-lg" style={{ fontFamily: "'Share Tech', sans-serif" }}>{plan.title}</CardTitle>
                      {plan.description && <CardDescription className="text-[#4a6070] line-clamp-2">{plan.description}</CardDescription>}
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-4 text-xs text-[#4a6070] mb-3">
                        <span>by {plan.created_by_username || 'Unknown'}</span>
                      </div>
                      <Link to={`/hub/plans/${plan.id}`}>
                        <Button size="sm" className="bg-[#ff3333] text-white hover:bg-[#cc2222] w-full">
                          <Eye className="w-4 h-4 mr-1" /> VIEW LIVE <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* Operations Plans */}
          {operationsPlans.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-bold text-[#e8c547]" style={{ fontFamily: "'Share Tech', sans-serif" }}>OPERATIONS PLANS</h3>
                <Link to="/hub/operations-planner"><Button size="sm" variant="outline" className="border-[rgba(201,162,39,0.15)]">
                  {hasPermission(user?.role, PERMISSIONS.MANAGE_PLANS) ? 'Manage' : 'View All'} <ChevronRight className="w-4 h-4 ml-1" />
                </Button></Link>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                {operationsPlans.map((plan) => (
                  <Card key={plan.id} className="bg-[#0c1117] border-[rgba(201,162,39,0.1)] hover:border-[#e8c547]/30 transition-colors">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <Badge className="bg-[#e8c547]/20 text-[#e8c547] border border-[#e8c547]/40">PLAN</Badge>
                        {plan.units && <span className="text-xs text-[#8a9aa8]"><MapIcon className="inline w-3 h-3 mr-1" />{plan.units.length} units</span>}
                      </div>
                      <CardTitle className="text-lg" style={{ fontFamily: "'Share Tech', sans-serif" }}>{plan.title}</CardTitle>
                      {plan.description && <CardDescription className="text-[#4a6070] line-clamp-2">{plan.description}</CardDescription>}
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-4 text-xs text-[#4a6070] mb-3">
                        <span>by {plan.created_by_username || 'Unknown'}</span>
                        {plan.updated_at && <span>{new Date(plan.updated_at).toLocaleDateString()}</span>}
                      </div>
                      <Link to={`/hub/plans/${plan.id}`}>
                        <Button size="sm" className="bg-[#e8c547] text-[#050a0e] hover:bg-[#c9a227] w-full">
                          VIEW PLAN <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* Training */}
          <section id="training">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-2xl font-bold text-[#e8c547]" style={{ fontFamily: "'Share Tech', sans-serif" }}>TRAINING PROGRAMS</h3>
            </div>
            {training.length === 0 ? <p className="text-[#4a6070]">No training scheduled.</p> : (
              <div className="grid md:grid-cols-3 gap-4">
                {training.map((t) => (
                  <Card key={t.id} className="bg-[#0c1117] border-[rgba(201,162,39,0.1)]" data-testid={`hub-training-${t.id}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg" style={{ fontFamily: "'Share Tech', sans-serif" }}>{t.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-[#8a9aa8] mb-3 whitespace-pre-wrap">{t.description}</p>
                      <div className="text-xs text-[#4a6070] space-y-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
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
              <h3 className="text-2xl font-bold text-[#e8c547]" style={{ fontFamily: "'Share Tech', sans-serif" }}>RECENT DISCUSSIONS</h3>
              <Link to="/hub/discussions"><Button size="sm" variant="outline" className="border-[rgba(201,162,39,0.15)]" data-testid="hub-view-all-discussions">View All <ChevronRight className="w-4 h-4 ml-1" /></Button></Link>
            </div>
            {discussions.length === 0 ? <p className="text-[#4a6070]">No discussions yet.</p> : (
              <div className="space-y-2">
                {discussions.map((d) => (
                  <Link to={`/hub/discussions/${d.id}`} key={d.id} className="block">
                    <Card className={`bg-[#0c1117] border-[rgba(201,162,39,0.1)] hover:border-[#e8c547]/30 active:bg-[#111a24]/50 transition-colors ${d.pinned ? 'border-l-2 border-l-[#e8c547]' : ''}`} data-testid={`hub-discussion-${d.id}`}>
                      <CardContent className="py-3">
                        <div className="flex items-start sm:items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
                            {d.pinned && <Pin className="w-3.5 h-3.5 text-[#e8c547] shrink-0" />}
                            <Badge variant="outline" className="text-xs border-[rgba(201,162,39,0.15)] shrink-0">{d.category}</Badge>
                            <span className="font-medium truncate">{d.title}</span>
                            <span className="text-xs text-[#4a6070] hidden sm:inline">by {d.author_name}</span>
                          </div>
                          <div className="flex items-center gap-2 sm:gap-3 text-sm text-[#4a6070] shrink-0">
                            <span><MessageSquare className="inline w-3 h-3 mr-1" />{d.replies?.length || 0}</span>
                            <span className="hidden sm:inline">{new Date(d.created_at).toLocaleDateString()}</span>
                          </div>
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

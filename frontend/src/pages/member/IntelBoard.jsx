import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, Search, FileText, Shield, Home, LogOut, Tag, Clock, User, ChevronRight, X, Filter, CheckCircle, Eye } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { isStaff } from '@/utils/permissions';
import MapMiniView from '@/components/MapMiniView';
import { colors } from '@/theme/theme';

import { API } from '@/utils/api';
import { useMemberLayout } from '@/components/MemberLayout';

const CATEGORIES = [
  { value: 'intel_update', label: 'Intel Update', short: 'INTEL', color: 'bg-[#ff3333]/80 text-white' },
  { value: 'commanders_intent', label: "Commander's Intent", short: 'CDR INTENT', color: 'bg-[#e8c547] text-black' },
  { value: 'operational_order', label: 'Operational Order', short: 'OPORD', color: 'bg-[#c9a227] text-white' },
  { value: 'after_action_report', label: 'After Action Report', short: 'AAR', color: 'bg-emerald-700 text-white' },
  { value: 'training_bulletin', label: 'Training Bulletin', short: 'TNG BUL', color: 'bg-[#4a6070] text-white' },
];

const CLASSIFICATIONS = [
  { value: 'routine', label: 'ROUTINE', color: 'border-[#4a6070] text-[#8a9aa8]' },
  { value: 'priority', label: 'PRIORITY', color: 'border-[#e8c547] text-[#e8c547]' },
  { value: 'immediate', label: 'IMMEDIATE', color: 'border-orange-600 text-orange-400' },
  { value: 'flash', label: 'FLASH', color: 'border-[#ff3333] text-[#ff3333] animate-pulse' },
];

const getCat = (v) => CATEGORIES.find(c => c.value === v) || CATEGORIES[0];
const getCls = (v) => CLASSIFICATIONS.find(c => c.value === v) || CLASSIFICATIONS[0];

const IntelBoard = () => {
  const inLayout = useMemberLayout();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [briefings, setBriefings] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [selected, setSelected] = useState(null);
  const [acking, setAcking] = useState(false);

  useEffect(() => {
    axios.get(`${API}/intel/tags`).then(r => setAllTags(r.data)).catch(() => {});
  }, []);

  const fetchBriefings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterCat) params.append('category', filterCat);
      if (filterTag) params.append('tag', filterTag);
      if (search) params.append('search', search);
      const res = await axios.get(`${API}/intel?${params}`);
      setBriefings(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [search, filterCat, filterTag]);

  useEffect(() => {
    fetchBriefings();
  }, [fetchBriefings]);

  const handleAcknowledge = async (briefingId, isAcked) => {
    setAcking(true);
    try {
      if (isAcked) {
        await axios.delete(`${API}/intel/${briefingId}/acknowledge`);
      } else {
        await axios.post(`${API}/intel/${briefingId}/acknowledge`);
      }
      // Update local state
      setBriefings(prev => prev.map(b => b.id === briefingId ? { ...b, user_acknowledged: !isAcked, ack_count: b.ack_count + (isAcked ? -1 : 1) } : b));
      if (selected?.id === briefingId) {
        setSelected(prev => (prev ? { ...prev, user_acknowledged: !isAcked, ack_count: prev.ack_count + (isAcked ? -1 : 1) } : prev));
      }
    } catch (e) { console.error(e); }
    finally { setAcking(false); }
  };

  const handleLogout = async () => { await logout(); navigate('/'); };

  return (
    <div className={inLayout ? '' : 'min-h-screen bg-[#050a0e] text-[#d0d8e0]'}>
      {/* Nav */}
      {!inLayout && (
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#050a0e]/95 backdrop-blur-xl border-b border-[rgba(201,162,39,0.15)]">
        <div className="container mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/hub"><Button size="sm" variant="outline" className="border-gray-700"><ArrowLeft className="w-4 h-4 mr-1" />Hub</Button></Link>
            <h1 className="text-xl font-bold tracking-[0.12em] text-[#e8c547]" style={{ fontFamily: "'Share Tech', sans-serif" }} data-testid="intel-board-title">
              INTELLIGENCE BOARD
            </h1>
          </div>
          <div className="flex items-center space-x-3">
            {isStaff(user?.role) && <Link to="/admin/intel"><Button size="sm" variant="outline" className="border-tropic-gold/60 text-tropic-gold"><Shield className="w-4 h-4 mr-1" />Manage</Button></Link>}
            <Link to="/"><Button size="sm" variant="outline" className="border-gray-700"><Home className="w-4 h-4" /></Button></Link>
            <Button size="sm" variant="outline" onClick={handleLogout} className="border-gray-700"><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </nav>
      )}

      <div className={`${inLayout ? 'pt-4' : 'pt-20'} pb-12 px-4 md:px-6`}>
        <div className="container mx-auto max-w-5xl space-y-6">
          {/* Header Banner */}
          <div className="relative corner-bracket border border-[rgba(201,162,39,0.15)] bg-[radial-gradient(circle_at_top,rgba(201,162,39,0.06),#050a0e_58%)] px-6 py-7 shadow-2xl" data-testid="intel-board-header">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#c9a227]" style={{ fontFamily: "'Oswald', sans-serif" }}>S2/S3 Combined Intelligence Feed</p>
            <h2 className="mt-3 text-3xl font-black uppercase tracking-[0.12em] text-[#e8c547]" style={{ fontFamily: "'Share Tech', sans-serif" }}>
              CLASSIFIED INTELLIGENCE BRIEFINGS
            </h2>
            <p className="mt-3 text-sm text-[#8a9aa8]" style={{ fontFamily: "'Inter', sans-serif" }}>25th Infantry Division — Tropic Lightning S2/S3 Combined Intelligence Feed</p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <Input value={search} onChange={e => setSearch(e.target.value)} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] pl-10 rounded-none text-[#d0d8e0]" style={{ fontFamily: "'JetBrains Mono', monospace" }} placeholder="Search briefings..." data-testid="intel-board-search" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={!filterCat ? 'default' : 'outline'} onClick={() => setFilterCat('')}
                className={!filterCat ? 'bg-[#111a24] text-[#e8c547] border border-[rgba(201,162,39,0.3)]' : 'border-[rgba(201,162,39,0.12)] text-[#8a9aa8]'} data-testid="filter-all">
                ALL
              </Button>
              {CATEGORIES.map(c => (
                <Button key={c.value} size="sm" variant={filterCat === c.value ? 'default' : 'outline'}
                  onClick={() => setFilterCat(filterCat === c.value ? '' : c.value)}
                  className={filterCat === c.value ? `${c.color}` : 'border-[rgba(201,162,39,0.12)] text-[#8a9aa8]'}
                  data-testid={`filter-${c.value}`}>
                  {c.short}
                </Button>
              ))}
            </div>
          </div>

          {/* Active tag filter */}
          {filterTag && (
            <div className="flex items-center gap-2">
              <Filter className="w-3 h-3 text-gray-500" />
              <span className="text-xs text-gray-500">Filtered by tag:</span>
              <Badge variant="outline" className="border-[rgba(201,162,39,0.4)] text-[#e8c547] text-xs">
                {filterTag} <button onClick={() => setFilterTag('')} className="ml-1"><X className="w-3 h-3" /></button>
              </Badge>
            </div>
          )}

          {/* Tag Cloud */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {allTags.map(t => (
                <button key={t} onClick={() => setFilterTag(filterTag === t ? '' : t)}
                  className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${filterTag === t ? 'bg-[rgba(201,162,39,0.08)] border-[rgba(201,162,39,0.4)] text-[#e8c547]' : 'border-[rgba(201,162,39,0.1)] text-[#4a6070] hover:border-[rgba(201,162,39,0.3)] hover:text-[#8a9aa8]'}`}
                  data-testid={`tag-${t}`}>
                  {t}
                </button>
              ))}
            </div>
          )}

          {/* Briefings */}
          {loading ? (
            <div className="text-center py-12 text-[#e8c547]" style={{ fontFamily: "'JetBrains Mono', monospace" }}><span className="animate-pulse">■</span> Loading intelligence feed...</div>
          ) : briefings.length === 0 ? (
            <div className="text-center py-16 text-[#4a6070] border border-dashed border-[rgba(201,162,39,0.1)]">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
              No briefings match your criteria.
            </div>
          ) : (
            <div className="space-y-3">
              {briefings.map((b, idx) => {
                const cat = getCat(b.category);
                const cls = getCls(b.classification);
                return (
                  <button key={b.id} onClick={() => setSelected(b)} className="w-full text-left group" data-testid={`briefing-${idx}`}>
                    <Card className={`bg-[#0c1117] border-[rgba(201,162,39,0.12)] hover:border-[rgba(201,162,39,0.35)] transition-all duration-300 overflow-hidden ${b.user_acknowledged ? 'border-l-2 border-l-green-600' : ''}`}>
                      <div className={`h-0.5 ${cat.color.split(' ')[0]}`}></div>
                      <CardContent className="p-5">
                        <div className="flex items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                              <Badge className={`${cat.color} text-[10px] tracking-wider`}>{cat.short}</Badge>
                              <Badge variant="outline" className={`${cls.color} text-[10px] tracking-wider border`}>{cls.label}</Badge>
                              {b.user_acknowledged && (
                                <Badge variant="outline" className="border-green-700 text-green-500 text-[10px]">
                                  <CheckCircle className="w-2.5 h-2.5 mr-1" />READ
                                </Badge>
                              )}
                            </div>
                            <h3 className="text-lg font-bold tracking-wide group-hover:text-[#e8c547] transition-colors" style={{ fontFamily: "'Share Tech', sans-serif" }}>{b.title}</h3>
                            <p className="text-sm text-[#8a9aa8] mt-1 line-clamp-2">{b.content}</p>
                            <div className="flex items-center gap-4 mt-3 text-xs text-[#4a6070]">
                              <span className="flex items-center gap-1"><User className="w-3 h-3" />{b.author_name}</span>
                              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(b.created_at).toLocaleDateString()}</span>
                              <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{b.ack_count || 0} read</span>
                              {(b.tags || []).length > 0 && (
                                <span className="flex items-center gap-1 text-[rgba(201,162,39,0.5)]">
                                  <Tag className="w-3 h-3" />{b.tags.slice(0, 3).join(', ')}{b.tags.length > 3 && ` +${b.tags.length - 3}`}
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-[#4a6070] group-hover:text-[#e8c547] transition-colors shrink-0 mt-2" />
                        </div>
                      </CardContent>
                    </Card>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="bg-[#0c1117] text-[#d0d8e0] border-[rgba(201,162,39,0.2)] max-w-3xl max-h-[85vh] overflow-y-auto rounded-none">
          {selected && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <Badge className={`${getCat(selected.category).color} text-[10px] tracking-wider`}>{getCat(selected.category).short}</Badge>
                  <Badge variant="outline" className={`${getCls(selected.classification).color} text-[10px] tracking-wider border`}>{getCls(selected.classification).label}</Badge>
                </div>
                <DialogTitle className="text-2xl tracking-wide" style={{ fontFamily: "'Share Tech', sans-serif" }} data-testid="intel-detail-title">{selected.title}</DialogTitle>
                <div className="flex items-center gap-4 text-xs text-[#4a6070] mt-1">
                  <span className="flex items-center gap-1"><User className="w-3 h-3" />{selected.author_name}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(selected.created_at).toLocaleString()}</span>
                  {selected.updated_at && <span className="text-[#e8c547]/80">(Updated: {new Date(selected.updated_at).toLocaleString()})</span>}
                </div>
              </DialogHeader>
              <div className="mt-4 border-t border-[rgba(201,162,39,0.1)] pt-4">
                <div className="prose prose-invert max-w-none">
                  <p className="text-[#d0d8e0] leading-relaxed whitespace-pre-wrap text-sm" data-testid="intel-detail-content">{selected.content}</p>
                </div>
                {selected.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-6 pt-4 border-t border-[rgba(201,162,39,0.1)]">
                    {selected.tags.map(t => (
                      <Badge key={t} variant="outline" className="border-[rgba(201,162,39,0.3)] text-[#e8c547] text-[10px]">
                        <Tag className="w-2.5 h-2.5 mr-1" />{t}
                      </Badge>
                    ))}
                  </div>
                )}
                {/* Mini-Map for geo-tagged intel */}
                {selected.lat != null && selected.lng != null && (
                  <div className="mt-4 pt-4 border-t border-[rgba(201,162,39,0.1)]">
                    <MapMiniView
                      latitude={selected.lat}
                      longitude={selected.lng}
                      zoom={7}
                      height="180px"
                      markers={[
                        { id: selected.id, latitude: selected.lat, longitude: selected.lng, color: colors.markerIntel, label: selected.title },
                      ]}
                    />
                  </div>
                )}
                {/* Acknowledge Bar */}
                <div className="mt-6 pt-4 border-t border-[rgba(201,162,39,0.1)] flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-[#4a6070]">
                    <Eye className="w-3.5 h-3.5" />
                    <span>{selected.ack_count || 0} personnel have acknowledged</span>
                  </div>
                  <Button
                    size="sm"
                    disabled={acking}
                    onClick={(e) => { e.stopPropagation(); handleAcknowledge(selected.id, selected.user_acknowledged); }}
                    className={selected.user_acknowledged
                      ? 'bg-green-800/40 border border-green-700 text-green-400 hover:bg-red-900/30 hover:text-red-400 hover:border-red-700'
                      : 'bg-[#111a24] text-[#e8c547] border border-[rgba(201,162,39,0.3)] hover:bg-[rgba(201,162,39,0.08)]'}
                    data-testid="acknowledge-btn"
                  >
                    <CheckCircle className="w-4 h-4 mr-1.5" />
                    {selected.user_acknowledged ? 'ACKNOWLEDGED' : 'ACKNOWLEDGE'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default IntelBoard;

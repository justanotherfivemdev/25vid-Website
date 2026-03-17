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
import MapMiniView from '@/components/MapMiniView';
import { colors } from '@/theme/theme';

import { API } from '@/utils/api';

const CATEGORIES = [
  { value: 'intel_update', label: 'Intel Update', short: 'INTEL', color: 'bg-tropic-red/80 text-white' },
  { value: 'commanders_intent', label: "Commander's Intent", short: 'CDR INTENT', color: 'bg-tropic-gold text-black' },
  { value: 'operational_order', label: 'Operational Order', short: 'OPORD', color: 'bg-tropic-gold-dark text-white' },
  { value: 'after_action_report', label: 'After Action Report', short: 'AAR', color: 'bg-emerald-700 text-white' },
  { value: 'training_bulletin', label: 'Training Bulletin', short: 'TNG BUL', color: 'bg-gray-600 text-white' },
];

const CLASSIFICATIONS = [
  { value: 'routine', label: 'ROUTINE', color: 'border-gray-600 text-gray-400' },
  { value: 'priority', label: 'PRIORITY', color: 'border-tropic-gold-dark text-tropic-gold' },
  { value: 'immediate', label: 'IMMEDIATE', color: 'border-orange-600 text-orange-400' },
  { value: 'flash', label: 'FLASH', color: 'border-tropic-red text-tropic-red animate-pulse' },
];

const getCat = (v) => CATEGORIES.find(c => c.value === v) || CATEGORIES[0];
const getCls = (v) => CLASSIFICATIONS.find(c => c.value === v) || CLASSIFICATIONS[0];

const IntelBoard = () => {
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
    <div className="min-h-screen bg-black text-white">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur border-b border-tropic-gold/25">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/hub"><Button size="sm" variant="outline" className="border-gray-700"><ArrowLeft className="w-4 h-4 mr-1" />Hub</Button></Link>
            <h1 className="text-xl font-bold tracking-widest text-tropic-gold" style={{ fontFamily: 'Rajdhani, sans-serif' }} data-testid="intel-board-title">
              INTELLIGENCE BOARD
            </h1>
          </div>
          <div className="flex items-center space-x-3">
            {user?.role === 'admin' && <Link to="/admin/intel"><Button size="sm" variant="outline" className="border-tropic-gold/60 text-tropic-gold"><Shield className="w-4 h-4 mr-1" />Manage</Button></Link>}
            <Link to="/"><Button size="sm" variant="outline" className="border-gray-700"><Home className="w-4 h-4" /></Button></Link>
            <Button size="sm" variant="outline" onClick={handleLogout} className="border-gray-700"><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </nav>

      <div className="pt-20 pb-12 px-6">
        <div className="container mx-auto max-w-5xl space-y-6">
          {/* Header Banner */}
          <div className="bg-gray-900/80 border border-tropic-red/30 rounded-lg p-6" data-testid="intel-board-header">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-1 h-8 bg-tropic-red rounded-full"></div>
              <h2 className="text-2xl font-bold tracking-wider" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                CLASSIFIED INTELLIGENCE BRIEFINGS
              </h2>
            </div>
            <p className="text-sm text-gray-500 ml-4">25th Infantry Division — Tropic Lightning S2/S3 Combined Intelligence Feed</p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <Input value={search} onChange={e => setSearch(e.target.value)} className="bg-gray-900 border-gray-700 pl-10" placeholder="Search briefings..." data-testid="intel-board-search" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={!filterCat ? 'default' : 'outline'} onClick={() => setFilterCat('')}
                className={!filterCat ? 'bg-tropic-gold text-black' : 'border-gray-700 text-gray-400'} data-testid="filter-all">
                ALL
              </Button>
              {CATEGORIES.map(c => (
                <Button key={c.value} size="sm" variant={filterCat === c.value ? 'default' : 'outline'}
                  onClick={() => setFilterCat(filterCat === c.value ? '' : c.value)}
                  className={filterCat === c.value ? `${c.color}` : 'border-gray-700 text-gray-400'}
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
              <Badge variant="outline" className="border-tropic-gold/50 text-tropic-gold text-xs">
                {filterTag} <button onClick={() => setFilterTag('')} className="ml-1"><X className="w-3 h-3" /></button>
              </Badge>
            </div>
          )}

          {/* Tag Cloud */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {allTags.map(t => (
                <button key={t} onClick={() => setFilterTag(filterTag === t ? '' : t)}
                  className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${filterTag === t ? 'bg-tropic-gold/20 border-tropic-gold/50 text-tropic-gold' : 'border-gray-800 text-gray-600 hover:border-gray-600 hover:text-gray-400'}`}
                  data-testid={`tag-${t}`}>
                  {t}
                </button>
              ))}
            </div>
          )}

          {/* Briefings */}
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading intelligence feed...</div>
          ) : briefings.length === 0 ? (
            <div className="text-center py-16 text-gray-600 border border-dashed border-gray-800 rounded-lg">
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
                    <Card className={`bg-gray-900/80 border-gray-800 hover:border-tropic-gold/40 transition-all duration-300 overflow-hidden ${b.user_acknowledged ? 'border-l-2 border-l-green-600' : ''}`}>
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
                            <h3 className="text-lg font-bold tracking-wide group-hover:text-tropic-gold transition-colors" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{b.title}</h3>
                            <p className="text-sm text-gray-500 mt-1 line-clamp-2">{b.content}</p>
                            <div className="flex items-center gap-4 mt-3 text-xs text-gray-600">
                              <span className="flex items-center gap-1"><User className="w-3 h-3" />{b.author_name}</span>
                              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(b.created_at).toLocaleDateString()}</span>
                              <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{b.ack_count || 0} read</span>
                              {(b.tags || []).length > 0 && (
                                <span className="flex items-center gap-1 text-tropic-gold/60">
                                  <Tag className="w-3 h-3" />{b.tags.slice(0, 3).join(', ')}{b.tags.length > 3 && ` +${b.tags.length - 3}`}
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-gray-700 group-hover:text-tropic-gold transition-colors shrink-0 mt-2" />
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
        <DialogContent className="bg-gray-900 text-white border-gray-800 max-w-3xl max-h-[85vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <Badge className={`${getCat(selected.category).color} text-[10px] tracking-wider`}>{getCat(selected.category).short}</Badge>
                  <Badge variant="outline" className={`${getCls(selected.classification).color} text-[10px] tracking-wider border`}>{getCls(selected.classification).label}</Badge>
                </div>
                <DialogTitle className="text-2xl tracking-wide" style={{ fontFamily: 'Rajdhani, sans-serif' }} data-testid="intel-detail-title">{selected.title}</DialogTitle>
                <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                  <span className="flex items-center gap-1"><User className="w-3 h-3" />{selected.author_name}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(selected.created_at).toLocaleString()}</span>
                  {selected.updated_at && <span className="text-tropic-gold/80">(Updated: {new Date(selected.updated_at).toLocaleString()})</span>}
                </div>
              </DialogHeader>
              <div className="mt-4 border-t border-gray-800 pt-4">
                <div className="prose prose-invert max-w-none">
                  <p className="text-gray-300 leading-relaxed whitespace-pre-wrap text-sm" data-testid="intel-detail-content">{selected.content}</p>
                </div>
                {selected.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-6 pt-4 border-t border-gray-800">
                    {selected.tags.map(t => (
                      <Badge key={t} variant="outline" className="border-tropic-gold/40 text-tropic-gold text-[10px]">
                        <Tag className="w-2.5 h-2.5 mr-1" />{t}
                      </Badge>
                    ))}
                  </div>
                )}
                {/* Mini-Map for geo-tagged intel */}
                {selected.lat != null && selected.lng != null && (
                  <div className="mt-4 pt-4 border-t border-gray-800">
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
                <div className="mt-6 pt-4 border-t border-gray-800 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Eye className="w-3.5 h-3.5" />
                    <span>{selected.ack_count || 0} personnel have acknowledged</span>
                  </div>
                  <Button
                    size="sm"
                    disabled={acking}
                    onClick={(e) => { e.stopPropagation(); handleAcknowledge(selected.id, selected.user_acknowledged); }}
                    className={selected.user_acknowledged
                      ? 'bg-green-800/40 border border-green-700 text-green-400 hover:bg-red-900/30 hover:text-red-400 hover:border-red-700'
                      : 'bg-tropic-gold hover:bg-tropic-gold-dark text-black'}
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

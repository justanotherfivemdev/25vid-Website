import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, ChevronRight, ArrowRight, MessageSquare } from 'lucide-react';
import { API } from '@/utils/api';

const STAGES = [
  { value: 'applicant', label: 'Applicant', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  { value: 'accepted_recruit', label: 'Accepted Recruit', color: 'bg-tropic-gold/20 text-tropic-gold border-tropic-gold/30' },
  { value: 'bct_in_progress', label: 'BCT In Progress', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { value: 'probationary', label: 'Probationary', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  { value: 'active_member', label: 'Active Member', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  { value: 'rejected', label: 'Rejected', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  { value: 'dropped', label: 'Dropped', color: 'bg-red-700/20 text-red-500 border-red-700/30' },
  { value: 'archived', label: 'Archived', color: 'bg-gray-700/20 text-gray-500 border-gray-700/30' },
];

const getStageColor = (stage) => STAGES.find(s => s.value === stage)?.color || 'bg-gray-700';
const getStageLabel = (stage) => STAGES.find(s => s.value === stage)?.label || stage;

const PipelineManager = () => {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [transitionStage, setTransitionStage] = useState('');
  const [transitionNotes, setTransitionNotes] = useState('');
  const [noteText, setNoteText] = useState('');

  useEffect(() => { fetchAll(); }, [stageFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAll = async () => {
    try {
      const params = stageFilter !== 'all' ? `?stage=${stageFilter}` : '';
      const [usersRes, statsRes] = await Promise.all([
        axios.get(`${API}/admin/pipeline${params}`),
        axios.get(`${API}/admin/pipeline/stats`),
      ]);
      setUsers(usersRes.data);
      setStats(statsRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleViewDetail = async (userId) => {
    try {
      const res = await axios.get(`${API}/admin/pipeline/${userId}`);
      setDetailData(res.data);
      setSelectedUser(userId);
      setTransitionStage(res.data.pipeline_stage || 'applicant');
    } catch (e) { alert('Failed to load pipeline details'); }
  };

  const handleTransition = async () => {
    try {
      await axios.put(`${API}/admin/pipeline/${selectedUser}/stage`, { stage: transitionStage, notes: transitionNotes });
      setTransitionNotes('');
      await handleViewDetail(selectedUser);
      fetchAll();
    } catch (e) { alert(e.response?.data?.detail || 'Failed to update stage'); }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    try {
      await axios.post(`${API}/admin/pipeline/${selectedUser}/notes`, { text: noteText });
      setNoteText('');
      await handleViewDetail(selectedUser);
    } catch (e) { alert('Failed to add note'); }
  };

  const filtered = users.filter(u => u.username.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>RECRUIT PIPELINE</h1>
          <p className="text-gray-400 mt-2">Track recruits through the onboarding lifecycle.</p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {STAGES.map(s => (
              <Card key={s.value} className="bg-gray-900/80 border-gray-800 cursor-pointer hover:border-tropic-gold/30" onClick={() => setStageFilter(s.value)}>
                <CardContent className="p-2 text-center">
                  <div className="text-xl font-bold text-tropic-gold">{stats[s.value] || 0}</div>
                  <div className="text-[9px] text-gray-500 tracking-wider uppercase">{s.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Filter & Search */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button size="sm" variant={stageFilter === 'all' ? 'default' : 'outline'} onClick={() => setStageFilter('all')}
            className={stageFilter === 'all' ? 'bg-tropic-gold text-black' : 'border-gray-700 text-gray-400'}>ALL</Button>
          {STAGES.map(s => (
            <Button key={s.value} size="sm" variant={stageFilter === s.value ? 'default' : 'outline'} onClick={() => setStageFilter(s.value)}
              className={stageFilter === s.value ? 'bg-tropic-gold text-black' : 'border-gray-700 text-gray-400 text-xs'}>{s.label.toUpperCase()}</Button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by username..." className="bg-gray-900 border-gray-700 pl-10" />
        </div>

        {/* Users List */}
        {loading ? <div className="text-center py-12">Loading...</div> : (
          <div className="grid gap-2">
            {filtered.length === 0 ? (
              <Card className="bg-gray-900 border-gray-800"><CardContent className="py-12 text-center text-gray-400">No members found.</CardContent></Card>
            ) : filtered.map(u => (
              <Card key={u.id} className="bg-gray-900/80 border-gray-800 hover:border-tropic-gold/25 transition-colors cursor-pointer group" onClick={() => handleViewDetail(u.id)}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-500">{u.username?.[0]?.toUpperCase()}</div>
                      <div>
                        <span className="font-bold text-sm tracking-wide group-hover:text-tropic-gold transition-colors" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{u.username}</span>
                        {u.rank && <span className="text-xs text-gray-500 ml-2">{u.rank}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`text-[10px] ${getStageColor(u.pipeline_stage || 'applicant')}`}>{getStageLabel(u.pipeline_stage || 'applicant')}</Badge>
                      <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-tropic-gold" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Detail Dialog */}
        <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
          <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="tracking-wider">PIPELINE DETAIL</DialogTitle>
            </DialogHeader>
            {detailData && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-lg">{detailData.username}</span>
                  <Badge className={`text-[10px] ${getStageColor(detailData.pipeline_stage || 'applicant')}`}>{getStageLabel(detailData.pipeline_stage || 'applicant')}</Badge>
                </div>

                {/* Stage Transition */}
                <Card className="bg-black/30 border-gray-800">
                  <CardContent className="p-3 space-y-3">
                    <Label className="text-xs tracking-wider text-gray-400">TRANSITION STAGE</Label>
                    <Select value={transitionStage} onValueChange={setTransitionStage}>
                      <SelectTrigger className="bg-black border-gray-700"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-gray-900 border-gray-700">
                        {STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Textarea value={transitionNotes} onChange={e => setTransitionNotes(e.target.value)} className="bg-black border-gray-700" rows={2} placeholder="Transition notes..." />
                    <Button size="sm" onClick={handleTransition} className="bg-tropic-gold hover:bg-tropic-gold-light text-black" disabled={transitionStage === (detailData.pipeline_stage || 'applicant')}>
                      <ArrowRight className="w-4 h-4 mr-2" />Update Stage
                    </Button>
                  </CardContent>
                </Card>

                {/* Add Note */}
                <Card className="bg-black/30 border-gray-800">
                  <CardContent className="p-3 space-y-3">
                    <Label className="text-xs tracking-wider text-gray-400">ADD NOTE</Label>
                    <Textarea value={noteText} onChange={e => setNoteText(e.target.value)} className="bg-black border-gray-700" rows={2} placeholder="Staff notes..." />
                    <Button size="sm" onClick={handleAddNote} className="bg-gray-700 hover:bg-gray-600" disabled={!noteText.trim()}>
                      <MessageSquare className="w-4 h-4 mr-2" />Add Note
                    </Button>
                  </CardContent>
                </Card>

                {/* History */}
                {detailData.pipeline_history?.length > 0 && (
                  <div>
                    <Label className="text-xs tracking-wider text-gray-400 mb-2 block">PIPELINE HISTORY</Label>
                    <div className="space-y-2">
                      {detailData.pipeline_history.slice().reverse().map((h, i) => (
                        <div key={i} className="bg-black/20 border border-gray-800/50 rounded p-2 text-xs">
                          {h.type === 'note' ? (
                            <div>
                              <span className="text-gray-500">{h.created_at?.split('T')[0]}</span>
                              <span className="text-gray-400 ml-2">{h.author}:</span>
                              <span className="text-gray-300 ml-1">{h.text}</span>
                            </div>
                          ) : (
                            <div>
                              <span className="text-gray-500">{h.changed_at?.split('T')[0]}</span>
                              <span className="text-gray-400 ml-2">{h.changed_by}</span>
                              <span className="text-gray-500 mx-1">→</span>
                              <Badge className={`text-[9px] ${getStageColor(h.to_stage)}`}>{getStageLabel(h.to_stage)}</Badge>
                              {h.notes && <div className="text-gray-500 mt-1">{h.notes}</div>}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
};

export default PipelineManager;

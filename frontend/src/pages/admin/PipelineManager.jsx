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
  { value: 'applicant', label: 'Applicant', color: 'bg-gray-500/20 text-[#8a9aa8] border-gray-500/30' },
  { value: 'accepted_recruit', label: 'Accepted Recruit', color: 'bg-tropic-gold/20 text-tropic-gold border-tropic-gold/30' },
  { value: 'bct_in_progress', label: 'BCT In Progress', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { value: 'probationary', label: 'Probationary', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  { value: 'active_member', label: 'Active Member', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  { value: 'rejected', label: 'Rejected', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  { value: 'dropped', label: 'Dropped', color: 'bg-red-700/20 text-red-500 border-red-700/30' },
  { value: 'archived', label: 'Archived', color: 'bg-[#111a24]/20 text-[#4a6070] border-[rgba(201,162,39,0.15)]/30' },
];

const getStageColor = (stage) => STAGES.find(s => s.value === stage)?.color || 'bg-[#111a24]';
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
        <div className="relative corner-bracket border border-[rgba(201,162,39,0.15)] bg-[radial-gradient(circle_at_top,rgba(201,162,39,0.06),#050a0e_58%)] px-6 py-7 shadow-2xl">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#c9a227]" style={{ fontFamily: "'Oswald', sans-serif" }}>Personnel Pipeline</p>
            <h1 className="mt-3 text-4xl font-black uppercase tracking-[0.12em] text-[#e8c547]" style={{ fontFamily: "'Share Tech', sans-serif" }}>RECRUIT PIPELINE</h1>
            <p className="mt-2 text-sm text-[#8a9aa8]" style={{ fontFamily: "'Inter', sans-serif" }}>Track recruits through the onboarding lifecycle</p>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {STAGES.map(s => (
              <Card key={s.value} className="bg-[#0c1117]/80 border-[rgba(201,162,39,0.12)] cursor-pointer hover:border-tropic-gold/30" onClick={() => setStageFilter(s.value)}>
                <CardContent className="p-2 text-center">
                  <div className="text-xl font-bold text-tropic-gold">{stats[s.value] || 0}</div>
                  <div className="text-[9px] text-[#4a6070] tracking-wider uppercase">{s.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Filter & Search */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button size="sm" variant={stageFilter === 'all' ? 'default' : 'outline'} onClick={() => setStageFilter('all')}
            className={stageFilter === 'all' ? 'bg-tropic-gold text-black' : 'border-[rgba(201,162,39,0.15)] text-[#8a9aa8]'}>ALL</Button>
          {STAGES.map(s => (
            <Button key={s.value} size="sm" variant={stageFilter === s.value ? 'default' : 'outline'} onClick={() => setStageFilter(s.value)}
              className={stageFilter === s.value ? 'bg-tropic-gold text-black' : 'border-[rgba(201,162,39,0.15)] text-[#8a9aa8] text-xs'}>{s.label.toUpperCase()}</Button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4a6070]" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by username..." className="bg-[#0c1117] border-[rgba(201,162,39,0.15)] pl-10" />
        </div>

        {/* Users List */}
        {loading ? <div className="text-center py-12">Loading...</div> : (
          <div className="grid gap-2">
            {filtered.length === 0 ? (
              <Card className="bg-[#0c1117] border-[rgba(201,162,39,0.12)]"><CardContent className="py-12 text-center text-[#8a9aa8]">No members found.</CardContent></Card>
            ) : filtered.map(u => (
              <Card key={u.id} className="bg-[#0c1117]/80 border-[rgba(201,162,39,0.12)] hover:border-tropic-gold/25 transition-colors cursor-pointer group" onClick={() => handleViewDetail(u.id)}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-[#111a24] flex items-center justify-center text-xs font-bold text-[#4a6070]">{u.username?.[0]?.toUpperCase()}</div>
                      <div>
                        <span className="font-bold text-sm tracking-wide group-hover:text-tropic-gold transition-colors" style={{ fontFamily: "'Share Tech', sans-serif" }}>{u.username}</span>
                        {u.rank && <span className="text-xs text-[#4a6070] ml-2">{u.rank}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`text-[10px] ${getStageColor(u.pipeline_stage || 'applicant')}`}>{getStageLabel(u.pipeline_stage || 'applicant')}</Badge>
                      <ChevronRight className="w-4 h-4 text-[#4a6070] group-hover:text-tropic-gold" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Detail Dialog */}
        <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
          <DialogContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)] text-white max-w-lg max-h-[80vh] overflow-y-auto">
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
                <Card className="bg-[#050a0e]/30 border-[rgba(201,162,39,0.12)]">
                  <CardContent className="p-3 space-y-3">
                    <Label className="text-xs tracking-wider text-[#8a9aa8]">TRANSITION STAGE</Label>
                    <Select value={transitionStage} onValueChange={setTransitionStage}>
                      <SelectTrigger className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]">
                        {STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Textarea value={transitionNotes} onChange={e => setTransitionNotes(e.target.value)} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" rows={2} placeholder="Transition notes..." />
                    <Button size="sm" onClick={handleTransition} className="bg-tropic-gold hover:bg-tropic-gold-light text-black" disabled={transitionStage === (detailData.pipeline_stage || 'applicant')}>
                      <ArrowRight className="w-4 h-4 mr-2" />Update Stage
                    </Button>
                  </CardContent>
                </Card>

                {/* Add Note */}
                <Card className="bg-[#050a0e]/30 border-[rgba(201,162,39,0.12)]">
                  <CardContent className="p-3 space-y-3">
                    <Label className="text-xs tracking-wider text-[#8a9aa8]">ADD NOTE</Label>
                    <Textarea value={noteText} onChange={e => setNoteText(e.target.value)} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" rows={2} placeholder="Staff notes..." />
                    <Button size="sm" onClick={handleAddNote} className="bg-[#111a24] hover:bg-[#4a6070]" disabled={!noteText.trim()}>
                      <MessageSquare className="w-4 h-4 mr-2" />Add Note
                    </Button>
                  </CardContent>
                </Card>

                {/* History */}
                {detailData.pipeline_history?.length > 0 && (
                  <div>
                    <Label className="text-xs tracking-wider text-[#8a9aa8] mb-2 block">PIPELINE HISTORY</Label>
                    <div className="space-y-2">
                      {detailData.pipeline_history.slice().reverse().map((h, i) => (
                        <div key={i} className="bg-[#050a0e]/20 border border-[rgba(201,162,39,0.12)]/50 rounded p-2 text-xs">
                          {h.type === 'note' ? (
                            <div>
                              <span className="text-[#4a6070]">{h.created_at?.split('T')[0]}</span>
                              <span className="text-[#8a9aa8] ml-2">{h.author}:</span>
                              <span className="text-[#8a9aa8] ml-1">{h.text}</span>
                            </div>
                          ) : (
                            <div>
                              <span className="text-[#4a6070]">{h.changed_at?.split('T')[0]}</span>
                              <span className="text-[#8a9aa8] ml-2">{h.changed_by}</span>
                              <span className="text-[#4a6070] mx-1">→</span>
                              <Badge className={`text-[9px] ${getStageColor(h.to_stage)}`}>{getStageLabel(h.to_stage)}</Badge>
                              {h.notes && <div className="text-[#4a6070] mt-1">{h.notes}</div>}
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

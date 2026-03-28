import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar, CheckCircle, XCircle, Clock, UserMinus, UserCheck, Plus } from 'lucide-react';
import { API } from '@/utils/api';

const STATUS_COLORS = {
  pending: 'bg-tropic-gold/20 text-tropic-gold border-tropic-gold/30',
  approved: 'bg-green-500/20 text-green-400 border-green-500/30',
  denied: 'bg-red-500/20 text-red-400 border-red-500/30',
  active: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  returned: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  expired: 'bg-gray-700/20 text-gray-500 border-gray-700/30',
};

const LOAManager = () => {
  const [loaRequests, setLoaRequests] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [reviewDialog, setReviewDialog] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [placeDialog, setPlaceDialog] = useState(false);
  const [placeForm, setPlaceForm] = useState({ user_id: '', start_date: '', end_date: '', reason: '', notes: '' });
  const [members, setMembers] = useState([]);
  const [memberSearch, setMemberSearch] = useState('');

  useEffect(() => { fetchAll(); }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAll = async () => {
    try {
      const params = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const [loaRes, statsRes, membersRes] = await Promise.all([
        axios.get(`${API}/admin/loa${params}`),
        axios.get(`${API}/admin/loa/stats`),
        axios.get(`${API}/admin/users`),
      ]);
      setLoaRequests(loaRes.data);
      setStats(statsRes.data);
      setMembers(membersRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleReview = async (id, status) => {
    try {
      await axios.put(`${API}/admin/loa/${id}/review`, { status, notes: reviewNotes });
      setReviewDialog(null);
      setReviewNotes('');
      fetchAll();
    } catch (e) { alert(e.response?.data?.detail || 'Review failed'); }
  };

  const handleActivate = async (id) => {
    try {
      await axios.put(`${API}/admin/loa/${id}/activate`);
      fetchAll();
    } catch (e) { alert(e.response?.data?.detail || 'Activation failed'); }
  };

  const handleReturn = async (id) => {
    try {
      await axios.put(`${API}/admin/loa/${id}/return`);
      fetchAll();
    } catch (e) { alert(e.response?.data?.detail || 'Return failed'); }
  };

  const handlePlaceLOA = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/admin/loa/place`, placeForm);
      setPlaceDialog(false);
      setPlaceForm({ user_id: '', start_date: '', end_date: '', reason: '', notes: '' });
      fetchAll();
    } catch (e) { alert(e.response?.data?.detail || 'Failed to place member on LOA'); }
  };

  const filteredMembers = members.filter(m =>
    m.username.toLowerCase().includes(memberSearch.toLowerCase())
  );

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>LOA MANAGEMENT</h1>
            <p className="text-gray-400 mt-2">Manage Leave of Absence requests and status.</p>
          </div>
          <Button onClick={() => setPlaceDialog(true)} className="bg-tropic-gold hover:bg-tropic-gold-light text-black">
            <Plus className="w-4 h-4 mr-2" />Place Member on LOA
          </Button>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {Object.entries(stats).map(([key, val]) => (
              <Card key={key} className="bg-gray-900/80 border-gray-800">
                <CardContent className="p-3 text-center">
                  <div className="text-2xl font-bold text-tropic-gold">{val}</div>
                  <div className="text-[10px] text-gray-500 tracking-wider uppercase">{key.replace(/_/g, ' ')}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Filter */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">Filter:</span>
          {['all', 'pending', 'approved', 'active', 'denied', 'returned', 'expired'].map(s => (
            <Button key={s} size="sm" variant={statusFilter === s ? 'default' : 'outline'}
              onClick={() => setStatusFilter(s)}
              className={statusFilter === s ? 'bg-tropic-gold text-black' : 'border-gray-700 text-gray-400'}>
              {s.toUpperCase()}
            </Button>
          ))}
        </div>

        {/* LOA List */}
        {loading ? <div className="text-center py-12">Loading...</div> : (
          <div className="space-y-3">
            {loaRequests.length === 0 ? (
              <Card className="bg-gray-900 border-gray-800"><CardContent className="py-12 text-center text-gray-400">No LOA requests found.</CardContent></Card>
            ) : loaRequests.map(loa => (
              <Card key={loa.id} className="bg-gray-900/80 border-gray-800">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div>
                        <span className="font-bold text-sm">{loa.username}</span>
                        <span className="text-xs text-gray-500 ml-2">{loa.start_date} — {loa.end_date}</span>
                      </div>
                    </div>
                    <Badge className={`text-[10px] ${STATUS_COLORS[loa.status] || 'bg-gray-700'}`}>{(loa.status || 'pending').toUpperCase()}</Badge>
                  </div>
                  <div className="text-xs text-gray-400 mb-2">{loa.reason}</div>
                  {loa.notes && <div className="text-xs text-gray-500 mb-2">Notes: {loa.notes}</div>}
                  {loa.reviewed_by && <div className="text-xs text-gray-600 mb-2">Reviewed by {loa.reviewed_by} at {loa.reviewed_at}</div>}
                  <div className="flex gap-2 mt-2">
                    {loa.status === 'pending' && (
                      <Button size="sm" onClick={() => setReviewDialog(loa)} className="bg-tropic-gold/20 text-tropic-gold hover:bg-tropic-gold/30 text-xs">
                        Review
                      </Button>
                    )}
                    {loa.status === 'approved' && (
                      <Button size="sm" onClick={() => handleActivate(loa.id)} className="bg-blue-700/20 text-blue-400 hover:bg-blue-700/30 text-xs">
                        <UserMinus className="w-3 h-3 mr-1" />Activate LOA
                      </Button>
                    )}
                    {loa.status === 'active' && (
                      <Button size="sm" onClick={() => handleReturn(loa.id)} className="bg-green-700/20 text-green-400 hover:bg-green-700/30 text-xs">
                        <UserCheck className="w-3 h-3 mr-1" />Mark Returned
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Review Dialog */}
        {reviewDialog && (
          <Dialog open={!!reviewDialog} onOpenChange={() => setReviewDialog(null)}>
            <DialogContent className="bg-gray-900 border-gray-700 text-white">
              <DialogHeader>
                <DialogTitle className="tracking-wider">REVIEW LOA REQUEST</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="text-sm"><strong>{reviewDialog.username}</strong> — {reviewDialog.start_date} to {reviewDialog.end_date}</div>
                <div className="text-xs text-gray-400">{reviewDialog.reason}</div>
                <div>
                  <Label>Review Notes</Label>
                  <Textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} className="bg-black border-gray-700" rows={2} />
                </div>
                <div className="flex gap-3">
                  <Button onClick={() => handleReview(reviewDialog.id, 'approved')} className="bg-green-700 hover:bg-green-600">
                    <CheckCircle className="w-4 h-4 mr-2" />Approve
                  </Button>
                  <Button onClick={() => handleReview(reviewDialog.id, 'denied')} className="bg-red-700 hover:bg-red-600">
                    <XCircle className="w-4 h-4 mr-2" />Deny
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Place LOA Dialog */}
        <Dialog open={placeDialog} onOpenChange={setPlaceDialog}>
          <DialogContent className="bg-gray-900 border-gray-700 text-white">
            <DialogHeader>
              <DialogTitle className="tracking-wider">PLACE MEMBER ON LOA</DialogTitle>
            </DialogHeader>
            <form onSubmit={handlePlaceLOA} className="space-y-4">
              <div>
                <Label>Member</Label>
                <Input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} className="bg-black border-gray-700 mb-2" placeholder="Search member..." />
                {memberSearch && (
                  <div className="max-h-32 overflow-y-auto border border-gray-800 rounded bg-black/50">
                    {filteredMembers.slice(0, 10).map(m => (
                      <button key={m.id} type="button" onClick={() => { setPlaceForm({ ...placeForm, user_id: m.id }); setMemberSearch(m.username); }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-800 ${placeForm.user_id === m.id ? 'bg-tropic-gold/10 text-tropic-gold' : 'text-gray-300'}`}>
                        {m.username} {m.rank ? `— ${m.rank}` : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><Label>Start Date</Label><Input type="date" required value={placeForm.start_date} onChange={e => setPlaceForm({ ...placeForm, start_date: e.target.value })} className="bg-black border-gray-700" /></div>
                <div><Label>End Date</Label><Input type="date" required value={placeForm.end_date} onChange={e => setPlaceForm({ ...placeForm, end_date: e.target.value })} className="bg-black border-gray-700" /></div>
              </div>
              <div><Label>Reason</Label><Input required value={placeForm.reason} onChange={e => setPlaceForm({ ...placeForm, reason: e.target.value })} className="bg-black border-gray-700" /></div>
              <div><Label>Notes</Label><Textarea value={placeForm.notes} onChange={e => setPlaceForm({ ...placeForm, notes: e.target.value })} className="bg-black border-gray-700" rows={2} /></div>
              <Button type="submit" className="bg-tropic-gold hover:bg-tropic-gold-light text-black w-full">Place on LOA</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
};

export default LOAManager;

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Home, LogOut, Calendar, CheckCircle, AlertCircle, Clock, Send } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { API } from '@/utils/api';
import { useMemberLayout } from '@/components/MemberLayout';

const STATUS_COLORS = {
  pending: 'bg-tropic-gold/20 text-tropic-gold border-tropic-gold/30',
  approved: 'bg-green-500/20 text-green-400 border-green-500/30',
  denied: 'bg-red-500/20 text-red-400 border-red-500/30',
  active: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  returned: 'bg-[#4a6070]/20 text-[#8a9aa8] border-[#4a6070]/30',
  expired: 'bg-[#111a24]/20 text-[#4a6070] border-[rgba(201,162,39,0.045)]',
};

const LOARequest = () => {
  const inLayout = useMemberLayout();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [activeLOA, setActiveLOA] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [form, setForm] = useState({ start_date: '', end_date: '', reason: '', notes: '' });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [reqRes, activeRes] = await Promise.all([
        axios.get(`${API}/loa/my-requests`),
        axios.get(`${API}/loa/my-active`),
      ]);
      setRequests(reqRes.data);
      setActiveLOA(activeRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.start_date || !form.end_date || !form.reason) {
      setMessage({ type: 'error', text: 'Please fill in all required fields.' });
      return;
    }
    setSubmitting(true);
    setMessage({ type: '', text: '' });
    try {
      await axios.post(`${API}/loa/request`, form);
      setMessage({ type: 'success', text: 'LOA request submitted successfully.' });
      setForm({ start_date: '', end_date: '', reason: '', notes: '' });
      await fetchData();
    } catch (e) {
      setMessage({ type: 'error', text: e.response?.data?.detail || 'Failed to submit LOA request.' });
    } finally { setSubmitting(false); }
  };

  const handleLogout = async () => { await logout(); navigate('/'); };

  if (loading) return <div className="min-h-screen bg-[#050a0e] text-white flex items-center justify-center">Loading...</div>;

  return (
    <div className={inLayout ? '' : 'min-h-screen bg-[#050a0e] text-white'}>
      {!inLayout && (
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#050a0e]/92 backdrop-blur-xl border-b border-tropic-gold/15">
        <div className="container mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/hub"><Button size="sm" variant="outline" className="border-[rgba(201,162,39,0.15)]"><ArrowLeft className="w-4 h-4 mr-1" />Hub</Button></Link>
            <h1 className="text-xl font-bold tracking-widest" style={{ fontFamily: "'Share Tech', sans-serif" }}>LEAVE OF ABSENCE</h1>
          </div>
          <div className="flex items-center space-x-3">
            <Link to="/"><Button size="sm" variant="outline" className="border-[rgba(201,162,39,0.15)]"><Home className="w-4 h-4" /></Button></Link>
            <Button size="sm" variant="outline" onClick={handleLogout} className="border-[rgba(201,162,39,0.15)]"><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </nav>
      )}

      <div className={`${inLayout ? 'pt-4' : 'pt-20'} pb-12 px-4 md:px-6`}>
        <div className="container mx-auto max-w-3xl space-y-6">
          {message.text && (
            <Alert className={message.type === 'success' ? 'bg-green-900/20 border-green-700' : 'bg-tropic-red/10 border-tropic-red/60'}>
              {message.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          )}

          {/* Active LOA Banner */}
          {activeLOA && (
            <Card className="bg-blue-900/20 border-blue-500/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-blue-400" />
                  <div>
                    <div className="font-bold text-blue-400 tracking-wider text-sm">CURRENTLY ON LOA</div>
                    <div className="text-xs text-[#8a9aa8]">{activeLOA.start_date} — {activeLOA.end_date}</div>
                    <div className="text-xs text-[#4a6070] mt-1">{activeLOA.reason}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Request Form */}
          <Card className="bg-[#0c1117]/80 border-[rgba(201,162,39,0.12)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg tracking-wider flex items-center gap-2">
                <Send className="w-5 h-5 text-tropic-gold" /> REQUEST LOA
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Start Date *</Label>
                    <Input type="date" required value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" />
                  </div>
                  <div>
                    <Label>End Date *</Label>
                    <Input type="date" required value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" />
                  </div>
                </div>
                <div>
                  <Label>Reason *</Label>
                  <Input required value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" placeholder="Brief reason for leave" />
                </div>
                <div>
                  <Label>Additional Notes</Label>
                  <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" rows={3} placeholder="Any additional details..." />
                </div>
                <Button type="submit" disabled={submitting} className="bg-tropic-gold hover:bg-tropic-gold-light text-black">
                  <Send className="w-4 h-4 mr-2" />{submitting ? 'Submitting...' : 'Submit LOA Request'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Previous Requests */}
          {requests.length > 0 && (
            <Card className="bg-[#0c1117]/80 border-[rgba(201,162,39,0.12)]">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg tracking-wider">YOUR LOA HISTORY</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {requests.map(r => (
                    <div key={r.id} className="bg-[#050a0e]/30 border border-[rgba(201,162,39,0.12)] rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-[#4a6070]" />
                          <span className="text-sm text-[#8a9aa8]">{r.start_date} — {r.end_date}</span>
                        </div>
                        <Badge className={`text-[10px] ${STATUS_COLORS[r.status] || 'bg-[#111a24]'}`}>{(r.status || 'pending').toUpperCase()}</Badge>
                      </div>
                      <div className="text-xs text-[#8a9aa8]">{r.reason}</div>
                      {r.notes && <div className="text-xs text-[#4a6070] mt-1">{r.notes}</div>}
                      {r.reviewed_by && <div className="text-xs text-[#4a6070] mt-1">Reviewed by: {r.reviewed_by}</div>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default LOARequest;

import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, MessageSquare, Trash2, Send, Shield, Home, LogOut } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

import { BACKEND_URL, API } from '@/utils/api';

const DiscussionThread = () => {
  const { id } = useParams();
  const [discussion, setDiscussion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  useEffect(() => { fetchDiscussion(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchDiscussion = async () => {
    try {
      const res = await axios.get(`${API}/discussions/${id}`);
      setDiscussion(res.data);
    } catch (e) {
      console.error(e);
      if (e.response?.status === 404) navigate('/hub/discussions');
    }
    finally { setLoading(false); }
  };

  const handleReply = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setSubmitting(true);
    try {
      await axios.post(`${API}/discussions/${id}/reply`, { content: reply });
      setReply('');
      await fetchDiscussion();
    } catch (err) {
      alert(err.response?.data?.detail || 'Error posting reply');
    } finally { setSubmitting(false); }
  };

  const handleDeleteReply = async (replyId) => {
    if (!window.confirm('Delete this reply?')) return;
    try {
      await axios.delete(`${API}/admin/discussions/${id}/reply/${replyId}`);
      await fetchDiscussion();
    } catch (err) { alert('Error deleting reply'); }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const getCatColor = (c) => ({ general: 'border-gray-500 text-gray-400', operations: 'border-tropic-red text-tropic-red', training: 'border-tropic-gold text-tropic-gold', feedback: 'border-green-500 text-green-400' }[c] || 'border-gray-500 text-gray-400');

  if (loading) return <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading...</div>;
  if (!discussion) return <div className="min-h-screen bg-black text-white flex items-center justify-center">Discussion not found</div>;

  return (
    <div className="min-h-screen bg-black text-white">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur border-b border-tropic-gold/25">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/hub/discussions"><Button size="sm" variant="outline" className="border-gray-700"><ArrowLeft className="w-4 h-4 mr-1" />Forum</Button></Link>
            <h1 className="text-xl font-bold tracking-wider truncate" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{discussion.title}</h1>
          </div>
          <div className="flex items-center space-x-3">
            {user?.role === 'admin' && <Link to="/admin"><Button size="sm" variant="outline" className="border-tropic-gold/60 text-tropic-gold hover:bg-tropic-gold/10"><Shield className="w-4 h-4" /></Button></Link>}
            <Link to="/"><Button size="sm" variant="outline" className="border-gray-700"><Home className="w-4 h-4" /></Button></Link>
            <Button size="sm" variant="outline" onClick={handleLogout} className="border-gray-700"><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </nav>

      <div className="pt-20 pb-12 px-6">
        <div className="container mx-auto max-w-4xl space-y-6">
          {/* Original post */}
          <Card className="bg-gray-900 border-gray-800" data-testid="discussion-original-post">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <Badge variant="outline" className={`text-xs ${getCatColor(discussion.category)}`}>{discussion.category}</Badge>
                <span className="text-sm text-gray-500">{new Date(discussion.created_at).toLocaleString()}</span>
              </div>
              <CardTitle className="text-2xl" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{discussion.title}</CardTitle>
              <div className="text-sm text-gray-400 mt-1">Posted by <span className="text-tropic-gold font-medium">{discussion.author_name}</span></div>
            </CardHeader>
            <CardContent>
              <p className="text-gray-300 whitespace-pre-wrap">{discussion.content}</p>
            </CardContent>
          </Card>

          {/* Replies */}
          <div className="space-y-1">
            <h3 className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
              <MessageSquare className="w-5 h-5 text-tropic-gold" /> REPLIES ({discussion.replies?.length || 0})
            </h3>
          </div>

          {(!discussion.replies || discussion.replies.length === 0) ? (
            <p className="text-gray-500 text-sm">No replies yet. Be the first to respond.</p>
          ) : (
            <div className="space-y-3">
              {discussion.replies.map((r, idx) => (
                <Card key={r.id || idx} className="bg-gray-900/50 border-gray-800" data-testid={`reply-${r.id || idx}`}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-sm font-medium text-tropic-gold">{r.author_name}</span>
                          <span className="text-xs text-gray-500">{new Date(r.created_at).toLocaleString()}</span>
                        </div>
                        <p className="text-gray-300 whitespace-pre-wrap">{r.content}</p>
                      </div>
                      {user?.role === 'admin' && (
                        <Button size="sm" variant="ghost" onClick={() => handleDeleteReply(r.id)} className="text-tropic-gold hover:bg-tropic-gold/10 shrink-0 ml-2" data-testid={`delete-reply-${r.id || idx}`}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Reply form */}
          <Card className="bg-gray-900 border-gray-800" data-testid="reply-form-card">
            <CardContent className="pt-6">
              <form onSubmit={handleReply} className="space-y-4">
                <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={3}
                  placeholder="Write your reply..."
                  className="bg-black border-gray-700"
                  required
                  data-testid="reply-input"
                />
                <div className="flex justify-end">
                  <Button type="submit" disabled={submitting} className="bg-tropic-gold hover:bg-tropic-gold-dark text-black" data-testid="reply-submit-btn">
                    <Send className="w-4 h-4 mr-2" />{submitting ? 'Posting...' : 'Post Reply'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default DiscussionThread;

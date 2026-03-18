import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, Shield, Users } from 'lucide-react';
import AdminLayout from '@/components/admin/AdminLayout';
import { API } from '@/utils/api';

const statusColor = (s) => ({
  pending: 'bg-yellow-900/50 text-yellow-400 border-yellow-700',
  approved: 'bg-green-900/50 text-green-400 border-green-700',
  denied: 'bg-red-900/50 text-red-400 border-red-700',
}[s] || 'bg-gray-700 text-gray-300');

const statusIcon = (s) => ({
  pending: <Clock className="w-4 h-4" />,
  approved: <CheckCircle className="w-4 h-4" />,
  denied: <XCircle className="w-4 h-4" />,
}[s] || null);

const PartnerApplicationsReview = () => {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedApp, setExpandedApp] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [processing, setProcessing] = useState(null);

  const fetchApplications = async () => {
    try {
      const res = await axios.get(`${API}/partner-applications`, { withCredentials: true });
      setApplications(res.data);
    } catch (err) {
      console.error('Failed to fetch partner applications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchApplications(); }, []);

  const handleReview = async (appId, status) => {
    setProcessing(appId);
    try {
      await axios.put(`${API}/partner-applications/${appId}/review`, {
        status,
        review_notes: reviewNotes,
      }, { withCredentials: true });
      setReviewNotes('');
      setExpandedApp(null);
      fetchApplications();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to process application');
    } finally {
      setProcessing(null);
    }
  };

  const toggleExpand = (appId) => {
    setExpandedApp(expandedApp === appId ? null : appId);
    setReviewNotes('');
  };

  const pendingCount = applications.filter(a => a.status === 'pending').length;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-tropic-gold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
              <Shield className="w-6 h-6 inline mr-2" />PARTNER APPLICATIONS
            </h2>
            <p className="text-sm text-gray-500 mt-1">Review and manage incoming partner unit enrollment requests</p>
          </div>
          {pendingCount > 0 && (
            <Badge className="bg-yellow-900/50 text-yellow-400 border border-yellow-700 text-sm px-3 py-1">
              {pendingCount} Pending
            </Badge>
          )}
        </div>

        {loading ? (
          <div className="text-center text-gray-500 py-12">Loading applications...</div>
        ) : applications.length === 0 ? (
          <Card className="bg-gray-900/50 border-gray-800">
            <CardContent className="p-12 text-center text-gray-500">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>No partner applications have been submitted yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {applications.map(app => (
              <Card key={app.id} className={`bg-gray-900/80 border-gray-800 ${app.status === 'pending' ? 'border-l-2 border-l-yellow-500' : ''}`}>
                <CardContent className="p-0">
                  <div
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-800/30 transition-colors"
                    onClick={() => toggleExpand(app.id)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center text-tropic-olive font-bold text-lg">
                        {app.unit_name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-white">{app.unit_name}</h3>
                        <p className="text-xs text-gray-500">
                          {app.contact_name && <span>{app.contact_name} — </span>}
                          {app.contact_email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={`${statusColor(app.status)} text-[10px] flex items-center gap-1`}>
                        {statusIcon(app.status)} {app.status?.toUpperCase()}
                      </Badge>
                      <span className="text-[10px] text-gray-600">
                        {app.submitted_at ? new Date(app.submitted_at).toLocaleDateString() : ''}
                      </span>
                      {expandedApp === app.id ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                    </div>
                  </div>

                  {expandedApp === app.id && (
                    <div className="border-t border-gray-800 p-4 space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-xs text-gray-500 block">Unit Name</span>
                          <span className="text-white">{app.unit_name}</span>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500 block">Timezone</span>
                          <span className="text-white">{app.unit_timezone || '—'}</span>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500 block">Member Count</span>
                          <span className="text-white">{app.member_count || '—'}</span>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500 block">Primary Tasking</span>
                          <span className="text-white">{app.primary_tasking || '—'}</span>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500 block">Contact</span>
                          <span className="text-white">{app.contact_name || '—'}</span>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500 block">Email</span>
                          <span className="text-white">{app.contact_email}</span>
                        </div>
                      </div>

                      {app.description && (
                        <div>
                          <span className="text-xs text-gray-500 block mb-1">Description</span>
                          <p className="text-sm text-gray-300 bg-gray-800/50 rounded p-3">{app.description}</p>
                        </div>
                      )}

                      {app.additional_info && (
                        <div>
                          <span className="text-xs text-gray-500 block mb-1">Additional Info</span>
                          <p className="text-sm text-gray-300 bg-gray-800/50 rounded p-3">{app.additional_info}</p>
                        </div>
                      )}

                      {app.review_notes && (
                        <div>
                          <span className="text-xs text-gray-500 block mb-1">Review Notes</span>
                          <p className="text-sm text-gray-400 bg-gray-800/50 rounded p-3">{app.review_notes}</p>
                          {app.reviewed_at && (
                            <p className="text-[10px] text-gray-600 mt-1">
                              Reviewed {new Date(app.reviewed_at).toLocaleString()} by {app.reviewed_by || 'Unknown'}
                            </p>
                          )}
                        </div>
                      )}

                      {app.status === 'pending' && (
                        <div className="border-t border-gray-800 pt-4 space-y-3">
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">Review Notes (optional)</label>
                            <Textarea
                              value={reviewNotes}
                              onChange={(e) => setReviewNotes(e.target.value)}
                              placeholder="Add notes about this application..."
                              rows={2}
                              className="bg-black/50 border-gray-700 focus:border-tropic-olive"
                            />
                          </div>
                          <div className="flex gap-3">
                            <Button
                              onClick={() => handleReview(app.id, 'approved')}
                              disabled={processing === app.id}
                              className="bg-green-700 hover:bg-green-600 text-white"
                            >
                              <CheckCircle className="w-4 h-4 mr-2" />
                              {processing === app.id ? 'Processing...' : 'Approve & Create Unit'}
                            </Button>
                            <Button
                              onClick={() => handleReview(app.id, 'denied')}
                              disabled={processing === app.id}
                              variant="outline"
                              className="border-red-700 text-red-400 hover:bg-red-900/20"
                            >
                              <XCircle className="w-4 h-4 mr-2" />Deny
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default PartnerApplicationsReview;

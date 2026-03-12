import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, Edit, Users, UserPlus, Clock, CheckCircle, XCircle, Eye, Building2, ExternalLink } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STATUS_COLORS = {
  pending: 'bg-tropic-gold/20 text-tropic-gold border-tropic-gold/30',
  reviewing: 'bg-tropic-gold/30 text-tropic-gold border-tropic-gold/50',
  accepted: 'bg-green-500/20 text-green-400 border-green-500/30',
  rejected: 'bg-red-500/20 text-red-400 border-red-500/30'
};

const RecruitmentManager = () => {
  const [stats, setStats] = useState(null);
  const [billets, setBillets] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('applications');
  const [statusFilter, setStatusFilter] = useState('all');
  const [unitTags, setUnitTags] = useState(null);
  
  // Billet form
  const [billetDialogOpen, setBilletDialogOpen] = useState(false);
  const [editingBillet, setEditingBillet] = useState(null);
  const [billetForm, setBilletForm] = useState({
    title: '', company: '', platoon: '', description: '', requirements: '', is_open: true
  });

  // Application review
  const [selectedApp, setSelectedApp] = useState(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      const [statsRes, billetsRes, appsRes, tagsRes] = await Promise.all([
        axios.get(`${API}/admin/recruitment/stats`),
        axios.get(`${API}/admin/recruitment/billets`),
        axios.get(`${API}/admin/recruitment/applications`),
        axios.get(`${API}/unit-tags`)
      ]);
      setStats(statsRes.data);
      setBillets(billetsRes.data);
      setApplications(appsRes.data);
      setUnitTags(tagsRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSaveBillet = async (e) => {
    e.preventDefault();
    try {
      if (editingBillet) {
        await axios.put(`${API}/admin/recruitment/billets/${editingBillet.id}`, billetForm);
      } else {
        await axios.post(`${API}/admin/recruitment/billets`, billetForm);
      }
      setBilletDialogOpen(false);
      setEditingBillet(null);
      setBilletForm({ title: '', company: '', platoon: '', description: '', requirements: '', is_open: true });
      fetchAll();
    } catch (e) { alert(e.response?.data?.detail || 'Failed to save billet'); }
  };

  const handleDeleteBillet = async (id) => {
    if (!window.confirm('Delete this billet?')) return;
    try {
      await axios.delete(`${API}/admin/recruitment/billets/${id}`);
      fetchAll();
    } catch (e) { alert('Failed to delete'); }
  };

  const handleEditBillet = (billet) => {
    setEditingBillet(billet);
    setBilletForm({
      title: billet.title,
      company: billet.company || '',
      platoon: billet.platoon || '',
      description: billet.description,
      requirements: billet.requirements || '',
      is_open: billet.is_open
    });
    setBilletDialogOpen(true);
  };

  const handleReviewApp = (app) => {
    setSelectedApp(app);
    setReviewDialogOpen(true);
  };

  const handleUpdateAppStatus = async (status) => {
    try {
      await axios.put(`${API}/admin/recruitment/applications/${selectedApp.id}`, {
        status,
        admin_notes: selectedApp.admin_notes
      });
      setReviewDialogOpen(false);
      fetchAll();
    } catch (e) { alert('Failed to update'); }
  };

  const filteredApps = statusFilter === 'all' 
    ? applications 
    : applications.filter(a => a.status === statusFilter);

  if (loading) return <AdminLayout><div className="text-center py-12">Loading recruitment data...</div></AdminLayout>;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-wider text-tropic-gold" style={{ fontFamily: 'Rajdhani, sans-serif' }} data-testid="recruitment-title">
              RECRUITMENT PIPELINE
            </h1>
            <p className="text-sm text-gray-500">Manage open positions and review applications</p>
          </div>
          <a href="/join" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="border-tropic-gold/50 text-tropic-gold hover:bg-tropic-gold/10">
              <ExternalLink className="w-4 h-4 mr-2" />View Public Page
            </Button>
          </a>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="py-4 text-center">
                <div className="text-2xl font-bold text-tropic-gold">{stats.open_billets}</div>
                <div className="text-xs text-gray-500">Open Billets</div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="py-4 text-center">
                <div className="text-2xl font-bold text-tropic-gold">{stats.pending}</div>
                <div className="text-xs text-gray-500">Pending</div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="py-4 text-center">
                <div className="text-2xl font-bold text-tropic-gold">{stats.reviewing}</div>
                <div className="text-xs text-gray-500">Reviewing</div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="py-4 text-center">
                <div className="text-2xl font-bold text-green-400">{stats.accepted}</div>
                <div className="text-xs text-gray-500">Accepted</div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="py-4 text-center">
                <div className="text-2xl font-bold text-gray-400">{stats.total_applications}</div>
                <div className="text-xs text-gray-500">Total Apps</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-gray-900 border border-gray-800">
            <TabsTrigger value="applications" className="data-[state=active]:bg-tropic-red">
              <UserPlus className="w-4 h-4 mr-2" />Applications ({applications.length})
            </TabsTrigger>
            <TabsTrigger value="billets" className="data-[state=active]:bg-tropic-red">
              <Building2 className="w-4 h-4 mr-2" />Open Billets ({billets.filter(b => b.is_open).length})
            </TabsTrigger>
          </TabsList>

          {/* Applications Tab */}
          <TabsContent value="applications" className="space-y-4">
            <div className="flex items-center justify-between">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="bg-black border-gray-700 w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-700">
                  <SelectItem value="all">All Applications</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="reviewing">Reviewing</SelectItem>
                  <SelectItem value="accepted">Accepted</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filteredApps.length === 0 ? (
              <Card className="bg-gray-900 border-gray-800">
                <CardContent className="py-12 text-center text-gray-500">
                  No applications found.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredApps.map(app => (
                  <Card key={app.id} className="bg-gray-900 border-gray-800 hover:border-tropic-red/30 transition-colors" data-testid={`app-${app.id}`}>
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <span className="font-bold">{app.applicant_name}</span>
                            <Badge className={STATUS_COLORS[app.status]}>{app.status.toUpperCase()}</Badge>
                            {app.billet_id && (
                              <span className="text-xs text-gray-500">
                                → {billets.find(b => b.id === app.billet_id)?.title || 'Position'}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-400 flex items-center gap-4">
                            <span>{app.applicant_email}</span>
                            {app.discord_username && <span className="text-tropic-gold">{app.discord_username}</span>}
                            {app.timezone && <span className="text-gray-500">{app.timezone}</span>}
                          </div>
                          <div className="text-xs text-gray-600 mt-1">
                            Submitted: {new Date(app.submitted_at).toLocaleDateString()}
                            {app.reviewed_by && <span> · Reviewed by {app.reviewed_by}</span>}
                          </div>
                        </div>
                        <Button onClick={() => handleReviewApp(app)} className="bg-tropic-red hover:bg-tropic-red-dark shrink-0" data-testid={`review-${app.id}`}>
                          <Eye className="w-4 h-4 mr-1" />Review
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Billets Tab */}
          <TabsContent value="billets" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={billetDialogOpen} onOpenChange={(open) => { setBilletDialogOpen(open); if (!open) { setEditingBillet(null); setBilletForm({ title: '', company: '', platoon: '', description: '', requirements: '', is_open: true }); } }}>
                <DialogTrigger asChild>
                  <Button className="bg-tropic-red hover:bg-tropic-red-dark" data-testid="add-billet-btn">
                    <Plus className="w-4 h-4 mr-2" />Add Billet
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-gray-900 text-white border-gray-800">
                  <DialogHeader>
                    <DialogTitle className="text-tropic-gold">{editingBillet ? 'EDIT BILLET' : 'NEW BILLET'}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSaveBillet} className="space-y-4">
                    <div>
                      <Label>Position Title *</Label>
                      <Input required value={billetForm.title} onChange={e => setBilletForm({...billetForm, title: e.target.value})} className="bg-black border-gray-700" placeholder="e.g., Squad Leader" data-testid="billet-title" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Company</Label>
                        <Select value={billetForm.company || '__none__'} onValueChange={v => setBilletForm({...billetForm, company: v === '__none__' ? '' : v})}>
                          <SelectTrigger className="bg-black border-gray-700"><SelectValue placeholder="Select..." /></SelectTrigger>
                          <SelectContent className="bg-gray-900 border-gray-700">
                            <SelectItem value="__none__">— None —</SelectItem>
                            {unitTags?.companies?.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Platoon</Label>
                        <Select value={billetForm.platoon || '__none__'} onValueChange={v => setBilletForm({...billetForm, platoon: v === '__none__' ? '' : v})}>
                          <SelectTrigger className="bg-black border-gray-700"><SelectValue placeholder="Select..." /></SelectTrigger>
                          <SelectContent className="bg-gray-900 border-gray-700">
                            <SelectItem value="__none__">— None —</SelectItem>
                            {unitTags?.platoons?.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label>Description *</Label>
                      <Textarea required value={billetForm.description} onChange={e => setBilletForm({...billetForm, description: e.target.value})} rows={3} className="bg-black border-gray-700" placeholder="Describe the role and responsibilities..." data-testid="billet-desc" />
                    </div>
                    <div>
                      <Label>Requirements</Label>
                      <Input value={billetForm.requirements} onChange={e => setBilletForm({...billetForm, requirements: e.target.value})} className="bg-black border-gray-700" placeholder="e.g., Must have leadership experience" />
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="is_open" checked={billetForm.is_open} onChange={e => setBilletForm({...billetForm, is_open: e.target.checked})} className="w-4 h-4" />
                      <Label htmlFor="is_open" className="cursor-pointer">Position is open for applications</Label>
                    </div>
                    <div className="flex gap-3">
                      <Button type="button" variant="outline" onClick={() => setBilletDialogOpen(false)} className="border-gray-700 flex-1">Cancel</Button>
                      <Button type="submit" className="bg-tropic-red hover:bg-tropic-red-dark flex-1" data-testid="billet-save">{editingBillet ? 'Save Changes' : 'Create Billet'}</Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {billets.length === 0 ? (
              <Card className="bg-gray-900 border-gray-800">
                <CardContent className="py-12 text-center text-gray-500">
                  No billets created yet. Add your first open position.
                </CardContent>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {billets.map(billet => (
                  <Card key={billet.id} className={`bg-gray-900 border-gray-800 ${!billet.is_open ? 'opacity-60' : ''}`} data-testid={`billet-card-${billet.id}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{billet.title}</CardTitle>
                        <Badge className={billet.is_open ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}>
                          {billet.is_open ? 'OPEN' : 'CLOSED'}
                        </Badge>
                      </div>
                      {(billet.company || billet.platoon) && (
                        <CardDescription className="text-xs">
                          {billet.company}{billet.company && billet.platoon && ' · '}{billet.platoon}
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-400 mb-3 whitespace-pre-wrap line-clamp-3">{billet.description}</p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleEditBillet(billet)} className="border-gray-700 flex-1">
                          <Edit className="w-3 h-3 mr-1" />Edit
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleDeleteBillet(billet.id)} className="border-red-700/50 text-red-400 hover:bg-red-700/10">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Application Review Dialog */}
        <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
          <DialogContent className="bg-gray-900 text-white border-gray-800 max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-tropic-gold">APPLICATION REVIEW</DialogTitle>
            </DialogHeader>
            {selectedApp && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-500">Applicant</Label>
                    <div className="font-medium">{selectedApp.applicant_name}</div>
                  </div>
                  <div>
                    <Label className="text-gray-500">Email</Label>
                    <div className="text-sm">{selectedApp.applicant_email}</div>
                  </div>
                  <div>
                    <Label className="text-gray-500">Discord</Label>
                    <div className="text-sm text-tropic-gold">{selectedApp.discord_username || '—'}</div>
                  </div>
                  <div>
                    <Label className="text-gray-500">Timezone</Label>
                    <div className="text-sm">{selectedApp.timezone || '—'}</div>
                  </div>
                </div>

                {selectedApp.billet_id && (
                  <div>
                    <Label className="text-gray-500">Applied For</Label>
                    <div className="text-sm text-tropic-gold">{billets.find(b => b.id === selectedApp.billet_id)?.title || 'Position'}</div>
                  </div>
                )}

                <div>
                  <Label className="text-gray-500">Experience</Label>
                  <div className="text-sm text-gray-300 bg-black/30 rounded p-3 whitespace-pre-wrap">{selectedApp.experience}</div>
                </div>

                <div>
                  <Label className="text-gray-500">Availability</Label>
                  <div className="text-sm text-gray-300 bg-black/30 rounded p-3 whitespace-pre-wrap">{selectedApp.availability}</div>
                </div>

                <div>
                  <Label className="text-gray-500">Why Join</Label>
                  <div className="text-sm text-gray-300 bg-black/30 rounded p-3 whitespace-pre-wrap">{selectedApp.why_join}</div>
                </div>

                <div>
                  <Label>Admin Notes</Label>
                  <Textarea 
                    value={selectedApp.admin_notes || ''} 
                    onChange={e => setSelectedApp({...selectedApp, admin_notes: e.target.value})} 
                    rows={2} 
                    className="bg-black border-gray-700" 
                    placeholder="Add internal notes about this applicant..."
                    data-testid="admin-notes"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button onClick={() => handleUpdateAppStatus('pending')} variant="outline" className={`flex-1 ${selectedApp.status === 'pending' ? 'border-tropic-gold text-tropic-gold' : 'border-gray-700'}`}>
                    <Clock className="w-4 h-4 mr-1" />Pending
                  </Button>
                  <Button onClick={() => handleUpdateAppStatus('reviewing')} variant="outline" className={`flex-1 ${selectedApp.status === 'reviewing' ? 'border-tropic-gold text-tropic-gold' : 'border-gray-700'}`}>
                    <Eye className="w-4 h-4 mr-1" />Reviewing
                  </Button>
                  <Button onClick={() => handleUpdateAppStatus('accepted')} className="flex-1 bg-green-700 hover:bg-green-600" data-testid="accept-app">
                    <CheckCircle className="w-4 h-4 mr-1" />Accept
                  </Button>
                  <Button onClick={() => handleUpdateAppStatus('rejected')} variant="outline" className="flex-1 border-red-700/50 text-red-400 hover:bg-red-700/10" data-testid="reject-app">
                    <XCircle className="w-4 h-4 mr-1" />Reject
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default RecruitmentManager;

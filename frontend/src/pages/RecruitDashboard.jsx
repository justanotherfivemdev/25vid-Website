import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Shield, Clock, CheckCircle, Send, LogOut, User, FileText, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

import { BACKEND_URL, API } from '@/utils/api';

const STATUS_DISPLAY = {
  pending: { label: 'PENDING REVIEW', color: 'bg-tropic-gold/20 text-tropic-gold border-tropic-gold/30', icon: Clock, message: 'Your application is awaiting review by our recruitment team.' },
  reviewing: { label: 'UNDER REVIEW', color: 'bg-tropic-gold/30 text-tropic-gold border-tropic-gold/50', icon: FileText, message: 'A recruiter is currently reviewing your application.' },
  accepted: { label: 'ACCEPTED', color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: CheckCircle, message: 'Congratulations! Your application has been accepted. Please wait for your account to be activated.' },
  rejected: { label: 'NOT ACCEPTED', color: 'bg-tropic-red/20 text-tropic-red border-tropic-red/30', icon: AlertCircle, message: 'We appreciate your interest, but we are unable to accept your application at this time.' }
};

const RecruitDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [application, setApplication] = useState(null);
  const [billets, setBillets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [applicationOpen, setApplicationOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    discord_username: '',
    timezone: '',
    experience: '',
    availability: '',
    why_join: '',
    billet_id: ''
  });

  const fetchData = useCallback(async () => {
    try {
      const [appsRes, billetsRes] = await Promise.all([
        axios.get(`${API}/recruit/my-application`).catch(() => ({ data: null })),
        axios.get(`${API}/recruitment/billets`)
      ]);
      setApplication(appsRes.data);
      setBillets(billetsRes.data);
      
      // Pre-fill discord username if user has it
      if (user?.discord_username) {
        setForm(f => ({ ...f, discord_username: user.discord_username }));
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user?.discord_username]);

  useEffect(() => {
    if (user && user.status !== 'recruit') {
      // User is no longer a recruit, redirect to hub
      navigate('/hub');
      return;
    }
    fetchData();
  }, [user, navigate, fetchData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await axios.post(`${API}/recruit/apply`, {
        ...form,
        billet_id: form.billet_id || null
      });
      await fetchData();
      setApplicationOpen(false);
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to submit application');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-tropic-gold" />
      </div>
    );
  }

  const statusInfo = application ? STATUS_DISPLAY[application.status] : null;
  const StatusIcon = statusInfo?.icon || Clock;

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/92 backdrop-blur-xl border-b border-tropic-gold/15">
        <div className="container mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={`${BACKEND_URL}/api/uploads/25th_id_patch.png`} alt="25th ID" className="w-8 h-8 object-contain" />
            <h1 className="text-xl font-bold tracking-widest text-tropic-gold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
              RECRUIT STATUS
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">
              <User className="w-4 h-4 inline mr-1" />{user?.username}
            </span>
            <Button size="sm" variant="outline" onClick={handleLogout} className="border-gray-700">
              <LogOut className="w-4 h-4 mr-1" />Logout
            </Button>
          </div>
        </div>
      </nav>

      <div className="pt-24 pb-16 px-4 md:px-6">
        <div className="container mx-auto max-w-2xl space-y-8">
          <Card className="bg-gray-900/80 border-amber-700/30" data-testid="recruit-profile-cta">
            <CardContent className="pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-tropic-gold tracking-wider">KEEP YOUR PROFILE CURRENT</h3>
                <p className="text-sm text-gray-400 mt-1">Add your bio, timezone, and role preferences so staff can process you faster.</p>
              </div>
              <Button onClick={() => navigate('/hub/profile')} className="bg-amber-700 hover:bg-amber-800 text-white tracking-wider" data-testid="recruit-update-profile">
                Update Profile
              </Button>
            </CardContent>
          </Card>

          {/* Welcome Message */}
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold tracking-wider text-tropic-gold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
              WELCOME, RECRUIT
            </h2>
            <p className="text-gray-400">
              {application 
                ? 'Track your application status below.' 
                : 'Complete your application to join the 25th Infantry Division.'}
            </p>
          </div>

          {/* Application Status or Application Form */}
          {application ? (
            <Card className="bg-gray-900/80 border-tropic-red/30">
              <CardHeader className="text-center pb-4">
                <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${statusInfo?.color.split(' ')[0]} mx-auto mb-4`}>
                  <StatusIcon className="w-8 h-8" />
                </div>
                <Badge className={statusInfo?.color}>{statusInfo?.label}</Badge>
                <CardDescription className="mt-4 text-gray-300">
                  {statusInfo?.message}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-black/30 rounded-lg p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Submitted:</span>
                      <div className="text-gray-300">{new Date(application.submitted_at).toLocaleDateString()}</div>
                    </div>
                    {application.reviewed_at && (
                      <div>
                        <span className="text-gray-500">Reviewed:</span>
                        <div className="text-gray-300">{new Date(application.reviewed_at).toLocaleDateString()}</div>
                      </div>
                    )}
                  </div>
                  
                  {application.billet_id && (
                    <div>
                      <span className="text-gray-500 text-sm">Applied for:</span>
                      <div className="text-tropic-gold text-sm">
                        {billets.find(b => b.id === application.billet_id)?.title || 'Position'}
                      </div>
                    </div>
                  )}
                </div>

                {application.status === 'accepted' && (
                  <Alert className="bg-green-900/20 border-green-700/50">
                    <CheckCircle className="h-4 w-4 text-green-400" />
                    <AlertDescription className="text-green-300">
                      Your application has been accepted! An admin will activate your account shortly, 
                      giving you access to the full member hub.
                    </AlertDescription>
                  </Alert>
                )}

                {application.status === 'rejected' && (
                  <Alert className="bg-tropic-red/10 border-tropic-red/30">
                    <AlertCircle className="h-4 w-4 text-tropic-red" />
                    <AlertDescription className="text-gray-300">
                      If you have questions about this decision, please reach out to our recruitment team via Discord.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-gray-900/80 border-tropic-red/30">
              <CardHeader>
                <CardTitle className="text-tropic-gold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                  COMPLETE YOUR APPLICATION
                </CardTitle>
                <CardDescription>
                  Tell us about yourself and why you want to join the 25th Infantry Division.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Discord Username</Label>
                      <Input 
                        value={form.discord_username} 
                        onChange={e => setForm({...form, discord_username: e.target.value})} 
                        className="bg-black border-gray-700" 
                        placeholder="username#1234"
                        data-testid="recruit-discord"
                      />
                    </div>
                    <div>
                      <Label>Timezone</Label>
                      <Input 
                        value={form.timezone} 
                        onChange={e => setForm({...form, timezone: e.target.value})} 
                        className="bg-black border-gray-700" 
                        placeholder="e.g., EST, PST"
                        data-testid="recruit-timezone"
                      />
                    </div>
                  </div>

                  {billets.length > 0 && (
                    <div>
                      <Label>Position of Interest (Optional)</Label>
                      <select 
                        value={form.billet_id} 
                        onChange={e => setForm({...form, billet_id: e.target.value})}
                        className="w-full bg-black border border-gray-700 rounded-md px-3 py-2 text-white"
                        data-testid="recruit-billet"
                      >
                        <option value="">General Application</option>
                        {billets.map(b => (
                          <option key={b.id} value={b.id}>{b.title} {b.company ? `(${b.company})` : ''}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <Label>Milsim / Gaming Experience *</Label>
                    <Textarea 
                      required
                      value={form.experience} 
                      onChange={e => setForm({...form, experience: e.target.value})} 
                      rows={3} 
                      className="bg-black border-gray-700" 
                      placeholder="Tell us about your milsim or tactical gaming background..."
                      data-testid="recruit-experience"
                    />
                  </div>

                  <div>
                    <Label>Availability *</Label>
                    <Textarea 
                      required
                      value={form.availability} 
                      onChange={e => setForm({...form, availability: e.target.value})} 
                      rows={2} 
                      className="bg-black border-gray-700" 
                      placeholder="When are you typically available? (days/times)"
                      data-testid="recruit-availability"
                    />
                  </div>

                  <div>
                    <Label>Why do you want to join the 25th ID? *</Label>
                    <Textarea 
                      required
                      value={form.why_join} 
                      onChange={e => setForm({...form, why_join: e.target.value})} 
                      rows={3} 
                      className="bg-black border-gray-700" 
                      placeholder="What draws you to our unit?"
                      data-testid="recruit-why"
                    />
                  </div>

                  <Button 
                    type="submit" 
                    disabled={submitting} 
                    className="w-full bg-tropic-red hover:bg-tropic-red-dark"
                    data-testid="recruit-submit"
                  >
                    {submitting ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting...</>
                    ) : (
                      <><Send className="w-4 h-4 mr-2" />Submit Application</>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Info Section */}
          <Card className="bg-gray-900/50 border-gray-800">
            <CardContent className="py-6">
              <h3 className="text-sm font-bold text-tropic-gold mb-3" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                WHAT HAPPENS NEXT?
              </h3>
              <ul className="text-sm text-gray-400 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-tropic-gold mt-1">1.</span>
                  <span>Our recruitment team will review your application</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-tropic-gold mt-1">2.</span>
                  <span>You may be contacted via Discord for an interview</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-tropic-gold mt-1">3.</span>
                  <span>Once accepted, your account will be activated</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-tropic-gold mt-1">4.</span>
                  <span>You'll gain full access to the member hub and operations</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Return to Home */}
          <div className="text-center">
            <Link to="/">
              <Button variant="outline" className="border-gray-700 text-gray-400">
                Return to Main Site
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecruitDashboard;

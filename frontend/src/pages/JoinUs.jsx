import React, { useEffect, useState } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Shield, Users, Target, CheckCircle, ArrowLeft, Building2, Send, Clock, Zap } from 'lucide-react';
import ThreatMap from '@/components/map/ThreatMap';
import ThreatLegend from '@/components/map/ThreatLegend';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const JoinUs = () => {
  const [billets, setBillets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBillet, setSelectedBillet] = useState(null);
  const [applicationOpen, setApplicationOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [publicThreats, setPublicThreats] = useState([]);
  const [selectedThreat, setSelectedThreat] = useState(null);
  const [form, setForm] = useState({
    applicant_name: '',
    applicant_email: '',
    discord_username: '',
    timezone: '',
    experience: '',
    availability: '',
    why_join: ''
  });
  const navigate = useNavigate();

  useEffect(() => {
    fetchBillets();
  }, []);

  const fetchBillets = async () => {
    try {
      const res = await axios.get(`${API}/recruitment/billets`);
      setBillets(res.data);
      const threatRes = await axios.get(`${API}/public/threat-map`).catch(() => ({ data: { markers: [] } }));
      setPublicThreats(threatRes.data?.markers || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleApply = (billet) => {
    setSelectedBillet(billet);
    setApplicationOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await axios.post(`${API}/recruitment/apply`, {
        ...form,
        billet_id: selectedBillet?.id || null,
        campaign_id: selectedThreat?.campaign_id || null,
        objective_id: selectedThreat?.id || null,
        operation_id: selectedThreat?.linked_operation_id || null,
      });
      setSubmitted(true);
      setForm({
        applicant_name: '',
        applicant_email: '',
        discord_username: '',
        timezone: '',
        experience: '',
        availability: '',
        why_join: ''
      });
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to submit application');
    } finally {
      setSubmitting(false);
    }
  };

  const groupedBillets = billets.reduce((acc, b) => {
    const key = b.company || 'General';
    if (!acc[key]) acc[key] = [];
    acc[key].push(b);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur border-b border-tropic-gold/25">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/"><Button size="sm" variant="outline" className="border-tropic-gold/30 text-tropic-gold hover:bg-tropic-gold/10"><ArrowLeft className="w-4 h-4 mr-1" />Home</Button></Link>
            <img src={`${BACKEND_URL}/api/uploads/25th_id_patch.png`} alt="25th ID" className="w-8 h-8 object-contain" />
            <h1 className="text-xl font-bold tracking-widest text-tropic-gold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>JOIN THE 25TH</h1>
          </div>
          <Link to="/login"><Button size="sm" className="bg-tropic-gold hover:bg-tropic-gold-light text-black">Member Login</Button></Link>
        </div>
      </nav>

      <div className="pt-24 pb-16 px-6">
        <div className="container mx-auto max-w-5xl space-y-10">
          {/* Hero Section */}
          <div className="text-center space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold tracking-wider text-tropic-gold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
              ENLIST TODAY
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Join the 25th Infantry Division "Tropic Lightning" - a dedicated milsim community committed to tactical excellence and brotherhood.
            </p>
            <div className="flex justify-center gap-6 pt-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-tropic-gold">{billets.length}</div>
                <div className="text-xs text-gray-500 uppercase tracking-wider">Open Billets</div>
              </div>
              <div className="border-l border-gray-800 h-12"></div>
              <div className="text-center">
                <div className="text-3xl font-bold text-tropic-gold-light">Active</div>
                <div className="text-xs text-gray-500 uppercase tracking-wider">Recruiting Status</div>
              </div>
            </div>
          </div>

          {publicThreats.length > 0 && (
            <Card className="bg-gray-900/50 border-tropic-gold/20">
              <CardHeader>
                <CardTitle className="text-lg text-tropic-gold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>GLOBAL THREAT MAP</CardTitle>
                <CardDescription>World-building theater overview of public recruiting hotspots.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ThreatLegend />
                <ThreatMap markers={publicThreats} selectedMarkerId={selectedThreat?.id} onSelectMarker={setSelectedThreat} showRecruitCta height="360px" />
                {selectedThreat && (
                  <Alert className="border-tropic-gold/30 bg-black/30">
                    <AlertDescription className="text-xs text-gray-300">
                      Selected region: <span className="text-tropic-gold font-semibold">{selectedThreat.name}</span>
                      {selectedThreat.linked_operation?.title ? ` • Linked operation: ${selectedThreat.linked_operation.title}` : ''}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}

          {/* Requirements Section */}
          <Card className="bg-gray-900/50 border-tropic-gold/20">
            <CardHeader>
              <CardTitle className="text-lg text-tropic-gold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>REQUIREMENTS</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-tropic-gold shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-sm">Availability</div>
                    <div className="text-xs text-gray-400">Attend at least 2 operations per month</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Target className="w-5 h-5 text-tropic-olive-light shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-sm">Attitude</div>
                    <div className="text-xs text-gray-400">Team-oriented, mature, and respectful</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Zap className="w-5 h-5 text-tropic-gold shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-sm">Commitment</div>
                    <div className="text-xs text-gray-400">Complete basic training and evaluation</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Open Billets */}
          <section>
            <h3 className="text-2xl font-bold text-tropic-gold mb-6" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
              OPEN POSITIONS
            </h3>

            {loading ? (
              <div className="text-center py-12 text-gray-500">Loading positions...</div>
            ) : billets.length === 0 ? (
              <Card className="bg-gray-900/50 border-gray-800">
                <CardContent className="py-12 text-center">
                  <Users className="w-12 h-12 mx-auto mb-4 text-gray-600" />
                  <p className="text-gray-400">No specific positions are currently listed.</p>
                  <p className="text-sm text-gray-500 mt-2">You can still submit a general application below.</p>
                  <Button onClick={() => { setSelectedBillet(null); setApplicationOpen(true); }} className="mt-4 bg-tropic-gold hover:bg-tropic-gold-light text-black">
                    Submit General Application
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {Object.entries(groupedBillets).map(([company, companyBillets]) => (
                  <div key={company}>
                    <div className="flex items-center gap-2 mb-3">
                      <Building2 className="w-5 h-5 text-tropic-gold" />
                      <h4 className="font-bold tracking-wider" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{company.toUpperCase()} COMPANY</h4>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      {companyBillets.map(billet => (
                        <Card key={billet.id} className="bg-gray-900/80 border-gray-800 hover:border-tropic-gold/40 transition-colors" data-testid={`billet-${billet.id}`}>
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-base">{billet.title}</CardTitle>
                              <Badge className="bg-tropic-gold/20 text-tropic-gold border-tropic-gold/30">OPEN</Badge>
                            </div>
                            {billet.platoon && <CardDescription className="text-xs text-gray-500">{billet.platoon}</CardDescription>}
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm text-gray-400 mb-3 whitespace-pre-wrap">{billet.description}</p>
                            {billet.requirements && (
                              <div className="text-xs text-gray-500 mb-3 border-l-2 border-tropic-gold/30 pl-2">
                                <span className="text-gray-400">Requirements:</span> {billet.requirements}
                              </div>
                            )}
                            <Button onClick={() => handleApply(billet)} className="w-full bg-tropic-gold hover:bg-tropic-gold-light text-black" data-testid={`apply-${billet.id}`}>
                              <Send className="w-4 h-4 mr-2" />Apply for This Position
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                ))}

                {/* General Application Option */}
                <Card className="bg-gray-900/50 border-dashed border-gray-700">
                  <CardContent className="py-6 text-center">
                    <p className="text-gray-400 mb-3">Don't see a position that fits? Submit a general application.</p>
                    <Button variant="outline" onClick={() => { setSelectedBillet(null); setApplicationOpen(true); }} className="border-tropic-gold/50 text-tropic-gold hover:bg-tropic-gold/10">
                      General Application
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </section>

          {/* Application Dialog */}
          <Dialog open={applicationOpen} onOpenChange={(open) => { setApplicationOpen(open); if (!open) setSubmitted(false); }}>
            <DialogContent className="bg-gray-900 text-white border-gray-800 max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-tropic-gold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                  {submitted ? 'APPLICATION SUBMITTED' : selectedBillet ? `APPLY: ${selectedBillet.title}` : 'GENERAL APPLICATION'}
                </DialogTitle>
                {!submitted && selectedThreat && (
                  <p className="text-xs text-gray-400">Threat region context: <span className="text-tropic-gold">{selectedThreat.name}</span></p>
                )}
              </DialogHeader>

              {submitted ? (
                <div className="text-center py-6 space-y-4">
                  <CheckCircle className="w-16 h-16 mx-auto text-green-500" />
                  <div>
                    <p className="text-lg font-medium">Thank you for your application!</p>
                    <p className="text-sm text-gray-400 mt-2">Our recruitment team will review your submission and contact you via Discord or email.</p>
                  </div>
                  <Button onClick={() => { setApplicationOpen(false); setSubmitted(false); }} className="bg-tropic-gold hover:bg-tropic-gold-light text-black">
                    Close
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Name / Callsign *</Label>
                      <Input required value={form.applicant_name} onChange={e => setForm({...form, applicant_name: e.target.value})} className="bg-black border-gray-700" placeholder="Your name" data-testid="apply-name" />
                    </div>
                    <div>
                      <Label>Email *</Label>
                      <Input required type="email" value={form.applicant_email} onChange={e => setForm({...form, applicant_email: e.target.value})} className="bg-black border-gray-700" placeholder="you@example.com" data-testid="apply-email" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Discord Username</Label>
                      <Input value={form.discord_username} onChange={e => setForm({...form, discord_username: e.target.value})} className="bg-black border-gray-700" placeholder="username#1234" data-testid="apply-discord" />
                    </div>
                    <div>
                      <Label>Timezone</Label>
                      <Input value={form.timezone} onChange={e => setForm({...form, timezone: e.target.value})} className="bg-black border-gray-700" placeholder="e.g., EST, PST, UTC+1" data-testid="apply-timezone" />
                    </div>
                  </div>

                  <div>
                    <Label>Milsim / Gaming Experience *</Label>
                    <Textarea required value={form.experience} onChange={e => setForm({...form, experience: e.target.value})} rows={3} className="bg-black border-gray-700" placeholder="Tell us about your milsim or tactical gaming background..." data-testid="apply-experience" />
                  </div>

                  <div>
                    <Label>Availability *</Label>
                    <Textarea required value={form.availability} onChange={e => setForm({...form, availability: e.target.value})} rows={2} className="bg-black border-gray-700" placeholder="When are you typically available? (days/times)" data-testid="apply-availability" />
                  </div>

                  <div>
                    <Label>Why do you want to join the 25th ID? *</Label>
                    <Textarea required value={form.why_join} onChange={e => setForm({...form, why_join: e.target.value})} rows={3} className="bg-black border-gray-700" placeholder="What draws you to our unit?" data-testid="apply-why" />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button type="button" variant="outline" onClick={() => setApplicationOpen(false)} className="border-gray-700 flex-1">Cancel</Button>
                    <Button type="submit" disabled={submitting} className="bg-tropic-gold hover:bg-tropic-gold-light text-black flex-1" data-testid="apply-submit">
                      {submitting ? 'Submitting...' : 'Submit Application'}
                    </Button>
                  </div>
                </form>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
};

export default JoinUs;

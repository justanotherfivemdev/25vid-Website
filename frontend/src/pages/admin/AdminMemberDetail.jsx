import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Save, Plus, Trash2, CheckCircle, AlertCircle, ArrowLeft, Target, Award, Calendar, Link2, Building2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import ImageUpload from '@/components/admin/ImageUpload';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const resolveImg = (url) => { if (!url) return ''; if (url.startsWith('http')) return url; if (url.startsWith('/uploads/')) return `${BACKEND_URL}/api${url}`; return `${BACKEND_URL}${url}`; };

const AdminMemberDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [missionForm, setMissionForm] = useState({ operation_name: '', date: '', role_performed: '', notes: '' });
  const [trainingForm, setTrainingForm] = useState({ course_name: '', completion_date: '', instructor: '', notes: '' });
  const [awardForm, setAwardForm] = useState({ name: '', date: '', description: '' });
  const [missionDialogOpen, setMissionDialogOpen] = useState(false);
  const [trainingDialogOpen, setTrainingDialogOpen] = useState(false);
  const [awardDialogOpen, setAwardDialogOpen] = useState(false);
  const [unitTags, setUnitTags] = useState(null);

  useEffect(() => { 
    fetchMember(); 
    fetchUnitTags();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchMember = async () => {
    try {
      const res = await axios.get(`${API}/roster/${id}`);
      setMember(res.data);
    } catch (e) { navigate('/admin/users'); }
    finally { setLoading(false); }
  };

  const fetchUnitTags = async () => {
    try {
      const res = await axios.get(`${API}/unit-tags`);
      setUnitTags(res.data);
    } catch (e) { console.error('Failed to load unit tags'); }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      await axios.put(`${API}/admin/users/${id}/profile`, {
        username: member.username, role: member.role, rank: member.rank,
        specialization: member.specialization, status: member.status,
        squad: member.squad, avatar_url: member.avatar_url, bio: member.bio,
        timezone: member.timezone, favorite_role: member.favorite_role,
        discord_id: member.discord_id || undefined,
        discord_username: member.discord_username || undefined,
        company: member.company || undefined,
        platoon: member.platoon || undefined,
        billet: member.billet || undefined
      });
      setMessage({ type: 'success', text: 'Profile saved.' });
    } catch (e) {
      setMessage({ type: 'error', text: e.response?.data?.detail || 'Save failed.' });
    } finally { setSaving(false); }
  };

  const addMission = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/admin/users/${id}/mission-history`, missionForm);
      setMissionForm({ operation_name: '', date: '', role_performed: '', notes: '' });
      setMissionDialogOpen(false);
      await fetchMember();
    } catch (e) { alert(e.response?.data?.detail || 'Error'); }
  };

  const removeMission = async (entryId) => {
    if (!window.confirm('Remove this mission record?')) return;
    await axios.delete(`${API}/admin/users/${id}/mission-history/${entryId}`);
    await fetchMember();
  };

  const addTraining = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/admin/users/${id}/training-history`, trainingForm);
      setTrainingForm({ course_name: '', completion_date: '', instructor: '', notes: '' });
      setTrainingDialogOpen(false);
      await fetchMember();
    } catch (e) { alert(e.response?.data?.detail || 'Error'); }
  };

  const removeTraining = async (entryId) => {
    if (!window.confirm('Remove this training record?')) return;
    await axios.delete(`${API}/admin/users/${id}/training-history/${entryId}`);
    await fetchMember();
  };

  const addAward = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/admin/users/${id}/awards`, awardForm);
      setAwardForm({ name: '', date: '', description: '' });
      setAwardDialogOpen(false);
      await fetchMember();
    } catch (e) { alert(e.response?.data?.detail || 'Error'); }
  };

  const removeAward = async (entryId) => {
    if (!window.confirm('Remove this award?')) return;
    await axios.delete(`${API}/admin/users/${id}/awards/${entryId}`);
    await fetchMember();
  };

  // Helper to render select with option to type custom value
  const renderTagSelect = (field, label, options, placeholder) => {
    const currentValue = member?.[field] || '';
    const isCustom = currentValue && options && !options.includes(currentValue);
    
    return (
      <div>
        <Label>{label}</Label>
        <div className="flex gap-2">
          <Select 
            value={isCustom ? '__custom__' : (currentValue || '__none__')} 
            onValueChange={v => {
              if (v === '__custom__') return;
              if (v === '__none__') setMember({ ...member, [field]: '' });
              else setMember({ ...member, [field]: v });
            }}
          >
            <SelectTrigger className="bg-black border-gray-700 flex-1"><SelectValue placeholder={placeholder} /></SelectTrigger>
            <SelectContent className="bg-gray-900 border-gray-700 max-h-60">
              <SelectItem value="__none__">— None —</SelectItem>
              {options?.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
              {isCustom && <SelectItem value="__custom__">{currentValue} (custom)</SelectItem>}
            </SelectContent>
          </Select>
          <Input 
            value={currentValue} 
            onChange={e => setMember({ ...member, [field]: e.target.value })} 
            className="bg-black border-gray-700 w-40" 
            placeholder="Or type custom..."
          />
        </div>
      </div>
    );
  };

  if (loading) return <AdminLayout><div className="text-center py-12">Loading member...</div></AdminLayout>;
  if (!member) return <AdminLayout><div className="text-center py-12">Member not found</div></AdminLayout>;

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/admin/users"><Button size="sm" variant="outline" className="border-gray-700"><ArrowLeft className="w-4 h-4 mr-1" />Members</Button></Link>
            <div>
              <h1 className="text-3xl font-bold tracking-wider" style={{ fontFamily: 'Rajdhani, sans-serif' }} data-testid="admin-member-title">{member.username}</h1>
              <p className="text-sm text-gray-500">{member.email}</p>
            </div>
          </div>
          <Button onClick={handleSaveProfile} disabled={saving} className="bg-amber-700 hover:bg-amber-800" data-testid="admin-save-profile-btn"><Save className="w-4 h-4 mr-2" />{saving ? 'Saving...' : 'Save Profile'}</Button>
        </div>

        {message.text && <Alert className={message.type === 'success' ? 'bg-green-900/20 border-green-700' : 'bg-amber-900/20 border-red-700'}>{message.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}<AlertDescription>{message.text}</AlertDescription></Alert>}

        {/* Profile fields */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3"><CardTitle className="text-lg tracking-wider">IDENTITY & ASSIGNMENT</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <ImageUpload value={member.avatar_url || ''} onChange={url => setMember({ ...member, avatar_url: url })} label="Avatar" description="Profile photo. 300x300px recommended." previewClass="w-16 h-16 rounded-lg object-cover" />
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Username</Label><Input value={member.username || ''} onChange={e => setMember({ ...member, username: e.target.value })} className="bg-black border-gray-700" /></div>
              <div><Label>Role</Label>
                <Select value={member.role} onValueChange={v => setMember({ ...member, role: v })}>
                  <SelectTrigger className="bg-black border-gray-700"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-700"><SelectItem value="member">Member</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {renderTagSelect('rank', 'Rank', unitTags?.ranks, 'Select rank...')}
              {renderTagSelect('specialization', 'Specialization / MOS', unitTags?.specializations, 'Select spec...')}
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><Label>Status</Label>
                <Select value={member.status || 'recruit'} onValueChange={v => setMember({ ...member, status: v })}>
                  <SelectTrigger className="bg-black border-gray-700"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-700">{(unitTags?.statuses || ['recruit', 'active', 'reserve', 'staff', 'command', 'inactive']).map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {renderTagSelect('squad', 'Squad / Team', unitTags?.squads, 'Select squad...')}
              <div><Label>Timezone</Label><Input value={member.timezone || ''} onChange={e => setMember({ ...member, timezone: e.target.value })} className="bg-black border-gray-700" placeholder="e.g., EST" /></div>
            </div>
            <div><Label>Preferred Role / Loadout</Label><Input value={member.favorite_role || ''} onChange={e => setMember({ ...member, favorite_role: e.target.value })} className="bg-black border-gray-700" /></div>
            <div><Label>Bio</Label><Textarea value={member.bio || ''} onChange={e => setMember({ ...member, bio: e.target.value })} rows={3} className="bg-black border-gray-700" /></div>
          </CardContent>
        </Card>

        {/* Unit Assignment (Hierarchy) */}
        <Card className="bg-gray-900 border-gray-800" data-testid="admin-unit-assignment">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg tracking-wider flex items-center gap-2">
              <Building2 className="w-5 h-5 text-tropic-gold" /> UNIT ASSIGNMENT
            </CardTitle>
            <p className="text-xs text-gray-500 mt-1">Assign this member to a position in the unit hierarchy. Used for the organizational roster view.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {renderTagSelect('company', 'Company', unitTags?.companies, 'Select company...')}
              {renderTagSelect('platoon', 'Platoon', unitTags?.platoons, 'Select platoon...')}
              {renderTagSelect('billet', 'Billet / Position', unitTags?.billets, 'Select billet...')}
            </div>
          </CardContent>
        </Card>

        {/* Discord Integration Prep */}
        <Card className="bg-gray-900 border-gray-800" data-testid="admin-discord-fields">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg tracking-wider flex items-center gap-2">
              <Link2 className="w-5 h-5 text-tropic-gold" /> DISCORD INTEGRATION PREP
            </CardTitle>
            <p className="text-xs text-gray-500 mt-1">These fields prepare the account for future Discord OAuth linking. They are not active OAuth controls — values here will be overwritten when Discord linking goes live.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Discord ID</Label>
                <Input value={member.discord_id || ''} onChange={e => setMember({ ...member, discord_id: e.target.value })} className="bg-black border-gray-700" placeholder="e.g., 123456789012345678" data-testid="discord-id-input" />
              </div>
              <div>
                <Label>Discord Username</Label>
                <Input value={member.discord_username || ''} onChange={e => setMember({ ...member, discord_username: e.target.value })} className="bg-black border-gray-700" placeholder="e.g., operator#1234" data-testid="discord-username-input" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Discord Avatar URL</Label>
                <Input value={member.discord_avatar || ''} disabled className="bg-black/40 border-gray-800 text-gray-500 cursor-not-allowed" placeholder="Auto-populated by Discord OAuth" data-testid="discord-avatar-input" />
                <p className="text-[10px] text-gray-600 mt-1">Read-only — set automatically during Discord linking</p>
              </div>
              <div>
                <Label>Discord Linked</Label>
                <div className="flex items-center gap-2 mt-2">
                  <Badge className={`${member.discord_linked ? 'bg-green-700' : 'bg-gray-700'} text-white`} data-testid="discord-linked-badge">
                    {member.discord_linked ? 'LINKED' : 'NOT LINKED'}
                  </Badge>
                  <p className="text-[10px] text-gray-600">Status managed by the OAuth flow</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Mission History */}
        <Card className="bg-gray-900 border-gray-800" data-testid="admin-mission-history">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg tracking-wider flex items-center gap-2"><Target className="w-5 h-5 text-amber-500" /> MISSION HISTORY</CardTitle>
              <Dialog open={missionDialogOpen} onOpenChange={setMissionDialogOpen}>
                <DialogTrigger asChild><Button size="sm" className="bg-amber-700 hover:bg-amber-800" data-testid="add-mission-btn"><Plus className="w-4 h-4 mr-1" />Add</Button></DialogTrigger>
                <DialogContent className="bg-gray-900 text-white border-gray-800">
                  <DialogHeader><DialogTitle>Add Mission Record</DialogTitle></DialogHeader>
                  <form onSubmit={addMission} className="space-y-3">
                    <div><Label>Operation Name</Label><Input required value={missionForm.operation_name} onChange={e => setMissionForm({...missionForm, operation_name: e.target.value})} className="bg-black border-gray-700" data-testid="mission-name-input" /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Date</Label><Input required value={missionForm.date} onChange={e => setMissionForm({...missionForm, date: e.target.value})} className="bg-black border-gray-700" placeholder="2026-01-15" /></div>
                      <div><Label>Role Performed</Label><Input required value={missionForm.role_performed} onChange={e => setMissionForm({...missionForm, role_performed: e.target.value})} className="bg-black border-gray-700" placeholder="e.g., Squad Lead" /></div>
                    </div>
                    <div><Label>Notes</Label><Input value={missionForm.notes} onChange={e => setMissionForm({...missionForm, notes: e.target.value})} className="bg-black border-gray-700" /></div>
                    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setMissionDialogOpen(false)} className="border-gray-700">Cancel</Button><Button type="submit" className="bg-amber-700 hover:bg-amber-800" data-testid="mission-submit-btn">Add</Button></div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {(!member.mission_history?.length) ? <p className="text-sm text-gray-600">No mission records.</p> : (
              <div className="space-y-2">
                {member.mission_history.map((m, i) => (
                  <div key={m.id || i} className="flex items-center justify-between bg-black/30 rounded p-3 border border-gray-800/50">
                    <div><div className="font-medium text-sm">{m.operation_name}</div><div className="text-xs text-gray-500">{m.date} — {m.role_performed}{m.notes ? ` — ${m.notes}` : ''}</div></div>
                    <Button size="sm" variant="ghost" onClick={() => removeMission(m.id)} className="text-amber-500 hover:bg-amber-700/10 shrink-0"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Training History */}
        <Card className="bg-gray-900 border-gray-800" data-testid="admin-training-history">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg tracking-wider flex items-center gap-2"><Calendar className="w-5 h-5 text-tropic-gold" /> TRAINING HISTORY</CardTitle>
              <Dialog open={trainingDialogOpen} onOpenChange={setTrainingDialogOpen}>
                <DialogTrigger asChild><Button size="sm" className="bg-amber-700 hover:bg-amber-800" data-testid="add-training-btn"><Plus className="w-4 h-4 mr-1" />Add</Button></DialogTrigger>
                <DialogContent className="bg-gray-900 text-white border-gray-800">
                  <DialogHeader><DialogTitle>Add Training Record</DialogTitle></DialogHeader>
                  <form onSubmit={addTraining} className="space-y-3">
                    <div><Label>Course / Training Name</Label><Input required value={trainingForm.course_name} onChange={e => setTrainingForm({...trainingForm, course_name: e.target.value})} className="bg-black border-gray-700" data-testid="training-name-input" /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Completion Date</Label><Input required value={trainingForm.completion_date} onChange={e => setTrainingForm({...trainingForm, completion_date: e.target.value})} className="bg-black border-gray-700" placeholder="2026-01-15" /></div>
                      <div><Label>Instructor</Label><Input value={trainingForm.instructor} onChange={e => setTrainingForm({...trainingForm, instructor: e.target.value})} className="bg-black border-gray-700" /></div>
                    </div>
                    <div><Label>Notes / Certification</Label><Input value={trainingForm.notes} onChange={e => setTrainingForm({...trainingForm, notes: e.target.value})} className="bg-black border-gray-700" /></div>
                    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setTrainingDialogOpen(false)} className="border-gray-700">Cancel</Button><Button type="submit" className="bg-amber-700 hover:bg-amber-800" data-testid="training-submit-btn">Add</Button></div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {(!member.training_history?.length) ? <p className="text-sm text-gray-600">No training records.</p> : (
              <div className="space-y-2">
                {member.training_history.map((t, i) => (
                  <div key={t.id || i} className="flex items-center justify-between bg-black/30 rounded p-3 border border-gray-800/50">
                    <div><div className="font-medium text-sm">{t.course_name}</div><div className="text-xs text-gray-500">{t.completion_date}{t.instructor ? ` — ${t.instructor}` : ''}{t.notes ? ` — ${t.notes}` : ''}</div></div>
                    <Button size="sm" variant="ghost" onClick={() => removeTraining(t.id)} className="text-amber-500 hover:bg-amber-700/10 shrink-0"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Awards */}
        <Card className="bg-gray-900 border-gray-800" data-testid="admin-awards">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg tracking-wider flex items-center gap-2"><Award className="w-5 h-5 text-yellow-500" /> AWARDS & QUALIFICATIONS</CardTitle>
              <Dialog open={awardDialogOpen} onOpenChange={setAwardDialogOpen}>
                <DialogTrigger asChild><Button size="sm" className="bg-amber-700 hover:bg-amber-800" data-testid="add-award-btn"><Plus className="w-4 h-4 mr-1" />Add</Button></DialogTrigger>
                <DialogContent className="bg-gray-900 text-white border-gray-800">
                  <DialogHeader><DialogTitle>Add Award / Qualification</DialogTitle></DialogHeader>
                  <form onSubmit={addAward} className="space-y-3">
                    <div><Label>Award Name</Label><Input required value={awardForm.name} onChange={e => setAwardForm({...awardForm, name: e.target.value})} className="bg-black border-gray-700" data-testid="award-name-input" /></div>
                    <div><Label>Date</Label><Input value={awardForm.date} onChange={e => setAwardForm({...awardForm, date: e.target.value})} className="bg-black border-gray-700" placeholder="2026-01-15" /></div>
                    <div><Label>Description</Label><Input value={awardForm.description} onChange={e => setAwardForm({...awardForm, description: e.target.value})} className="bg-black border-gray-700" /></div>
                    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setAwardDialogOpen(false)} className="border-gray-700">Cancel</Button><Button type="submit" className="bg-amber-700 hover:bg-amber-800" data-testid="award-submit-btn">Add</Button></div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {(!member.awards?.length) ? <p className="text-sm text-gray-600">No awards.</p> : (
              <div className="space-y-2">
                {member.awards.map((a, i) => (
                  <div key={a.id || i} className="flex items-center justify-between bg-black/30 rounded p-3 border border-gray-800/50">
                    <div className="flex items-center gap-2"><Award className="w-4 h-4 text-yellow-600 shrink-0" /><div><div className="font-medium text-sm">{a.name}</div>{a.description && <div className="text-xs text-gray-500">{a.description}</div>}</div></div>
                    <div className="flex items-center gap-2">{a.date && <span className="text-xs text-gray-600">{a.date}</span>}<Button size="sm" variant="ghost" onClick={() => removeAward(a.id)} className="text-amber-500 hover:bg-amber-700/10"><Trash2 className="w-4 h-4" /></Button></div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminMemberDetail;

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
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
import { useAuth } from '@/context/AuthContext';
import { hasPermission, PERMISSIONS } from '@/utils/permissions';

import { BACKEND_URL, API } from '@/utils/api';
const resolveImg = (url) => { if (!url) return ''; if (url.startsWith('http')) return url; if (url.startsWith('/uploads/')) return `${BACKEND_URL}/api${url}`; return `${BACKEND_URL}${url}`; };

const AdminMemberDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
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

  // Role-based access: full admin vs training-staff (limited to training fields only)
  const role = authUser?.role || 'member';
  const canManageUsers = hasPermission(role, PERMISSIONS.MANAGE_USERS);
  const canEditTrainingFields = hasPermission(role, PERMISSIONS.EDIT_MEMBER_TRAINING_FIELDS);
  const isTrainingStaffOnly = !canManageUsers && canEditTrainingFields;

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
        billet: member.billet || undefined,
        billet_acronym: member.billet_acronym || undefined
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
    try {
      await axios.delete(`${API}/admin/users/${id}/mission-history/${entryId}`);
      await fetchMember();
    } catch (e) { alert(e.response?.data?.detail || 'Error removing mission'); }
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
    try {
      await axios.delete(`${API}/admin/users/${id}/training-history/${entryId}`);
      await fetchMember();
    } catch (e) { alert(e.response?.data?.detail || 'Error removing training record'); }
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
    try {
      await axios.delete(`${API}/admin/users/${id}/awards/${entryId}`);
      await fetchMember();
    } catch (e) { alert(e.response?.data?.detail || 'Error removing award'); }
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
            <SelectTrigger className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] flex-1"><SelectValue placeholder={placeholder} /></SelectTrigger>
            <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)] max-h-60">
              <SelectItem value="__none__">— None —</SelectItem>
              {options?.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
              {isCustom && <SelectItem value="__custom__">{currentValue} (custom)</SelectItem>}
            </SelectContent>
          </Select>
          <Input 
            value={currentValue} 
            onChange={e => setMember({ ...member, [field]: e.target.value })} 
            className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] w-full md:w-40" 
            placeholder="Or type custom..."
          />
        </div>
      </div>
    );
  };

  if (loading) return <div className="text-center py-12">Loading member...</div>;
  if (!member) return <div className="text-center py-12">Member not found</div>;

  return (
    <>
      <div className="space-y-6 max-w-4xl">
        <div className="relative corner-bracket flex flex-col gap-4 border border-tropic-gold/15 bg-[radial-gradient(circle_at_top,rgba(201,162,39,0.06),#050a0e_58%)] px-6 py-6 shadow-2xl md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Link to="/admin/users"><Button size="sm" variant="outline" className="border-tropic-gold/25 bg-[#050a0e]/40 text-tropic-gold hover:bg-tropic-gold/10"><ArrowLeft className="w-4 h-4 mr-1" />Members</Button></Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#c9a227]" style={{ fontFamily: "'Oswald', sans-serif" }}>Member Workspace</p>
              <h1 className="mt-2 text-3xl font-bold tracking-wider text-white" style={{ fontFamily: "'Share Tech', sans-serif" }} data-testid="admin-member-title">{member.username}</h1>
              <p className="text-sm text-[#8a9aa8]">{member.email}</p>
            </div>
          </div>
          {!isTrainingStaffOnly && <Button onClick={handleSaveProfile} disabled={saving} className="bg-tropic-gold hover:bg-tropic-gold-dark text-black" data-testid="admin-save-profile-btn"><Save className="w-4 h-4 mr-2" />{saving ? 'Saving...' : 'Save Profile'}</Button>}
        </div>

        {message.text && <Alert className={message.type === 'success' ? 'bg-green-900/20 border-green-700' : 'bg-tropic-red/10 border-tropic-red/60'}>{message.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}<AlertDescription>{message.text}</AlertDescription></Alert>}

        {/* Profile fields */}
        {isTrainingStaffOnly ? (
          /* Training Staff: read-only view of identity */
          <Card className="border-tropic-gold/12 bg-[#0b1016] shadow-xl">
            <CardHeader className="pb-3"><CardTitle className="text-lg tracking-wider">IDENTITY & ASSIGNMENT</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {member.avatar_url && <img src={resolveImg(member.avatar_url)} alt="avatar" className="w-16 h-16 rounded-lg object-cover" />}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><Label className="text-[#4a6070]">Username</Label><p className="text-sm">{member.username || '—'}</p></div>
                <div><Label className="text-[#4a6070]">Role</Label><p className="text-sm">{member.role || '—'}</p></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><Label className="text-[#4a6070]">Rank</Label><p className="text-sm">{member.rank || '—'}</p></div>
                <div><Label className="text-[#4a6070]">Specialization / MOS</Label><p className="text-sm">{member.specialization || '—'}</p></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><Label className="text-[#4a6070]">Status</Label><p className="text-sm">{member.status || '—'}</p></div>
                <div><Label className="text-[#4a6070]">Squad / Team</Label><p className="text-sm">{member.squad || '—'}</p></div>
                <div><Label className="text-[#4a6070]">Timezone</Label><p className="text-sm">{member.timezone || '—'}</p></div>
              </div>
              {member.favorite_role && <div><Label className="text-[#4a6070]">Preferred Role / Loadout</Label><p className="text-sm">{member.favorite_role}</p></div>}
              {member.bio && <div><Label className="text-[#4a6070]">Bio</Label><p className="text-sm text-[#8a9aa8] whitespace-pre-wrap">{member.bio}</p></div>}
            </CardContent>
          </Card>
        ) : (
        <Card className="border-tropic-gold/12 bg-[#0b1016] shadow-xl">
          <CardHeader className="pb-3"><CardTitle className="text-lg tracking-wider">IDENTITY & ASSIGNMENT</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <ImageUpload value={member.avatar_url || ''} onChange={url => setMember({ ...member, avatar_url: url })} label="Avatar" description="Profile photo. 300x300px recommended." previewClass="w-16 h-16 rounded-lg object-cover" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>Username</Label><Input value={member.username || ''} onChange={e => setMember({ ...member, username: e.target.value })} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" /></div>
              <div><Label>Role</Label>
                <Select value={member.role} onValueChange={v => setMember({ ...member, role: v })}>
                  <SelectTrigger className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]">
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="admin">Admin (S-1)</SelectItem>
                    <SelectItem value="s1_personnel">S-1 Personnel</SelectItem>
                    <SelectItem value="s2_intelligence">S-2 Intelligence</SelectItem>
                    <SelectItem value="s3_operations">S-3 Operations</SelectItem>
                    <SelectItem value="s4_logistics">S-4 Logistics</SelectItem>
                    <SelectItem value="s5_civil_affairs">S-5 Civil Affairs</SelectItem>
                    <SelectItem value="s6_communications">S-6 Communications</SelectItem>
                    <SelectItem value="training_staff">Training Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {renderTagSelect('rank', 'Rank', unitTags?.ranks, 'Select rank...')}
              {renderTagSelect('specialization', 'Specialization / MOS', unitTags?.specializations, 'Select spec...')}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><Label>Status</Label>
                <Select value={member.status || 'recruit'} onValueChange={v => setMember({ ...member, status: v })}>
                  <SelectTrigger className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]">{(unitTags?.statuses || ['recruit', 'active', 'reserve', 'staff', 'command', 'inactive']).map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {renderTagSelect('squad', 'Squad / Team', unitTags?.squads, 'Select squad...')}
              <div><Label>Timezone</Label><Input value={member.timezone || ''} onChange={e => setMember({ ...member, timezone: e.target.value })} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" placeholder="e.g., EST" /></div>
            </div>
            <div><Label>Preferred Role / Loadout</Label><Input value={member.favorite_role || ''} onChange={e => setMember({ ...member, favorite_role: e.target.value })} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" /></div>
            <div><Label>Bio</Label><Textarea value={member.bio || ''} onChange={e => setMember({ ...member, bio: e.target.value })} rows={3} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" /></div>
          </CardContent>
        </Card>
        )}

        {/* Unit Assignment, Discord, Mission History — hidden for training staff */}
        {!isTrainingStaffOnly && (
        <>
        {/* Unit Assignment (Hierarchy) */}
        <Card className="border-tropic-gold/12 bg-[#0b1016] shadow-xl" data-testid="admin-unit-assignment">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg tracking-wider flex items-center gap-2">
              <Building2 className="w-5 h-5 text-tropic-gold" /> UNIT ASSIGNMENT
            </CardTitle>
            <p className="text-xs text-[#4a6070] mt-1">Assign this member to a position in the unit hierarchy. Used for the organizational roster view.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {renderTagSelect('company', 'Company', unitTags?.companies, 'Select company...')}
              {renderTagSelect('platoon', 'Platoon', unitTags?.platoons, 'Select platoon...')}
              {renderTagSelect('billet', 'Billet / Position', unitTags?.billets, 'Select billet...')}
            </div>
            <div>
              <Label>Billet Acronym</Label>
              <Input value={member.billet_acronym || ''} onChange={e => setMember({...member, billet_acronym: e.target.value})} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" placeholder="e.g., SL, PL, PSG, CO" />
            </div>
          </CardContent>
        </Card>

        {/* Discord Integration Prep */}
        <Card className="border-tropic-gold/12 bg-[#0b1016] shadow-xl" data-testid="admin-discord-fields">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg tracking-wider flex items-center gap-2">
              <Link2 className="w-5 h-5 text-tropic-gold" /> DISCORD INTEGRATION PREP
            </CardTitle>
            <p className="text-xs text-[#4a6070] mt-1">These fields prepare the account for future Discord OAuth linking. They are not active OAuth controls — values here will be overwritten when Discord linking goes live.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Discord ID</Label>
                <Input value={member.discord_id || ''} onChange={e => setMember({ ...member, discord_id: e.target.value })} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" placeholder="e.g., 123456789012345678" data-testid="discord-id-input" />
              </div>
              <div>
                <Label>Discord Username</Label>
                <Input value={member.discord_username || ''} onChange={e => setMember({ ...member, discord_username: e.target.value })} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" placeholder="e.g., operator#1234" data-testid="discord-username-input" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Discord Avatar URL</Label>
                <Input value={member.discord_avatar || ''} disabled className="bg-[#050a0e]/40 border-[rgba(201,162,39,0.12)] text-[#4a6070] cursor-not-allowed" placeholder="Auto-populated by Discord OAuth" data-testid="discord-avatar-input" />
                <p className="text-[10px] text-[#4a6070] mt-1">Read-only — set automatically during Discord linking</p>
              </div>
              <div>
                <Label>Discord Linked</Label>
                <div className="flex items-center gap-2 mt-2">
                  <Badge className={`${member.discord_linked ? 'bg-green-700' : 'bg-[#111a24]'} text-white`} data-testid="discord-linked-badge">
                    {member.discord_linked ? 'LINKED' : 'NOT LINKED'}
                  </Badge>
                  <p className="text-[10px] text-[#4a6070]">Status managed by the OAuth flow</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Mission History */}
        <Card className="border-tropic-gold/12 bg-[#0b1016] shadow-xl" data-testid="admin-mission-history">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg tracking-wider flex items-center gap-2"><Target className="w-5 h-5 text-tropic-gold" /> MISSION HISTORY</CardTitle>
              <Dialog open={missionDialogOpen} onOpenChange={setMissionDialogOpen}>
                <DialogTrigger asChild><Button size="sm" className="bg-tropic-gold hover:bg-tropic-gold-dark text-black" data-testid="add-mission-btn"><Plus className="w-4 h-4 mr-1" />Add</Button></DialogTrigger>
        <DialogContent className="bg-[#0b1016] text-white border-tropic-gold/15">
                  <DialogHeader><DialogTitle>Add Mission Record</DialogTitle></DialogHeader>
                  <form onSubmit={addMission} className="space-y-3">
                    <div><Label>Operation Name</Label><Input required value={missionForm.operation_name} onChange={e => setMissionForm({...missionForm, operation_name: e.target.value})} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" data-testid="mission-name-input" /></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div><Label>Date</Label><Input required value={missionForm.date} onChange={e => setMissionForm({...missionForm, date: e.target.value})} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" placeholder="2026-01-15" /></div>
                      <div><Label>Role Performed</Label><Input required value={missionForm.role_performed} onChange={e => setMissionForm({...missionForm, role_performed: e.target.value})} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" placeholder="e.g., Squad Lead" /></div>
                    </div>
                    <div><Label>Notes</Label><Input value={missionForm.notes} onChange={e => setMissionForm({...missionForm, notes: e.target.value})} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" /></div>
                    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setMissionDialogOpen(false)} className="border-[rgba(201,162,39,0.15)]">Cancel</Button><Button type="submit" className="bg-tropic-gold hover:bg-tropic-gold-dark text-black" data-testid="mission-submit-btn">Add</Button></div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {(!member.mission_history?.length) ? <p className="text-sm text-[#4a6070]">No mission records.</p> : (
              <div className="space-y-2">
                {member.mission_history.map((m, i) => (
                  <div key={m.id || i} className="flex items-center justify-between bg-[#050a0e]/30 rounded p-3 border border-[rgba(201,162,39,0.12)]/50">
                    <div><div className="font-medium text-sm">{m.operation_name}</div><div className="text-xs text-[#4a6070]">{m.date} — {m.role_performed}{m.notes ? ` — ${m.notes}` : ''}</div></div>
                    <Button size="sm" variant="ghost" onClick={() => removeMission(m.id)} className="text-tropic-red hover:bg-tropic-red/10 shrink-0"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        </>
        )}

        {/* Training History */}
        <Card className="border-tropic-gold/12 bg-[#0b1016] shadow-xl" data-testid="admin-training-history">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg tracking-wider flex items-center gap-2"><Calendar className="w-5 h-5 text-tropic-gold" /> TRAINING HISTORY</CardTitle>
              <Dialog open={trainingDialogOpen} onOpenChange={setTrainingDialogOpen}>
                <DialogTrigger asChild><Button size="sm" className="bg-tropic-gold hover:bg-tropic-gold-dark text-black" data-testid="add-training-btn"><Plus className="w-4 h-4 mr-1" />Add</Button></DialogTrigger>
        <DialogContent className="bg-[#0b1016] text-white border-tropic-gold/15">
                  <DialogHeader><DialogTitle>Add Training Record</DialogTitle></DialogHeader>
                  <form onSubmit={addTraining} className="space-y-3">
                    <div><Label>Course / Training Name</Label><Input required value={trainingForm.course_name} onChange={e => setTrainingForm({...trainingForm, course_name: e.target.value})} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" data-testid="training-name-input" /></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div><Label>Completion Date</Label><Input required value={trainingForm.completion_date} onChange={e => setTrainingForm({...trainingForm, completion_date: e.target.value})} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" placeholder="2026-01-15" /></div>
                      <div><Label>Instructor</Label><Input value={trainingForm.instructor} onChange={e => setTrainingForm({...trainingForm, instructor: e.target.value})} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" /></div>
                    </div>
                    <div><Label>Notes / Certification</Label><Input value={trainingForm.notes} onChange={e => setTrainingForm({...trainingForm, notes: e.target.value})} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" /></div>
                    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setTrainingDialogOpen(false)} className="border-[rgba(201,162,39,0.15)]">Cancel</Button><Button type="submit" className="bg-tropic-gold hover:bg-tropic-gold-dark text-black" data-testid="training-submit-btn">Add</Button></div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {(!member.training_history?.length) ? <p className="text-sm text-[#4a6070]">No training records.</p> : (
              <div className="space-y-2">
                {member.training_history.map((t, i) => (
                  <div key={t.id || i} className="flex items-center justify-between bg-[#050a0e]/30 rounded p-3 border border-[rgba(201,162,39,0.12)]/50">
                    <div><div className="font-medium text-sm">{t.course_name}</div><div className="text-xs text-[#4a6070]">{t.completion_date}{t.instructor ? ` — ${t.instructor}` : ''}{t.notes ? ` — ${t.notes}` : ''}</div></div>
                    <Button size="sm" variant="ghost" onClick={() => removeTraining(t.id)} className="text-tropic-red hover:bg-tropic-red/10 shrink-0"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Awards */}
        <Card className="border-tropic-gold/12 bg-[#0b1016] shadow-xl" data-testid="admin-awards">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg tracking-wider flex items-center gap-2"><Award className="w-5 h-5 text-yellow-500" /> AWARDS & QUALIFICATIONS</CardTitle>
              <Dialog open={awardDialogOpen} onOpenChange={setAwardDialogOpen}>
                <DialogTrigger asChild><Button size="sm" className="bg-tropic-gold hover:bg-tropic-gold-dark text-black" data-testid="add-award-btn"><Plus className="w-4 h-4 mr-1" />Add</Button></DialogTrigger>
        <DialogContent className="bg-[#0b1016] text-white border-tropic-gold/15">
                  <DialogHeader><DialogTitle>Add Award / Qualification</DialogTitle></DialogHeader>
                  <form onSubmit={addAward} className="space-y-3">
                    <div><Label>Award Name</Label><Input required value={awardForm.name} onChange={e => setAwardForm({...awardForm, name: e.target.value})} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" data-testid="award-name-input" /></div>
                    <div><Label>Date</Label><Input value={awardForm.date} onChange={e => setAwardForm({...awardForm, date: e.target.value})} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" placeholder="2026-01-15" /></div>
                    <div><Label>Description</Label><Input value={awardForm.description} onChange={e => setAwardForm({...awardForm, description: e.target.value})} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)]" /></div>
                    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setAwardDialogOpen(false)} className="border-[rgba(201,162,39,0.15)]">Cancel</Button><Button type="submit" className="bg-tropic-gold hover:bg-tropic-gold-dark text-black" data-testid="award-submit-btn">Add</Button></div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {(!member.awards?.length) ? <p className="text-sm text-[#4a6070]">No awards.</p> : (
              <div className="space-y-2">
                {member.awards.map((a, i) => (
                  <div key={a.id || i} className="flex items-center justify-between bg-[#050a0e]/30 rounded p-3 border border-[rgba(201,162,39,0.12)]/50">
                    <div className="flex items-center gap-2"><Award className="w-4 h-4 text-yellow-600 shrink-0" /><div><div className="font-medium text-sm">{a.name}</div>{a.description && <div className="text-xs text-[#4a6070]">{a.description}</div>}</div></div>
                    <div className="flex items-center gap-2">{a.date && <span className="text-xs text-[#4a6070]">{a.date}</span>}<Button size="sm" variant="ghost" onClick={() => removeAward(a.id)} className="text-tropic-red hover:bg-tropic-red/10"><Trash2 className="w-4 h-4" /></Button></div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default AdminMemberDetail;

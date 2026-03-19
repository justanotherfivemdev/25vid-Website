import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Save, CheckCircle, AlertCircle, Home, LogOut, Link2, Unlink, Lock } from 'lucide-react';
import ImageUpload from '@/components/admin/ImageUpload';
import { useAuth } from '@/context/AuthContext';

import { BACKEND_URL, API } from '@/utils/api';

const EditProfile = () => {
  const { logout } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [unlinking, setUnlinking] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ email: '', password: '', confirm: '' });
  const [settingPassword, setSettingPassword] = useState(false);
  const [discordAvailable, setDiscordAvailable] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    axios.get(`${API}/auth/me`)
      .then(r => setProfile(r.data))
      .catch(() => navigate('/login'))
      .finally(() => setLoading(false));

    // Check if Discord OAuth is enabled on the backend
    axios.get(`${API}/auth/discord`).then(() => setDiscordAvailable(true)).catch(() => {});

    // Check for Discord link callback
    const params = new URLSearchParams(window.location.search);
    if (params.get('discord_linked') === 'true') {
      setMessage({ type: 'success', text: 'Discord account linked successfully!' });
      window.history.replaceState({}, '', '/hub/profile');
    } else if (params.get('discord_error')) {
      const errorMap = {
        discord_already_linked_to_another_account: 'This Discord account is already linked to another member.',
        invalid_link_state: 'Link session expired. Please try again.',
      };
      setMessage({ type: 'error', text: errorMap[params.get('discord_error')] || `Discord error: ${params.get('discord_error')}` });
      window.history.replaceState({}, '', '/hub/profile');
    }
  }, [navigate]);

  const handleSave = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const payload = {
        avatar_url: profile.avatar_url || null,
        bio: profile.bio || null,
        timezone: profile.timezone || null,
        favorite_role: profile.favorite_role || null
      };
      const res = await axios.put(`${API}/profile`, payload);
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...stored, ...res.data }));
      setMessage({ type: 'success', text: 'Profile updated successfully.' });
    } catch (e) {
      setMessage({ type: 'error', text: e.response?.data?.detail || 'Failed to save profile.' });
    } finally { setSaving(false); }
  };

  const handleLogout = async () => { await logout(); navigate('/'); };

  const handleLinkDiscord = async () => {
    try {
      const res = await axios.get(`${API}/auth/discord/link`);
      window.location.href = res.data.url;
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Could not start Discord linking.' });
    }
  };

  const handleUnlinkDiscord = async () => {
    if (!window.confirm('Unlink your Discord account? You can re-link it later.')) return;
    setUnlinking(true);
    try {
      await axios.delete(`${API}/auth/discord/unlink`);
      setProfile({ ...profile, discord_linked: false, discord_id: null, discord_username: null, discord_avatar: null });
      setMessage({ type: 'success', text: 'Discord account unlinked.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to unlink Discord.' });
    } finally { setUnlinking(false); }
  };

  const handleSetPassword = async (e) => {
    e.preventDefault();
    if (passwordForm.password !== passwordForm.confirm) {
      setMessage({ type: 'error', text: 'Passwords do not match.' });
      return;
    }
    if (passwordForm.password.length < 8) {
      setMessage({ type: 'error', text: 'Password must be at least 8 characters.' });
      return;
    }
    setSettingPassword(true);
    setMessage({ type: '', text: '' });
    try {
      const res = await axios.post(`${API}/auth/set-password`, {
        email: passwordForm.email,
        password: passwordForm.password
      });
      // Cookie is set by backend — update profile
      setProfile({ ...profile, email: passwordForm.email });
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...stored, email: passwordForm.email }));
      setPasswordForm({ email: '', password: '', confirm: '' });
      setMessage({ type: 'success', text: res.data.message });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to set password.' });
    } finally { setSettingPassword(false); }
  };

  if (loading) return <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-black text-white">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/92 backdrop-blur-xl border-b border-tropic-gold/15">
        <div className="container mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/hub"><Button size="sm" variant="outline" className="border-gray-700"><ArrowLeft className="w-4 h-4 mr-1" />Hub</Button></Link>
            <h1 className="text-xl font-bold tracking-widest" style={{ fontFamily: 'Rajdhani, sans-serif' }}>EDIT PROFILE</h1>
          </div>
          <div className="flex items-center space-x-3">
            <Link to="/"><Button size="sm" variant="outline" className="border-gray-700"><Home className="w-4 h-4" /></Button></Link>
            <Button size="sm" variant="outline" onClick={handleLogout} className="border-gray-700"><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </nav>

      <div className="pt-20 pb-12 px-4 md:px-6">
        <div className="container mx-auto max-w-2xl space-y-6">
          {message.text && (
            <Alert className={message.type === 'success' ? 'bg-green-900/20 border-green-700' : 'bg-tropic-red/10 border-tropic-red/60'}>
              {message.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          )}

          {/* Read-only info */}
          <Card className="bg-gray-900/80 border-gray-800">
            <CardHeader className="pb-3"><CardTitle className="text-lg tracking-wider">YOUR DETAILS</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div><span className="text-gray-500 text-xs block">Username</span>{profile.username}</div>
                <div><span className="text-gray-500 text-xs block">Email</span>{profile.email}</div>
                <div><span className="text-gray-500 text-xs block">Rank</span><span className="text-gray-400">{profile.rank || 'Not assigned'}</span></div>
                <div><span className="text-gray-500 text-xs block">Specialization</span><span className="text-gray-400">{profile.specialization || 'Not assigned'}</span></div>
                <div><span className="text-gray-500 text-xs block">Status</span><span className="text-gray-400">{profile.status || 'recruit'}</span></div>
                <div><span className="text-gray-500 text-xs block">Squad</span><span className="text-gray-400">{profile.squad || 'Unassigned'}</span></div>
              </div>
              <p className="text-xs text-gray-600 mt-4">Rank, specialization, status, and squad are managed by unit command. Contact an admin to update these fields.</p>
            </CardContent>
          </Card>

          {/* Editable fields */}
          <Card className="bg-gray-900/80 border-gray-800">
            <CardHeader className="pb-3"><CardTitle className="text-lg tracking-wider">EDITABLE FIELDS</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <ImageUpload
                value={profile.avatar_url || ''}
                onChange={url => setProfile({ ...profile, avatar_url: url })}
                label="Profile Photo"
                description="Appears on your roster card and profile page. Recommended: 300x300px square."
                previewClass="w-20 h-20 rounded-lg object-cover"
              />
              <div>
                <Label>Bio</Label>
                <p className="text-xs text-gray-500 mb-1">A short personal or in-character description.</p>
                <Textarea value={profile.bio || ''} onChange={e => setProfile({ ...profile, bio: e.target.value })} rows={3} className="bg-black border-gray-700" placeholder="Tell the unit about yourself..." data-testid="profile-bio-input" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Timezone</Label>
                  <p className="text-xs text-gray-500 mb-1">Helps with op scheduling.</p>
                  <Input value={profile.timezone || ''} onChange={e => setProfile({ ...profile, timezone: e.target.value })} className="bg-black border-gray-700" placeholder="e.g., EST, UTC+2, PST" data-testid="profile-tz-input" />
                </div>
                <div>
                  <Label>Preferred Role / Loadout</Label>
                  <p className="text-xs text-gray-500 mb-1">Your go-to kit or position.</p>
                  <Input value={profile.favorite_role || ''} onChange={e => setProfile({ ...profile, favorite_role: e.target.value })} className="bg-black border-gray-700" placeholder="e.g., Pointman, DMR, Medic" data-testid="profile-role-input" />
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <Button onClick={handleSave} disabled={saving} className="bg-tropic-red hover:bg-tropic-red-dark px-8" data-testid="profile-save-btn"><Save className="w-4 h-4 mr-2" />{saving ? 'Saving...' : 'Save Profile'}</Button>
              </div>
            </CardContent>
          </Card>

          {/* Discord Integration — only shown when backend has Discord configured */}
          {discordAvailable && (
          <Card className="bg-gray-900/80 border-gray-800" data-testid="discord-section">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg tracking-wider flex items-center gap-2">
                <svg className="w-5 h-5 text-[#5865F2]" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z"/></svg>
                DISCORD
              </CardTitle>
            </CardHeader>
            <CardContent>
              {profile.discord_linked ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-4 bg-black/30 rounded-lg p-4 border border-[#5865F2]/30">
                    {profile.discord_avatar && (
                      <img src={profile.discord_avatar} alt="Discord avatar" className="w-12 h-12 rounded-full border-2 border-[#5865F2]/50" />
                    )}
                    <div className="flex-1">
                      <div className="text-sm font-medium text-white">{profile.discord_username}</div>
                      <div className="text-xs text-gray-500">ID: {profile.discord_id}</div>
                    </div>
                    <span className="text-xs bg-[#5865F2]/20 text-[#5865F2] border border-[#5865F2]/30 px-2 py-1 rounded">LINKED</span>
                  </div>
                  <Button
                    onClick={handleUnlinkDiscord}
                    disabled={unlinking}
                    variant="outline"
                    className="border-tropic-red/60 text-tropic-red hover:bg-tropic-red/10"
                    data-testid="discord-unlink-btn"
                  >
                    <Unlink className="w-4 h-4 mr-2" />{unlinking ? 'Unlinking...' : 'Unlink Discord'}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-400">Link your Discord account for quick login and unit identification.</p>
                  <Button
                    onClick={handleLinkDiscord}
                    className="bg-[#5865F2] hover:bg-[#4752C4] text-white"
                    data-testid="discord-link-btn"
                  >
                    <Link2 className="w-4 h-4 mr-2" />Link Discord Account
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          )}

          {/* Set Password — for Discord-only users */}
          {profile.email?.endsWith('@25thid.local') && (
            <Card className="bg-gray-900/80 border-yellow-700/40" data-testid="set-password-section">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg tracking-wider flex items-center gap-2">
                  <Lock className="w-5 h-5 text-tropic-gold" /> SET EMAIL & PASSWORD
                </CardTitle>
                <p className="text-xs text-gray-500 mt-1">Your account was created via Discord. Add an email and password to enable password-based login and allow Discord unlinking.</p>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSetPassword} className="space-y-4">
                  <div>
                    <Label>Email Address</Label>
                    <Input
                      type="email"
                      required
                      value={passwordForm.email}
                      onChange={e => setPasswordForm({ ...passwordForm, email: e.target.value })}
                      className="bg-black border-gray-700"
                      placeholder="your.real@email.com"
                      data-testid="set-email-input"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Password</Label>
                      <Input
                        type="password"
                        required
                        minLength={8}
                        value={passwordForm.password}
                        onChange={e => setPasswordForm({ ...passwordForm, password: e.target.value })}
                        className="bg-black border-gray-700"
                        placeholder="Min 8 characters"
                        data-testid="set-password-input"
                      />
                    </div>
                    <div>
                      <Label>Confirm Password</Label>
                      <Input
                        type="password"
                        required
                        value={passwordForm.confirm}
                        onChange={e => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                        className="bg-black border-gray-700"
                        placeholder="Confirm"
                        data-testid="set-password-confirm"
                      />
                    </div>
                  </div>
                  <Button type="submit" disabled={settingPassword} className="bg-yellow-700 hover:bg-yellow-800 text-white" data-testid="set-password-btn">
                    <Lock className="w-4 h-4 mr-2" />{settingPassword ? 'Setting...' : 'Set Email & Password'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default EditProfile;

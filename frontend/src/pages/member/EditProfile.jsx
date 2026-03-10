import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Save, CheckCircle, AlertCircle, Home, LogOut } from 'lucide-react';
import ImageUpload from '@/components/admin/ImageUpload';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const EditProfile = () => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    axios.get(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setProfile(r.data))
      .catch(() => navigate('/login'))
      .finally(() => setLoading(false));
  }, [navigate]);

  const handleSave = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const token = localStorage.getItem('token');
      const payload = {
        avatar_url: profile.avatar_url || null,
        bio: profile.bio || null,
        timezone: profile.timezone || null,
        favorite_role: profile.favorite_role || null
      };
      const res = await axios.put(`${API}/profile`, payload, { headers: { Authorization: `Bearer ${token}` } });
      // Update local storage with new profile data
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...stored, ...res.data }));
      setMessage({ type: 'success', text: 'Profile updated successfully.' });
    } catch (e) {
      setMessage({ type: 'error', text: e.response?.data?.detail || 'Failed to save profile.' });
    } finally { setSaving(false); }
  };

  const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); navigate('/'); };

  if (loading) return <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-black text-white">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur border-b border-red-900/30">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
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

      <div className="pt-20 pb-12 px-6">
        <div className="container mx-auto max-w-2xl space-y-6">
          {message.text && (
            <Alert className={message.type === 'success' ? 'bg-green-900/20 border-green-700' : 'bg-red-900/20 border-red-700'}>
              {message.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          )}

          {/* Read-only info */}
          <Card className="bg-gray-900/80 border-gray-800">
            <CardHeader className="pb-3"><CardTitle className="text-lg tracking-wider">YOUR DETAILS</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
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
              <div className="grid grid-cols-2 gap-4">
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
                <Button onClick={handleSave} disabled={saving} className="bg-red-700 hover:bg-red-800 px-8" data-testid="profile-save-btn"><Save className="w-4 h-4 mr-2" />{saving ? 'Saving...' : 'Save Profile'}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default EditProfile;

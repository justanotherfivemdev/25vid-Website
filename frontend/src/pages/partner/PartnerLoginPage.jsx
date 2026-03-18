import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Shield, Users } from 'lucide-react';
import { API } from '@/utils/api';

const PartnerLoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('login'); // 'login' | 'register'
  const [formData, setFormData] = useState({ email: '', password: '', username: '', rank: '', invite_token: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    axios.get(`${API}/auth/me`)
      .then(res => {
        login(res.data);
        const dest = res.data.partner_role ? '/partner' : (res.data.role === 'admin' ? '/admin' : '/hub');
        navigate(dest, { replace: true });
      })
      .catch(() => {});
  }, [navigate, login]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(''); setNotice(''); setSubmitting(true);
    try {
      const res = await axios.post(`${API}/auth/login`, { email: formData.email, password: formData.password });
      login(res.data.user);
      const user = res.data.user;
      if (user.partner_role) {
        navigate('/partner', { replace: true });
      } else if (user.role === 'admin') {
        navigate('/admin', { replace: true });
      } else {
        navigate('/hub', { replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Check your credentials.');
    } finally { setSubmitting(false); }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError(''); setNotice(''); setSubmitting(true);
    try {
      const res = await axios.post(`${API}/partner/register`, {
        invite_token: formData.invite_token,
        email: formData.email,
        username: formData.username,
        password: formData.password,
        rank: formData.rank || undefined,
      });
      login(res.data.user);
      navigate('/partner', { replace: true });
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed. Check your invite token.');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-black text-white">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Shield className="w-8 h-8 text-tropic-gold" />
            <h1 className="text-3xl font-bold tracking-wider" style={{ fontFamily: 'Rajdhani, sans-serif' }}>S-5 LIAISON AREA</h1>
          </div>
          <p className="text-gray-400 text-sm tracking-wide">25th Infantry Division — Partner Unit Portal</p>
          <div className="mt-2 inline-flex items-center gap-1 bg-tropic-gold/10 border border-tropic-gold/30 rounded px-3 py-1">
            <Users className="w-3 h-3 text-tropic-gold" />
            <span className="text-tropic-gold text-xs font-semibold tracking-widest">PARTNER ACCESS</span>
          </div>
        </div>

        <Card className="bg-gray-900/90 border border-tropic-gold/30">
          <CardHeader>
            <div className="flex border-b border-gray-800 mb-2">
              <button
                onClick={() => { setTab('login'); setError(''); }}
                className={`flex-1 py-2 text-sm font-semibold tracking-wider transition-colors ${tab === 'login' ? 'text-tropic-gold border-b-2 border-tropic-gold' : 'text-gray-500 hover:text-gray-300'}`}
              >LOGIN</button>
              <button
                onClick={() => { setTab('register'); setError(''); }}
                className={`flex-1 py-2 text-sm font-semibold tracking-wider transition-colors ${tab === 'register' ? 'text-tropic-gold border-b-2 border-tropic-gold' : 'text-gray-500 hover:text-gray-300'}`}
              >JOIN UNIT</button>
            </div>
          </CardHeader>
          <CardContent>
            {tab === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-300">Email</label>
                  <Input type="email" required className="bg-black/50 border-gray-700" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-300">Password</label>
                  <Input type="password" required className="bg-black/50 border-gray-700" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                </div>
                {error && <p className="text-tropic-gold text-sm text-center">{error}</p>}
                {notice && <p className="text-green-400 text-sm text-center">{notice}</p>}
                <Button type="submit" disabled={submitting} className="w-full bg-tropic-gold hover:bg-tropic-gold-light text-black py-5 tracking-wider font-bold">
                  {submitting ? 'Authenticating...' : 'ACCESS PARTNER HUB'}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-300">Invite Token</label>
                  <Input type="text" required placeholder="Provided by your unit admin or 25th ID S-5" className="bg-black/50 border-gray-700" value={formData.invite_token} onChange={e => setFormData({...formData, invite_token: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-300">Username</label>
                  <Input type="text" required className="bg-black/50 border-gray-700" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-300">Email</label>
                  <Input type="email" required className="bg-black/50 border-gray-700" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-300">Password</label>
                  <Input type="password" required minLength={8} className="bg-black/50 border-gray-700" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-300">Rank (Optional)</label>
                  <Input type="text" className="bg-black/50 border-gray-700" value={formData.rank} onChange={e => setFormData({...formData, rank: e.target.value})} />
                </div>
                {error && <p className="text-tropic-gold text-sm text-center">{error}</p>}
                {notice && <p className="text-green-400 text-sm text-center">{notice}</p>}
                <Button type="submit" disabled={submitting} className="w-full bg-tropic-gold hover:bg-tropic-gold-light text-black py-5 tracking-wider font-bold">
                  {submitting ? 'Registering...' : 'JOIN PARTNER UNIT'}
                </Button>
              </form>
            )}
            <div className="mt-6 text-center space-y-2">
              <div className="text-xs text-gray-600 border-t border-gray-800 pt-4">
                Partner Unit access requires an invite from your unit admin or the 25th ID S-5 Office.
              </div>
            </div>
          </CardContent>
        </Card>
        <div className="mt-4 text-center space-y-2">
          <Link to="/login" className="block text-sm text-gray-500 hover:text-tropic-gold transition-colors">25th ID Member? Login here →</Link>
          <Link to="/" className="block text-sm text-gray-600 hover:text-gray-400 transition-colors">← Back to Home</Link>
        </div>
      </div>
    </div>
  );
};

export default PartnerLoginPage;

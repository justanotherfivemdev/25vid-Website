import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Shield } from 'lucide-react';
import { BACKEND_URL, API } from '@/utils/api';

const resolveImg = (url) => { if (!url) return ''; if (url.startsWith('http')) return url; if (url.startsWith('/uploads/')) return `${BACKEND_URL}/api${url}`; return `${BACKEND_URL}${url}`; };

const PartnerLoginPage = () => {
  const [mode, setMode] = useState('login'); // login | register
  const [formData, setFormData] = useState({ email: '', password: '', username: '', invite_code: '', rank: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [bgConfig, setBgConfig] = useState(null);
  const navigate = useNavigate();

  // Fetch site content for partner login background
  useEffect(() => {
    axios.get(`${API}/site-content`)
      .then(res => {
        if (res.data?.partnerLogin) {
          setBgConfig(res.data.partnerLogin);
        }
      })
      .catch(err => console.error('Failed to fetch partner login config:', err));
  }, []);

  // If already authenticated as partner, redirect
  useEffect(() => {
    axios.get(`${API}/auth/partner/me`)
      .then(res => {
        if (res.data?.account_type === 'partner') {
          navigate(res.data.partner_role === 'partner_admin' ? '/partner-admin' : '/partner', { replace: true });
        }
      })
      .catch(() => {});
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setSubmitting(true);
    try {
      if (mode === 'login') {
        const res = await axios.post(`${API}/auth/partner/login`, {
          email: formData.email,
          password: formData.password,
        });
        localStorage.setItem('partner_user', JSON.stringify(res.data.user));
        navigate(res.data.user.partner_role === 'partner_admin' ? '/partner-admin' : '/partner', { replace: true });
      } else {
        await axios.post(`${API}/auth/partner/register`, {
          email: formData.email,
          password: formData.password,
          username: formData.username,
          invite_code: formData.invite_code,
          rank: formData.rank || undefined,
        });
        setMode('login');
        setNotice('Registration successful. You can now log in.');
      }
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : (detail?.message || err.message || 'An error occurred'));
    } finally {
      setSubmitting(false);
    }
  };

  const partnerBg = bgConfig?.showBackground && bgConfig?.backgroundImage ? {
    backgroundImage: `url('${resolveImg(bgConfig.backgroundImage)}')`,
    backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed'
  } : {};

  return (
    <div className="min-h-screen flex items-center justify-center px-4 md:px-6 relative" style={partnerBg}>
      {bgConfig?.showBackground && bgConfig?.backgroundImage && (
        <div className="absolute inset-0 bg-black" style={{ opacity: bgConfig.overlayOpacity || 0.85 }}></div>
      )}
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <img src={`${BACKEND_URL}/api/uploads/25th_id_patch.png`} alt="25th ID" className="w-12 h-12 object-contain" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-2 tracking-wider text-white" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
            S-5 LIAISON AREA
          </h1>
          <p className="text-gray-400 text-sm tracking-wide">Partner Unit Access — 25th Infantry Division</p>
        </div>

        <Card className="glass-card border border-tropic-olive/30">
          <CardHeader>
            <CardTitle className="text-xl text-center tracking-wider text-tropic-gold flex items-center justify-center gap-2">
              <Shield className="w-5 h-5" />
              {mode === 'login' ? 'PARTNER LOGIN' : 'PARTNER REGISTRATION'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" data-testid="partner-auth-form">
              {mode === 'register' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-300">Invite Code</label>
                    <Input
                      type="text"
                      required
                      className="bg-black/50 border-white/20"
                      value={formData.invite_code}
                      onChange={(e) => setFormData({ ...formData, invite_code: e.target.value })}
                      placeholder="Enter your invite code"
                      data-testid="partner-invite-input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-300">Username</label>
                    <Input
                      type="text"
                      required
                      className="bg-black/50 border-white/20"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      data-testid="partner-username-input"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-300">Email</label>
                <Input
                  type="email"
                  required
                  className="bg-black/50 border-white/20"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  data-testid="partner-email-input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-300">Password</label>
                <Input
                  type="password"
                  required
                  className="bg-black/50 border-white/20"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  data-testid="partner-password-input"
                />
              </div>
              {mode === 'register' && (
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-300">Rank (Optional)</label>
                  <Input
                    type="text"
                    className="bg-black/50 border-white/20"
                    value={formData.rank}
                    onChange={(e) => setFormData({ ...formData, rank: e.target.value })}
                    data-testid="partner-rank-input"
                  />
                </div>
              )}

              {notice && <div className="text-green-400 text-sm text-center" data-testid="partner-auth-notice">{notice}</div>}
              {error && <div className="text-red-400 text-sm text-center" data-testid="partner-auth-error">{error}</div>}

              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-tropic-olive hover:bg-tropic-olive/80 text-white py-5 tracking-wider"
                data-testid="partner-auth-submit"
              >
                {submitting ? 'Please wait...' : mode === 'login' ? 'PARTNER LOGIN' : 'REGISTER'}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setNotice(''); }}
                className="text-sm text-gray-400 hover:text-tropic-gold transition-colors"
                data-testid="partner-auth-toggle"
              >
                {mode === 'login' ? 'Have an invite code? Register here' : 'Already have an account? Login'}
              </button>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 text-center space-y-2">
          <Link to="/partner-apply" className="text-sm text-tropic-olive hover:text-tropic-gold transition-colors block">
            Don't have an invite? Apply as a Partner Unit →
          </Link>
          <Link to="/login" className="text-sm text-gray-500 hover:text-tropic-gold transition-colors block">
            &larr; 25th ID Member Login
          </Link>
          <Link to="/" className="text-sm text-gray-600 hover:text-tropic-gold transition-colors block">
            &larr; Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PartnerLoginPage;

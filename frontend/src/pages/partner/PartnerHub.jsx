import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, MessageSquare, Shield, LogOut, Home, BookOpen, Globe, Target, Radio, ChevronRight, Users } from 'lucide-react';
import { BACKEND_URL, API } from '@/utils/api';

const PartnerHub = () => {
  const [user, setUser] = useState(null);
  const [operations, setOperations] = useState([]);
  const [discussions, setDiscussions] = useState([]);
  const [training, setTraining] = useState([]);
  const [intel, setIntel] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    axios.get(`${API}/auth/partner/me`)
      .then(res => {
        if (res.data?.account_type !== 'partner') {
          navigate('/partner-login', { replace: true });
          return;
        }
        setUser(res.data);
        fetchAll();
      })
      .catch(() => navigate('/partner-login', { replace: true }));
  }, [navigate]);

  const fetchAll = async () => {
    try {
      const [ops, disc, train, intelRes, camp] = await Promise.all([
        axios.get(`${API}/partner/operations`),
        axios.get(`${API}/partner/discussions`),
        axios.get(`${API}/partner/training`),
        axios.get(`${API}/partner/intel`),
        axios.get(`${API}/partner/campaigns`),
      ]);
      setOperations(ops.data.slice(0, 6));
      setDiscussions(disc.data.slice(0, 6));
      setTraining(train.data.slice(0, 4));
      setIntel(intelRes.data.slice(0, 4));
      setCampaigns(camp.data.slice(0, 4));
    } catch (err) {
      console.error('Failed to fetch partner data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try { await axios.post(`${API}/auth/logout`); } catch {}
    localStorage.removeItem('partner_user');
    navigate('/partner-login', { replace: true });
  };

  const getTypeColor = (t) => ({
    combat: 'bg-tropic-red', training: 'bg-tropic-gold-dark',
    recon: 'bg-green-600', support: 'bg-gray-600'
  }[t] || 'bg-gray-600');

  if (loading) {
    return <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Top bar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur border-b border-tropic-olive/40" data-testid="partner-nav">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={`${BACKEND_URL}/api/uploads/25th_id_patch.png`} alt="25th ID" className="w-8 h-8 object-contain" />
            <div>
              <h1 className="text-xl font-bold tracking-wider text-tropic-gold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                PARTNER HUB
              </h1>
              <p className="text-[10px] text-tropic-olive tracking-widest">S-5 LIAISON AREA</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Badge className="bg-tropic-olive/20 text-tropic-olive border border-tropic-olive/40 text-[10px]">
              PARTNER UNIT
            </Badge>
            <span className="text-sm text-gray-400 hidden sm:block">
              <span className="text-tropic-gold font-bold">{user?.username}</span>
              {user?.partner_unit_name && <span className="text-gray-500 ml-1">({user.partner_unit_name})</span>}
            </span>
            {user?.partner_role === 'partner_admin' && (
              <Link to="/partner-admin">
                <Button size="sm" variant="outline" className="border-tropic-olive/60 text-tropic-olive hover:bg-tropic-olive/10">
                  <Shield className="w-4 h-4 mr-1" />Admin
                </Button>
              </Link>
            )}
            <Link to="/">
              <Button size="sm" variant="outline" className="border-gray-700">
                <Home className="w-4 h-4 mr-1" />Home
              </Button>
            </Link>
            <Button size="sm" variant="outline" onClick={handleLogout} className="border-gray-700" data-testid="partner-logout-btn">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </nav>

      <div className="pt-20 pb-12 px-6">
        <div className="container mx-auto max-w-7xl space-y-8">
          {/* Welcome */}
          <div className="bg-gradient-to-r from-tropic-olive/20 to-gray-900 border border-tropic-olive/30 rounded-xl p-6">
            <h2 className="text-2xl font-bold text-tropic-gold mb-1" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
              Welcome, {user?.username}
            </h2>
            <p className="text-gray-400 text-sm">
              {user?.partner_unit_name || 'Partner Unit'} — Allied Unit Portal
            </p>
          </div>

          {/* Quick links */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { icon: MessageSquare, label: 'Discussions', color: 'text-blue-400' },
              { icon: Calendar, label: 'Operations', color: 'text-tropic-red' },
              { icon: BookOpen, label: 'Training', color: 'text-tropic-gold' },
              { icon: Radio, label: 'Intel Board', color: 'text-green-400' },
              { icon: Target, label: 'Campaigns', color: 'text-purple-400' },
            ].map((item) => (
              <Card key={item.label} className="bg-gray-900/80 border-gray-800 hover:border-tropic-olive/40 transition-colors cursor-pointer">
                <CardContent className="p-4 text-center">
                  <item.icon className={`w-6 h-6 mx-auto mb-2 ${item.color}`} />
                  <p className="text-xs font-medium text-gray-300">{item.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Operations */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-tropic-gold tracking-wider" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                <Calendar className="w-5 h-5 inline mr-2" />UPCOMING OPERATIONS
              </h3>
            </div>
            {operations.length === 0 ? (
              <Card className="bg-gray-900/50 border-gray-800"><CardContent className="p-6 text-center text-gray-500">No operations available</CardContent></Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {operations.map(op => (
                  <Card key={op.id} className="bg-gray-900/80 border-gray-800 hover:border-tropic-olive/40 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-bold text-sm">{op.title}</h4>
                        <Badge className={`${getTypeColor(op.operation_type)} text-[10px]`}>{op.operation_type?.toUpperCase()}</Badge>
                      </div>
                      <p className="text-xs text-gray-400 line-clamp-2 mb-2">{op.description}</p>
                      <div className="flex items-center gap-3 text-[10px] text-gray-500">
                        <span><Calendar className="w-3 h-3 inline mr-1" />{op.date}</span>
                        <span><Clock className="w-3 h-3 inline mr-1" />{op.time}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Discussions */}
          <div>
            <h3 className="text-lg font-bold text-tropic-gold tracking-wider mb-4" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
              <MessageSquare className="w-5 h-5 inline mr-2" />DISCUSSIONS
            </h3>
            {discussions.length === 0 ? (
              <Card className="bg-gray-900/50 border-gray-800"><CardContent className="p-6 text-center text-gray-500">No discussions available</CardContent></Card>
            ) : (
              <div className="space-y-2">
                {discussions.map(d => (
                  <Card key={d.id} className="bg-gray-900/80 border-gray-800 hover:border-tropic-olive/40 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-sm">{d.title}</h4>
                        <p className="text-xs text-gray-500">{d.category} — by {d.author_name}</p>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <MessageSquare className="w-3 h-3" />
                        <span>{d.replies?.length || 0}</span>
                        <ChevronRight className="w-4 h-4 text-gray-600" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Training & Intel side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Training */}
            <div>
              <h3 className="text-lg font-bold text-tropic-gold tracking-wider mb-4" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                <BookOpen className="w-5 h-5 inline mr-2" />TRAINING
              </h3>
              {training.length === 0 ? (
                <Card className="bg-gray-900/50 border-gray-800"><CardContent className="p-6 text-center text-gray-500">No training available</CardContent></Card>
              ) : (
                <div className="space-y-2">
                  {training.map(t => (
                    <Card key={t.id} className="bg-gray-900/80 border-gray-800">
                      <CardContent className="p-4">
                        <h4 className="font-bold text-sm mb-1">{t.title}</h4>
                        <p className="text-xs text-gray-400 line-clamp-2">{t.description}</p>
                        <p className="text-[10px] text-gray-500 mt-1">Instructor: {t.instructor}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Intel */}
            <div>
              <h3 className="text-lg font-bold text-tropic-gold tracking-wider mb-4" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                <Radio className="w-5 h-5 inline mr-2" />INTEL BOARD
              </h3>
              {intel.length === 0 ? (
                <Card className="bg-gray-900/50 border-gray-800"><CardContent className="p-6 text-center text-gray-500">No intel briefings available</CardContent></Card>
              ) : (
                <div className="space-y-2">
                  {intel.map(i => (
                    <Card key={i.id} className="bg-gray-900/80 border-gray-800">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-1">
                          <h4 className="font-bold text-sm">{i.title}</h4>
                          <Badge className="bg-gray-700 text-[10px]">{i.classification?.toUpperCase()}</Badge>
                        </div>
                        <p className="text-xs text-gray-400 line-clamp-2">{i.content}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Campaigns */}
          <div>
            <h3 className="text-lg font-bold text-tropic-gold tracking-wider mb-4" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
              <Target className="w-5 h-5 inline mr-2" />CAMPAIGNS
            </h3>
            {campaigns.length === 0 ? (
              <Card className="bg-gray-900/50 border-gray-800"><CardContent className="p-6 text-center text-gray-500">No campaigns available</CardContent></Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {campaigns.map(c => (
                  <Card key={c.id} className="bg-gray-900/80 border-gray-800 hover:border-tropic-olive/40 transition-colors">
                    <CardContent className="p-4">
                      <h4 className="font-bold text-sm mb-1">{c.name}</h4>
                      <p className="text-xs text-gray-400 line-clamp-2 mb-2">{c.description}</p>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-gray-700 text-[10px]">{c.status?.toUpperCase()}</Badge>
                        {c.theater && <span className="text-[10px] text-gray-500">{c.theater}</span>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PartnerHub;

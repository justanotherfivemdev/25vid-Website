import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, Users, MessageSquare, Crosshair, BookOpen, Globe, LogOut, Home, ChevronRight, Megaphone, Map, Settings } from 'lucide-react';
import { API } from '@/utils/api';

const PartnerHub = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [hubData, setHubData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/partner/hub`)
      .then(res => setHubData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => { await logout(); navigate('/'); };

  const navTiles = [
    { label: 'DISCUSSIONS', icon: MessageSquare, path: '/hub/discussions', color: 'text-blue-400', desc: 'Joint briefings & comms' },
    { label: 'OPERATIONS', icon: Crosshair, path: '/hub/operations', color: 'text-tropic-red', desc: 'Sign up for joint ops' },
    { label: 'TRAINING', icon: BookOpen, path: '/hub/training', color: 'text-tropic-gold', desc: 'Training schedule' },
    { label: 'INTEL BOARD', icon: Globe, path: '/hub/intel', color: 'text-green-400', desc: 'Intelligence reports' },
    { label: 'CAMPAIGNS', icon: Map, path: '/hub/campaign', color: 'text-purple-400', desc: 'Active campaigns' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-tropic-gold border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400 tracking-wider">Loading Partner Hub...</p>
        </div>
      </div>
    );
  }

  const unit = hubData?.unit;

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur border-b border-tropic-gold/40">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-tropic-gold" />
            <div>
              <h1 className="text-lg font-bold tracking-wider text-tropic-gold leading-none" style={{ fontFamily: 'Rajdhani, sans-serif' }}>PARTNER HUB</h1>
              <p className="text-[10px] text-gray-500 tracking-widest leading-none">S-5 LIAISON AREA</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:block text-sm text-gray-400">
              Welcome, <span className="text-tropic-gold font-bold">{user?.username}</span>
            </span>
            {user?.partner_role === 'partner_admin' && (
              <Link to="/partner-admin">
                <Button size="sm" variant="outline" className="border-tropic-gold/50 text-tropic-gold hover:bg-tropic-gold/10">
                  <Settings className="w-4 h-4 mr-1" />Admin
                </Button>
              </Link>
            )}
            <Link to="/"><Button size="sm" variant="outline" className="border-gray-700"><Home className="w-4 h-4" /></Button></Link>
            <Button size="sm" variant="outline" onClick={handleLogout} className="border-gray-700"><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </nav>

      <div className="pt-20 pb-12 px-6">
        <div className="container mx-auto max-w-6xl space-y-8">

          {/* Partner Unit Banner */}
          <div className="bg-tropic-gold/10 border border-tropic-gold/30 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-tropic-gold/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-tropic-gold" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-tropic-gold tracking-wide" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{unit?.name || 'Partner Unit'}</span>
                  {unit?.abbreviation && <Badge className="bg-tropic-gold/20 text-tropic-gold border border-tropic-gold/40 text-[10px]">{unit.abbreviation}</Badge>}
                  <Badge className="bg-gray-800 text-gray-400 border border-gray-700 text-[10px] tracking-widest">PARTNER UNIT</Badge>
                </div>
                {unit?.description && <p className="text-gray-400 text-xs mt-0.5">{unit.description}</p>}
              </div>
            </div>
            <div className="text-right hidden sm:block">
              <div className="text-xs text-gray-500 tracking-widest">ACCESS LEVEL</div>
              <div className="text-tropic-gold text-sm font-bold tracking-wide">{user?.partner_role === 'partner_admin' ? 'UNIT ADMIN' : 'MEMBER'}</div>
            </div>
          </div>

          {/* Announcements */}
          {hubData?.announcements?.length > 0 && (
            <div>
              <h2 className="text-sm font-bold tracking-widest text-gray-500 mb-3 flex items-center gap-2">
                <Megaphone className="w-4 h-4" />ANNOUNCEMENTS
              </h2>
              <div className="space-y-2">
                {hubData.announcements.map(a => (
                  <div key={a.id} className="bg-gray-900/60 border border-gray-800 rounded-lg p-3">
                    <p className="font-semibold text-sm text-white">{a.title}</p>
                    {a.content && <p className="text-gray-400 text-xs mt-1 line-clamp-2">{a.content}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Nav Tiles */}
          <div>
            <h2 className="text-sm font-bold tracking-widest text-gray-500 mb-3">PARTNER HUB AREAS</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {navTiles.map(tile => (
                <Link key={tile.label} to={tile.path}>
                  <Card className="bg-gray-900/80 border-gray-800 hover:border-tropic-gold/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-tropic-gold/10 group cursor-pointer">
                    <CardContent className="p-5 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center group-hover:bg-gray-700 transition-colors">
                        <tile.icon className={`w-5 h-5 ${tile.color}`} />
                      </div>
                      <div className="flex-1">
                        <div className="font-bold tracking-wide" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{tile.label}</div>
                        <div className="text-xs text-gray-500">{tile.desc}</div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-tropic-gold transition-colors" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>

          {/* Recent Operations */}
          {hubData?.operations?.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold tracking-widest text-gray-500 flex items-center gap-2"><Crosshair className="w-4 h-4" />RECENT OPERATIONS</h2>
                <Link to="/hub/operations" className="text-xs text-tropic-gold hover:text-tropic-gold-light">View all →</Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {hubData.operations.slice(0, 4).map(op => (
                  <div key={op.id} className="bg-gray-900/60 border border-gray-800 rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm">{op.title}</p>
                      <p className="text-gray-500 text-xs">{op.date} • {op.operation_type}</p>
                    </div>
                    <Badge className="bg-gray-800 text-gray-300 text-[10px]">{op.activity_state || 'planned'}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer note */}
          <div className="text-center text-xs text-gray-600 border-t border-gray-900 pt-6">
            You are accessing the <span className="text-tropic-gold">25th ID Partner Hub</span> as a representative of <span className="text-tropic-gold">{unit?.name || 'your partner unit'}</span>.
            Gallery and 25th-internal areas are not available in this portal.
          </div>
        </div>
      </div>
    </div>
  );
};

export default PartnerHub;

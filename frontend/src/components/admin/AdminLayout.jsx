import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, FileText, Megaphone, MessageSquare, Image, Users, Calendar, Settings, LogOut, Home, BookOpen, Shield, Building2, UserPlus, Radio, MapPin, ClipboardList } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

import { BACKEND_URL } from '@/utils/api';

const AdminLayout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user: authUser } = useAuth();
  
  const handleLogout = async () => {
    await logout();
    navigate('/');
  };
  
  const menuItems = [
    { path: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/admin/site-content', icon: Settings, label: 'Command Center' },
    { path: '/admin/operations', icon: Calendar, label: 'Operations' },
    { path: '/admin/announcements', icon: Megaphone, label: 'Announcements' },
    { path: '/admin/gallery', icon: Image, label: 'Gallery' },
    { path: '/admin/history', icon: BookOpen, label: 'Unit History' },
    { path: '/admin/training', icon: FileText, label: 'Training' },
    { path: '/admin/users', icon: Users, label: 'Members' },
    { path: '/admin/recruitment', icon: UserPlus, label: 'Recruitment' },
    { path: '/admin/intel', icon: Radio, label: 'Intel & Briefings' },
    { path: '/admin/campaigns', icon: MapPin, label: 'Campaigns' },
    { path: '/admin/unit-config', icon: Building2, label: 'Unit Config' },
    { path: '/admin/partner-units', icon: Shield, label: 'Partner Units' },
    { path: '/admin/partner-applications', icon: ClipboardList, label: 'Partner Applications' }
  ];
  
  const visibleMenuItems = authUser?.role === 's5_liaison' 
    ? menuItems.filter(item => item.path === '/admin' || item.path === '/admin/partner-units' || item.path === '/admin/partner-applications')
    : menuItems;
  
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Top Bar - 25th ID colors: gold-forward with red as secondary accent */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-gray-900 border-b border-tropic-gold/25">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center space-x-4">
            <img src={`${BACKEND_URL}/api/uploads/25th_id_patch.png`} alt="25th ID" className="w-8 h-8 object-contain" />
            <h1 className="text-2xl font-bold text-tropic-gold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
              {authUser?.role === 's5_liaison' ? 'S-5 LIAISON CENTER' : '25TH ID COMMAND CENTER'}
            </h1>
          </div>
          <div className="flex items-center space-x-3">
            <Link to="/hub">
              <Button variant="outline" size="sm" className="border-tropic-gold/60 text-tropic-gold hover:bg-tropic-gold/10" data-testid="admin-back-to-hub">
                <Shield className="w-4 h-4 mr-2" />
                Member Hub
              </Button>
            </Link>
            <Link to="/hub/campaign">
              <Button variant="outline" size="sm" className="border-tropic-red/60 text-tropic-red hover:bg-tropic-red/10" data-testid="admin-campaigns-btn">
                <MapPin className="w-4 h-4 mr-2" />
                Campaigns
              </Button>
            </Link>
            <Link to="/">
              <Button variant="outline" size="sm" className="border-gray-700 text-gray-400 hover:bg-gray-700/10">
                <Home className="w-4 h-4 mr-2" />
                Main Site
              </Button>
            </Link>
            <Button 
              onClick={handleLogout}
              variant="outline" 
              size="sm"
              className="border-tropic-red/50 text-tropic-red-light hover:bg-tropic-red/10"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </div>
      
      <div className="flex pt-16">
        {/* Sidebar - 25th ID colors */}
        <div className="fixed left-0 top-16 bottom-0 w-64 bg-gray-900 border-r border-tropic-gold/15 overflow-y-auto">
          <nav className="p-4 space-y-2">
            {visibleMenuItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              
              return (
                <Link key={item.path} to={item.path}>
                  <div
                    className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-tropic-gold text-black'
                        : 'text-gray-400 hover:bg-tropic-gold/10 hover:text-tropic-gold'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? '' : ''}`} />
                    <span className="font-medium">{item.label}</span>
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>
        
        {/* Main Content */}
        <div className="ml-64 flex-1 p-8">
          {children}
        </div>
      </div>
    </div>
  );
};

export default AdminLayout;

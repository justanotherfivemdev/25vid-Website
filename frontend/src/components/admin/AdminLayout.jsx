import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, FileText, Megaphone, MessageSquare, Image, Users, Calendar, Settings, LogOut, Home, BookOpen, Shield, Building2, UserPlus, Radio, MapPin, ClipboardList, ScrollText, Navigation, Menu, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

import { BACKEND_URL } from '@/utils/api';

const AdminLayout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user: authUser } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);
  
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
    { path: '/admin/deployments', icon: Navigation, label: 'Deployments' },
    { path: '/admin/unit-config', icon: Building2, label: 'Unit Config' },
    { path: '/admin/loa', icon: Calendar, label: 'LOA Management' },
    { path: '/admin/pipeline', icon: UserPlus, label: 'Recruit Pipeline' },
    { path: '/admin/partner-units', icon: Shield, label: 'Partner Units' },
    { path: '/admin/partner-applications', icon: ClipboardList, label: 'Partner Applications' },
    { path: '/admin/audit-logs', icon: ScrollText, label: 'Audit Logs' }
  ];
  
  const visibleMenuItems = authUser?.role === 's5_liaison' 
    ? menuItems.filter(item => item.path === '/admin' || item.path === '/admin/partner-units' || item.path === '/admin/partner-applications')
    : menuItems;
  
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Top Bar - 25th ID colors: gold-forward with red as secondary accent */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-black/92 backdrop-blur-xl border-b border-tropic-gold/15">
        <div className="flex items-center justify-between px-4 md:px-6 py-4">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden text-tropic-gold p-1"
              aria-label="Toggle menu"
            >
              <Menu className="w-6 h-6" />
            </button>
            <img src={`${BACKEND_URL}/api/uploads/25th_id_patch.png`} alt="25th ID" className="w-8 h-8 object-contain" />
            <h1 className="text-2xl font-bold text-tropic-gold tracking-[0.1em]" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
              <span className="hidden sm:inline">{authUser?.role === 's5_liaison' ? 'S-5 LIAISON CENTER' : '25TH ID COMMAND CENTER'}</span>
              <span className="sm:hidden">{authUser?.role === 's5_liaison' ? 'S-5' : '25TH ID'}</span>
            </h1>
          </div>
          <div className="flex items-center space-x-2 md:space-x-3">
            <Link to="/hub">
              <Button variant="outline" size="sm" className="border-tropic-gold/60 text-tropic-gold hover:bg-tropic-gold/10" data-testid="admin-back-to-hub">
                <Shield className="w-4 h-4 md:mr-2" />
                <span className="hidden md:inline">Member Hub</span>
              </Button>
            </Link>
            <Link to="/hub/campaign">
              <Button variant="outline" size="sm" className="border-tropic-red/60 text-tropic-red hover:bg-tropic-red/10" data-testid="admin-campaigns-btn">
                <MapPin className="w-4 h-4 md:mr-2" />
                <span className="hidden md:inline">Campaigns</span>
              </Button>
            </Link>
            <Link to="/">
              <Button variant="outline" size="sm" className="border-gray-700 text-gray-400 hover:bg-gray-700/10">
                <Home className="w-4 h-4 md:mr-2" />
                <span className="hidden md:inline">Main Site</span>
              </Button>
            </Link>
            <Button 
              onClick={handleLogout}
              variant="outline" 
              size="sm"
              className="border-tropic-red/50 text-tropic-red-light hover:bg-tropic-red/10"
            >
              <LogOut className="w-4 h-4 md:mr-2" />
              <span className="hidden md:inline">Logout</span>
            </Button>
          </div>
        </div>
      </div>
      
      <div className="flex pt-16">
        {/* Mobile Sidebar Overlay */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-[60] md:hidden">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="absolute left-0 top-0 bottom-0 w-64 bg-black/95 border-r border-tropic-gold/10 overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b border-tropic-gold/10">
                <span className="text-tropic-gold font-bold tracking-wider" style={{ fontFamily: 'Rajdhani, sans-serif' }}>MENU</span>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-gray-400 hover:text-tropic-gold p-1"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="p-4 space-y-2">
                {visibleMenuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  
                  return (
                    <Link key={item.path} to={item.path} onClick={() => setMobileMenuOpen(false)}>
                      <div
                        className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                          isActive
                            ? 'bg-tropic-gold text-black'
                            : 'text-gray-400 hover:bg-tropic-gold/10 hover:text-tropic-gold'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="font-medium">{item.label}</span>
                      </div>
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>
        )}

        {/* Desktop Sidebar - 25th ID colors */}
        <div className="hidden md:block fixed left-0 top-16 bottom-0 w-64 bg-black/95 border-r border-tropic-gold/10 overflow-y-auto">
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
        <div className="md:ml-64 flex-1 p-4 md:p-8">
          {children}
        </div>
      </div>
    </div>
  );
};

export default AdminLayout;

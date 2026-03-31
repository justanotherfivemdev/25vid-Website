import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  LogOut,
  Home,
  Shield,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getCommandCenterTitle, getCommandCenterTitleShort } from '@/utils/permissions';
import { BACKEND_URL } from '@/utils/api';
import { ADMIN_NAV_GROUPS } from '@/config/adminNavigationConfig';

// ── Sidebar Section (accordion group) ──────────────────────────────────────

const STORAGE_KEY_ADMIN_SECTIONS = 'admin-sidebar-sections';

/**
 * Read persisted open/closed sidebar section state from localStorage.
 */
const loadSectionState = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const saveSectionState = (key, state) => {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Storage full or unavailable — silently ignore
  }
};

const SidebarGroup = ({ group, collapsed, location, onNavigate, open, onToggle }) => {
  const items = group.items;
  if (!items.length) return null;

  return (
    <div className="mb-1">
      {/* Group header — clickable accordion toggle */}
      {!collapsed && (
        <button
          onClick={() => onToggle(group.id)}
          className="flex w-full items-center justify-between px-4 py-2 text-[10px] font-bold tracking-[0.2em] text-gray-500 hover:text-tropic-gold transition-colors"
        >
          {group.label}
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
      )}

      {/* Items — animated expand/collapse */}
      <div
        className="overflow-hidden transition-all duration-200 ease-in-out"
        style={{
          maxHeight: collapsed || open ? `${items.length * 56}px` : '0px',
          opacity: collapsed || open ? 1 : 0,
        }}
      >
        <nav className="space-y-0.5 px-2">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = item.exact
              ? location.pathname === item.path
              : location.pathname === item.path ||
                (item.path !== '/admin' && location.pathname.startsWith(item.path));

            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onNavigate}
              >
                <div
                  className={`flex items-center rounded-lg transition-colors ${
                    collapsed ? 'justify-center px-2 py-2.5' : 'space-x-3 px-3 py-2.5 min-h-[44px]'
                  } ${
                    isActive
                      ? 'bg-tropic-gold/15 text-tropic-gold'
                      : 'text-gray-400 hover:bg-tropic-gold/5 hover:text-tropic-gold'
                  }`}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className="w-4.5 h-4.5 shrink-0" style={{ width: 18, height: 18 }} />
                  {!collapsed && (
                    <span className="text-sm font-medium truncate">{item.label}</span>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
};

// ── AdminLayout ────────────────────────────────────────────────────────────

const AdminLayout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user: authUser } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('admin-sidebar-collapsed') === 'true'; } catch { return false; }
  });

  // Centralised open/closed state for sidebar sections (persisted to localStorage)
  const [sectionState, setSectionState] = useState(() => {
    const stored = loadSectionState(STORAGE_KEY_ADMIN_SECTIONS);
    if (stored) return stored;
    // All sections collapsed by default
    const defaults = {};
    ADMIN_NAV_GROUPS.forEach((g) => { defaults[g.id] = g.defaultOpen ?? false; });
    return defaults;
  });

  const toggleSection = (groupId) => {
    setSectionState((prev) => {
      const next = { ...prev, [groupId]: !prev[groupId] };
      saveSectionState(STORAGE_KEY_ADMIN_SECTIONS, next);
      return next;
    });
  };

  const role = authUser?.role || 'member';

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  // Allow Escape key to close mobile sidebar
  useEffect(() => {
    if (!mobileOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const closeMobileSidebar = () => setMobileOpen(false);

  // Filter nav items based on user role permissions
  const visibleGroups = ADMIN_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => (item.show ? item.show(role) : true)),
  })).filter((g) => g.items.length > 0);

  // Persist collapsed preference
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem('admin-sidebar-collapsed', String(next)); } catch {}
      return next;
    });
  };

  const sidebarWidth = collapsed ? 'w-16' : 'w-60';

  return (
    <div className="min-h-screen bg-black text-white">
      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/92 backdrop-blur-xl border-b border-tropic-gold/15">
        <div className="flex items-center justify-between px-3 sm:px-4 md:px-6 h-14">
          {/* Left: hamburger (mobile) + branding */}
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden text-tropic-gold p-2 -ml-1 rounded-lg active:bg-tropic-gold/10 transition-colors"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <Link to="/admin" className="flex items-center space-x-2 sm:space-x-3 min-w-0">
              <img
                src={`${BACKEND_URL}/api/uploads/25th_id_patch.png`}
                alt="25th ID"
                className="w-7 h-7 object-contain shrink-0"
              />
              <span
                className="text-base sm:text-lg font-bold tracking-[0.12em] text-tropic-gold truncate"
                style={{ fontFamily: 'Rajdhani, sans-serif' }}
              >
                <span className="hidden sm:inline">{getCommandCenterTitle(role)}</span>
                <span className="sm:hidden">{getCommandCenterTitleShort(role)}</span>
              </span>
            </Link>
          </div>

          {/* Right: minimal actions */}
          <div className="flex items-center space-x-1 sm:space-x-2 shrink-0">
            <span className="text-xs text-gray-500 hidden lg:block">
              Welcome, <span className="text-tropic-gold font-semibold">{authUser?.username}</span>
            </span>
            <Link to="/hub">
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-400 hover:text-tropic-gold h-9 w-9 sm:w-auto sm:h-auto p-0 sm:px-3 sm:py-1.5"
                data-testid="admin-back-to-hub"
              >
                <Shield className="w-4 h-4 sm:mr-1.5" />
                <span className="hidden sm:inline text-xs">Hub</span>
              </Button>
            </Link>
            <Link to="/">
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-400 hover:text-tropic-gold hidden sm:inline-flex"
              >
                <Home className="w-4 h-4 md:mr-1.5" />
                <span className="hidden md:inline text-xs">Home</span>
              </Button>
            </Link>
            <Button
              onClick={handleLogout}
              variant="ghost"
              size="sm"
              className="text-gray-400 hover:text-tropic-red h-9 w-9 sm:w-auto sm:h-auto p-0 sm:px-3 sm:py-1.5"
            >
              <LogOut className="w-4 h-4 sm:mr-1.5" />
              <span className="hidden sm:inline text-xs">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Mobile Sidebar Overlay ──────────────────────────────────────── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={closeMobileSidebar}
          />
          <div
            className="absolute left-0 top-0 bottom-0 w-[280px] max-w-[85vw] bg-black/95 border-r border-tropic-gold/10 overflow-y-auto overscroll-contain pt-14"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            <div className="flex items-center justify-between p-3 border-b border-tropic-gold/10">
              <span
                className="text-[10px] font-bold tracking-[0.25em] text-tropic-gold"
                style={{ fontFamily: 'Rajdhani, sans-serif' }}
              >
                COMMAND CENTER
              </span>
              <button
                onClick={closeMobileSidebar}
                className="text-gray-400 hover:text-tropic-gold p-1.5 -mr-1 rounded-lg active:bg-tropic-gold/10"
                aria-label="Close menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="py-2">
              {visibleGroups.map((group) => (
                <SidebarGroup
                  key={group.id}
                  group={group}
                  collapsed={false}
                  location={location}
                  onNavigate={closeMobileSidebar}
                  open={!!sectionState[group.id]}
                  onToggle={toggleSection}
                />
              ))}
            </div>
            {/* Mobile sidebar quick actions */}
            <div className="border-t border-tropic-gold/10 p-3 space-y-1">
              <Link
                to="/hub"
                onClick={closeMobileSidebar}
                className="flex items-center space-x-3 px-3 py-2.5 min-h-[44px] rounded-lg text-gray-400 hover:bg-tropic-gold/5 hover:text-tropic-gold transition-colors"
              >
                <Shield style={{ width: 18, height: 18 }} className="shrink-0" />
                <span className="text-sm font-medium">Member Hub</span>
              </Link>
              <Link
                to="/"
                onClick={closeMobileSidebar}
                className="flex items-center space-x-3 px-3 py-2.5 min-h-[44px] rounded-lg text-gray-400 hover:bg-tropic-gold/5 hover:text-tropic-gold transition-colors"
              >
                <Home style={{ width: 18, height: 18 }} className="shrink-0" />
                <span className="text-sm font-medium">Main Site</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Desktop Sidebar ─────────────────────────────────────────────── */}
      <aside
        className={`hidden md:flex flex-col fixed left-0 top-14 bottom-0 ${sidebarWidth} bg-black/95 border-r border-tropic-gold/10 overflow-y-auto transition-all duration-200 z-40`}
      >
        {/* Collapse toggle */}
        <div className="flex items-center justify-end p-2 border-b border-tropic-gold/10">
          <button
            onClick={toggleCollapsed}
            className="text-gray-500 hover:text-tropic-gold p-1 rounded transition-colors"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <PanelLeft className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Nav groups */}
        <div className="flex-1 py-2">
          {visibleGroups.map((group) => (
            <SidebarGroup
              key={group.id}
              group={group}
              collapsed={collapsed}
              location={location}
              open={!!sectionState[group.id]}
              onToggle={toggleSection}
            />
          ))}
        </div>

        {/* Sidebar footer */}
        {!collapsed && (
          <div className="p-3 border-t border-tropic-gold/10">
            <p className="text-[9px] text-gray-600 tracking-wider text-center">
              COMMAND CENTER
            </p>
          </div>
        )}
      </aside>

      {/* ── Main Content ────────────────────────────────────────────────── */}
      <main
        className={`pt-14 transition-all duration-200 ${
          collapsed ? 'md:ml-16' : 'md:ml-60'
        }`}
      >
        <div className="p-4 md:p-8">
          {children || <Outlet />}
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;

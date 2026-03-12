import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate, Navigate } from 'react-router-dom';
import axios from 'axios';
import '@/App.css';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Calendar, Users, Shield, Megaphone, Clock, ChevronRight } from 'lucide-react';
import { defaultSiteContent } from '@/config/siteContent';
import { AuthProvider, useAuth } from '@/context/AuthContext';

import AdminDashboard from '@/pages/admin/Dashboard';
import OperationsManager from '@/pages/admin/OperationsManager';
import SiteContentManager from '@/pages/admin/SiteContentManager';
import AnnouncementsManager from '@/pages/admin/AnnouncementsManager';
import UsersManager from '@/pages/admin/UsersManager';
import TrainingManager from '@/pages/admin/TrainingManager';
import GalleryManager from '@/pages/admin/GalleryManager';
import MemberHub from '@/pages/member/MemberHub';
import DiscussionForum from '@/pages/member/DiscussionForum';
import DiscussionThread from '@/pages/member/DiscussionThread';
import OperationDetail from '@/pages/member/OperationDetail';
import UnitRoster from '@/pages/member/UnitRoster';
import MemberProfile from '@/pages/member/MemberProfile';
import EditProfile from '@/pages/member/EditProfile';
import AdminMemberDetail from '@/pages/admin/AdminMemberDetail';
import HistoryManager from '@/pages/admin/HistoryManager';
import UnitTagsManager from '@/pages/admin/UnitTagsManager';
import RecruitmentManager from '@/pages/admin/RecruitmentManager';
import IntelManager from '@/pages/admin/IntelManager';
import CampaignManager from '@/pages/admin/CampaignManager';
import RecruitDashboard from '@/pages/RecruitDashboard';
import IntelBoard from '@/pages/member/IntelBoard';
import CampaignMap from '@/pages/member/CampaignMap';
import JoinUs from '@/pages/JoinUs';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Configure axios for HttpOnly cookie auth
axios.defaults.withCredentials = true;

// Intercept 401s — clear stale session
axios.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401 && !err.config?.url?.includes('/auth/')) {
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

const resolveImg = (url) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  if (url.startsWith('/uploads/')) return `${BACKEND_URL}/api${url}`;
  return `${BACKEND_URL}${url}`;
};

// Deep-merge helper
const deepMerge = (defaults, overrides) => {
  if (!overrides) return defaults;
  const result = { ...defaults };
  for (const key of Object.keys(overrides)) {
    if (overrides[key] && typeof overrides[key] === 'object' && !Array.isArray(overrides[key]) && defaults[key] && typeof defaults[key] === 'object' && !Array.isArray(defaults[key])) {
      result[key] = deepMerge(defaults[key], overrides[key]);
    } else if (overrides[key] !== undefined && overrides[key] !== null && overrides[key] !== '') {
      result[key] = overrides[key];
    }
  }
  return result;
};

// ============================================================================
// DYNAMIC CONTENT HOOK
// ============================================================================
const useSiteContent = () => {
  const [content, setContent] = useState(defaultSiteContent);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    axios.get(`${API}/site-content`).then(res => {
      if (res.data) {
        const merged = deepMerge(defaultSiteContent, res.data);
        // Arrays need special handling — only override if non-empty
        if (res.data.operationalSuperiority?.images?.length) merged.operationalSuperiority.images = res.data.operationalSuperiority.images;
        if (res.data.gallery?.showcaseImages?.length) merged.gallery.showcaseImages = res.data.gallery.showcaseImages;
        setContent(merged);
      }
    }).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  return { content, loaded };
};

// ============================================================================
// PROTECTED ROUTE WRAPPER — reads from AuthContext (no API call per route)
// ============================================================================
const ProtectedRoute = ({ children, adminOnly = false, allowRecruit = false }) => {
  const { user, checking } = useAuth();

  if (checking) return <div className="min-h-screen bg-black flex items-center justify-center text-white">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" replace />;
  
  // Recruit check: if user is a recruit and this route doesn't allow recruits, redirect to recruit dashboard
  if (!allowRecruit && user.status === 'recruit' && user.role !== 'admin') {
    return <Navigate to="/recruit" replace />;
  }
  
  return children;
};

// Recruit-specific route - only for recruits
const RecruitRoute = ({ children }) => {
  const { user, checking } = useAuth();

  if (checking) return <div className="min-h-screen bg-black flex items-center justify-center text-white">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  
  // If user is NOT a recruit (or is admin), redirect to appropriate page
  if (user.status !== 'recruit' || user.role === 'admin') {
    return <Navigate to={user.role === 'admin' ? '/admin' : '/hub'} replace />;
  }
  
  return children;
};

// ============================================================================
// NAVIGATION
// ============================================================================
const Navigation = ({ scrollToSection, content }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const brandName = content.nav?.brandName || '25TH INFANTRY DIVISION';
  const btnText = content.nav?.buttonText || 'JOIN NOW';

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-black/85 backdrop-blur-lg border-b border-white/5" data-testid="main-nav">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-lg font-bold tracking-widest text-white/90 hover:text-white transition-colors" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
            {brandName}
          </Link>
          <button className="md:hidden text-white" onClick={() => setMenuOpen(!menuOpen)} data-testid="mobile-menu-btn">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={menuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} /></svg>
          </button>
          <div className={`${menuOpen ? 'flex flex-col absolute top-full left-0 right-0 bg-black/95 p-6 space-y-4 border-b border-white/10' : 'hidden'} md:flex md:flex-row md:static md:bg-transparent md:p-0 md:space-y-0 md:border-0 items-center md:space-x-8`}>
            <button onClick={() => { scrollToSection('about'); setMenuOpen(false); }} className="text-sm tracking-[0.15em] text-gray-300 hover:text-amber-500 transition-colors" data-testid="nav-about">ABOUT</button>
            <button onClick={() => { scrollToSection('operations'); setMenuOpen(false); }} className="text-sm tracking-[0.15em] text-gray-300 hover:text-amber-500 transition-colors" data-testid="nav-operations">OPERATIONS</button>
            <button onClick={() => { scrollToSection('training'); setMenuOpen(false); }} className="text-sm tracking-[0.15em] text-gray-300 hover:text-amber-500 transition-colors" data-testid="nav-training">TRAINING</button>
            <button onClick={() => { scrollToSection('intel'); setMenuOpen(false); }} className="text-sm tracking-[0.15em] text-gray-300 hover:text-amber-500 transition-colors" data-testid="nav-intel">INTEL</button>
            <div className="hidden md:block h-5 w-px bg-amber-800/60"></div>
            <Link to="/login" onClick={() => setMenuOpen(false)}>
              <Button className="bg-amber-700 hover:bg-amber-800 text-white px-6 py-2 tactical-button font-bold tracking-wider" data-testid="nav-join-button">{btnText}</Button>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
};

// ============================================================================
// HERO SECTION
// ============================================================================
const HeroSection = ({ content }) => (
  <section className="hero-section relative min-h-screen flex items-center justify-center" style={{ backgroundImage: `url('${resolveImg(content.hero.backgroundImage)}')`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }} data-testid="hero-section">
    <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/75 to-black"></div>
    <div className="relative z-10 text-center px-6">
      <div className="mb-10 compass-logo" data-testid="unit-logo">
        <img src={`${process.env.REACT_APP_BACKEND_URL}/api/uploads/25th_id_patch.png`} alt="25th Infantry Division" className="w-48 h-48 sm:w-56 sm:h-56 mx-auto object-contain drop-shadow-[0_0_30px_rgba(212,160,23,0.4)]" />
      </div>
      <h1 className="text-4xl sm:text-5xl lg:text-7xl font-bold tracking-[0.08em] leading-tight" style={{ fontFamily: 'Rajdhani, sans-serif' }} data-testid="hero-tagline">
        <span className="block">{typeof content.hero.tagline === 'string' ? content.hero.tagline : content.hero.tagline?.line1 || 'TROPIC LIGHTNING'}</span>
        {content.hero.subtitle && <span className="block text-lg sm:text-xl lg:text-2xl text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-200 mt-4 tracking-[0.15em]">{content.hero.subtitle}</span>}
      </h1>
      <div className="mt-10">
        <Link to="/login"><Button className="bg-amber-700 hover:bg-amber-800 text-white px-10 py-5 text-lg tactical-button tracking-widest" data-testid="hero-cta-button">{content.nav?.buttonText || 'ENLIST NOW'}</Button></Link>
      </div>
    </div>
    <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black to-transparent"></div>
  </section>
);

// ============================================================================
// ABOUT SECTION
// ============================================================================
const AboutSection = ({ content }) => {
  const quote = typeof content.about?.quote === 'object' ? content.about.quote : { text: content.about?.quote || '', author: '', backgroundImage: '' };
  return (
    <section id="about" className="py-28 px-6 relative" style={{ background: 'linear-gradient(180deg, #000 0%, #0a0a0a 50%, #000 100%)' }} data-testid="about-section">
      <div className="container mx-auto max-w-6xl">
        <div className="grid md:grid-cols-[280px,1fr] gap-16 items-start">
          <div className="space-y-8">
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold section-underline tracking-wider" data-testid="about-heading">ABOUT</h2>
            {content.about?.logoImage && (
              <img src={resolveImg(content.about.logoImage)} alt="Unit Emblem" className="w-48 h-48 object-contain opacity-80 mt-6" data-testid="about-logo" />
            )}
            <Link to="/login"><Button className="bg-amber-700 hover:bg-amber-800 text-white px-10 py-5 text-lg tactical-button shadow-lg shadow-amber-900/40 tracking-wider" data-testid="about-join-button">{content.nav?.buttonText || 'JOIN NOW'}</Button></Link>
          </div>
          <div className="space-y-8 text-base md:text-lg leading-relaxed">
            <p className="text-gray-300" data-testid="about-description-1">{content.about?.paragraph1}</p>
            <div className="h-px bg-gradient-to-r from-transparent via-amber-800/40 to-transparent"></div>
            <p className="text-gray-300" data-testid="about-description-2">{content.about?.paragraph2}</p>
            {/* Quote block */}
            <div className="mt-12 relative rounded-lg overflow-hidden" style={{ backgroundImage: `url('${resolveImg(quote.backgroundImage)}')`, backgroundSize: 'cover', backgroundPosition: 'center', minHeight: '280px' }}>
              <div className="absolute inset-0 bg-gradient-to-br from-black/85 via-black/75 to-amber-900/30"></div>
              <div className="relative z-10 p-10 md:p-14 flex items-center justify-center min-h-[280px]">
                <div className="border-l-4 border-amber-700 pl-8 max-w-xl">
                  <p className="text-xl md:text-2xl italic text-gray-200 mb-5 font-light leading-relaxed" data-testid="founder-quote">{quote.text}</p>
                  <p className="text-base text-amber-400 font-bold tracking-wide" data-testid="founder-name">{quote.author}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

// ============================================================================
// UNIT HISTORY TIMELINE SECTION
// ============================================================================
const UnitHistorySection = () => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/unit-history`).then(r => setEntries(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const typeAccent = (t) => ({
    campaign: 'border-tropic-red bg-tropic-red',
    operation: 'border-tropic-gold-dark bg-tropic-gold-dark',
    milestone: 'border-emerald-600 bg-emerald-600',
  }[t] || 'border-tropic-red bg-tropic-red');

  if (loading || entries.length === 0) return null;

  return (
    <section id="history" className="py-28 px-6 relative" style={{ background: 'linear-gradient(180deg, #000 0%, #080806 50%, #000 100%)' }} data-testid="unit-history-section">
      <div className="section-divider absolute top-0 left-0 right-0"></div>
      <div className="container mx-auto max-w-5xl">
        <div className="section-label mb-16">
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold" data-testid="unit-history-heading">UNIT HISTORY</h2>
          <p className="text-base md:text-lg">Over 80 years of service, sacrifice, and the Tropic Lightning legacy</p>
        </div>

        {/* Timeline */}
        <div className="relative">
          {/* Center line */}
          <div className="absolute left-6 md:left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-amber-700/60 via-amber-700/30 to-transparent" aria-hidden="true"></div>

          <div className="space-y-12 md:space-y-16">
            {entries.map((entry, idx) => {
              const accent = typeAccent(entry.campaign_type);
              const isLeft = idx % 2 === 0;

              return (
                <div key={entry.id} className="relative" data-testid={`history-timeline-${idx}`}>
                  {/* Dot on the line */}
                  <div className={`absolute left-6 md:left-1/2 w-4 h-4 rounded-full ${accent.split(' ')[1]} border-2 border-black -translate-x-1/2 z-10 shadow-lg shadow-amber-900/30`}></div>

                  {/* Content card */}
                  <div className={`ml-14 md:ml-0 md:w-[calc(50%-2.5rem)] ${isLeft ? 'md:mr-auto md:pr-0' : 'md:ml-auto md:pl-0'}`}>
                    <div className={`group relative rounded-lg border ${accent.split(' ')[0]}/30 bg-black/60 backdrop-blur p-6 hover:border-amber-700/60 transition-all duration-500`}>
                      {/* Year badge */}
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-amber-500 font-bold text-lg tracking-wider" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{entry.year}</span>
                        <span className={`text-[10px] tracking-widest px-2 py-0.5 rounded ${accent.split(' ')[1]} text-white/90`}>{entry.campaign_type.toUpperCase()}</span>
                      </div>

                      <h3 className="text-xl md:text-2xl font-bold tracking-wide mb-3" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{entry.title}</h3>

                      {entry.image_url && (
                        <div className="mb-4 overflow-hidden rounded border border-white/10">
                          <img src={entry.image_url.startsWith('http') ? entry.image_url : `${BACKEND_URL}/api${entry.image_url}`} alt={entry.title} className="w-full h-40 object-cover group-hover:scale-105 transition-transform duration-700" />
                        </div>
                      )}

                      <p className="text-gray-400 text-sm leading-relaxed whitespace-pre-wrap">{entry.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="section-divider absolute bottom-0 left-0 right-0"></div>
    </section>
  );
};

// ============================================================================
// OPERATIONAL SUPERIORITY SECTION
// ============================================================================
const OperationalSuperioritySection = ({ content }) => {
  const sh = content.sectionHeadings?.operationalSuperiority || {};
  return (
    <section className="py-28 px-6 relative" style={{ background: 'linear-gradient(180deg, #000 0%, #060606 50%, #000 100%)' }} data-testid="operational-superiority-section">
      <div className="section-divider absolute top-0 left-0 right-0"></div>
      <div className="container mx-auto max-w-7xl">
        <div className="grid md:grid-cols-2 gap-16 items-center mb-20">
          <h2 className="text-4xl sm:text-5xl lg:text-7xl font-bold leading-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-gray-300 to-amber-500" data-testid="ops-superiority-heading">
            {(sh.heading || 'OPERATIONAL SUPERIORITY').split(' ').map((w, i) => <span key={i} className="block">{w}</span>)}
          </h2>
          <div className="relative">
            <div className="absolute -left-4 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-700 via-amber-700/40 to-transparent"></div>
            <p className="text-lg leading-relaxed text-gray-300 pl-8 whitespace-pre-wrap" data-testid="ops-superiority-description">{content.operationalSuperiority?.description}</p>
          </div>
        </div>
        <div className="h-px bg-gradient-to-r from-transparent via-amber-800/40 to-transparent mb-16"></div>
        <div className="grid md:grid-cols-3 gap-6">
          {(content.operationalSuperiority?.images || []).map((img, idx) => (
            <div key={idx} className="aspect-[3/4] overflow-hidden rounded-lg border border-white/10 hover:border-amber-700/40 transition-all duration-500 shadow-2xl shadow-black/40 group" data-testid={`ops-image-${idx + 1}`}>
              <img src={resolveImg(img)} alt={`Tactical ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
            </div>
          ))}
        </div>
      </div>
      <div className="section-divider absolute bottom-0 left-0 right-0"></div>
    </section>
  );
};

// ============================================================================
// LETHALITY ON DEMAND SECTION
// ============================================================================
const LethalitySection = ({ content }) => {
  const sh = content.sectionHeadings?.lethality || {};
  return (
    <section id="training" className="py-28 px-6" style={{ background: 'linear-gradient(180deg, #000 0%, #0a0a0a 50%, #000 100%)' }} data-testid="lethality-section">
      <div className="container mx-auto max-w-7xl space-y-20">
        <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-wider" data-testid="lethality-heading">{sh.heading || 'LETHALITY ON DEMAND'}</h2>
        {/* Logistics */}
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h3 className="text-3xl font-bold tracking-wide" data-testid="logistics-heading">LOGISTICS & OPERATIONAL SUPPORT</h3>
            <p className="text-base md:text-lg leading-relaxed text-gray-300 whitespace-pre-wrap" data-testid="logistics-description">{content.lethality?.logistics?.description}</p>
          </div>
          <div className="aspect-video overflow-hidden rounded-lg border border-white/10 shadow-2xl shadow-black/40 group">
            <img src={resolveImg(content.lethality?.logistics?.image)} alt="Logistics" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
          </div>
        </div>
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
        {/* Training */}
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="order-2 md:order-1 aspect-video overflow-hidden rounded-lg border border-white/10 shadow-2xl shadow-black/40 group">
            <img src={resolveImg(content.lethality?.training?.image)} alt="Training" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
          </div>
          <div className="order-1 md:order-2 space-y-6">
            <h3 className="text-3xl font-bold tracking-wide" data-testid="training-heading">TRAINING PROGRAMS</h3>
            <p className="text-base md:text-lg leading-relaxed text-gray-300 whitespace-pre-wrap" data-testid="training-description">{content.lethality?.training?.description}</p>
          </div>
        </div>
      </div>
    </section>
  );
};

// ============================================================================
// UPCOMING OPERATIONS SECTION — polished cards
// ============================================================================
const UpcomingOperationsSection = ({ content }) => {
  const [operations, setOperations] = useState([]);
  const [loading, setLoading] = useState(true);
  const sh = content.sectionHeadings?.operations || {};

  useEffect(() => {
    axios.get(`${API}/operations`).then(r => setOperations(r.data.slice(0, 3))).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const typeConfig = {
    combat:   { bg: 'bg-tropic-red/80', border: 'border-tropic-red/30', glow: 'shadow-tropic-red/20' },
    training: { bg: 'bg-tropic-gold-dark/80', border: 'border-tropic-gold-dark/30', glow: 'shadow-tropic-gold-dark/20' },
    recon:    { bg: 'bg-emerald-700/80', border: 'border-emerald-800/30', glow: 'shadow-emerald-900/20' },
    support:  { bg: 'bg-gray-600/80', border: 'border-gray-700/30', glow: 'shadow-gray-900/20' },
  };
  const getType = (t) => typeConfig[t] || typeConfig.combat;

  return (
    <section id="operations" className="py-28 px-6 relative" style={{ background: 'linear-gradient(180deg, #000 0%, #080808 50%, #000 100%)' }} data-testid="operations-section">
      <div className="section-divider absolute top-0 left-0 right-0"></div>
      <div className="container mx-auto max-w-7xl">
        <div className="section-label">
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold" data-testid="upcoming-ops-heading">{sh.heading || 'UPCOMING OPERATIONS'}</h2>
          <p className="text-base md:text-lg">{sh.subtext || 'Join the next tactical mission'}</p>
        </div>
        {loading ? <div className="text-center text-gray-500">Loading operations...</div> : operations.length === 0 ? (
          <div className="text-center text-gray-600 py-12 border border-dashed border-gray-800 rounded-lg">No operations currently scheduled. Check back soon.</div>
        ) : (
          <div className="grid md:grid-cols-3 gap-6">
            {operations.map((op, idx) => {
              const tc = getType(op.operation_type);
              return (
                <Card key={op.id} className={`op-card bg-black/80 backdrop-blur border ${tc.border} ${tc.glow} shadow-xl`} data-testid={`operation-card-${idx}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between mb-3">
                      <Badge className={`${tc.bg} text-white text-xs tracking-wider px-3 py-0.5`}>{op.operation_type.toUpperCase()}</Badge>
                      {op.logo_url && <img src={resolveImg(op.logo_url)} alt="" className="w-7 h-7 object-contain rounded opacity-80" />}
                    </div>
                    <CardTitle className="text-xl tracking-wide">{op.title}</CardTitle>
                    <CardDescription className="text-gray-400 text-sm mt-1 line-clamp-2 whitespace-pre-wrap">{op.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm mb-4">
                      <div className="flex items-center text-gray-300"><Calendar className="w-4 h-4 mr-2 text-amber-600 shrink-0"/>{op.date}</div>
                      <div className="flex items-center text-gray-300"><Clock className="w-4 h-4 mr-2 text-amber-600 shrink-0"/>{op.time}</div>
                      {op.max_participants && <div className="flex items-center text-gray-400"><Users className="w-4 h-4 mr-2 text-amber-600 shrink-0"/><span>{op.rsvps?.length || 0} / {op.max_participants} operators</span></div>}
                    </div>
                    <Link to="/login"><Button className="w-full bg-amber-700/90 hover:bg-amber-700 text-sm tracking-wider" data-testid={`operation-rsvp-${idx}`}>RSVP NOW <ChevronRight className="w-4 h-4 ml-1" /></Button></Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

// ============================================================================
// ANNOUNCEMENTS / LATEST INTEL SECTION — polished cards
// ============================================================================
const AnnouncementsSection = ({ content }) => {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const sh = content.sectionHeadings?.intel || {};

  useEffect(() => {
    axios.get(`${API}/announcements`).then(r => setAnnouncements(r.data.slice(0, 4))).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const priorityConfig = {
    urgent: { class: 'intel-urgent', badge: 'bg-tropic-red text-white', dot: 'bg-tropic-red' },
    high:   { class: 'intel-high',   badge: 'bg-orange-800 text-orange-200', dot: 'bg-orange-500' },
    normal: { class: 'intel-normal', badge: 'bg-tropic-gold-dark/60 text-tropic-gold', dot: 'bg-tropic-gold' },
    low:    { class: 'intel-low',    badge: 'bg-gray-800 text-gray-300', dot: 'bg-gray-500' },
  };
  const getPriority = (p) => priorityConfig[p] || priorityConfig.normal;

  return (
    <section id="intel" className="py-28 px-6 relative" style={{ background: 'linear-gradient(180deg, #000 0%, #0a0a0a 50%, #000 100%)' }} data-testid="announcements-section">
      <div className="section-divider absolute top-0 left-0 right-0"></div>
      <div className="container mx-auto max-w-7xl">
        <div className="section-label">
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold" data-testid="announcements-heading">{sh.heading || 'LATEST INTEL'}</h2>
          <p className="text-base md:text-lg">{sh.subtext || 'Stay informed with our latest updates'}</p>
        </div>
        {loading ? <div className="text-center text-gray-500">Loading intel...</div> : announcements.length === 0 ? (
          <div className="text-center text-gray-600 py-12 border border-dashed border-gray-800 rounded-lg">No active intel briefings.</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {announcements.map((ann, idx) => {
              const pc = getPriority(ann.priority);
              return (
                <Card key={ann.id} className={`intel-card bg-black/80 backdrop-blur border border-white/5 ${pc.class}`} data-testid={`announcement-card-${idx}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${pc.dot}`}></div>
                        <Badge className={`${pc.badge} text-xs tracking-wider`}>{ann.priority.toUpperCase()}</Badge>
                      </div>
                      <span className="text-xs text-gray-600">{new Date(ann.created_at).toLocaleDateString()}</span>
                    </div>
                    <CardTitle className="text-xl mt-2 tracking-wide">{ann.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-gray-400 text-sm leading-relaxed whitespace-pre-wrap">{ann.content}</p>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-xs text-gray-500 flex items-center"><Megaphone className="w-3 h-3 mr-1.5 text-gray-600"/>{ann.author_name}</span>
                      {ann.badge_url && <img src={resolveImg(ann.badge_url)} alt="badge" className="w-7 h-7 object-contain opacity-70" />}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

// ============================================================================
// GALLERY SECTION
// ============================================================================
const GallerySection = ({ content }) => {
  const sh = content.sectionHeadings?.gallery || {};
  return (
    <section className="py-28 px-6 relative" style={{ background: 'linear-gradient(180deg, #000 0%, #060606 50%, #000 100%)' }} data-testid="gallery-section">
      <div className="section-divider absolute top-0 left-0 right-0"></div>
      <div className="container mx-auto max-w-7xl">
        <div className="section-label">
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold" data-testid="gallery-heading">{sh.heading || 'MISSION GALLERY'}</h2>
          <p className="text-base md:text-lg">{sh.subtext || 'Moments from the field'}</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          {(content.gallery?.showcaseImages || []).map((img, idx) => (
            <div key={idx} className="aspect-square overflow-hidden rounded-lg border border-white/5 hover:border-amber-700/40 transition-all duration-500 cursor-pointer group shadow-xl shadow-black/30" data-testid={`gallery-image-${idx}`}>
              <img src={resolveImg(img)} alt={`Mission ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

// ============================================================================
// JOIN US SECTION
// ============================================================================
const JoinUsSection = ({ content }) => {
  const sh = content.sectionHeadings?.enlist || {};

  return (
    <section className="py-28 px-6 relative" style={{ background: 'linear-gradient(180deg, #000 0%, #0a0a0a 50%, #000 100%)' }} data-testid="join-section">
      <div className="section-divider absolute top-0 left-0 right-0"></div>
      <div className="container mx-auto max-w-3xl text-center">
        <div className="section-label">
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold" data-testid="join-heading">{sh.heading || 'JOIN THE 25TH'}</h2>
          <p className="text-base md:text-lg">{sh.subtext || 'Become part of the Tropic Lightning legacy'}</p>
        </div>
        <Card className="glass-card shadow-2xl shadow-black/40">
          <CardContent className="p-8 md:p-12 space-y-6">
            <p className="text-gray-300 text-lg leading-relaxed">
              The 25th Infantry Division is always looking for dedicated operators ready to commit to tactical excellence,
              teamwork, and the Tropic Lightning tradition. Create an account to access the Member Hub, view upcoming
              operations, and begin your journey with the unit.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Link to="/login">
                <Button className="bg-amber-700 hover:bg-amber-800 px-10 py-5 text-lg tactical-button tracking-wider w-full sm:w-auto" data-testid="join-register-button">
                  <Shield className="mr-2 w-5 h-5"/>CREATE ACCOUNT
                </Button>
              </Link>
              {content.footer?.discord && (
                <a href={content.footer.discord} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="border-amber-700/50 text-amber-400 hover:bg-amber-900/20 px-10 py-5 text-lg tracking-wider w-full sm:w-auto" data-testid="join-discord-button">
                    JOIN OUR DISCORD
                  </Button>
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
};

// ============================================================================
// FOOTER
// ============================================================================
const Footer = ({ content }) => (
  <footer className="bg-black border-t border-white/5 py-14 px-6" data-testid="footer">
    <div className="container mx-auto max-w-7xl">
      <div className="grid md:grid-cols-3 gap-10 mb-10">
        <div>
          <h3 className="text-xl font-bold mb-3 tracking-wider">{content.nav?.brandName || '25TH INFANTRY DIVISION'}</h3>
          <p className="text-sm text-gray-500 leading-relaxed">{content.footer?.tagline || 'Tropic Lightning — Ready to Strike'}</p>
        </div>
        <div>
          <h4 className="text-sm font-bold mb-3 tracking-[0.15em] text-gray-400">QUICK LINKS</h4>
          <ul className="space-y-2 text-sm text-gray-500">
            <li><a href="#about" className="hover:text-amber-500 transition-colors">About</a></li>
            <li><a href="#operations" className="hover:text-amber-500 transition-colors">Operations</a></li>
            <li><a href="#training" className="hover:text-amber-500 transition-colors">Training</a></li>
            <li><Link to="/login" className="hover:text-amber-500 transition-colors">Member Portal</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-bold mb-3 tracking-[0.15em] text-gray-400">CONNECT</h4>
          <div className="space-y-2 text-sm text-gray-500">
            {content.footer?.discord && <p><a href={content.footer.discord} target="_blank" rel="noopener noreferrer" className="hover:text-amber-500 transition-colors">Discord Server</a></p>}
            {(content.footer?.contact?.email || content.footer?.email) && <p>Email: {content.footer?.contact?.email || content.footer?.email}</p>}
          </div>
        </div>
      </div>
      <div className="border-t border-white/5 pt-8 space-y-3 text-center">
        <p className="text-xs text-gray-600 tracking-wider">&copy; {new Date().getFullYear()} 25th Infantry Division — Tropic Lightning</p>
        <p className="text-[10px] text-gray-700 max-w-2xl mx-auto leading-relaxed">{content.footer?.disclaimer || 'This is a fictional Arma Reforger milsim unit. We are NOT in any way tied to the Department of War or the United States Department of Defense.'}</p>
      </div>
    </div>
  </footer>
);

// ============================================================================
// LANDING PAGE
// ============================================================================
const LandingPage = () => {
  const { content } = useSiteContent();
  const scrollToSection = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="App">
      <Navigation scrollToSection={scrollToSection} content={content} />
      <HeroSection content={content} />
      <AboutSection content={content} />
      <UnitHistorySection />
      <OperationalSuperioritySection content={content} />
      <LethalitySection content={content} />
      <UpcomingOperationsSection content={content} />
      <AnnouncementsSection content={content} />
      <GallerySection content={content} />
      <JoinUsSection content={content} />
      <Footer content={content} />
    </div>
  );
};

// ============================================================================
// LOGIN PAGE
// ============================================================================
const LoginPage = () => {
  const { content } = useSiteContent();
  const { login: authLogin, user } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ email: '', password: '', username: '', rank: '', specialization: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [discordLoading, setDiscordLoading] = useState(false);
  const [discordAvailable, setDiscordAvailable] = useState(false);
  const navigate = useNavigate();

  // If already logged in, redirect
  useEffect(() => {
    if (user) navigate(user.role === 'admin' ? '/admin' : '/hub');
  }, [user, navigate]);

  // Check if Discord OAuth is enabled on the backend via dedicated status endpoint
  useEffect(() => {
    axios.get(`${API}/auth/status`)
      .then(res => setDiscordAvailable(res.data?.discord_enabled === true))
      .catch(() => setDiscordAvailable(false));
  }, []);

  // Handle Discord OAuth callback — cookie is set by backend redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const discordSuccess = params.get('discord_success');
    const discordError = params.get('discord_error');

    if (discordSuccess) {
      // Cookie was set by backend — fetch user data into auth context
      setDiscordLoading(true);
      axios.get(`${API}/auth/me`)
        .then(res => {
          authLogin(res.data);
          window.history.replaceState({}, '', '/login');
          // Route based on role and status
          if (res.data.role === 'admin') {
            navigate('/admin');
          } else if (res.data.status === 'recruit') {
            navigate('/recruit');
          } else {
            navigate('/hub');
          }
        })
        .catch(() => {
          setError('Discord login failed. Please try again.');
          setDiscordLoading(false);
          window.history.replaceState({}, '', '/login');
        });
    } else if (discordError) {
      const errorMessages = {
        authorization_denied: 'Discord authorization was denied.',
        invalid_state: 'Security validation failed. Please try again.',
        token_exchange_failed: 'Failed to connect with Discord. Please try again.',
        user_fetch_failed: 'Could not retrieve your Discord profile.',
        account_inactive: 'Your account has been deactivated. Contact an admin.',
        api_error: 'Discord API error. Please try again later.',
      };
      setError(errorMessages[discordError] || `Discord error: ${discordError}`);
      window.history.replaceState({}, '', '/login');
    }
  }, [navigate, authLogin]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const payload = isLogin
        ? { email: formData.email, password: formData.password }
        : { email: formData.email, username: formData.username, password: formData.password, rank: formData.rank || undefined, specialization: formData.specialization || undefined };
      const response = await axios.post(`${API}${endpoint}`, payload);
      // Cookie is set by backend — store user in auth context
      authLogin(response.data.user);
      // Route based on role and status
      const user = response.data.user;
      if (user.role === 'admin') {
        navigate('/admin');
      } else if (user.status === 'recruit') {
        navigate('/recruit');
      } else {
        navigate('/hub');
      }
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'An error occurred';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally { setSubmitting(false); }
  };

  const handleDiscordLogin = async () => {
    setError('');
    setDiscordLoading(true);
    try {
      const res = await axios.get(`${API}/auth/discord`);
      window.location.href = res.data.url;
    } catch (err) {
      setError('Could not initiate Discord login. Please try again.');
      setDiscordLoading(false);
    }
  };

  const loginBg = content.login?.showBackground ? {
    backgroundImage: `url('${resolveImg(content.login.backgroundImage)}')`,
    backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed'
  } : {};

  if (discordLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-amber-700 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400 tracking-wider">Authenticating with Discord...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 relative" style={loginBg}>
      {content.login?.showBackground && <div className="absolute inset-0 bg-black" style={{ opacity: content.login.overlayOpacity || 0.85 }}></div>}
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <img src={`${BACKEND_URL}/api/uploads/25th_id_patch.png`} alt="25th Infantry Division" className="w-20 h-20 mx-auto mb-4 object-contain drop-shadow-[0_0_20px_rgba(212,160,23,0.3)]" data-testid="login-logo" />
          <h1 className="text-4xl sm:text-5xl font-bold mb-2 tracking-wider" style={{ fontFamily: 'Rajdhani, sans-serif' }}>25TH INFANTRY DIVISION</h1>
          <p className="text-gray-400 text-sm tracking-wide">Tropic Lightning — Member Access</p>
        </div>
        <Card className="glass-card">
          <CardHeader><CardTitle className="text-2xl text-center tracking-wider">{isLogin ? 'MEMBER LOGIN' : 'NEW RECRUIT'}</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" data-testid="auth-form">
              {!isLogin && <div><label className="block text-sm font-medium mb-2">Username</label><Input type="text" required className="bg-black/50 border-white/20" value={formData.username} onChange={(e) => setFormData({...formData, username: e.target.value})} data-testid="auth-username-input" /></div>}
              <div><label className="block text-sm font-medium mb-2">Email</label><Input type="email" required className="bg-black/50 border-white/20" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} data-testid="auth-email-input" /></div>
              <div><label className="block text-sm font-medium mb-2">Password</label><Input type="password" required className="bg-black/50 border-white/20" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} data-testid="auth-password-input" /></div>
              {!isLogin && <>
                <div><label className="block text-sm font-medium mb-2">Rank (Optional)</label><Input type="text" className="bg-black/50 border-white/20" value={formData.rank} onChange={(e) => setFormData({...formData, rank: e.target.value})} data-testid="auth-rank-input" /></div>
                <div><label className="block text-sm font-medium mb-2">Specialization (Optional)</label><Input type="text" placeholder="e.g., Assault, Recon, Support" className="bg-black/50 border-white/20" value={formData.specialization} onChange={(e) => setFormData({...formData, specialization: e.target.value})} data-testid="auth-specialization-input" /></div>
              </>}
              {error && <div className="text-amber-500 text-sm text-center" data-testid="auth-error">{error}</div>}
              <Button type="submit" disabled={submitting} className="w-full bg-amber-700 hover:bg-amber-800 py-5 tactical-button tracking-wider" data-testid="auth-submit-button">{submitting ? 'Please wait...' : isLogin ? 'LOGIN' : 'REGISTER'}</Button>
            </form>
            {/* Discord OAuth — only shown when backend has Discord configured */}
            {discordAvailable && (
              <div className="mt-4">
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
                  <div className="relative flex justify-center text-xs"><span className="bg-black/60 px-3 text-gray-500 tracking-wider">OR</span></div>
                </div>
                <Button
                  type="button"
                  onClick={handleDiscordLogin}
                  disabled={discordLoading}
                  className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white py-5 tracking-wider transition-all"
                  data-testid="discord-login-button"
                >
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z"/></svg>
                  CONTINUE WITH DISCORD
                </Button>
              </div>
            )}
            <div className="mt-6 text-center">
              <button onClick={() => { setIsLogin(!isLogin); setError(''); }} className="text-sm text-gray-400 hover:text-amber-500 transition-colors" data-testid="auth-toggle-button">{isLogin ? "Don't have an account? Register" : 'Already have an account? Login'}</button>
            </div>
          </CardContent>
        </Card>
        <div className="mt-6 text-center"><Link to="/" className="text-sm text-gray-500 hover:text-amber-500 transition-colors">&larr; Back to Home</Link></div>
      </div>
    </div>
  );
};

// ============================================================================
// APP
// ============================================================================
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/join" element={<JoinUs />} />
          <Route path="/recruit" element={<RecruitRoute><RecruitDashboard /></RecruitRoute>} />
          <Route path="/admin" element={<ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/operations" element={<ProtectedRoute adminOnly><OperationsManager /></ProtectedRoute>} />
          <Route path="/admin/site-content" element={<ProtectedRoute adminOnly><SiteContentManager /></ProtectedRoute>} />
          <Route path="/admin/announcements" element={<ProtectedRoute adminOnly><AnnouncementsManager /></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute adminOnly><UsersManager /></ProtectedRoute>} />
          <Route path="/admin/training" element={<ProtectedRoute adminOnly><TrainingManager /></ProtectedRoute>} />
          <Route path="/admin/gallery" element={<ProtectedRoute adminOnly><GalleryManager /></ProtectedRoute>} />
          <Route path="/admin/history" element={<ProtectedRoute adminOnly><HistoryManager /></ProtectedRoute>} />
          <Route path="/admin/users/:id" element={<ProtectedRoute adminOnly><AdminMemberDetail /></ProtectedRoute>} />
          <Route path="/admin/unit-config" element={<ProtectedRoute adminOnly><UnitTagsManager /></ProtectedRoute>} />
          <Route path="/admin/recruitment" element={<ProtectedRoute adminOnly><RecruitmentManager /></ProtectedRoute>} />
          <Route path="/admin/intel" element={<ProtectedRoute adminOnly><IntelManager /></ProtectedRoute>} />
          <Route path="/admin/campaigns" element={<ProtectedRoute adminOnly><CampaignManager /></ProtectedRoute>} />
          <Route path="/hub" element={<ProtectedRoute><MemberHub /></ProtectedRoute>} />
          <Route path="/hub/profile" element={<ProtectedRoute><EditProfile /></ProtectedRoute>} />
          <Route path="/hub/discussions" element={<ProtectedRoute><DiscussionForum /></ProtectedRoute>} />
          <Route path="/hub/discussions/:id" element={<ProtectedRoute><DiscussionThread /></ProtectedRoute>} />
          <Route path="/hub/operations/:id" element={<ProtectedRoute><OperationDetail /></ProtectedRoute>} />
          <Route path="/hub/intel" element={<ProtectedRoute><IntelBoard /></ProtectedRoute>} />
          <Route path="/hub/campaign" element={<ProtectedRoute><CampaignMap /></ProtectedRoute>} />
          <Route path="/roster" element={<ProtectedRoute><UnitRoster /></ProtectedRoute>} />
          <Route path="/roster/:id" element={<ProtectedRoute><MemberProfile /></ProtectedRoute>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

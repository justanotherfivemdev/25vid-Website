import React, { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate, useParams, Navigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';
import '@/App.css';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar, Users, Shield, Megaphone, Clock, ChevronRight, Globe } from 'lucide-react';
import { defaultSiteContent } from '@/config/siteContent';
import { applyBrowserMetadata } from '@/utils/browserMetadata';
import { isStaff, STAFF_ROLES, hasPermission, PERMISSIONS } from '@/utils/permissions';
import { BootSequence } from '@/components/tactical/BootSequence';
import { LoginTransition } from '@/components/tactical/LoginTransition';

const AdminDashboard = lazy(() => import('@/pages/admin/Dashboard'));
const OperationsManager = lazy(() => import('@/pages/admin/OperationsManager'));
const SiteContentManager = lazy(() => import('@/pages/admin/SiteContentManager'));
const AnnouncementsManager = lazy(() => import('@/pages/admin/AnnouncementsManager'));
const UsersManager = lazy(() => import('@/pages/admin/UsersManager'));
const TrainingManager = lazy(() => import('@/pages/admin/TrainingManager'));
const GalleryManager = lazy(() => import('@/pages/admin/GalleryManager'));
const MemberHub = lazy(() => import('@/pages/member/MemberHub'));
const DiscussionForum = lazy(() => import('@/pages/member/DiscussionForum'));
const DiscussionThread = lazy(() => import('@/pages/member/DiscussionThread'));
const OperationDetail = lazy(() => import('@/pages/member/OperationDetail'));
const UnitRoster = lazy(() => import('@/pages/member/UnitRoster'));
const MemberProfile = lazy(() => import('@/pages/member/MemberProfile'));
const EditProfile = lazy(() => import('@/pages/member/EditProfile'));
const IntelBoard = lazy(() => import('@/pages/member/IntelBoard'));
const CampaignMap = lazy(() => import('@/pages/member/CampaignMap'));
const ThreatMapPage = lazy(() => import('@/pages/member/ThreatMapPage'));
const GalleryHub = lazy(() => import('@/pages/member/GalleryHub'));
const TrainingPage = lazy(() => import('@/pages/member/TrainingPage'));
const AdminMemberDetail = lazy(() => import('@/pages/admin/AdminMemberDetail'));
const HistoryManager = lazy(() => import('@/pages/admin/HistoryManager'));
const RecruitDashboard = lazy(() => import('@/pages/RecruitDashboard'));
const RecruitmentManager = lazy(() => import('@/pages/admin/RecruitmentManager'));
const IntelManager = lazy(() => import('@/pages/admin/IntelManager'));
const CampaignManager = lazy(() => import('@/pages/admin/CampaignManager'));
const UnitTagsManager = lazy(() => import('@/pages/admin/UnitTagsManager'));
const PartnerUnitsManager = lazy(() => import('@/pages/admin/PartnerUnitsManager'));
const PartnerLoginPage = lazy(() => import('@/pages/partner/PartnerLoginPage'));
const PartnerHub = lazy(() => import('@/pages/partner/PartnerHub'));
const PartnerAdmin = lazy(() => import('@/pages/partner/PartnerAdmin'));
const PartnerApply = lazy(() => import('@/pages/partner/PartnerApply'));
const PartnerThreatMap = lazy(() => import('@/pages/partner/PartnerThreatMap'));
const WorldMonitorPage = lazy(() => import('@/pages/WorldMonitorPage'));
const PartnerApplicationsReview = lazy(() => import('@/pages/admin/PartnerApplicationsReview'));
const AuditLogsManager = lazy(() => import('@/pages/admin/AuditLogsManager'));
const ErrorLogsManager = lazy(() => import('@/pages/admin/ErrorLogsManager'));
const LOARequest = lazy(() => import('@/pages/member/LOARequest'));
const LOAManager = lazy(() => import('@/pages/admin/LOAManager'));
const PipelineManager = lazy(() => import('@/pages/admin/PipelineManager'));
const DeploymentManager = lazy(() => import('@/pages/admin/DeploymentManager'));
const OperationalDocsManager = lazy(() => import('@/pages/admin/OperationalDocsManager'));
const ServerDashboard = lazy(() => import('@/pages/admin/servers/ServerDashboard'));
const ModIssues = lazy(() => import('@/pages/admin/servers/ModIssues'));
const LogMonitorPage = lazy(() => import('@/pages/admin/servers/LogMonitorPage'));
const ServerDiagnostics = lazy(() => import('@/pages/admin/servers/ServerDiagnostics'));
const ServerWorkspace = lazy(() => import('@/pages/admin/servers/ServerWorkspace'));
const OverviewModule = lazy(() => import('@/pages/admin/servers/modules/OverviewModule'));
const ConsoleModule = lazy(() => import('@/pages/admin/servers/modules/ConsoleModule'));
const RconModule = lazy(() => import('@/pages/admin/servers/modules/RconModule'));
const PlayersModule = lazy(() => import('@/pages/admin/servers/modules/PlayersModule'));
const MetricsModule = lazy(() => import('@/pages/admin/servers/modules/MetricsModule'));
const ModsModule = lazy(() => import('@/pages/admin/servers/modules/ModsModule'));
const SchedulesModule = lazy(() => import('@/pages/admin/servers/modules/SchedulesModule'));
const ServerSettingsModule = lazy(() => import('@/pages/admin/servers/modules/ServerSettingsModule'));
const SatConfigModule = lazy(() => import('@/pages/admin/servers/modules/SatConfigModule'));
const SystemSettingsModule = lazy(() => import('@/pages/admin/servers/modules/SystemSettingsModule'));
const NotesModule = lazy(() => import('@/pages/admin/servers/modules/NotesModule'));
const NotificationsModule = lazy(() => import('@/pages/admin/servers/modules/NotificationsModule'));
const IncidentsModule = lazy(() => import('@/pages/admin/servers/modules/IncidentsModule'));
const FileManagerModule = lazy(() => import('@/pages/admin/servers/modules/FileManagerModule'));
const TriggerExecModule = lazy(() => import('@/pages/admin/servers/modules/TriggerExecModule'));
const ReportsModule = lazy(() => import('@/pages/admin/servers/modules/ReportsModule'));
const TodoModule = lazy(() => import('@/pages/admin/servers/modules/TodoModule'));
const WatchersModule = lazy(() => import('@/pages/admin/servers/modules/WatchersModule'));
const CompareServersModule = lazy(() => import('@/pages/admin/servers/modules/CompareServersModule'));
const IntegrationsModule = lazy(() => import('@/pages/admin/servers/modules/IntegrationsModule'));
const SharedArea = lazy(() => import('@/pages/member/SharedArea'));
const PartnerSharedArea = lazy(() => import('@/pages/partner/PartnerSharedArea'));
const OperationsPlanner = lazy(() => import('@/pages/member/OperationsPlanner'));
const OperationsPlanView = lazy(() => import('@/pages/member/OperationsPlanView'));
const JoinUs = lazy(() => import('@/pages/JoinUs'));
const MemberLayout = lazy(() => import('@/components/MemberLayout'));
const AdminLayout = lazy(() => import('@/components/admin/AdminLayout'));
import ErrorBoundary from '@/components/ErrorBoundary';

const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || window.location.origin || '').replace(/\/$/, '');
const API = `${BACKEND_URL}/api`;

const getPostAuthRoute = (user) => {
  if (!user) return '/login';
  if (isStaff(user.role)) {
    // S1/S4 users with MANAGE_SERVERS go directly to server dashboard
    if (hasPermission(user.role, PERMISSIONS.MANAGE_SERVERS)) return '/admin/servers';
    return '/admin';
  }
  if (user.status === 'recruit') return '/recruit';
  return '/hub';
};

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


const mediaKind = (url) => {
  if (!url) return 'none';
  const clean = url.split('?')[0].toLowerCase();
  if (/\.(mp4|webm|mov|m4v)$/.test(clean)) return 'video';
  if (/\.(mp3|ogg|wav)$/.test(clean)) return 'audio';
  return 'image';
};

const MediaFrame = ({ src, alt, className = 'w-full h-full object-cover', imgClassName = className }) => {
  const kind = mediaKind(src);
  if (kind === 'video') {
    return <video src={src} className={className} muted loop autoPlay playsInline />;
  }
  if (kind === 'audio') {
    return (
      <div className="w-full h-full bg-[#050a0e]/60 flex items-center justify-center p-4">
        <audio src={src} controls className="w-full max-w-xs" />
      </div>
    );
  }
  return <img src={src} alt={alt} className={imgClassName} />;
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

const textOrFallback = (value, fallback) => {
  if (typeof value !== 'string') return fallback;
  return value.trim() ? value : fallback;
};

const sanitizeMediaArray = (value) => {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string' && item.trim());
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
        // Arrays need special handling to remove blank slots from Command Center image pickers.
        merged.operationalSuperiority.images = sanitizeMediaArray(res.data.operationalSuperiority?.images);
        merged.gallery.showcaseImages = sanitizeMediaArray(res.data.gallery?.showcaseImages);
        setContent(merged);
      }
    }).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;

    const tabTitle = textOrFallback(content.browser?.tabTitle, defaultSiteContent.browser.tabTitle);
    document.title = tabTitle;

    const tabDescription = textOrFallback(content.browser?.tabDescription, defaultSiteContent.browser.tabDescription);
    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement('meta');
      metaDescription.setAttribute('name', 'description');
      document.head.appendChild(metaDescription);
    }
    metaDescription.setAttribute('content', tabDescription);

    const tabIcon = textOrFallback(content.browser?.tabIcon, defaultSiteContent.browser.tabIcon);
    let iconLink = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
    if (!iconLink) {
      iconLink = document.createElement('link');
      iconLink.setAttribute('rel', 'icon');
      document.head.appendChild(iconLink);
    }

    const iconHref = tabIcon ? resolveImg(tabIcon) : `${process.env.PUBLIC_URL}/favicon.ico`;
    iconLink.setAttribute('href', iconHref);

    const cleanIcon = iconHref.split('?')[0].toLowerCase();
    const iconType = cleanIcon.endsWith('.svg') ? 'image/svg+xml' : cleanIcon.endsWith('.png') ? 'image/png' : 'image/x-icon';
    iconLink.setAttribute('type', iconType);
  }, [content, loaded]);

  return { content, loaded };
};

// ============================================================================
// PROTECTED ROUTE WRAPPER
// ============================================================================
const ProtectedRoute = ({ children, adminOnly = false, allowedRoles = null, staffOnly = false, allowRecruit = false }) => {
  const [authState, setAuthState] = useState({ loading: true, user: null });

  useEffect(() => {
    axios.get(`${API}/auth/me`)
      .then(res => {
        localStorage.setItem('user', JSON.stringify(res.data));
        setAuthState({ loading: false, user: res.data });
      })
      .catch(() => {
        localStorage.removeItem('user');
        setAuthState({ loading: false, user: null });
      });
  }, []);

  if (authState.loading) {
    return <div className="min-h-screen bg-[#050a0e] flex items-center justify-center text-[#d0d8e0]">
      <div className="text-center">
        <div className="mx-auto mb-4 h-8 w-8 rounded-full border-2 border-[#e8c547] border-t-transparent animate-spin" />
        <p className="text-xs tracking-[0.2em] text-[#4a6070]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>AUTHENTICATING...</p>
      </div>
    </div>;
  }

  if (!authState.user) return <Navigate to="/login" replace />;

  const userRole = authState.user.role;

  // Explicit allowedRoles list takes priority
  if (allowedRoles && !allowedRoles.includes(userRole)) return <Navigate to="/" replace />;

  // staffOnly = any staff (S1–S6, training_staff) can access
  if (staffOnly && !allowedRoles && !isStaff(userRole)) return <Navigate to="/" replace />;

  // Legacy adminOnly → now means any staff role
  if (adminOnly && !allowedRoles && !staffOnly && !isStaff(userRole)) return <Navigate to="/" replace />;

  // Recruit redirect (non-staff recruits go to recruit dashboard)
  if (!isStaff(userRole) && authState.user.status === 'recruit' && !allowRecruit) {
    return <Navigate to="/recruit" replace />;
  }

  return children;
};

// ============================================================================
// NAVIGATION — Military terminal bracket-style
// ============================================================================
const Navigation = ({ scrollToSection, content }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const brandName = content.nav?.brandName || '25TH INFANTRY DIVISION';
  const btnText = content.nav?.buttonText || 'ENLIST NOW';

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { id: 'about', label: 'BRIEFING' },
    { id: 'history', label: 'HISTORY' },
    { id: 'training', label: 'TRAINING' },
    { id: 'operations', label: 'OPERATIONS' },
    { id: 'intel', label: 'INTEL' },
  ];

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? 'bg-[#050a0e]/95 backdrop-blur-xl border-b border-[rgba(201,162,39,0.1)]' : 'bg-transparent'}`} data-testid="main-nav">
      <div className="container mx-auto px-4 md:px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Brand */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-1.5 h-6 bg-[#e8c547] opacity-60 group-hover:opacity-100 transition-opacity" />
            <span className="text-sm font-bold tracking-[0.2em] text-[#e8c547] group-hover:text-white transition-colors" style={{ fontFamily: "'Share Tech', sans-serif" }}>
              {brandName}
            </span>
          </Link>

          {/* Mobile toggle */}
          <button className="md:hidden text-[#d0d8e0] hover:text-[#e8c547] transition-colors" onClick={() => setMenuOpen(!menuOpen)} data-testid="mobile-menu-btn">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={menuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} /></svg>
          </button>

          {/* Desktop nav */}
          <div className={`${menuOpen ? 'flex flex-col absolute top-full left-0 right-0 bg-[#050a0e]/98 backdrop-blur-xl p-6 space-y-4 border-b border-[rgba(201,162,39,0.1)]' : 'hidden'} md:flex md:flex-row md:static md:bg-transparent md:p-0 md:space-y-0 md:border-0 items-center md:space-x-1`}>
            {navLinks.map(link => (
              <button
                key={link.id}
                onClick={() => { scrollToSection(link.id); setMenuOpen(false); }}
                className="text-xs tracking-[0.2em] text-[#4a6070] hover:text-[#e8c547] transition-all px-3 py-2 hover:bg-[rgba(201,162,39,0.04)]"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
                data-testid={`nav-${link.id}`}
              >
                [ {link.label} ]
              </button>
            ))}
            <div className="hidden md:block h-5 w-px bg-[rgba(201,162,39,0.15)] mx-2" />
            <Link to="/login" onClick={() => setMenuOpen(false)}>
              <Button className="bg-[#c9a227] hover:bg-[#e8c547] text-[#050a0e] px-5 py-2 tactical-button font-bold tracking-[0.15em] text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }} data-testid="nav-join-button">{btnText}</Button>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
};

// ============================================================================
// HERO SECTION — Military command terminal showstopper
// ============================================================================
const HeroSection = ({ content }) => {
  const heroLine1 = typeof content.hero.tagline === 'string'
    ? content.hero.tagline
    : textOrFallback(content.hero.tagline?.line1, 'TROPIC LIGHTNING');
  const heroLine2 = typeof content.hero.tagline === 'object'
    ? textOrFallback(content.hero.tagline?.line2, textOrFallback(content.hero.subtitle, ''))
    : textOrFallback(content.hero.subtitle, '');
  const heroMedia = resolveImg(content.hero.backgroundImage);
  const heroIsVideo = mediaKind(heroMedia) === 'video';

  const [typedText, setTypedText] = useState('');
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    const text = heroLine1;
    let i = 0;
    const timer = setTimeout(() => {
      const interval = setInterval(() => {
        i++;
        setTypedText(text.slice(0, i));
        if (i >= text.length) {
          clearInterval(interval);
          setTimeout(() => setShowContent(true), 300);
        }
      }, 60);
      return () => clearInterval(interval);
    }, 500);
    return () => clearTimeout(timer);
  }, [heroLine1]);

  return (
    <section className="hero-section relative min-h-screen flex items-center justify-center" style={heroIsVideo ? undefined : { backgroundImage: `url('${heroMedia}')`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }} data-testid="hero-section">
      {heroIsVideo && <video src={heroMedia} className="absolute inset-0 w-full h-full object-cover" muted loop autoPlay playsInline />}
      <div className="absolute inset-0 bg-gradient-to-b from-[#050a0e]/70 via-[#050a0e]/80 to-[#050a0e]" />
      <div className="hero-grid-overlay" />
      <div className="hero-topo-overlay" />
      <div className="hero-aurora hero-aurora-left" />
      <div className="hero-aurora hero-aurora-right" />

      <div className="relative z-10 text-center px-4 md:px-6">
        {/* Unit patch — clean, no glow animation */}
        <div className="mb-4" data-testid="unit-logo">
          <img
            src={`${BACKEND_URL}/api/uploads/25th_id_patch.png`}
            alt="25th Infantry Division"
            className="w-52 h-52 sm:w-64 sm:h-64 mx-auto object-contain"
          />
        </div>

        {/* Classification bar */}
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="h-px w-12 bg-gradient-to-r from-transparent to-[rgba(201,162,39,0.3)]" />
          <span className="text-[10px] tracking-[0.4em] text-[#e8c547] opacity-50" style={{ fontFamily: "'Oswald', sans-serif" }}>
            DIGITAL COMMAND CENTER
          </span>
          <div className="h-px w-12 bg-gradient-to-l from-transparent to-[rgba(201,162,39,0.3)]" />
        </div>

        {/* Main title — typewriter effect */}
        <h1 className="text-4xl sm:text-5xl lg:text-7xl font-bold tracking-[0.12em] leading-tight" style={{ fontFamily: "'Share Tech', sans-serif" }} data-testid="hero-tagline">
          <span className="block text-[#e8c547]">
            {typedText}
            {typedText.length < heroLine1.length && (
              <span className="inline-block w-[3px] h-[0.8em] bg-[#e8c547] ml-1 animate-[blink_0.8s_steps(1)_infinite] align-middle" />
            )}
          </span>
          {heroLine2 && showContent && (
            <span className="block text-base sm:text-lg lg:text-xl text-[#4a6070] mt-4 tracking-[0.25em] animate-slide-up-fade" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              // {heroLine2.toUpperCase()}
            </span>
          )}
        </h1>

        {/* CTA Buttons */}
        {showContent && (
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row animate-slide-up-fade" style={{ animationDelay: '0.4s', animationFillMode: 'backwards' }}>
            <Link to="/join">
              <Button className="bg-[#c9a227] hover:bg-[#e8c547] text-[#050a0e] px-10 py-5 text-sm tactical-button tracking-[0.2em] font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }} data-testid="hero-cta-button">
                {content.nav?.buttonText || 'INITIATE ENLISTMENT'}
              </Button>
            </Link>
            <Link to="/login">
              <Button variant="outline" className="border-[rgba(201,162,39,0.2)] bg-transparent px-8 py-5 text-sm tracking-[0.2em] text-[#e8c547] hover:bg-[rgba(201,162,39,0.05)] hover:border-[rgba(201,162,39,0.4)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                [ MEMBER ACCESS ]
              </Button>
            </Link>
          </div>
        )}

        {/* Scroll indicator */}
        <div className="mt-10 flex items-center justify-center gap-2 text-[10px] tracking-[0.3em] text-[#4a6070] uppercase" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          <span className="w-8 h-px bg-gradient-to-r from-transparent to-[rgba(201,162,39,0.2)]" />
          SCROLL TO EXPLORE
          <span className="w-8 h-px bg-gradient-to-l from-transparent to-[rgba(201,162,39,0.2)]" />
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#050a0e] to-transparent" />
    </section>
  );
};

// ============================================================================
// ABOUT SECTION → "UNIT BRIEFING"
// ============================================================================
const AboutSection = ({ content }) => {
  const quote = typeof content.about?.quote === 'object' ? content.about.quote : { text: content.about?.quote || '', author: '', backgroundImage: '' };
  const aboutHeading = textOrFallback(content.sectionHeadings?.about?.heading, 'UNIT BRIEFING');
  const aboutSubtext = textOrFallback(content.sectionHeadings?.about?.subtext, '');
  return (
    <section id="about" className="py-28 px-4 md:px-6 relative bg-[#050a0e]" data-testid="about-section">
      <div className="section-divider absolute top-0 left-0 right-0" />
      <div className="container mx-auto max-w-6xl">
        <div className="grid md:grid-cols-[280px,1fr] gap-8 md:gap-16 items-start">
          <div className="space-y-8">
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[#e8c547] text-xs">▶</span>
                <span className="text-[10px] tracking-[0.3em] text-[#e8c547] opacity-60" style={{ fontFamily: "'Oswald', sans-serif" }}>BRIEFING</span>
              </div>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold section-underline tracking-[0.1em] text-[#d0d8e0]" style={{ fontFamily: "'Share Tech', sans-serif" }} data-testid="about-heading">{aboutHeading}</h2>
              {aboutSubtext && <p className="text-sm text-[#4a6070] tracking-wide" data-testid="about-subtext">{aboutSubtext}</p>}
            </div>
            {content.about?.logoImage && (
              <div className="w-44 h-44 opacity-70 mt-6 corner-bracket" data-testid="about-logo">
                <MediaFrame src={resolveImg(content.about.logoImage)} alt="Unit Emblem" className="w-44 h-44 object-contain" imgClassName="w-44 h-44 object-contain" />
              </div>
            )}
            <Link to="/login">
              <Button className="bg-[#c9a227] hover:bg-[#e8c547] text-[#050a0e] px-8 py-4 text-sm tactical-button tracking-[0.15em] font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }} data-testid="about-join-button">
                {content.nav?.buttonText || 'ENLIST NOW'}
              </Button>
            </Link>
          </div>
          <div className="space-y-8 text-base leading-relaxed" style={{ fontFamily: "'Inter', sans-serif" }}>
            <p className="text-[#8a9aa8]" data-testid="about-description-1">{content.about?.paragraph1}</p>
            <div className="h-px bg-gradient-to-r from-transparent via-[rgba(201,162,39,0.15)] to-transparent" />
            <p className="text-[#8a9aa8]" data-testid="about-description-2">{content.about?.paragraph2}</p>
            {/* Quote block */}
            <div className="mt-12 relative overflow-hidden corner-bracket" style={{ minHeight: '280px' }}>
              {mediaKind(resolveImg(quote.backgroundImage)) === 'video'
                ? <video src={resolveImg(quote.backgroundImage)} className="absolute inset-0 w-full h-full object-cover" muted loop autoPlay playsInline />
                : <div className="absolute inset-0" style={{ backgroundImage: `url('${resolveImg(quote.backgroundImage)}')`, backgroundSize: 'cover', backgroundPosition: 'center' }} />}
              <div className="absolute inset-0 bg-gradient-to-br from-[#050a0e]/92 via-[#050a0e]/80 to-[rgba(201,162,39,0.1)]" />
              <div className="relative z-10 p-10 md:p-14 flex items-center justify-center min-h-[280px]">
                <div className="border-l-2 border-[#e8c547] pl-8 max-w-xl">
                  <p className="text-lg md:text-xl italic text-[#8a9aa8] mb-5 font-light leading-relaxed" style={{ fontFamily: "'Inter', sans-serif" }} data-testid="founder-quote">{quote.text}</p>
                  <p className="text-sm text-[#e8c547] font-bold tracking-[0.15em]" style={{ fontFamily: "'Oswald', sans-serif" }} data-testid="founder-name">{quote.author}</p>
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
// QUICK NAV TAB STRIP
// ============================================================================
const HistoryQuickTab = ({ onNavigate }) => (
  <section className="px-4 md:px-6 -mt-2 relative z-20" data-testid="history-quick-tab">
    <div className="container mx-auto max-w-6xl">
      <button
        type="button"
        onClick={onNavigate}
        className="w-full md:w-auto inline-flex items-center gap-3 border border-[rgba(201,162,39,0.15)] bg-[#050a0e] hover:bg-[#0c1117] px-6 py-3 tracking-[0.15em] text-xs text-[#4a6070] hover:text-[#e8c547] transition-all duration-300 hover:border-[rgba(201,162,39,0.3)]"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
        data-testid="history-quick-scroll"
      >
        <span className="text-[#e8c547] font-bold">HISTORY</span>
        <span className="h-3 w-px bg-[rgba(201,162,39,0.2)]" />
        <span>JUMP TO TIMELINE</span>
        <span aria-hidden="true" className="text-[#e8c547]">↓</span>
      </button>
    </div>
  </section>
);

// ============================================================================
// UNIT HISTORY TIMELINE SECTION
// ============================================================================
const UnitHistorySection = ({ content }) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [entryBrightness, setEntryBrightness] = useState({});
  const historyHeading = textOrFallback(content.sectionHeadings?.history?.heading, 'UNIT HISTORY');
  const historySubtext = textOrFallback(content.sectionHeadings?.history?.subtext, 'Over 80 years of service, sacrifice, and the Tropic Lightning legacy');

  useEffect(() => {
    axios.get(`${API}/unit-history`).then(r => setEntries(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;

    const imageEntries = entries.filter((entry) => entry.image_url);
    if (imageEntries.length === 0) {
      setEntryBrightness({});
      return undefined;
    }

    const analyzeImageBrightness = (src) => new Promise((resolve) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.referrerPolicy = 'no-referrer';

      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve('dark');
            return;
          }

          canvas.width = 24;
          canvas.height = 24;
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

          let totalLuminance = 0;
          let count = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];
            totalLuminance += (0.299 * r) + (0.587 * g) + (0.114 * b);
            count += 1;
          }

          const average = count ? totalLuminance / count : 0;
          resolve(average > 130 ? 'bright' : 'dark');
        } catch {
          resolve('dark');
        }
      };

      image.onerror = () => resolve('dark');
      image.src = src;
    });

    Promise.all(imageEntries.map(async (entry) => {
      const imageSrc = entry.image_url.startsWith('http') ? entry.image_url : `${BACKEND_URL}/api${entry.image_url}`;
      const contrast = await analyzeImageBrightness(imageSrc);
      return [entry.id, contrast];
    })).then((results) => {
      if (cancelled) return;
      setEntryBrightness(Object.fromEntries(results));
    });

    return () => {
      cancelled = true;
    };
  }, [entries]);

  const typeAccent = (t) => ({
    campaign: 'border-[#e8c547] bg-[#c9a227]',
    operation: 'border-[#ff3333] bg-[#ff3333]',
    milestone: 'border-[#e8c547] bg-[#e8c547]',
  }[t] || 'border-[#e8c547] bg-[#c9a227]');

  if (loading || entries.length === 0) return null;

  return (
    <section id="history" className="py-28 px-4 md:px-6 relative bg-[#050a0e]" data-testid="unit-history-section">
      <div className="section-divider absolute top-0 left-0 right-0" />
      <div className="container mx-auto max-w-5xl">
        <div className="section-label mb-16">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#d0d8e0]" style={{ fontFamily: "'Share Tech', sans-serif" }} data-testid="unit-history-heading">{historyHeading}</h2>
          <p>{historySubtext}</p>
        </div>

        {/* Timeline */}
        <div className="relative">
          {/* Center line */}
          <div className="absolute left-6 md:left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-[rgba(201,162,39,0.4)] via-[rgba(201,162,39,0.15)] to-transparent" aria-hidden="true" />

          <div className="space-y-12 md:space-y-16">
            {entries.map((entry, idx) => {
              const accent = typeAccent(entry.campaign_type);
              const isLeft = idx % 2 === 0;
              const hasImage = Boolean(entry.image_url);
              const detectedBrightness = entryBrightness[entry.id] || 'dark';
              const requestedContrast = entry.text_contrast_mode || 'auto';
              const useDarkText = hasImage && (requestedContrast === 'dark' || (requestedContrast === 'auto' && detectedBrightness === 'bright'));
              const imageSrc = hasImage
                ? (entry.image_url.startsWith('http') ? entry.image_url : `${BACKEND_URL}/api${entry.image_url}`)
                : '';
              const overlayOpacity = Math.min(90, Math.max(20, entry.image_overlay_opacity ?? 60)) / 100;
              const overlayColor = useDarkText
                ? `rgba(255, 255, 255, ${(overlayOpacity * 0.45).toFixed(2)})`
                : `rgba(0, 0, 0, ${overlayOpacity.toFixed(2)})`;

              return (
                <div key={entry.id} className="relative" data-testid={`history-timeline-${idx}`}>
                  {/* Dot on the line */}
                  <div className={`absolute left-6 md:left-1/2 w-3 h-3 rounded-full ${accent.split(' ')[1]} border-2 border-[#050a0e] -translate-x-1/2 z-10 shadow-[0_0_8px_rgba(201,162,39,0.3)]`} />

                  {/* Content card */}
                  <div className={`ml-14 md:ml-0 md:w-[calc(50%-2.5rem)] ${isLeft ? 'md:mr-auto md:pr-0' : 'md:ml-auto md:pl-0'}`}>
                    <div
                      className={`group relative border ${accent.split(' ')[0]}/30 overflow-hidden ${hasImage ? '' : 'bg-[#0c1117]'} p-6 hover:border-[rgba(201,162,39,0.3)] transition-all duration-500 corner-bracket`}
                      style={hasImage ? {
                        backgroundImage: `url('${imageSrc}')`,
                        backgroundSize: 'cover',
                        backgroundPosition: entry.image_position || 'center'
                      } : undefined}
                    >
                      {hasImage && (
                        <>
                          <div
                            className="absolute inset-0 transition-opacity duration-500"
                            style={{ backgroundColor: overlayColor }}
                            aria-hidden="true"
                          ></div>
                          <div className="absolute inset-0 bg-gradient-to-br from-black/40 via-transparent to-black/55" aria-hidden="true"></div>
                        </>
                      )}

                      <div className={`relative z-10 ${useDarkText ? 'text-[#d0d8e0]' : 'text-white'}`}>
                      {/* Year badge */}
                      <div className="flex items-center gap-3 mb-3">
                        <span className={`${useDarkText ? 'text-[#d0d8e0]' : 'text-[#e8c547]'} font-bold text-lg tracking-wider`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>{entry.year}</span>
                        <span className={`text-[10px] tracking-widest px-2 py-0.5 rounded ${accent.split(' ')[1]} text-white/90`}>{entry.campaign_type.toUpperCase()}</span>
                      </div>

                      <h3 className="text-xl md:text-2xl font-bold tracking-wide mb-3" style={{ fontFamily: "'Share Tech', sans-serif" }}>{entry.title}</h3>

                      <p className={`${useDarkText ? 'text-[#8a9aa8]' : 'text-[#d0d8e0]'} text-sm leading-relaxed`}>{entry.description}</p>
                      </div>
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
  const heading = textOrFallback(sh.heading, 'OPERATIONAL SUPERIORITY');
  const subtext = textOrFallback(sh.subtext, '');
  return (
    <section className="py-28 px-4 md:px-6 relative bg-[#050a0e]" data-testid="operational-superiority-section">
      <div className="section-divider absolute top-0 left-0 right-0" />
      <div className="container mx-auto max-w-7xl">
        <div className="grid md:grid-cols-2 gap-16 items-center mb-20">
          <h2 className="text-3xl sm:text-4xl lg:text-6xl font-bold leading-tight text-[#d0d8e0]" style={{ fontFamily: "'Share Tech', sans-serif" }} data-testid="ops-superiority-heading">
            {heading.split(' ').map((w, i) => <span key={i} className="block">{w}</span>)}
          </h2>
          <div className="relative">
            <div className="absolute -left-4 top-0 bottom-0 w-0.5 bg-gradient-to-b from-[#e8c547] via-[rgba(201,162,39,0.3)] to-transparent" />
            <div className="pl-8 space-y-3">
              {subtext && <p className="text-[10px] uppercase tracking-[0.25em] text-[#e8c547] opacity-60" style={{ fontFamily: "'Oswald', sans-serif" }} data-testid="ops-superiority-subtext">{subtext}</p>}
              <p className="text-base leading-relaxed text-[#8a9aa8]" style={{ fontFamily: "'Inter', sans-serif" }} data-testid="ops-superiority-description">{content.operationalSuperiority?.description}</p>
            </div>
          </div>
        </div>
        <div className="h-px bg-gradient-to-r from-transparent via-[rgba(201,162,39,0.15)] to-transparent mb-16" />
        <div className="grid md:grid-cols-3 gap-6">
          {(content.operationalSuperiority?.images || []).map((img, idx) => (
            <div key={idx} className="aspect-[3/4] overflow-hidden border border-[rgba(201,162,39,0.1)] hover:border-[rgba(201,162,39,0.3)] transition-all duration-500 shadow-2xl shadow-black/40 group corner-bracket" data-testid={`ops-image-${idx + 1}`}>
              <MediaFrame src={resolveImg(img)} alt={`Tactical ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
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
  const heading = textOrFallback(sh.heading, 'LETHALITY ON DEMAND');
  const subtext = textOrFallback(sh.subtext, '');
  const logisticsHeading = textOrFallback(content.lethality?.logistics?.heading, 'LOGISTICS & OPERATIONAL SUPPORT');
  const trainingHeading = textOrFallback(content.lethality?.training?.heading, 'TRAINING PROGRAMS');
  return (
    <section id="training" className="py-28 px-4 md:px-6 bg-[#050a0e]" data-testid="lethality-section">
      <div className="container mx-auto max-w-7xl space-y-20">
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[#e8c547] text-xs">▶</span>
            <span className="text-[10px] tracking-[0.3em] text-[#e8c547] opacity-60" style={{ fontFamily: "'Oswald', sans-serif" }}>TRAINING PROTOCOL</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-wider text-[#d0d8e0]" style={{ fontFamily: "'Share Tech', sans-serif" }} data-testid="lethality-heading">{heading}</h2>
          {subtext && <p className="text-sm text-[#4a6070]" data-testid="lethality-subtext">{subtext}</p>}
        </div>
        {/* Logistics */}
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h3 className="text-2xl font-bold tracking-wide text-[#d0d8e0]" style={{ fontFamily: "'Share Tech', sans-serif" }} data-testid="logistics-heading">{logisticsHeading}</h3>
            <p className="text-sm leading-relaxed text-[#8a9aa8]" style={{ fontFamily: "'Inter', sans-serif" }} data-testid="logistics-description">{content.lethality?.logistics?.description}</p>
          </div>
          <div className="aspect-video overflow-hidden border border-[rgba(201,162,39,0.1)] shadow-2xl shadow-black/40 group corner-bracket">
            <MediaFrame src={resolveImg(content.lethality?.logistics?.image)} alt="Logistics" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
          </div>
        </div>
        <div className="h-px bg-gradient-to-r from-transparent via-[rgba(201,162,39,0.15)] to-transparent" />
        {/* Training */}
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="order-2 md:order-1 aspect-video overflow-hidden border border-[rgba(201,162,39,0.1)] shadow-2xl shadow-black/40 group corner-bracket">
            <MediaFrame src={resolveImg(content.lethality?.training?.image)} alt="Training" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
          </div>
          <div className="order-1 md:order-2 space-y-6">
            <h3 className="text-2xl font-bold tracking-wide text-[#d0d8e0]" style={{ fontFamily: "'Share Tech', sans-serif" }} data-testid="training-heading">{trainingHeading}</h3>
            <p className="text-sm leading-relaxed text-[#8a9aa8]" style={{ fontFamily: "'Inter', sans-serif" }} data-testid="training-description">{content.lethality?.training?.description}</p>
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
    combat:   { bg: 'bg-[#ff3333]/80', border: 'border-[rgba(255,51,51,0.25)]', glow: 'shadow-[0_0_15px_rgba(255,51,51,0.1)]' },
    training: { bg: 'bg-[#556B2F]/80', border: 'border-[rgba(201,162,39,0.2)]', glow: 'shadow-[0_0_15px_rgba(201,162,39,0.08)]' },
    recon:    { bg: 'bg-[#c9a227]/80', border: 'border-[rgba(201,162,39,0.25)]', glow: 'shadow-[0_0_15px_rgba(201,162,39,0.1)]' },
    support:  { bg: 'bg-[#00aaff]/80', border: 'border-[rgba(0,170,255,0.25)]', glow: 'shadow-[0_0_15px_rgba(0,170,255,0.08)]' },
  };
  const getType = (t) => typeConfig[t] || typeConfig.combat;

  return (
    <section id="operations" className="py-28 px-4 md:px-6 relative bg-[#050a0e]" data-testid="operations-section">
      <div className="section-divider absolute top-0 left-0 right-0" />
      <div className="container mx-auto max-w-7xl">
        <div className="section-label">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#d0d8e0]" style={{ fontFamily: "'Share Tech', sans-serif" }} data-testid="upcoming-ops-heading">{sh.heading || 'ACTIVE OPERATIONS'}</h2>
          <p>{sh.subtext || 'Join the next tactical mission'}</p>
        </div>
        {loading ? <div className="text-center text-[#4a6070]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>LOADING OPERATIONS...</div> : operations.length === 0 ? (
          <div className="text-center text-[#4a6070] py-12 border border-dashed border-[rgba(201,162,39,0.1)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>NO OPERATIONS CURRENTLY SCHEDULED. CHECK BACK SOON.</div>
        ) : (
          <div className="grid md:grid-cols-3 gap-6">
            {operations.map((op, idx) => {
              const tc = getType(op.operation_type);
              return (
                <Card key={op.id} className={`op-card corner-bracket bg-[#0c1117] backdrop-blur border ${tc.border} ${tc.glow}`} data-testid={`operation-card-${idx}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between mb-3">
                      <Badge className={`${tc.bg} text-white text-[10px] tracking-[0.2em] px-3 py-0.5`} style={{ fontFamily: "'Oswald', sans-serif" }}>{op.operation_type.toUpperCase()}</Badge>
                      {op.logo_url && <img src={resolveImg(op.logo_url)} alt="" className="w-7 h-7 object-contain opacity-70" />}
                    </div>
                    <CardTitle className="text-lg tracking-wide text-[#d0d8e0]" style={{ fontFamily: "'Share Tech', sans-serif" }}>{op.title}</CardTitle>
                    <CardDescription className="text-[#4a6070] text-xs mt-1 line-clamp-2" style={{ fontFamily: "'Inter', sans-serif" }}>{op.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-xs mb-4" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      <div className="flex items-center text-[#8a9aa8]"><Calendar className="w-3.5 h-3.5 mr-2 text-[#e8c547] shrink-0"/>{op.date}</div>
                      <div className="flex items-center text-[#8a9aa8]"><Clock className="w-3.5 h-3.5 mr-2 text-[#e8c547] shrink-0"/>{op.time}</div>
                      {op.max_participants && <div className="flex items-center text-[#4a6070]"><Users className="w-3.5 h-3.5 mr-2 text-[#e8c547] shrink-0"/><span>{op.rsvps?.length || 0} / {op.max_participants} operators</span></div>}
                    </div>
                    <Link to="/login"><Button className="w-full bg-[#c9a227] hover:bg-[#e8c547] text-[#050a0e] text-xs tracking-[0.15em] tactical-button" style={{ fontFamily: "'JetBrains Mono', monospace" }} data-testid={`operation-rsvp-${idx}`}>RSVP NOW <ChevronRight className="w-3.5 h-3.5 ml-1" /></Button></Link>
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
    urgent: { class: 'intel-urgent', badge: 'bg-[#ff3333]/80 text-white', dot: 'bg-[#ff3333]' },
    high:   { class: 'intel-high',   badge: 'bg-[#ff6600]/80 text-white', dot: 'bg-[#ff6600]' },
    normal: { class: 'intel-normal', badge: 'bg-[#c9a227]/60 text-[#e8c547]', dot: 'bg-[#c9a227]' },
    low:    { class: 'intel-low',    badge: 'bg-[#0c1117] text-[#4a6070]', dot: 'bg-[#4a6070]' },
  };
  const getPriority = (p) => priorityConfig[p] || priorityConfig.normal;

  return (
    <section id="intel" className="py-28 px-4 md:px-6 relative bg-[#050a0e]" data-testid="announcements-section">
      <div className="section-divider absolute top-0 left-0 right-0" />
      <div className="container mx-auto max-w-7xl">
        <div className="section-label">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#d0d8e0]" style={{ fontFamily: "'Share Tech', sans-serif" }} data-testid="announcements-heading">{sh.heading || 'LATEST INTEL'}</h2>
          <p>{sh.subtext || 'Stay informed with our latest updates'}</p>
        </div>
        {loading ? <div className="text-center text-[#4a6070]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>LOADING INTEL...</div> : announcements.length === 0 ? (
          <div className="text-center text-[#4a6070] py-12 border border-dashed border-[rgba(201,162,39,0.1)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>NO ACTIVE INTEL BRIEFINGS.</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {announcements.map((ann, idx) => {
              const pc = getPriority(ann.priority);
              return (
                <Card key={ann.id} className={`intel-card bg-[#0c1117] backdrop-blur border border-[rgba(201,162,39,0.08)] ${pc.class}`} data-testid={`announcement-card-${idx}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${pc.dot}`} />
                        <Badge className={`${pc.badge} text-[10px] tracking-[0.15em]`} style={{ fontFamily: "'Oswald', sans-serif" }}>{ann.priority.toUpperCase()}</Badge>
                      </div>
                      <span className="text-[10px] text-[#4a6070]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{new Date(ann.created_at).toLocaleDateString()}</span>
                    </div>
                    <CardTitle className="text-lg mt-2 tracking-wide text-[#d0d8e0]" style={{ fontFamily: "'Share Tech', sans-serif" }}>{ann.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-[#4a6070] text-xs leading-relaxed" style={{ fontFamily: "'Inter', sans-serif" }}>{ann.content}</p>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-[10px] text-[#4a6070] flex items-center" style={{ fontFamily: "'JetBrains Mono', monospace" }}><Megaphone className="w-3 h-3 mr-1.5 text-[#e8c547] opacity-40"/>{ann.author_name}</span>
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
    <section className="py-28 px-4 md:px-6 relative bg-[#050a0e]" data-testid="gallery-section">
      <div className="section-divider absolute top-0 left-0 right-0" />
      <div className="container mx-auto max-w-7xl">
        <div className="section-label">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#d0d8e0]" style={{ fontFamily: "'Share Tech', sans-serif" }} data-testid="gallery-heading">{sh.heading || 'SIGNAL INTELLIGENCE'}</h2>
          <p>{sh.subtext || 'Moments from the field'}</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-5">
          {(content.gallery?.showcaseImages || []).map((img, idx) => (
            <div key={idx} className="aspect-square overflow-hidden border border-[rgba(201,162,39,0.1)] hover:border-[rgba(201,162,39,0.3)] transition-all duration-500 cursor-pointer group shadow-xl shadow-black/30 corner-bracket relative" data-testid={`gallery-image-${idx}`}>
              <MediaFrame src={resolveImg(img)} alt={`Mission ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
              <div className="absolute inset-0 bg-[#050a0e]/20 group-hover:bg-transparent transition-all duration-500" />
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <span className="text-[8px] tracking-[0.3em] text-[#e8c547] bg-[#050a0e]/80 px-2 py-0.5" style={{ fontFamily: "'JetBrains Mono', monospace" }}>VIEWING</span>
              </div>
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
    <section className="py-28 px-4 md:px-6 relative bg-[#050a0e]" data-testid="join-section">
      <div className="section-divider absolute top-0 left-0 right-0" />
      <div className="container mx-auto max-w-3xl text-center">
        <div className="section-label">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#d0d8e0]" style={{ fontFamily: "'Share Tech', sans-serif" }} data-testid="join-heading">{sh.heading || 'ENLISTMENT PROTOCOL'}</h2>
          <p>{sh.subtext || 'Become part of the Tropic Lightning legacy'}</p>
        </div>
        {/* Status readout */}
        <div className="mb-8 flex items-center justify-center gap-2">
          <span className="status-dot status-dot-online" />
          <span className="text-[10px] tracking-[0.3em] text-[#e8c547]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>RECRUITMENT STATUS: ACTIVE</span>
        </div>
        <Card className="glass-card corner-bracket">
          <CardContent className="p-8 md:p-12 space-y-6">
            <p className="text-[#8a9aa8] text-sm leading-relaxed" style={{ fontFamily: "'Inter', sans-serif" }}>
              The 25th Infantry Division is always looking for dedicated operators ready to commit to tactical excellence,
              teamwork, and the Tropic Lightning tradition. Create an account to access the Member Hub, view upcoming
              operations, and begin your journey with the unit.
            </p>
            <div className="pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-2xl mx-auto">
                <Link to="/join" className="w-full">
                  <Button variant="outline" className="border-[rgba(255,51,51,0.3)] text-[#ff3333] hover:bg-[rgba(255,51,51,0.05)] px-4 py-3 text-xs tracking-[0.15em] w-full" style={{ fontFamily: "'JetBrains Mono', monospace" }} data-testid="join-threat-map-button">
                    <Globe className="mr-2 w-4 h-4 flex-shrink-0" />GLOBAL THREAT MAP
                  </Button>
                </Link>
                <Link to="/login" className="w-full">
                  <Button className="bg-[#c9a227] hover:bg-[#e8c547] text-[#050a0e] px-4 py-3 text-xs tactical-button tracking-[0.15em] w-full font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }} data-testid="join-register-button">
                    <Shield className="mr-2 w-4 h-4 flex-shrink-0" />CREATE ACCOUNT
                  </Button>
                </Link>
                {content.footer?.discord && (
                  <a href={content.footer.discord} target="_blank" rel="noopener noreferrer" className="w-full sm:col-span-2 lg:col-span-1">
                    <Button variant="outline" className="border-[rgba(201,162,39,0.2)] text-[#e8c547] hover:bg-[rgba(201,162,39,0.05)] px-4 py-3 text-xs tracking-[0.15em] w-full" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      JOIN OUR DISCORD
                    </Button>
                  </a>
                )}
              </div>
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
  <footer className="bg-[#050a0e] border-t border-[rgba(201,162,39,0.08)] py-14 px-4 md:px-6" data-testid="footer">
    <div className="container mx-auto max-w-7xl">
      {/* Classification banner */}
      <div className="classification-banner mb-10">UNCLASSIFIED // FOR OFFICIAL USE ONLY</div>

      <div className="grid md:grid-cols-3 gap-10 mb-10">
        <div>
          <h3 className="text-sm font-bold mb-3 tracking-[0.15em] text-[#e8c547]" style={{ fontFamily: "'Share Tech', sans-serif" }}>{content.nav?.brandName || '25TH INFANTRY DIVISION'}</h3>
          <p className="text-xs text-[#4a6070] leading-relaxed" style={{ fontFamily: "'Inter', sans-serif" }}>{content.footer?.tagline || 'Tropic Lightning — Ready to Strike'}</p>
        </div>
        <div>
          <h4 className="text-[10px] font-bold mb-3 tracking-[0.3em] text-[#e8c547] opacity-50" style={{ fontFamily: "'Oswald', sans-serif" }}>QUICK LINKS</h4>
          <div className="h-px w-12 bg-[rgba(201,162,39,0.15)] mb-3" />
          <ul className="space-y-2 text-xs text-[#4a6070]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            <li><a href="#about" className="hover:text-[#e8c547] transition-colors">[ BRIEFING ]</a></li>
            <li><a href="#history" className="hover:text-[#e8c547] transition-colors">[ HISTORY ]</a></li>
            <li><a href="#training" className="hover:text-[#e8c547] transition-colors">[ TRAINING ]</a></li>
            <li><a href="#operations" className="hover:text-[#e8c547] transition-colors">[ OPERATIONS ]</a></li>
            <li><Link to="/login" className="hover:text-[#e8c547] transition-colors">[ MEMBER PORTAL ]</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-[10px] font-bold mb-3 tracking-[0.3em] text-[#e8c547] opacity-50" style={{ fontFamily: "'Oswald', sans-serif" }}>COMMUNICATIONS</h4>
          <div className="h-px w-12 bg-[rgba(201,162,39,0.15)] mb-3" />
          <div className="space-y-2 text-xs text-[#4a6070]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {content.footer?.discord && <p><a href={content.footer.discord} target="_blank" rel="noopener noreferrer" className="hover:text-[#e8c547] transition-colors">[ DISCORD SERVER ]</a></p>}
            {(content.footer?.contact?.email || content.footer?.email) && <p>EMAIL: {content.footer?.contact?.email || content.footer?.email}</p>}
          </div>
        </div>
      </div>
      <div className="footer-divider mb-8" />
      <div className="space-y-3 text-center">
        <p className="text-[10px] text-[#4a6070] tracking-[0.2em]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>&copy; {new Date().getFullYear()} 25TH INFANTRY DIVISION — TROPIC LIGHTNING</p>
        <p className="text-[9px] text-[#2a3a4a] max-w-2xl mx-auto leading-relaxed" style={{ fontFamily: "'Inter', sans-serif" }}>{content.footer?.disclaimer || 'This is a fictional Arma Reforger milsim unit. We are NOT in any way tied to the Department of War or the United States Department of Defense.'}</p>
      </div>
    </div>
  </footer>
);

// ============================================================================
// LANDING PAGE
// ============================================================================
const LandingPage = () => {
  const { content } = useSiteContent();
  const [bootDone, setBootDone] = useState(false);
  const scrollToSection = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="App">
      <BootSequence onComplete={() => setBootDone(true)} skipIfReturning />
      {bootDone && (
        <>
          <div className="landing-glitch-overlay" aria-hidden="true" />
          <Navigation scrollToSection={scrollToSection} content={content} />
          <HeroSection content={content} />
          <AboutSection content={content} />
          <HistoryQuickTab onNavigate={() => scrollToSection('history')} />
          <UnitHistorySection content={content} />
          <OperationalSuperioritySection content={content} />
          <LethalitySection content={content} />
          <UpcomingOperationsSection content={content} />
          <AnnouncementsSection content={content} />
          <GallerySection content={content} />
          <JoinUsSection content={content} />
          <Footer content={content} />
        </>
      )}
    </div>
  );
};



// ============================================================================
// LOGIN PAGE
// ============================================================================
const LoginPage = () => {
  const { content } = useSiteContent();
  const { login } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ email: '', password: '', username: '', rank: '', specialization: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [discordLoading, setDiscordLoading] = useState(false);
  const [discordAvailable, setDiscordAvailable] = useState(false);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState('');
  const [resendingVerification, setResendingVerification] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimChecked, setClaimChecked] = useState(false);
  const [claimUsername, setClaimUsername] = useState('');
  const [loginTransition, setLoginTransition] = useState(null);
  const navigate = useNavigate();

  // If already authenticated, show login transition animation then redirect
  useEffect(() => {
    // Don't interfere with Discord OAuth or email verification flows
    const params = new URLSearchParams(window.location.search);
    if (params.get('discord_success') || params.get('discord_error') || params.get('verify_email_token')) return;

    axios.get(`${API}/auth/me`)
      .then(res => {
        login(res.data);
        const dest = getPostAuthRoute(res.data);
        setLoginTransition({ username: res.data.username, dest });
      })
      .catch(() => {});
  }, [login, setLoginTransition]);

  // Check if Discord OAuth is enabled on the backend
  useEffect(() => {
    axios.get(`${API}/auth/discord`).then(() => setDiscordAvailable(true)).catch(() => {});
  }, []);

  // Handle Discord OAuth callback — cookie is set by backend redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const discordSuccess = params.get('discord_success');
    const discordError = params.get('discord_error');
    const verifyEmailToken = params.get('verify_email_token');

    if (verifyEmailToken) {
      setSubmitting(true);
      axios.post(`${API}/auth/verify-email`, { token: verifyEmailToken })
        .then(res => {
          setIsLogin(true);
          setError('');
          setPendingVerificationEmail('');
          setNotice(res.data?.message || 'Email verified successfully. You can now log in.');
        })
        .catch(err => {
          setNotice('');
          setError(err.response?.data?.detail || 'This verification link is invalid or has expired.');
        })
        .finally(() => {
          setSubmitting(false);
          window.history.replaceState({}, '', '/login');
        });
      return;
    }

    if (discordSuccess) {
      // Cookie was set by backend — fetch user data
      setDiscordLoading(true);
      axios.get(`${API}/auth/me`)
        .then(res => {
          login(res.data);
          window.history.replaceState({}, '', '/login');
          const dest = getPostAuthRoute(res.data);
          setDiscordLoading(false);
          setLoginTransition({ username: res.data.username, dest });
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
  }, [navigate, login]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setSubmitting(true);
    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const payload = isLogin
        ? { email: formData.email, password: formData.password }
        : { email: formData.email, username: formData.username, password: formData.password, rank: formData.rank || undefined, specialization: formData.specialization || undefined };
      const response = await axios.post(`${API}${endpoint}`, payload);
      if (isLogin) {
        login(response.data.user);
        const dest = getPostAuthRoute(response.data.user);
        setLoginTransition({ username: response.data.user.username, dest });
        return;
      }

      setIsLogin(true);
      setPendingVerificationEmail(formData.email);
      setNotice(response.data?.message || 'Registration successful. Check your email to verify your account.');
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (detail?.code === 'email_not_verified') {
        setPendingVerificationEmail(formData.email);
        setError(detail.message);
      } else {
        const msg = detail || err.message || 'An error occurred';
        setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      }
    } finally { setSubmitting(false); }
  };

  const handleResendVerification = async () => {
    const email = (pendingVerificationEmail || formData.email || '').trim();
    if (!email) {
      setError('Enter your email address first so we know where to resend the verification link.');
      return;
    }

    setError('');
    setNotice('');
    setResendingVerification(true);
    try {
      const response = await axios.post(`${API}/auth/resend-verification`, { email });
      setPendingVerificationEmail(email);
      setNotice(response.data?.message || 'A new verification email has been sent.');
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Unable to resend verification email.';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setResendingVerification(false);
    }
  };

  const handleCheckClaim = async () => {
    setError('');
    setNotice('');
    if (!formData.email) { setError('Enter your email address first.'); return; }
    setSubmitting(true);
    try {
      const res = await axios.get(`${API}/auth/check-claimable?email=${encodeURIComponent(formData.email)}`);
      if (res.data.claimable) {
        setClaimChecked(true);
        setClaimUsername(res.data.username || '');
        setNotice(`Account found for "${res.data.username}". Set a password to activate.`);
      } else {
        setError(res.data.message || 'No claimable account found.');
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Check failed.');
    } finally { setSubmitting(false); }
  };

  const handleClaimSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!formData.password || formData.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/auth/claim-account`, { email: formData.email, password: formData.password });
      login(res.data.user);
      const dest = getPostAuthRoute(res.data.user);
      setLoginTransition({ username: res.data.user.username, dest });
    } catch (err) {
      setError(err.response?.data?.detail || 'Claim failed.');
    } finally { setSubmitting(false); }
  };

  const handleDiscordLogin = async () => {
    setError('');
    setNotice('');
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

  if (discordLoading && !loginTransition) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050a0e]">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-[#e8c547] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#4a6070] tracking-[0.2em] text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>AUTHENTICATING WITH DISCORD...</p>
        </div>
      </div>
    );
  }

  if (loginTransition) {
    return (
      <LoginTransition
        username={loginTransition.username}
        onComplete={() => navigate(loginTransition.dest, { replace: true })}
      />
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 md:px-6 relative bg-[#050a0e]" style={loginBg}>
      {content.login?.showBackground && <div className="absolute inset-0 bg-[#050a0e]" style={{ opacity: content.login.overlayOpacity || 0.85 }} />}
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold mb-2 tracking-[0.15em] text-[#e8c547]" style={{ fontFamily: "'Share Tech', sans-serif" }}>25TH INFANTRY DIVISION</h1>
          <p className="text-[#4a6070] text-[10px] tracking-[0.3em]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>// MEMBER ACCESS TERMINAL</p>
        </div>
        <Card className="glass-card corner-bracket">
          <CardHeader><CardTitle className="text-lg text-center tracking-[0.15em] text-[#d0d8e0]" style={{ fontFamily: "'Share Tech', sans-serif" }}>{isClaiming ? 'CLAIM ACCOUNT' : isLogin ? 'MEMBER LOGIN' : 'NEW RECRUIT'}</CardTitle></CardHeader>
          <CardContent>
            {isClaiming ? (
              <div className="space-y-4">
                {!claimChecked ? (
                  <>
                    <div><label className="block text-sm font-medium mb-2">Email</label><Input type="email" required className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] focus:border-[rgba(201,162,39,0.3)] text-[#d0d8e0]" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} /></div>
                    {notice && <div className="text-[#e8c547] text-sm text-center">{notice}</div>}
                    {error && <div className="text-[#e8c547] text-sm text-center">{error}</div>}
                    <Button onClick={handleCheckClaim} disabled={submitting} className="w-full bg-[#c9a227] hover:bg-[#e8c547] text-[#050a0e] py-5 tracking-[0.15em] tactical-button" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{submitting ? 'Checking...' : 'FIND MY ACCOUNT'}</Button>
                  </>
                ) : (
                  <form onSubmit={handleClaimSubmit} className="space-y-4">
                    <div className="text-center text-sm text-[#4a6070] mb-2">Welcome back, <span className="text-[#e8c547] font-bold">{claimUsername}</span></div>
                    <div><label className="block text-sm font-medium mb-2">Set Password</label><Input type="password" required minLength={8} className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-[#d0d8e0]" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} placeholder="Min 8 characters" /></div>
                    {notice && <div className="text-[#e8c547] text-sm text-center">{notice}</div>}
                    {error && <div className="text-[#e8c547] text-sm text-center">{error}</div>}
                    <Button type="submit" disabled={submitting} className="w-full bg-[#c9a227] hover:bg-[#e8c547] text-[#050a0e] py-5 tracking-[0.15em] tactical-button" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{submitting ? 'Activating...' : 'ACTIVATE ACCOUNT'}</Button>
                  </form>
                )}
                <div className="text-center mt-4">
                  <button onClick={() => { setIsClaiming(false); setClaimChecked(false); setClaimUsername(''); setError(''); setNotice(''); }} className="text-sm text-[#4a6070] hover:text-[#e8c547] transition-colors">← Back to Login</button>
                </div>
              </div>
            ) : (
            <>
            <form onSubmit={handleSubmit} className="space-y-4" data-testid="auth-form">
              {!isLogin && <div><label className="block text-sm font-medium mb-2">Username</label><Input type="text" required className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-[#d0d8e0]" value={formData.username} onChange={(e) => setFormData({...formData, username: e.target.value})} data-testid="auth-username-input" /></div>}
              <div><label className="block text-sm font-medium mb-2">Email</label><Input type="email" required className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-[#d0d8e0]" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} data-testid="auth-email-input" /></div>
              <div><label className="block text-sm font-medium mb-2">Password</label><Input type="password" required className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-[#d0d8e0]" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} data-testid="auth-password-input" /></div>
              {!isLogin && <>
                <div><label className="block text-sm font-medium mb-2">Rank (Optional)</label><Input type="text" className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-[#d0d8e0]" value={formData.rank} onChange={(e) => setFormData({...formData, rank: e.target.value})} data-testid="auth-rank-input" /></div>
                <div><label className="block text-sm font-medium mb-2">Specialization (Optional)</label><Input type="text" placeholder="e.g., Assault, Recon, Support" className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] text-[#d0d8e0]" value={formData.specialization} onChange={(e) => setFormData({...formData, specialization: e.target.value})} data-testid="auth-specialization-input" /></div>
              </>}
              {notice && <div className="text-[#e8c547] text-sm text-center" data-testid="auth-notice">{notice}</div>}
              {error && <div className="text-[#e8c547] text-sm text-center" data-testid="auth-error">{error}</div>}
              {isLogin && pendingVerificationEmail && (
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={resendingVerification}
                  className="w-full text-sm text-[#8a9aa8] hover:text-[#e8c547] transition-colors disabled:opacity-60"
                  data-testid="auth-resend-verification-button"
                >
                  {resendingVerification ? 'Sending verification email...' : `Resend verification email to ${pendingVerificationEmail}`}
                </button>
              )}
              <Button type="submit" disabled={submitting} className="w-full bg-[#c9a227] hover:bg-[#e8c547] text-[#050a0e] py-5 tactical-button tracking-[0.15em] font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }} data-testid="auth-submit-button">{submitting ? 'Please wait...' : isLogin ? 'LOGIN' : 'REGISTER'}</Button>
            </form>
            {/* Discord OAuth — only shown when backend has Discord configured */}
            {discordAvailable && (
              <div className="mt-4">
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
                  <div className="relative flex justify-center text-xs"><span className="bg-[#0c1117] px-3 text-[#4a6070] tracking-[0.2em]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>OR</span></div>
                </div>
                <Button
                  type="button"
                  onClick={handleDiscordLogin}
                  disabled={discordLoading}
                  className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white py-5 tracking-[0.15em] transition-all"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  data-testid="discord-login-button"
                >
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z"/></svg>
                  CONTINUE WITH DISCORD
                </Button>
              </div>
            )}
            <div className="mt-6 text-center">
              <button onClick={() => { setIsLogin(!isLogin); setError(''); setNotice(''); }} className="text-sm text-[#4a6070] hover:text-[#e8c547] transition-colors" data-testid="auth-toggle-button">{isLogin ? "Don't have an account? Register" : 'Already have an account? Login'}</button>
            </div>
            {isLogin && (
              <div className="mt-3 text-center">
                <button onClick={() => { setIsClaiming(true); setError(''); setNotice(''); }} className="text-sm text-[#4a6070] hover:text-[#e8c547] transition-colors">Already a member? Claim your pre-created account</button>
              </div>
            )}
            </>
            )}
          </CardContent>
        </Card>
        <div className="mt-6 text-center space-y-3">
          <Link to="/" className="text-sm text-[#4a6070] hover:text-[#e8c547] transition-colors block">&larr; Back to Home</Link>
          <div className="border-t border-[rgba(201,162,39,0.08)] pt-4 mt-4">
            <p className="text-[10px] text-[#4a6070] mb-2 tracking-[0.2em]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>PARTNER UNIT ACCESS</p>
            <Link to="/partner-login" className="inline-flex items-center gap-2 px-4 py-2 border border-[rgba(201,162,39,0.2)] text-[#e8c547] hover:bg-[rgba(201,162,39,0.05)] hover:border-[rgba(201,162,39,0.4)] transition-all text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }} data-testid="partner-login-link">
              <Shield className="w-4 h-4" /> [ S-5 LIAISON / PARTNER ]
            </Link>
            <Link to="/partner-apply" className="block mt-2 text-[10px] text-[#4a6070] hover:text-[#e8c547] transition-colors" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              Apply as a Partner Unit →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// APP
// ============================================================================

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050a0e] text-[#d0d8e0]">
      <div className="text-center">
        <div className="mx-auto mb-4 h-10 w-10 rounded-full border-2 border-[#e8c547] border-t-transparent animate-spin" />
        <p className="text-xs tracking-[0.2em] text-[#e8c547] opacity-60" style={{ fontFamily: "'JetBrains Mono', monospace" }}>LOADING MODULE</p>
      </div>
    </div>
  );
}

function LegacyServerOverviewRedirect() {
  const { id } = useParams();
  return <Navigate to={`/admin/servers/${id}`} replace />;
}

function LegacyOrbatPlannerRedirect() {
  const { operationId } = useParams();
  return <Navigate to={`/hub/operations-planner/${operationId}`} replace />;
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/join" element={<JoinUs />} />
        <Route path="/join-us" element={<Navigate to="/join" replace />} />
        {/* ── Admin routes with Command Center sidebar layout ──────────── */}
        <Route element={<ProtectedRoute staffOnly><AdminLayout /></ProtectedRoute>}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/operations" element={<OperationsManager />} />
          <Route path="/admin/site-content" element={<SiteContentManager />} />
          <Route path="/admin/announcements" element={<AnnouncementsManager />} />
          <Route path="/admin/users" element={<UsersManager />} />
          <Route path="/admin/training" element={<TrainingManager />} />
          <Route path="/admin/gallery" element={<GalleryManager />} />
          <Route path="/admin/history" element={<HistoryManager />} />
          <Route path="/admin/recruitment" element={<RecruitmentManager />} />
          <Route path="/admin/intel" element={<IntelManager />} />
          <Route path="/admin/campaigns" element={<CampaignManager />} />
          <Route path="/admin/deployments" element={<DeploymentManager />} />
          <Route path="/admin/operational-docs" element={<ProtectedRoute allowedRoles={['admin', 's1_personnel', 's3_operations']}><OperationalDocsManager /></ProtectedRoute>} />
          <Route path="/admin/unit-config" element={<UnitTagsManager />} />
          <Route path="/admin/partner-units" element={<ProtectedRoute allowedRoles={['admin', 's1_personnel', 's5_liaison', 's5_civil_affairs']}><PartnerUnitsManager /></ProtectedRoute>} />
          <Route path="/admin/partner-applications" element={<ProtectedRoute allowedRoles={['admin', 's1_personnel', 's5_liaison', 's5_civil_affairs']}><PartnerApplicationsReview /></ProtectedRoute>} />
          <Route path="/admin/audit-logs" element={<ProtectedRoute allowedRoles={['admin', 's1_personnel']}><AuditLogsManager /></ProtectedRoute>} />
          <Route path="/admin/error-logs" element={<ProtectedRoute allowedRoles={['admin', 's1_personnel']}><ErrorLogsManager /></ProtectedRoute>} />
          <Route path="/admin/loa" element={<LOAManager />} />
          <Route path="/admin/pipeline" element={<PipelineManager />} />
          <Route path="/admin/users/:id" element={<AdminMemberDetail />} />
          {/* ── Server Management routes (S4/S1 only) ────────────────────── */}
          <Route path="/admin/servers" element={<ProtectedRoute allowedRoles={['admin', 's1_personnel', 's4_logistics']}><ServerDashboard /></ProtectedRoute>} />
          <Route path="/admin/servers/diagnostics" element={<ProtectedRoute allowedRoles={['admin', 's1_personnel', 's4_logistics']}><ServerDiagnostics /></ProtectedRoute>} />
          {/* Legacy routes — redirect to unified diagnostics page */}
          <Route path="/admin/servers/mod-issues" element={<Navigate to="/admin/servers/diagnostics" replace />} />
          <Route path="/admin/servers/log-monitor" element={<Navigate to="/admin/servers/diagnostics" replace />} />
          {/* Per-server workspace with nested module routes */}
          <Route path="/admin/servers/:id" element={<ProtectedRoute allowedRoles={['admin', 's1_personnel', 's4_logistics']}><ServerWorkspace /></ProtectedRoute>}>
            <Route index element={<OverviewModule />} />
            <Route path="console" element={<ConsoleModule />} />
            <Route path="rcon" element={<RconModule />} />
            <Route path="players" element={<PlayersModule />} />
            <Route path="metrics" element={<MetricsModule />} />
            <Route path="mods" element={<ModsModule />} />
            <Route path="schedules" element={<SchedulesModule />} />
            <Route path="config/server" element={<ServerSettingsModule />} />
            <Route path="config/system" element={<SystemSettingsModule />} />
            <Route path="config/admin-tools" element={<SatConfigModule />} />
            <Route path="config/integrations" element={<IntegrationsModule />} />
            <Route path="tools/files" element={<FileManagerModule />} />
            <Route path="tools/exec" element={<TriggerExecModule />} />
            <Route path="tools/reports" element={<ReportsModule />} />
            <Route path="tools/todos" element={<TodoModule />} />
            <Route path="tools/watchers" element={<WatchersModule />} />
            <Route path="tools/compare" element={<CompareServersModule />} />
            <Route path="admin/notes" element={<NotesModule />} />
            <Route path="admin/notifications" element={<NotificationsModule />} />
            <Route path="admin/incidents" element={<IncidentsModule />} />
          </Route>
          {/* Legacy detail route redirect */}
          <Route path="/admin/servers/:id/overview" element={<LegacyServerOverviewRedirect />} />
        </Route>
        <Route path="/recruit" element={<ProtectedRoute allowRecruit><RecruitDashboard /></ProtectedRoute>} />
        {/* ── Member routes with sidebar layout ─────────────────────────── */}
        <Route element={<ProtectedRoute><MemberLayout /></ProtectedRoute>}>
          <Route path="/hub" element={<MemberHub />} />
          <Route path="/hub/discussions" element={<DiscussionForum />} />
          <Route path="/hub/discussions/:id" element={<DiscussionThread />} />
          <Route path="/hub/operations/:id" element={<OperationDetail />} />
          <Route path="/hub/intel" element={<IntelBoard />} />
          <Route path="/hub/campaign" element={<CampaignMap />} />
          <Route path="/hub/gallery" element={<GalleryHub />} />
          <Route path="/hub/training" element={<TrainingPage />} />
          <Route path="/hub/loa" element={<LOARequest />} />
          <Route path="/hub/shared" element={<SharedArea />} />
          <Route path="/hub/plans/:id" element={<OperationsPlanView />} />
          <Route path="/roster" element={<UnitRoster />} />
          <Route path="/roster/:id" element={<MemberProfile />} />
        </Route>
        {/* Profile allows recruits, still gets sidebar layout */}
        <Route path="/hub/profile" element={<ProtectedRoute allowRecruit><MemberLayout><EditProfile /></MemberLayout></ProtectedRoute>} />
        {/* Threat map: full-screen layout, no sidebar */}
        <Route path="/hub/threat-map" element={<ProtectedRoute><ErrorBoundary><ThreatMapPage /></ErrorBoundary></ProtectedRoute>} />
        {/* World Monitor routes — redirect legacy paths to integrated route */}
        <Route path="/hub/threat-map/world-monitor" element={<Navigate to="/worldmonitor" replace />} />
        {/* Operations Planner: full-screen layout, no sidebar */}
        <Route path="/hub/operations-planner" element={<ProtectedRoute><ErrorBoundary><OperationsPlanner /></ErrorBoundary></ProtectedRoute>} />
        <Route path="/hub/operations-planner/:id" element={<ProtectedRoute><ErrorBoundary><OperationsPlanner /></ErrorBoundary></ProtectedRoute>} />
        {/* Legacy tool routes — redirect to unified Operations Planner */}
        <Route path="/hub/orbat-mapper" element={<Navigate to="/hub/operations-planner" replace />} />
        <Route path="/hub/orbat-mapper/:operationId" element={<LegacyOrbatPlannerRedirect />} />
        <Route path="/hub/reforger-maps" element={<Navigate to="/hub/operations-planner" replace />} />
        <Route path="/hub/mortar-calc" element={<Navigate to="/hub/operations-planner" replace />} />
        <Route path="/partner-login" element={<PartnerLoginPage />} />
        <Route path="/partner-apply" element={<PartnerApply />} />
        <Route path="/partner" element={<PartnerHub />} />
        <Route path="/partner-admin" element={<PartnerAdmin />} />
        <Route path="/partner/discussions" element={<DiscussionForum />} />
        <Route path="/partner/discussions/:id" element={<DiscussionThread />} />
        <Route path="/partner/threat-map" element={<ErrorBoundary><PartnerThreatMap /></ErrorBoundary>} />
        {/* World Monitor — redirect legacy partner path to integrated route */}
        <Route path="/partner/threat-map/world-monitor" element={<Navigate to="/worldmonitor" replace />} />
        <Route path="/partner/shared" element={<PartnerSharedArea />} />
        {/* World Monitor — integrated into the main frontend (no Nginx dependency) */}
        <Route path="/worldmonitor" element={<ErrorBoundary><WorldMonitorPage /></ErrorBoundary>} />
        <Route path="/worldmonitor/*" element={<ErrorBoundary><WorldMonitorPage /></ErrorBoundary>} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;

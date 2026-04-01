import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate, Navigate } from 'react-router-dom';
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
import IntelBoard from '@/pages/member/IntelBoard';
import CampaignMap from '@/pages/member/CampaignMap';
import ThreatMapPage from '@/pages/member/ThreatMapPage';
import GalleryHub from '@/pages/member/GalleryHub';
import AdminMemberDetail from '@/pages/admin/AdminMemberDetail';
import HistoryManager from '@/pages/admin/HistoryManager';
import RecruitDashboard from '@/pages/RecruitDashboard';
import RecruitmentManager from '@/pages/admin/RecruitmentManager';
import IntelManager from '@/pages/admin/IntelManager';
import CampaignManager from '@/pages/admin/CampaignManager';
import UnitTagsManager from '@/pages/admin/UnitTagsManager';
import PartnerUnitsManager from '@/pages/admin/PartnerUnitsManager';
import PartnerLoginPage from '@/pages/partner/PartnerLoginPage';
import PartnerHub from '@/pages/partner/PartnerHub';
import PartnerAdmin from '@/pages/partner/PartnerAdmin';
import PartnerApply from '@/pages/partner/PartnerApply';
import PartnerThreatMap from '@/pages/partner/PartnerThreatMap';
import PartnerApplicationsReview from '@/pages/admin/PartnerApplicationsReview';
import AuditLogsManager from '@/pages/admin/AuditLogsManager';
import ErrorLogsManager from '@/pages/admin/ErrorLogsManager';
import LOARequest from '@/pages/member/LOARequest';
import LOAManager from '@/pages/admin/LOAManager';
import PipelineManager from '@/pages/admin/PipelineManager';
import DeploymentManager from '@/pages/admin/DeploymentManager';
import SharedArea from '@/pages/member/SharedArea';
import PartnerSharedArea from '@/pages/partner/PartnerSharedArea';
import OperationsPlanner from '@/pages/member/OperationsPlanner';
import OperationsPlanView from '@/pages/member/OperationsPlanView';
import JoinUs from '@/pages/JoinUs';
import MemberLayout from '@/components/MemberLayout';
import AdminLayout from '@/components/admin/AdminLayout';
import { isStaff, STAFF_ROLES } from '@/utils/permissions';

const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || window.location.origin || '').replace(/\/$/, '');
const API = `${BACKEND_URL}/api`;

const getPostAuthRoute = (user) => {
  if (!user) return '/login';
  if (isStaff(user.role)) return '/admin';
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
      <div className="w-full h-full bg-black/60 flex items-center justify-center p-4">
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
    return <div className="min-h-screen bg-black flex items-center justify-center text-white">Loading...</div>;
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
// NAVIGATION
// ============================================================================
const Navigation = ({ scrollToSection, content }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const brandName = content.nav?.brandName || '25TH INFANTRY DIVISION';
  const btnText = content.nav?.buttonText || 'JOIN NOW';

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-xl border-b border-tropic-gold/15" data-testid="main-nav">
      <div className="container mx-auto px-4 md:px-6 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-lg font-bold tracking-[0.15em] text-tropic-gold-light hover:text-white transition-colors" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
            {brandName}
          </Link>
          <button className="md:hidden text-white" onClick={() => setMenuOpen(!menuOpen)} data-testid="mobile-menu-btn">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={menuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} /></svg>
          </button>
          <div className={`${menuOpen ? 'flex flex-col absolute top-full left-0 right-0 bg-black/95 p-6 space-y-4 border-b border-tropic-gold/20' : 'hidden'} md:flex md:flex-row md:static md:bg-transparent md:p-0 md:space-y-0 md:border-0 items-center md:space-x-8`}>
            <button onClick={() => { scrollToSection('about'); setMenuOpen(false); }} className="text-sm tracking-[0.15em] text-gray-300 hover:text-tropic-gold transition-colors" data-testid="nav-about">ABOUT</button>
            <button onClick={() => { scrollToSection('history'); setMenuOpen(false); }} className="text-sm tracking-[0.15em] text-gray-300 hover:text-tropic-gold transition-colors" data-testid="nav-history">HISTORY</button>
            <button onClick={() => { scrollToSection('training'); setMenuOpen(false); }} className="text-sm tracking-[0.15em] text-gray-300 hover:text-tropic-gold transition-colors" data-testid="nav-training">TRAINING</button>
            <button onClick={() => { scrollToSection('operations'); setMenuOpen(false); }} className="text-sm tracking-[0.15em] text-gray-300 hover:text-tropic-gold transition-colors" data-testid="nav-operations">OPERATIONS</button>
            <button onClick={() => { scrollToSection('intel'); setMenuOpen(false); }} className="text-sm tracking-[0.15em] text-gray-300 hover:text-tropic-gold transition-colors" data-testid="nav-intel">INTEL</button>
            <div className="hidden md:block h-5 w-px bg-tropic-gold/30"></div>
            <Link to="/login" onClick={() => setMenuOpen(false)}>
              <Button className="bg-tropic-gold hover:bg-tropic-gold-light text-black px-6 py-2 tactical-button font-bold tracking-wider" data-testid="nav-join-button">{btnText}</Button>
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
const HeroSection = ({ content }) => {
  const heroLine1 = typeof content.hero.tagline === 'string'
    ? content.hero.tagline
    : textOrFallback(content.hero.tagline?.line1, 'TROPIC LIGHTNING');
  const heroLine2 = typeof content.hero.tagline === 'object'
    ? textOrFallback(content.hero.tagline?.line2, textOrFallback(content.hero.subtitle, ''))
    : textOrFallback(content.hero.subtitle, '');
  const heroMedia = resolveImg(content.hero.backgroundImage);
  const heroIsVideo = mediaKind(heroMedia) === 'video';

  return (
    <section className="hero-section relative min-h-screen flex items-center justify-center" style={heroIsVideo ? undefined : { backgroundImage: `url('${heroMedia}')`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }} data-testid="hero-section">
      {heroIsVideo && <video src={heroMedia} className="absolute inset-0 w-full h-full object-cover" muted loop autoPlay playsInline />}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/75 to-black"></div>
      <div className="hero-grid-overlay"></div>
      <div className="relative z-10 text-center px-4 md:px-6">
        <div className="mb-10 compass-logo" data-testid="unit-logo">
          <img src={`${BACKEND_URL}/api/uploads/25th_id_patch.png`} alt="25th Infantry Division" className="w-48 h-48 sm:w-56 sm:h-56 mx-auto object-contain drop-shadow-[0_0_30px_rgba(212,160,23,0.4)]" />
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-7xl font-bold tracking-[0.12em] leading-tight" style={{ fontFamily: 'Rajdhani, sans-serif' }} data-testid="hero-tagline">
          <span className="block">{heroLine1}</span>
          {heroLine2 && <span className="block text-lg sm:text-xl lg:text-2xl text-transparent bg-clip-text bg-gradient-to-r from-tropic-gold to-tropic-gold-light mt-4 tracking-[0.2em]">{heroLine2}</span>}
        </h1>
        <div className="mt-10">
          <Link to="/login"><Button className="bg-tropic-gold hover:bg-tropic-gold-light text-black px-10 py-5 text-lg tactical-button tracking-widest" data-testid="hero-cta-button">{content.nav?.buttonText || 'ENLIST NOW'}</Button></Link>
        </div>
        <div className="mt-8 flex items-center justify-center gap-2 text-xs tracking-[0.25em] text-gray-500 uppercase">
          <span className="w-8 h-px bg-gradient-to-r from-transparent to-gray-600"></span>
          Scroll to explore
          <span className="w-8 h-px bg-gradient-to-l from-transparent to-gray-600"></span>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black to-transparent"></div>
    </section>
  );
};

// ============================================================================
// ABOUT SECTION
// ============================================================================
const AboutSection = ({ content }) => {
  const quote = typeof content.about?.quote === 'object' ? content.about.quote : { text: content.about?.quote || '', author: '', backgroundImage: '' };
  const aboutHeading = textOrFallback(content.sectionHeadings?.about?.heading, 'ABOUT');
  const aboutSubtext = textOrFallback(content.sectionHeadings?.about?.subtext, '');
  return (
    <section id="about" className="py-28 px-4 md:px-6 relative" style={{ background: 'linear-gradient(180deg, #000 0%, #080806 50%, #000 100%)' }} data-testid="about-section">
      <div className="section-divider absolute top-0 left-0 right-0"></div>
      <div className="container mx-auto max-w-6xl">
        <div className="grid md:grid-cols-[280px,1fr] gap-8 md:gap-16 items-start">
          <div className="space-y-8">
            <div className="space-y-3">
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold section-underline tracking-[0.1em]" data-testid="about-heading">{aboutHeading}</h2>
              {aboutSubtext && <p className="text-sm md:text-base text-gray-500 tracking-wide" data-testid="about-subtext">{aboutSubtext}</p>}
            </div>
            {content.about?.logoImage && (
              <div className="w-48 h-48 opacity-80 mt-6" data-testid="about-logo">
                <MediaFrame src={resolveImg(content.about.logoImage)} alt="Unit Emblem" className="w-48 h-48 object-contain" imgClassName="w-48 h-48 object-contain" />
              </div>
            )}
            <Link to="/login"><Button className="bg-tropic-gold hover:bg-tropic-gold-light text-black px-10 py-5 text-lg tactical-button shadow-lg shadow-tropic-gold/20 tracking-wider" data-testid="about-join-button">{content.nav?.buttonText || 'JOIN NOW'}</Button></Link>
          </div>
          <div className="space-y-8 text-base md:text-lg leading-relaxed">
            <p className="text-gray-300" data-testid="about-description-1">{content.about?.paragraph1}</p>
            <div className="h-px bg-gradient-to-r from-transparent via-tropic-gold/40 to-transparent"></div>
            <p className="text-gray-300" data-testid="about-description-2">{content.about?.paragraph2}</p>
            {/* Quote block */}
            <div className="mt-12 relative rounded-lg overflow-hidden corner-bracket" style={{ minHeight: '280px' }}>
              {mediaKind(resolveImg(quote.backgroundImage)) === 'video'
                ? <video src={resolveImg(quote.backgroundImage)} className="absolute inset-0 w-full h-full object-cover" muted loop autoPlay playsInline />
                : <div className="absolute inset-0" style={{ backgroundImage: `url('${resolveImg(quote.backgroundImage)}')`, backgroundSize: 'cover', backgroundPosition: 'center' }}></div>}
              <div className="absolute inset-0 bg-gradient-to-br from-black/90 via-black/78 to-tropic-gold-dark/25"></div>
              <div className="relative z-10 p-10 md:p-14 flex items-center justify-center min-h-[280px]">
                <div className="border-l-4 border-tropic-gold pl-8 max-w-xl">
                  <p className="text-xl md:text-2xl italic text-gray-200 mb-5 font-light leading-relaxed" data-testid="founder-quote">{quote.text}</p>
                  <p className="text-base text-tropic-gold font-bold tracking-wide" data-testid="founder-name">{quote.author}</p>
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
        className="w-full md:w-auto inline-flex items-center gap-3 rounded-md border border-tropic-gold/25 bg-black/90 hover:bg-black px-6 py-3 tracking-[0.15em] text-xs md:text-sm text-gray-400 hover:text-tropic-gold transition-all duration-300 hover:border-tropic-gold/40"
        data-testid="history-quick-scroll"
      >
        <span className="text-tropic-gold font-bold">HISTORY</span>
        <span className="h-3 w-px bg-tropic-gold/30"></span>
        <span>JUMP TO TIMELINE</span>
        <span aria-hidden="true" className="text-tropic-gold">↓</span>
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
    campaign: 'border-tropic-gold bg-tropic-gold-dark',
    operation: 'border-tropic-red bg-tropic-red',
    milestone: 'border-tropic-olive bg-tropic-olive',
  }[t] || 'border-tropic-gold bg-tropic-gold-dark');

  if (loading || entries.length === 0) return null;

  return (
    <section id="history" className="py-28 px-4 md:px-6 relative" style={{ background: 'linear-gradient(180deg, #000 0%, #080806 50%, #000 100%)' }} data-testid="unit-history-section">
      <div className="section-divider absolute top-0 left-0 right-0"></div>
      <div className="container mx-auto max-w-5xl">
        <div className="section-label mb-16">
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold" data-testid="unit-history-heading">{historyHeading}</h2>
          <p className="text-base md:text-lg">{historySubtext}</p>
        </div>

        {/* Timeline */}
        <div className="relative">
          {/* Center line */}
          <div className="absolute left-6 md:left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-tropic-gold/60 via-tropic-gold/25 to-transparent" aria-hidden="true"></div>

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
                  <div className={`absolute left-6 md:left-1/2 w-4 h-4 rounded-full ${accent.split(' ')[1]} border-2 border-black -translate-x-1/2 z-10 shadow-lg shadow-tropic-gold/20`}></div>

                  {/* Content card */}
                  <div className={`ml-14 md:ml-0 md:w-[calc(50%-2.5rem)] ${isLeft ? 'md:mr-auto md:pr-0' : 'md:ml-auto md:pl-0'}`}>
                    <div
                      className={`group relative rounded-lg border ${accent.split(' ')[0]}/30 overflow-hidden ${hasImage ? '' : 'bg-black/60 backdrop-blur'} p-6 hover:border-tropic-gold/60 transition-all duration-500`}
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

                      <div className={`relative z-10 ${useDarkText ? 'text-gray-900' : 'text-white'}`}>
                      {/* Year badge */}
                      <div className="flex items-center gap-3 mb-3">
                        <span className={`${useDarkText ? 'text-gray-900' : 'text-tropic-gold'} font-bold text-lg tracking-wider`} style={{ fontFamily: 'Rajdhani, sans-serif' }}>{entry.year}</span>
                        <span className={`text-[10px] tracking-widest px-2 py-0.5 rounded ${accent.split(' ')[1]} text-white/90`}>{entry.campaign_type.toUpperCase()}</span>
                      </div>

                      <h3 className="text-xl md:text-2xl font-bold tracking-wide mb-3" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{entry.title}</h3>

                      <p className={`${useDarkText ? 'text-gray-800' : 'text-gray-200'} text-sm leading-relaxed`}>{entry.description}</p>
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
    <section className="py-28 px-4 md:px-6 relative" style={{ background: 'linear-gradient(180deg, #000 0%, #060606 50%, #000 100%)' }} data-testid="operational-superiority-section">
      <div className="section-divider absolute top-0 left-0 right-0"></div>
      <div className="container mx-auto max-w-7xl">
        <div className="grid md:grid-cols-2 gap-16 items-center mb-20">
          <h2 className="text-4xl sm:text-5xl lg:text-7xl font-bold leading-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-tropic-gold-light to-tropic-gold" data-testid="ops-superiority-heading">
            {heading.split(' ').map((w, i) => <span key={i} className="block">{w}</span>)}
          </h2>
          <div className="relative">
            <div className="absolute -left-4 top-0 bottom-0 w-1 bg-gradient-to-b from-tropic-gold via-tropic-gold/40 to-transparent"></div>
            <div className="pl-8 space-y-3">
              {subtext && <p className="text-sm uppercase tracking-[0.2em] text-tropic-gold/70" data-testid="ops-superiority-subtext">{subtext}</p>}
              <p className="text-lg leading-relaxed text-gray-300" data-testid="ops-superiority-description">{content.operationalSuperiority?.description}</p>
            </div>
          </div>
        </div>
        <div className="h-px bg-gradient-to-r from-transparent via-tropic-gold/35 to-transparent mb-16"></div>
        <div className="grid md:grid-cols-3 gap-6">
          {(content.operationalSuperiority?.images || []).map((img, idx) => (
            <div key={idx} className="aspect-[3/4] overflow-hidden rounded-lg border border-tropic-gold/15 hover:border-tropic-gold/40 transition-all duration-500 shadow-2xl shadow-black/40 group corner-bracket" data-testid={`ops-image-${idx + 1}`}>
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
    <section id="training" className="py-28 px-4 md:px-6" style={{ background: 'linear-gradient(180deg, #000 0%, #0a0a0a 50%, #000 100%)' }} data-testid="lethality-section">
      <div className="container mx-auto max-w-7xl space-y-20">
        <div className="space-y-3">
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-wider" data-testid="lethality-heading">{heading}</h2>
          {subtext && <p className="text-base md:text-lg text-gray-400" data-testid="lethality-subtext">{subtext}</p>}
        </div>
        {/* Logistics */}
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h3 className="text-3xl font-bold tracking-wide" data-testid="logistics-heading">{logisticsHeading}</h3>
            <p className="text-base md:text-lg leading-relaxed text-gray-300" data-testid="logistics-description">{content.lethality?.logistics?.description}</p>
          </div>
          <div className="aspect-video overflow-hidden rounded-lg border border-tropic-gold/10 shadow-2xl shadow-black/40 group corner-bracket">
            <MediaFrame src={resolveImg(content.lethality?.logistics?.image)} alt="Logistics" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
          </div>
        </div>
        <div className="h-px bg-gradient-to-r from-transparent via-tropic-gold/25 to-transparent"></div>
        {/* Training */}
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="order-2 md:order-1 aspect-video overflow-hidden rounded-lg border border-tropic-gold/10 shadow-2xl shadow-black/40 group corner-bracket">
            <MediaFrame src={resolveImg(content.lethality?.training?.image)} alt="Training" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
          </div>
          <div className="order-1 md:order-2 space-y-6">
            <h3 className="text-3xl font-bold tracking-wide" data-testid="training-heading">{trainingHeading}</h3>
            <p className="text-base md:text-lg leading-relaxed text-gray-300" data-testid="training-description">{content.lethality?.training?.description}</p>
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
    combat:   { bg: 'bg-tropic-red/85', border: 'border-tropic-red/35', glow: 'shadow-tropic-red/20' },
    training: { bg: 'bg-tropic-olive/85', border: 'border-tropic-olive/35', glow: 'shadow-tropic-olive/20' },
    recon:    { bg: 'bg-tropic-gold-dark/85', border: 'border-tropic-gold/35', glow: 'shadow-tropic-gold/20' },
    support:  { bg: 'bg-tropic-gold/85', border: 'border-tropic-gold/35', glow: 'shadow-tropic-gold/20' },
  };
  const getType = (t) => typeConfig[t] || typeConfig.combat;

  return (
    <section id="operations" className="py-28 px-4 md:px-6 relative" style={{ background: 'linear-gradient(180deg, #000 0%, #080808 50%, #000 100%)' }} data-testid="operations-section">
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
                <Card key={op.id} className={`op-card corner-bracket bg-black/80 backdrop-blur border ${tc.border} ${tc.glow} shadow-xl`} data-testid={`operation-card-${idx}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between mb-3">
                      <Badge className={`${tc.bg} text-white text-xs tracking-wider px-3 py-0.5`}>{op.operation_type.toUpperCase()}</Badge>
                      {op.logo_url && <img src={resolveImg(op.logo_url)} alt="" className="w-7 h-7 object-contain rounded opacity-80" />}
                    </div>
                    <CardTitle className="text-xl tracking-wide">{op.title}</CardTitle>
                    <CardDescription className="text-gray-400 text-sm mt-1 line-clamp-2">{op.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm mb-4">
                      <div className="flex items-center text-gray-300"><Calendar className="w-4 h-4 mr-2 text-tropic-gold shrink-0"/>{op.date}</div>
                      <div className="flex items-center text-gray-300"><Clock className="w-4 h-4 mr-2 text-tropic-gold shrink-0"/>{op.time}</div>
                      {op.max_participants && <div className="flex items-center text-gray-400"><Users className="w-4 h-4 mr-2 text-tropic-gold shrink-0"/><span>{op.rsvps?.length || 0} / {op.max_participants} operators</span></div>}
                    </div>
                    <Link to="/login"><Button className="w-full bg-tropic-gold hover:bg-tropic-gold-light text-black text-sm tracking-wider" data-testid={`operation-rsvp-${idx}`}>RSVP NOW <ChevronRight className="w-4 h-4 ml-1" /></Button></Link>
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
    urgent: { class: 'intel-urgent', badge: 'bg-tropic-red/85 text-white', dot: 'bg-tropic-red' },
    high:   { class: 'intel-high',   badge: 'bg-orange-800 text-orange-200', dot: 'bg-orange-500' },
    normal: { class: 'intel-normal', badge: 'bg-tropic-gold-dark/80 text-tropic-gold-light', dot: 'bg-tropic-gold' },
    low:    { class: 'intel-low',    badge: 'bg-gray-800 text-gray-300', dot: 'bg-gray-500' },
  };
  const getPriority = (p) => priorityConfig[p] || priorityConfig.normal;

  return (
    <section id="intel" className="py-28 px-4 md:px-6 relative" style={{ background: 'linear-gradient(180deg, #000 0%, #0a0a0a 50%, #000 100%)' }} data-testid="announcements-section">
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
                  <CardContent>
                    <p className="text-gray-400 text-sm leading-relaxed">{ann.content}</p>
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
    <section className="py-28 px-4 md:px-6 relative" style={{ background: 'linear-gradient(180deg, #000 0%, #060606 50%, #000 100%)' }} data-testid="gallery-section">
      <div className="section-divider absolute top-0 left-0 right-0"></div>
      <div className="container mx-auto max-w-7xl">
        <div className="section-label">
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold" data-testid="gallery-heading">{sh.heading || 'MISSION GALLERY'}</h2>
          <p className="text-base md:text-lg">{sh.subtext || 'Moments from the field'}</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-5">
          {(content.gallery?.showcaseImages || []).map((img, idx) => (
            <div key={idx} className="aspect-square overflow-hidden rounded-lg border border-tropic-gold/10 hover:border-tropic-gold/40 transition-all duration-500 cursor-pointer group shadow-xl shadow-black/30 corner-bracket" data-testid={`gallery-image-${idx}`}>
              <MediaFrame src={resolveImg(img)} alt={`Mission ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
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
    <section className="py-28 px-4 md:px-6 relative" style={{ background: 'linear-gradient(180deg, #000 0%, #0a0a0a 50%, #000 100%)' }} data-testid="join-section">
      <div className="section-divider absolute top-0 left-0 right-0"></div>
      <div className="container mx-auto max-w-3xl text-center">
        <div className="section-label">
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold" data-testid="join-heading">{sh.heading || 'JOIN THE 25TH'}</h2>
          <p className="text-base md:text-lg">{sh.subtext || 'Become part of the Tropic Lightning legacy'}</p>
        </div>
        <Card className="glass-card shadow-2xl shadow-black/40 corner-bracket">
          <CardContent className="p-8 md:p-12 space-y-6">
            <p className="text-gray-300 text-lg leading-relaxed">
              The 25th Infantry Division is always looking for dedicated operators ready to commit to tactical excellence,
              teamwork, and the Tropic Lightning tradition. Create an account to access the Member Hub, view upcoming
              operations, and begin your journey with the unit.
            </p>
            <div className="pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-2xl mx-auto">
                <Link to="/join" className="w-full">
                  <Button variant="outline" className="border-tropic-red/60 text-tropic-red hover:bg-tropic-red/10 px-4 py-3 text-sm tracking-wider w-full" data-testid="join-threat-map-button">
                    <Globe className="mr-2 w-4 h-4 flex-shrink-0" />GLOBAL THREAT MAP
                  </Button>
                </Link>
                <Link to="/login" className="w-full">
                  <Button className="bg-tropic-gold hover:bg-tropic-gold-light text-black px-4 py-3 text-sm tactical-button tracking-wider w-full" data-testid="join-register-button">
                    <Shield className="mr-2 w-4 h-4 flex-shrink-0" />CREATE ACCOUNT
                  </Button>
                </Link>
                {content.footer?.discord && (
                  <a href={content.footer.discord} target="_blank" rel="noopener noreferrer" className="w-full sm:col-span-2 lg:col-span-1">
                    <Button variant="outline" className="border-tropic-gold/50 text-tropic-gold hover:bg-tropic-gold/10 px-4 py-3 text-sm tracking-wider w-full">
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
  <footer className="bg-black border-t border-tropic-gold/10 py-14 px-4 md:px-6" data-testid="footer">
    <div className="container mx-auto max-w-7xl">
      <div className="grid md:grid-cols-3 gap-10 mb-10">
        <div>
          <h3 className="text-xl font-bold mb-3 tracking-[0.12em]">{content.nav?.brandName || '25TH INFANTRY DIVISION'}</h3>
          <p className="text-sm text-gray-500 leading-relaxed">{content.footer?.tagline || 'Tropic Lightning — Ready to Strike'}</p>
        </div>
        <div>
          <h4 className="text-sm font-bold mb-3 tracking-[0.2em] text-tropic-gold/60">QUICK LINKS</h4>
          <div className="h-px w-12 bg-tropic-gold/20 mb-3"></div>
          <ul className="space-y-2 text-sm text-gray-500">
            <li><a href="#about" className="hover:text-tropic-gold transition-colors">About</a></li>
            <li><a href="#history" className="hover:text-tropic-gold transition-colors">History</a></li>
            <li><a href="#training" className="hover:text-tropic-gold transition-colors">Training</a></li>
            <li><a href="#operations" className="hover:text-tropic-gold transition-colors">Operations</a></li>
            <li><Link to="/login" className="hover:text-tropic-gold transition-colors">Member Portal</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-bold mb-3 tracking-[0.2em] text-tropic-gold/60">CONNECT</h4>
          <div className="h-px w-12 bg-tropic-gold/20 mb-3"></div>
          <div className="space-y-2 text-sm text-gray-500">
            {content.footer?.discord && <p><a href={content.footer.discord} target="_blank" rel="noopener noreferrer" className="hover:text-tropic-gold transition-colors">Discord Server</a></p>}
            {(content.footer?.contact?.email || content.footer?.email) && <p>Email: {content.footer?.contact?.email || content.footer?.email}</p>}
          </div>
        </div>
      </div>
      <div className="footer-divider mb-8"></div>
      <div className="space-y-3 text-center">
        <p className="text-xs text-gray-600 tracking-[0.15em]">&copy; {new Date().getFullYear()} 25th Infantry Division — Tropic Lightning</p>
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
      <div className="landing-glitch-overlay" aria-hidden="true"></div>
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
  const navigate = useNavigate();

  // If already authenticated, send the user to the correct destination immediately
  useEffect(() => {
    axios.get(`${API}/auth/me`)
      .then(res => {
        login(res.data);
        navigate(getPostAuthRoute(res.data), { replace: true });
      })
      .catch(() => {});
  }, [navigate, login]);

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
          navigate(getPostAuthRoute(res.data), { replace: true });
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
        navigate(getPostAuthRoute(response.data.user), { replace: true });
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
      navigate(getPostAuthRoute(res.data.user), { replace: true });
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

  if (discordLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-tropic-gold border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400 tracking-wider">Authenticating with Discord...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 md:px-6 relative" style={loginBg}>
      {content.login?.showBackground && <div className="absolute inset-0 bg-black" style={{ opacity: content.login.overlayOpacity || 0.85 }}></div>}
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold mb-2 tracking-[0.12em]">25TH INFANTRY DIVISION</h1>
          <p className="text-gray-400 text-sm tracking-[0.1em]">Tropic Lightning — Member Access</p>
        </div>
        <Card className="glass-card corner-bracket">
          <CardHeader><CardTitle className="text-2xl text-center tracking-wider">{isClaiming ? 'CLAIM ACCOUNT' : isLogin ? 'MEMBER LOGIN' : 'NEW RECRUIT'}</CardTitle></CardHeader>
          <CardContent>
            {isClaiming ? (
              <div className="space-y-4">
                {!claimChecked ? (
                  <>
                    <div><label className="block text-sm font-medium mb-2">Email</label><Input type="email" required className="bg-black/50 border-white/20" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} /></div>
                    {notice && <div className="text-green-400 text-sm text-center">{notice}</div>}
                    {error && <div className="text-tropic-gold text-sm text-center">{error}</div>}
                    <Button onClick={handleCheckClaim} disabled={submitting} className="w-full bg-tropic-gold hover:bg-tropic-gold-light text-black py-5 tracking-wider">{submitting ? 'Checking...' : 'FIND MY ACCOUNT'}</Button>
                  </>
                ) : (
                  <form onSubmit={handleClaimSubmit} className="space-y-4">
                    <div className="text-center text-sm text-gray-400 mb-2">Welcome back, <span className="text-tropic-gold font-bold">{claimUsername}</span></div>
                    <div><label className="block text-sm font-medium mb-2">Set Password</label><Input type="password" required minLength={8} className="bg-black/50 border-white/20" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} placeholder="Min 8 characters" /></div>
                    {notice && <div className="text-green-400 text-sm text-center">{notice}</div>}
                    {error && <div className="text-tropic-gold text-sm text-center">{error}</div>}
                    <Button type="submit" disabled={submitting} className="w-full bg-tropic-gold hover:bg-tropic-gold-light text-black py-5 tracking-wider">{submitting ? 'Activating...' : 'ACTIVATE ACCOUNT'}</Button>
                  </form>
                )}
                <div className="text-center mt-4">
                  <button onClick={() => { setIsClaiming(false); setClaimChecked(false); setClaimUsername(''); setError(''); setNotice(''); }} className="text-sm text-gray-400 hover:text-tropic-gold transition-colors">← Back to Login</button>
                </div>
              </div>
            ) : (
            <>
            <form onSubmit={handleSubmit} className="space-y-4" data-testid="auth-form">
              {!isLogin && <div><label className="block text-sm font-medium mb-2">Username</label><Input type="text" required className="bg-black/50 border-white/20" value={formData.username} onChange={(e) => setFormData({...formData, username: e.target.value})} data-testid="auth-username-input" /></div>}
              <div><label className="block text-sm font-medium mb-2">Email</label><Input type="email" required className="bg-black/50 border-white/20" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} data-testid="auth-email-input" /></div>
              <div><label className="block text-sm font-medium mb-2">Password</label><Input type="password" required className="bg-black/50 border-white/20" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} data-testid="auth-password-input" /></div>
              {!isLogin && <>
                <div><label className="block text-sm font-medium mb-2">Rank (Optional)</label><Input type="text" className="bg-black/50 border-white/20" value={formData.rank} onChange={(e) => setFormData({...formData, rank: e.target.value})} data-testid="auth-rank-input" /></div>
                <div><label className="block text-sm font-medium mb-2">Specialization (Optional)</label><Input type="text" placeholder="e.g., Assault, Recon, Support" className="bg-black/50 border-white/20" value={formData.specialization} onChange={(e) => setFormData({...formData, specialization: e.target.value})} data-testid="auth-specialization-input" /></div>
              </>}
              {notice && <div className="text-green-400 text-sm text-center" data-testid="auth-notice">{notice}</div>}
              {error && <div className="text-tropic-gold text-sm text-center" data-testid="auth-error">{error}</div>}
              {isLogin && pendingVerificationEmail && (
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={resendingVerification}
                  className="w-full text-sm text-gray-300 hover:text-tropic-gold transition-colors disabled:opacity-60"
                  data-testid="auth-resend-verification-button"
                >
                  {resendingVerification ? 'Sending verification email...' : `Resend verification email to ${pendingVerificationEmail}`}
                </button>
              )}
              <Button type="submit" disabled={submitting} className="w-full bg-tropic-gold hover:bg-tropic-gold-light text-black py-5 tactical-button tracking-wider" data-testid="auth-submit-button">{submitting ? 'Please wait...' : isLogin ? 'LOGIN' : 'REGISTER'}</Button>
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
              <button onClick={() => { setIsLogin(!isLogin); setError(''); setNotice(''); }} className="text-sm text-gray-400 hover:text-tropic-gold transition-colors" data-testid="auth-toggle-button">{isLogin ? "Don't have an account? Register" : 'Already have an account? Login'}</button>
            </div>
            {isLogin && (
              <div className="mt-3 text-center">
                <button onClick={() => { setIsClaiming(true); setError(''); setNotice(''); }} className="text-sm text-gray-500 hover:text-tropic-gold transition-colors">Already a member? Claim your pre-created account</button>
              </div>
            )}
            </>
            )}
          </CardContent>
        </Card>
        <div className="mt-6 text-center space-y-3">
          <Link to="/" className="text-sm text-gray-500 hover:text-tropic-gold transition-colors block">&larr; Back to Home</Link>
          <div className="border-t border-gray-800 pt-4 mt-4">
            <p className="text-xs text-gray-500 mb-2 tracking-wide">PARTNER UNIT ACCESS</p>
            <Link to="/partner-login" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-tropic-olive/40 text-tropic-olive hover:bg-tropic-olive/10 hover:border-tropic-olive/60 transition-all text-sm" data-testid="partner-login-link">
              <Shield className="w-4 h-4" /> S-5 Liaison / Partner Login
            </Link>
            <Link to="/partner-apply" className="block mt-2 text-xs text-gray-500 hover:text-tropic-olive transition-colors">
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

/** Redirect component for external URLs (outside the React SPA). */
function ExternalRedirect({ to }) {
  React.useEffect(() => { window.location.replace(to); }, [to]);
  return null;
}

/**
 * Defensive fallback shown when Nginx is misconfigured and serves the React SPA
 * at /worldmonitor/ instead of the standalone World Monitor Vite app.
 * In a correct deployment this route is never reached.
 */
function WorldMonitorNginxFallback() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#050a14',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{
        maxWidth: 520,
        padding: 32,
        borderRadius: 12,
        border: '1px solid rgba(255,215,0,0.3)',
        background: 'rgba(0,0,0,0.8)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🌐</div>
        <h2 style={{ color: '#FFD700', fontSize: 18, marginBottom: 12 }}>
          World Monitor — Nginx Configuration Required
        </h2>
        <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
          The World Monitor is a standalone app that must be served by Nginx at{' '}
          <code style={{ color: '#FFD700', background: '#1e293b', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>/worldmonitor/</code>.
          This page is showing because Nginx is serving the React app instead.
        </p>
        <div style={{
          textAlign: 'left',
          background: 'rgba(255,215,0,0.05)',
          border: '1px solid rgba(255,215,0,0.15)',
          borderRadius: 8,
          padding: 16,
          fontSize: 12,
          fontFamily: 'monospace',
          color: '#e2e8f0',
          lineHeight: 1.7,
        }}>
          <div style={{ color: '#64748b', marginBottom: 4 }}># 1. Build the World Monitor app</div>
          <div>cd worldmonitor &amp;&amp; npm run build</div>
          <div style={{ color: '#64748b', marginTop: 8, marginBottom: 4 }}># 2. Copy build output to Nginx root</div>
          <div>cp -r dist/* /opt/25th-id/frontend/build/worldmonitor/</div>
          <div style={{ color: '#64748b', marginTop: 8, marginBottom: 4 }}># 3. Add to nginx config (before the catch-all location /)</div>
          <div style={{ color: '#FFD700' }}>location /worldmonitor/ {'{'}</div>
          <div>&nbsp;&nbsp;try_files $uri $uri/ /worldmonitor/index.html;</div>
          <div style={{ color: '#FFD700' }}>{'}'}</div>
        </div>
        <p style={{ color: '#64748b', fontSize: 11, marginTop: 16 }}>
          See <code style={{ color: '#94a3b8' }}>nginx-production.conf</code> and{' '}
          <code style={{ color: '#94a3b8' }}>docs/WORLDMONITOR_INTEGRATION.md</code> for details.
        </p>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
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
          <Route path="/admin/unit-config" element={<UnitTagsManager />} />
          <Route path="/admin/partner-units" element={<ProtectedRoute allowedRoles={['admin', 's1_personnel', 's5_liaison', 's5_civil_affairs']}><PartnerUnitsManager /></ProtectedRoute>} />
          <Route path="/admin/partner-applications" element={<ProtectedRoute allowedRoles={['admin', 's1_personnel', 's5_liaison', 's5_civil_affairs']}><PartnerApplicationsReview /></ProtectedRoute>} />
          <Route path="/admin/audit-logs" element={<ProtectedRoute allowedRoles={['admin', 's1_personnel']}><AuditLogsManager /></ProtectedRoute>} />
          <Route path="/admin/error-logs" element={<ProtectedRoute allowedRoles={['admin', 's1_personnel']}><ErrorLogsManager /></ProtectedRoute>} />
          <Route path="/admin/loa" element={<LOAManager />} />
          <Route path="/admin/pipeline" element={<PipelineManager />} />
          <Route path="/admin/users/:id" element={<AdminMemberDetail />} />
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
          <Route path="/hub/loa" element={<LOARequest />} />
          <Route path="/hub/shared" element={<SharedArea />} />
          <Route path="/hub/plans/:id" element={<OperationsPlanView />} />
          <Route path="/roster" element={<UnitRoster />} />
          <Route path="/roster/:id" element={<MemberProfile />} />
        </Route>
        {/* Profile allows recruits, still gets sidebar layout */}
        <Route path="/hub/profile" element={<ProtectedRoute allowRecruit><MemberLayout><EditProfile /></MemberLayout></ProtectedRoute>} />
        {/* Threat map: full-screen layout, no sidebar */}
        <Route path="/hub/threat-map" element={<ProtectedRoute><ThreatMapPage /></ProtectedRoute>} />
        {/* Legacy world-monitor routes — redirect to standalone World Monitor app */}
        <Route path="/hub/threat-map/world-monitor" element={<ExternalRedirect to="/worldmonitor/" />} />
        {/* Operations Planner: full-screen layout, no sidebar */}
        <Route path="/hub/operations-planner" element={<ProtectedRoute><OperationsPlanner /></ProtectedRoute>} />
        <Route path="/hub/operations-planner/:id" element={<ProtectedRoute><OperationsPlanner /></ProtectedRoute>} />
        {/* Legacy tool routes — redirect to unified Operations Planner */}
        <Route path="/hub/orbat-mapper" element={<Navigate to="/hub/operations-planner" replace />} />
        <Route path="/hub/orbat-mapper/:operationId" element={<Navigate to="/hub/operations-planner" replace />} />
        <Route path="/hub/reforger-maps" element={<Navigate to="/hub/operations-planner" replace />} />
        <Route path="/hub/mortar-calc" element={<Navigate to="/hub/operations-planner" replace />} />
        <Route path="/partner-login" element={<PartnerLoginPage />} />
        <Route path="/partner-apply" element={<PartnerApply />} />
        <Route path="/partner" element={<PartnerHub />} />
        <Route path="/partner-admin" element={<PartnerAdmin />} />
        <Route path="/partner/discussions" element={<DiscussionForum />} />
        <Route path="/partner/discussions/:id" element={<DiscussionThread />} />
        <Route path="/partner/threat-map" element={<PartnerThreatMap />} />
        {/* Legacy world-monitor route — redirect to standalone World Monitor app */}
        <Route path="/partner/threat-map/world-monitor" element={<ExternalRedirect to="/worldmonitor/" />} />
        <Route path="/partner/shared" element={<PartnerSharedArea />} />
        {/* Defensive fallback: if Nginx is misconfigured and serves the React app
            at /worldmonitor/, show a diagnostic message instead of a black screen.
            In a correctly configured deployment, Nginx serves the standalone
            worldmonitor Vite app at this path and React never sees these requests. */}
        <Route path="/worldmonitor" element={<WorldMonitorNginxFallback />} />
        <Route path="/worldmonitor/*" element={<WorldMonitorNginxFallback />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

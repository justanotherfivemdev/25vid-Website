import React, { useEffect, useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate, Navigate } from 'react-router-dom';
import axios from 'axios';
import '@/App.css';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar, Users, Shield, Target, Megaphone, Image as ImageIcon, Clock, MapPin } from 'lucide-react';
import { SITE_CONTENT } from '@/config/siteContent';

// Admin Pages
import AdminDashboard from '@/pages/admin/Dashboard';
import OperationsManager from '@/pages/admin/OperationsManager';
import SiteContentManager from '@/pages/admin/SiteContentManager';
import AnnouncementsManager from '@/pages/admin/AnnouncementsManager';
import UsersManager from '@/pages/admin/UsersManager';
import TrainingManager from '@/pages/admin/TrainingManager';
import GalleryManager from '@/pages/admin/GalleryManager';

// Member Pages
import MemberHub from '@/pages/member/MemberHub';
import DiscussionForum from '@/pages/member/DiscussionForum';
import DiscussionThread from '@/pages/member/DiscussionThread';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Helper: resolve image URLs (handles relative /uploads/... and /api/uploads/... paths)
const resolveImg = (url) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  if (url.startsWith('/uploads/')) return `${BACKEND_URL}/api${url}`;
  return `${BACKEND_URL}${url}`;
};

// ============================================================================
// DYNAMIC CONTENT HOOK - Merges DB content over static defaults
// ============================================================================
const useSiteContent = () => {
  const [content, setContent] = useState(SITE_CONTENT);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const fetchContent = async () => {
      try {
        const res = await axios.get(`${API}/site-content`);
        if (res.data) {
          // Deep merge DB content over static defaults
          const merged = { ...SITE_CONTENT };
          const db = res.data;

          if (db.hero) {
            merged.hero = {
              backgroundImage: db.hero.backgroundImage || SITE_CONTENT.hero.backgroundImage,
              tagline: { ...SITE_CONTENT.hero.tagline, ...db.hero.tagline }
            };
          }
          if (db.about) {
            merged.about = {
              ...SITE_CONTENT.about,
              logoImage: db.about.logoImage || SITE_CONTENT.about.logoImage,
              paragraph1: db.about.paragraph1 || SITE_CONTENT.about.paragraph1,
              paragraph2: db.about.paragraph2 || SITE_CONTENT.about.paragraph2,
              quote: { ...SITE_CONTENT.about.quote, ...db.about.quote }
            };
          }
          if (db.operationalSuperiority) {
            merged.operationalSuperiority = {
              description: db.operationalSuperiority.description || SITE_CONTENT.operationalSuperiority.description,
              images: db.operationalSuperiority.images?.length ? db.operationalSuperiority.images : SITE_CONTENT.operationalSuperiority.images
            };
          }
          if (db.lethality) {
            merged.lethality = {
              logistics: { ...SITE_CONTENT.lethality.logistics, ...db.lethality.logistics },
              training: { ...SITE_CONTENT.lethality.training, ...db.lethality.training }
            };
          }
          if (db.gallery) {
            merged.gallery = {
              showcaseImages: db.gallery.showcaseImages?.length ? db.gallery.showcaseImages : SITE_CONTENT.gallery.showcaseImages
            };
          }
          if (db.footer) {
            merged.footer = {
              description: db.footer.description || SITE_CONTENT.footer.description,
              contact: { ...SITE_CONTENT.footer.contact, ...db.footer.contact }
            };
          }
          if (db.login) {
            merged.login = { ...SITE_CONTENT.login, ...db.login };
          }

          setContent(merged);
        }
      } catch (err) {
        // Fall back to static content silently
      } finally {
        setLoaded(true);
      }
    };
    fetchContent();
  }, []);

  return { content, loaded };
};

// ============================================================================
// PROTECTED ROUTE WRAPPER
// ============================================================================
const ProtectedRoute = ({ children, adminOnly = false }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (!token) { setIsAuthenticated(false); return; }
    setIsAuthenticated(true);
    setIsAdmin(user.role === 'admin');
  }, []);

  if (isAuthenticated === null) return <div className="min-h-screen bg-black flex items-center justify-center text-white">Loading...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  return children;
};

// ============================================================================
// NAVIGATION COMPONENT
// ============================================================================
const Navigation = ({ scrollToSection }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/10" data-testid="main-nav">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-xl font-bold tracking-wider" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
            AZIMUTH OPERATIONS GROUP
          </Link>
          {/* Mobile hamburger */}
          <button className="md:hidden text-white" onClick={() => setMenuOpen(!menuOpen)} data-testid="mobile-menu-btn">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={menuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} /></svg>
          </button>
          <div className={`${menuOpen ? 'flex flex-col absolute top-full left-0 right-0 bg-black/95 p-6 space-y-4 border-b border-white/10' : 'hidden'} md:flex md:flex-row md:static md:bg-transparent md:p-0 md:space-y-0 md:border-0 items-center md:space-x-8`}>
            <button onClick={() => { scrollToSection('about'); setMenuOpen(false); }} className="hover:text-red-600 transition-colors tracking-wide" data-testid="nav-about">ABOUT</button>
            <button onClick={() => { scrollToSection('operations'); setMenuOpen(false); }} className="hover:text-red-600 transition-colors tracking-wide" data-testid="nav-operations">OPERATIONS</button>
            <button onClick={() => { scrollToSection('training'); setMenuOpen(false); }} className="hover:text-red-600 transition-colors tracking-wide" data-testid="nav-training">TRAINING</button>
            <div className="hidden md:block h-6 w-px bg-red-700/50"></div>
            <Link to="/login" onClick={() => setMenuOpen(false)}>
              <Button className="bg-red-700 hover:bg-red-800 text-white px-8 py-2 tactical-button font-bold text-lg" data-testid="nav-join-button">JOIN NOW</Button>
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
    <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/80 to-black"></div>
    <div className="relative z-10 text-center px-6">
      <div className="mb-8 compass-logo" data-testid="azimuth-logo">
        <div className="relative inline-block">
          <svg width="300" height="300" viewBox="0 0 300 300" className="mx-auto">
            <circle cx="150" cy="150" r="140" stroke="#a00d0d" strokeWidth="3" fill="none" opacity="0.8"/>
            <circle cx="150" cy="150" r="120" stroke="#a00d0d" strokeWidth="2" fill="none" opacity="0.5"/>
            <path d="M 150 30 L 160 140 L 150 150 L 140 140 Z" fill="#a00d0d"/>
            <path d="M 150 270 L 160 160 L 150 150 L 140 160 Z" fill="#666"/>
            <circle cx="150" cy="150" r="8" fill="#a00d0d"/>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center flex-col">
            <div className="text-5xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif', letterSpacing: '0.15em' }}>AZIMUTH</div>
            <div className="text-3xl text-gray-400 mt-2" style={{ fontFamily: 'Rajdhani, sans-serif', letterSpacing: '0.2em' }}>SECURITY</div>
          </div>
        </div>
      </div>
      <h1 className="text-4xl sm:text-5xl lg:text-6xl md:text-8xl font-bold mb-6" style={{ fontFamily: 'Rajdhani, sans-serif', letterSpacing: '0.1em' }} data-testid="hero-tagline">
        {content.hero.tagline.line1}<br/>{content.hero.tagline.line2}
      </h1>
    </div>
  </section>
);

// ============================================================================
// ABOUT SECTION
// ============================================================================
const AboutSection = ({ content }) => (
  <section id="about" className="py-32 px-6 bg-gradient-to-b from-black via-gray-900 to-black relative" data-testid="about-section">
    <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-700 to-transparent"></div>
    <div className="container mx-auto max-w-6xl">
      <div className="grid md:grid-cols-[300px,1fr] gap-12 items-start">
        <div className="space-y-8">
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold section-underline" style={{ fontFamily: 'Rajdhani, sans-serif' }} data-testid="about-heading">ABOUT</h2>
          <Link to="/login"><Button className="bg-red-700 hover:bg-red-800 text-white px-12 py-6 text-xl tactical-button shadow-lg shadow-red-900/50" data-testid="about-join-button">JOIN NOW</Button></Link>
        </div>
        <div className="space-y-8 text-lg leading-relaxed">
          <p className="text-gray-300" data-testid="about-description-1">{content.about.paragraph1}</p>
          <div className="h-px bg-gradient-to-r from-transparent via-red-700/30 to-transparent my-8"></div>
          <p className="text-gray-300" data-testid="about-description-2">{content.about.paragraph2}</p>
          <div className="mt-16 relative rounded-lg overflow-hidden" style={{ backgroundImage: `url('${resolveImg(content.about.quote.backgroundImage)}')`, backgroundSize: 'cover', backgroundPosition: 'center', minHeight: '300px' }}>
            <div className="absolute inset-0 bg-gradient-to-br from-black/80 via-black/70 to-red-900/40"></div>
            <div className="relative z-10 p-12 flex items-center justify-center min-h-[300px]">
              <div className="text-center border-l-4 border-red-700 pl-8">
                <p className="text-2xl md:text-3xl italic text-red-400 mb-6 font-light" data-testid="founder-quote">{content.about.quote.text}</p>
                <p className="text-xl text-red-300 font-bold" data-testid="founder-name">{content.about.quote.author}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-700 to-transparent"></div>
  </section>
);

// ============================================================================
// OPERATIONAL SUPERIORITY SECTION
// ============================================================================
const OperationalSuperioritySection = ({ content }) => (
  <section className="py-32 px-6 bg-black relative" data-testid="operational-superiority-section">
    <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-700 to-transparent"></div>
    <div className="container mx-auto max-w-7xl">
      <div className="grid md:grid-cols-2 gap-16 items-center mb-20">
        <h2 className="text-4xl sm:text-5xl lg:text-6xl md:text-8xl font-bold leading-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-gray-300 to-red-500" style={{ fontFamily: 'Rajdhani, sans-serif' }} data-testid="ops-superiority-heading">OPERATIONAL<br/>SUPERIORITY</h2>
        <div className="relative">
          <div className="absolute -left-4 top-0 bottom-0 w-1 bg-gradient-to-b from-red-700 to-transparent"></div>
          <p className="text-xl leading-relaxed text-gray-300 pl-8" data-testid="ops-superiority-description">{content.operationalSuperiority.description}</p>
        </div>
      </div>
      <div className="h-px bg-gradient-to-r from-transparent via-red-700/50 to-transparent mb-20"></div>
      <div className="grid md:grid-cols-3 gap-8">
        {content.operationalSuperiority.images.map((img, idx) => (
          <div key={idx} className="aspect-[3/4] overflow-hidden rounded-lg border-2 border-white/10 hover:border-red-700/50 transition-all duration-300 shadow-2xl shadow-red-900/20 group" data-testid={`ops-image-${idx + 1}`}>
            <img src={resolveImg(img)} alt={`Tactical Operation ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          </div>
        ))}
      </div>
    </div>
    <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-700 to-transparent"></div>
  </section>
);

// ============================================================================
// LETHALITY ON DEMAND SECTION
// ============================================================================
const LethalitySection = ({ content }) => (
  <section id="training" className="py-24 px-6 bg-black" data-testid="lethality-section">
    <div className="container mx-auto max-w-7xl space-y-24">
      <h2 className="text-4xl sm:text-5xl lg:text-6xl md:text-7xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }} data-testid="lethality-heading">LETHALITY ON DEMAND</h2>
      <div className="grid md:grid-cols-2 gap-12 items-center">
        <div className="space-y-6">
          <h3 className="text-4xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }} data-testid="logistics-heading">LOGISTICS & OPERATIONAL<br/>SUPPORT</h3>
          <p className="text-lg leading-relaxed text-gray-300" data-testid="logistics-description">{content.lethality.logistics.description}</p>
        </div>
        <div className="aspect-video overflow-hidden rounded-lg border border-white/10">
          <img src={resolveImg(content.lethality.logistics.image)} alt="Logistics Support" className="w-full h-full object-cover" />
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-12 items-center">
        <div className="order-2 md:order-1 aspect-video overflow-hidden rounded-lg border border-white/10">
          <img src={resolveImg(content.lethality.training.image)} alt="Training Programs" className="w-full h-full object-cover" />
        </div>
        <div className="order-1 md:order-2 space-y-6">
          <h3 className="text-4xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif' }} data-testid="training-heading">TRAINING PROGRAMS</h3>
          <p className="text-lg leading-relaxed text-gray-300" data-testid="training-description">{content.lethality.training.description}</p>
        </div>
      </div>
    </div>
  </section>
);

// ============================================================================
// UPCOMING OPERATIONS SECTION
// ============================================================================
const UpcomingOperationsSection = () => {
  const [operations, setOperations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/operations`).then(r => setOperations(r.data.slice(0, 3))).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const getTypeColor = (type) => ({ combat: 'bg-red-700', training: 'bg-blue-600', recon: 'bg-green-600', support: 'bg-yellow-600' }[type] || 'bg-gray-600');

  return (
    <section id="operations" className="py-24 px-6 bg-gradient-to-b from-black to-gray-900" data-testid="operations-section">
      <div className="container mx-auto max-w-7xl">
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-4" style={{ fontFamily: 'Rajdhani, sans-serif' }} data-testid="upcoming-ops-heading">UPCOMING OPERATIONS</h2>
          <p className="text-base md:text-lg text-gray-400">Join the next tactical mission</p>
        </div>
        {loading ? <div className="text-center text-gray-500">Loading operations...</div> : operations.length === 0 ? <div className="text-center text-gray-500">No upcoming operations scheduled</div> : (
          <div className="grid md:grid-cols-3 gap-8">
            {operations.map((op, idx) => (
              <Card key={op.id} className="glass-card operation-card hover:border-red-700/50" data-testid={`operation-card-${idx}`}>
                <CardHeader>
                  <div className="flex items-start justify-between mb-2">
                    <Badge className={`${getTypeColor(op.operation_type)} text-white`}>{op.operation_type.toUpperCase()}</Badge>
                    {op.max_participants && <div className="text-sm text-gray-400"><Users className="inline w-4 h-4 mr-1"/>{op.rsvp_list?.length || 0}/{op.max_participants}</div>}
                  </div>
                  <CardTitle className="text-2xl" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{op.title}</CardTitle>
                  <CardDescription className="text-gray-400">{op.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center text-gray-300"><Calendar className="w-4 h-4 mr-2 text-red-500"/>{op.date}</div>
                    <div className="flex items-center text-gray-300"><Clock className="w-4 h-4 mr-2 text-red-500"/>{op.time}</div>
                  </div>
                  <Link to="/login"><Button className="w-full mt-4 bg-red-700 hover:bg-red-800" data-testid={`operation-rsvp-${idx}`}>RSVP NOW</Button></Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

// ============================================================================
// ANNOUNCEMENTS SECTION
// ============================================================================
const AnnouncementsSection = () => {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/announcements`).then(r => setAnnouncements(r.data.slice(0, 4))).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const getPriorityClass = (p) => ({ urgent: 'announcement-urgent', high: 'announcement-high', normal: 'announcement-normal', low: 'announcement-low' }[p] || 'announcement-normal');

  return (
    <section className="py-24 px-6 bg-black" data-testid="announcements-section">
      <div className="container mx-auto max-w-7xl">
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-4" style={{ fontFamily: 'Rajdhani, sans-serif' }} data-testid="announcements-heading">LATEST INTEL</h2>
          <p className="text-base md:text-lg text-gray-400">Stay informed with our latest updates</p>
        </div>
        {loading ? <div className="text-center text-gray-500">Loading announcements...</div> : announcements.length === 0 ? <div className="text-center text-gray-500">No announcements</div> : (
          <div className="grid md:grid-cols-2 gap-6">
            {announcements.map((ann, idx) => (
              <Card key={ann.id} className={`glass-card ${getPriorityClass(ann.priority)}`} data-testid={`announcement-card-${idx}`}>
                <CardHeader>
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline" className="text-red-500 border-red-500">{ann.priority.toUpperCase()}</Badge>
                    <div className="text-xs text-gray-500">{new Date(ann.created_at).toLocaleDateString()}</div>
                  </div>
                  <CardTitle className="text-2xl" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{ann.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-300">{ann.content}</p>
                  <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
                    <span><Megaphone className="inline w-4 h-4 mr-1"/> Posted by {ann.author_name}</span>
                    {ann.badge_url && <img src={resolveImg(ann.badge_url)} alt="badge" className="w-8 h-8 object-contain" />}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

// ============================================================================
// GALLERY SECTION
// ============================================================================
const GallerySection = ({ content }) => (
  <section className="py-24 px-6 bg-gradient-to-b from-gray-900 to-black" data-testid="gallery-section">
    <div className="container mx-auto max-w-7xl">
      <div className="text-center mb-16">
        <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-4" style={{ fontFamily: 'Rajdhani, sans-serif' }} data-testid="gallery-heading">MISSION GALLERY</h2>
        <p className="text-base md:text-lg text-gray-400">Moments from the field</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {content.gallery.showcaseImages.map((img, idx) => (
          <div key={idx} className="aspect-square overflow-hidden rounded-lg border border-white/10 hover:border-red-700/50 transition-colors cursor-pointer group" data-testid={`gallery-image-${idx}`}>
            <img src={resolveImg(img)} alt={`Mission ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
          </div>
        ))}
      </div>
    </div>
  </section>
);

// ============================================================================
// JOIN US SECTION
// ============================================================================
const JoinUsSection = () => {
  const [formData, setFormData] = useState({ name: '', email: '', specialization: '', message: '' });

  const handleSubmit = (e) => {
    e.preventDefault();
    alert('Thank you for your interest! Please create an account to complete your application.');
    window.location.href = '/login';
  };

  return (
    <section className="py-24 px-6 bg-black" data-testid="join-section">
      <div className="container mx-auto max-w-4xl">
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-4" style={{ fontFamily: 'Rajdhani, sans-serif' }} data-testid="join-heading">ENLIST TODAY</h2>
          <p className="text-base md:text-lg text-gray-400">Join the most professional MilSim unit</p>
        </div>
        <Card className="glass-card">
          <CardContent className="p-8">
            <form onSubmit={handleSubmit} className="space-y-6" data-testid="join-form">
              <div><label className="block text-sm font-medium mb-2">Name</label><Input type="text" required className="bg-black/50 border-white/20" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} data-testid="join-name-input" /></div>
              <div><label className="block text-sm font-medium mb-2">Email</label><Input type="email" required className="bg-black/50 border-white/20" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} data-testid="join-email-input" /></div>
              <div><label className="block text-sm font-medium mb-2">Specialization</label><Input type="text" placeholder="e.g., Assault, Recon, Support, Medic" className="bg-black/50 border-white/20" value={formData.specialization} onChange={(e) => setFormData({...formData, specialization: e.target.value})} data-testid="join-specialization-input" /></div>
              <div><label className="block text-sm font-medium mb-2">Why do you want to join?</label><Textarea rows={4} className="bg-black/50 border-white/20" value={formData.message} onChange={(e) => setFormData({...formData, message: e.target.value})} data-testid="join-message-input" /></div>
              <Button type="submit" className="w-full bg-red-700 hover:bg-red-800 py-6 text-lg tactical-button" data-testid="join-submit-button"><Shield className="mr-2"/>SUBMIT APPLICATION</Button>
            </form>
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
  <footer className="bg-black border-t border-white/10 py-12 px-6" data-testid="footer">
    <div className="container mx-auto max-w-7xl">
      <div className="grid md:grid-cols-3 gap-8 mb-8">
        <div>
          <h3 className="text-2xl font-bold mb-4" style={{ fontFamily: 'Rajdhani, sans-serif' }}>AZIMUTH OPERATIONS GROUP</h3>
          <p className="text-gray-400">{content.footer.description}</p>
        </div>
        <div>
          <h4 className="text-lg font-bold mb-4" style={{ fontFamily: 'Rajdhani, sans-serif' }}>QUICK LINKS</h4>
          <ul className="space-y-2 text-gray-400">
            <li><a href="#about" className="hover:text-red-500">About</a></li>
            <li><a href="#operations" className="hover:text-red-500">Operations</a></li>
            <li><a href="#training" className="hover:text-red-500">Training</a></li>
            <li><Link to="/login" className="hover:text-red-500">Member Portal</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-lg font-bold mb-4" style={{ fontFamily: 'Rajdhani, sans-serif' }}>CONNECT</h4>
          <p className="text-gray-400">Discord: {content.footer.contact.discord}<br/>Email: {content.footer.contact.email}</p>
        </div>
      </div>
      <div className="border-t border-white/10 pt-8 text-center text-gray-500"><p>&copy; 2025 Azimuth Operations Group. All rights reserved.</p></div>
    </div>
  </footer>
);

// ============================================================================
// LANDING PAGE COMPONENT
// ============================================================================
const LandingPage = () => {
  const { content } = useSiteContent();
  const scrollToSection = (sectionId) => {
    const el = document.getElementById(sectionId);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="App">
      <Navigation scrollToSection={scrollToSection} />
      <HeroSection content={content} />
      <AboutSection content={content} />
      <OperationalSuperioritySection content={content} />
      <LethalitySection content={content} />
      <UpcomingOperationsSection />
      <AnnouncementsSection />
      <GallerySection content={content} />
      <JoinUsSection />
      <Footer content={content} />
    </div>
  );
};

// ============================================================================
// LOGIN/REGISTER PAGE
// ============================================================================
const LoginPage = () => {
  const { content } = useSiteContent();
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ email: '', password: '', username: '', rank: '', specialization: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

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

      localStorage.setItem('token', response.data.access_token);
      localStorage.setItem('user', JSON.stringify(response.data.user));

      if (response.data.user.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/hub');
      }
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.message || 'An error occurred';
      setError(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
    } finally {
      setSubmitting(false);
    }
  };

  const loginBg = content.login?.showBackground ? {
    backgroundImage: `url('${resolveImg(content.login.backgroundImage)}')`,
    backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed'
  } : {};

  return (
    <div className="min-h-screen flex items-center justify-center px-6 relative" style={loginBg}>
      {content.login?.showBackground && <div className="absolute inset-0 bg-black" style={{ opacity: content.login.overlayOpacity || 0.85 }}></div>}
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold mb-2" style={{ fontFamily: 'Rajdhani, sans-serif' }}>AZIMUTH OPERATIONS</h1>
          <p className="text-gray-400">Member Access Portal</p>
        </div>
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-2xl text-center" style={{ fontFamily: 'Rajdhani, sans-serif' }}>{isLogin ? 'MEMBER LOGIN' : 'NEW RECRUIT'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" data-testid="auth-form">
              {!isLogin && (
                <div><label className="block text-sm font-medium mb-2">Username</label><Input type="text" required className="bg-black/50 border-white/20" value={formData.username} onChange={(e) => setFormData({...formData, username: e.target.value})} data-testid="auth-username-input" /></div>
              )}
              <div><label className="block text-sm font-medium mb-2">Email</label><Input type="email" required className="bg-black/50 border-white/20" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} data-testid="auth-email-input" /></div>
              <div><label className="block text-sm font-medium mb-2">Password</label><Input type="password" required className="bg-black/50 border-white/20" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} data-testid="auth-password-input" /></div>
              {!isLogin && (
                <>
                  <div><label className="block text-sm font-medium mb-2">Rank (Optional)</label><Input type="text" className="bg-black/50 border-white/20" value={formData.rank} onChange={(e) => setFormData({...formData, rank: e.target.value})} data-testid="auth-rank-input" /></div>
                  <div><label className="block text-sm font-medium mb-2">Specialization (Optional)</label><Input type="text" placeholder="e.g., Assault, Recon, Support" className="bg-black/50 border-white/20" value={formData.specialization} onChange={(e) => setFormData({...formData, specialization: e.target.value})} data-testid="auth-specialization-input" /></div>
                </>
              )}
              {error && <div className="text-red-500 text-sm text-center" data-testid="auth-error">{error}</div>}
              <Button type="submit" disabled={submitting} className="w-full bg-red-700 hover:bg-red-800 py-6 tactical-button" data-testid="auth-submit-button">{submitting ? 'Please wait...' : isLogin ? 'LOGIN' : 'REGISTER'}</Button>
            </form>
            <div className="mt-6 text-center">
              <button onClick={() => { setIsLogin(!isLogin); setError(''); }} className="text-sm text-gray-400 hover:text-red-500" data-testid="auth-toggle-button">{isLogin ? "Don't have an account? Register" : 'Already have an account? Login'}</button>
            </div>
          </CardContent>
        </Card>
        <div className="mt-6 text-center"><Link to="/" className="text-gray-400 hover:text-red-500">&larr; Back to Home</Link></div>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />

        {/* Admin Routes - Protected, admin only */}
        <Route path="/admin" element={<ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>} />
        <Route path="/admin/operations" element={<ProtectedRoute adminOnly><OperationsManager /></ProtectedRoute>} />
        <Route path="/admin/site-content" element={<ProtectedRoute adminOnly><SiteContentManager /></ProtectedRoute>} />
        <Route path="/admin/announcements" element={<ProtectedRoute adminOnly><AnnouncementsManager /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute adminOnly><UsersManager /></ProtectedRoute>} />
        <Route path="/admin/training" element={<ProtectedRoute adminOnly><TrainingManager /></ProtectedRoute>} />
        <Route path="/admin/gallery" element={<ProtectedRoute adminOnly><GalleryManager /></ProtectedRoute>} />

        {/* Member Routes - Protected, any authenticated user */}
        <Route path="/hub" element={<ProtectedRoute><MemberHub /></ProtectedRoute>} />
        <Route path="/hub/discussions" element={<ProtectedRoute><DiscussionForum /></ProtectedRoute>} />
        <Route path="/hub/discussions/:id" element={<ProtectedRoute><DiscussionThread /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

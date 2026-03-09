import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import '@/App.css';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar, Users, Shield, Target, Megaphone, Image as ImageIcon, Clock, MapPin } from 'lucide-react';
import { SITE_CONTENT } from '@/config/siteContent';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// ============================================================================
// NAVIGATION COMPONENT
// ============================================================================
const Navigation = ({ scrollToSection }) => {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/10">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="text-xl font-bold tracking-wider" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
            AZIMUTH OPERATIONS GROUP
          </div>
          <div className="hidden md:flex items-center space-x-8">
            <button 
              onClick={() => scrollToSection('about')} 
              className="hover:text-red-600 transition-colors tracking-wide"
              data-testid="nav-about"
            >
              ABOUT
            </button>
            <button 
              onClick={() => scrollToSection('operations')} 
              className="hover:text-red-600 transition-colors tracking-wide"
              data-testid="nav-operations"
            >
              OPERATIONS
            </button>
            <Link to="/login">
              <Button 
                className="bg-red-700 hover:bg-red-800 text-white px-6 tactical-button"
                data-testid="nav-join-button"
              >
                JOIN
              </Button>
            </Link>
            <button 
              onClick={() => scrollToSection('training')} 
              className="hover:text-red-600 transition-colors tracking-wide"
              data-testid="nav-training"
            >
              TRAINING
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

// ============================================================================
// HERO SECTION
// ============================================================================
const HeroSection = () => {
  return (
    <section 
      className="hero-section relative min-h-screen flex items-center justify-center"
      style={{
        backgroundImage: `url('${SITE_CONTENT.hero.backgroundImage}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed'
      }}
      data-testid="hero-section"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/80 to-black"></div>
      
      <div className="relative z-10 text-center px-6">
        {/* Logo */}
        <div className="mb-8 compass-logo" data-testid="azimuth-logo">
          <div className="relative inline-block">
            {/* Compass Circle */}
            <svg width="300" height="300" viewBox="0 0 300 300" className="mx-auto">
              <circle cx="150" cy="150" r="140" stroke="#a00d0d" strokeWidth="3" fill="none" opacity="0.8"/>
              <circle cx="150" cy="150" r="120" stroke="#a00d0d" strokeWidth="2" fill="none" opacity="0.5"/>
              
              {/* Compass needle */}
              <path d="M 150 30 L 160 140 L 150 150 L 140 140 Z" fill="#a00d0d"/>
              <path d="M 150 270 L 160 160 L 150 150 L 140 160 Z" fill="#666"/>
              
              {/* Center circle */}
              <circle cx="150" cy="150" r="8" fill="#a00d0d"/>
            </svg>
            
            {/* Text overlay */}
            <div className="absolute inset-0 flex items-center justify-center flex-col">
              <div className="text-5xl font-bold" style={{ fontFamily: 'Rajdhani, sans-serif', letterSpacing: '0.15em' }}>
                AZIMUTH
              </div>
              <div className="text-3xl text-gray-400 mt-2" style={{ fontFamily: 'Rajdhani, sans-serif', letterSpacing: '0.2em' }}>
                SECURITY
              </div>
            </div>
          </div>
        </div>
        
        {/* Tagline */}
        <h1 
          className="text-6xl md:text-8xl font-bold mb-6" 
          style={{ fontFamily: 'Rajdhani, sans-serif', letterSpacing: '0.1em' }}
          data-testid="hero-tagline"
        >
          {SITE_CONTENT.hero.tagline.line1}<br/>{SITE_CONTENT.hero.tagline.line2}
        </h1>
      </div>
    </section>
  );
};

// ============================================================================
// ABOUT SECTION
// ============================================================================
const AboutSection = () => {
  return (
    <section id="about" className="py-24 px-6 bg-black" data-testid="about-section">
      <div className="container mx-auto max-w-6xl">
        <div className="grid md:grid-cols-[300px,1fr] gap-12 items-start">
          {/* Left side - Title and Button */}
          <div className="space-y-8">
            <h2 
              className="text-6xl font-bold section-underline" 
              style={{ fontFamily: 'Rajdhani, sans-serif' }}
              data-testid="about-heading"
            >
              ABOUT
            </h2>
            <Link to="/login">
              <Button 
                className="bg-red-700 hover:bg-red-800 text-white px-12 py-6 text-xl tactical-button"
                data-testid="about-join-button"
              >
                JOIN NOW
              </Button>
            </Link>
          </div>
          
          {/* Right side - Content */}
          <div className="space-y-6 text-lg leading-relaxed">
            <p data-testid="about-description-1">
              {SITE_CONTENT.about.paragraph1}
            </p>
            
            <p data-testid="about-description-2">
              {SITE_CONTENT.about.paragraph2}
            </p>
            
            {/* Quote Section */}
            <div 
              className="mt-12 relative"
              style={{
                backgroundImage: `url('${SITE_CONTENT.about.quote.backgroundImage}')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                minHeight: '300px'
              }}
            >
              <div className="absolute inset-0 bg-black/70"></div>
              <div className="relative z-10 p-8 flex items-center justify-center min-h-[300px]">
                <div className="text-center">
                  <p 
                    className="text-2xl md:text-3xl italic text-red-500 mb-4"
                    data-testid="founder-quote"
                  >
                    {SITE_CONTENT.about.quote.text}
                  </p>
                  <p className="text-xl text-red-400" data-testid="founder-name">
                    {SITE_CONTENT.about.quote.author}
                  </p>
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
// OPERATIONAL SUPERIORITY SECTION
// ============================================================================
const OperationalSuperioritySection = () => {
  return (
    <section className="py-24 px-6 bg-black" data-testid="operational-superiority-section">
      <div className="container mx-auto max-w-7xl">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Left side - Title */}
          <div>
            <h2 
              className="text-6xl md:text-7xl font-bold leading-tight" 
              style={{ fontFamily: 'Rajdhani, sans-serif' }}
              data-testid="ops-superiority-heading"
            >
              OPERATIONAL
              <br/>
              SUPERIORITY
            </h2>
          </div>
          
          {/* Right side - Description */}
          <div>
            <p className="text-xl leading-relaxed" data-testid="ops-superiority-description">
              {SITE_CONTENT.operationalSuperiority.description}
            </p>
          </div>
        </div>
        
        {/* Image Grid */}
        <div className="grid md:grid-cols-3 gap-6 mt-16">
          {SITE_CONTENT.operationalSuperiority.images.map((img, idx) => (
            <div 
              key={idx} 
              className="aspect-[3/4] overflow-hidden rounded-lg border border-white/10"
              data-testid={`ops-image-${idx + 1}`}
            >
              <img 
                src={img} 
                alt={`Tactical Operation ${idx + 1}`}
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

// ============================================================================
// LETHALITY ON DEMAND SECTION
// ============================================================================
const LethalitySection = () => {
  return (
    <section id="training" className="py-24 px-6 bg-black" data-testid="lethality-section">
      <div className="container mx-auto max-w-7xl space-y-24">
        <h2 
          className="text-6xl md:text-7xl font-bold" 
          style={{ fontFamily: 'Rajdhani, sans-serif' }}
          data-testid="lethality-heading"
        >
          LETHALITY ON DEMAND
        </h2>
        
        {/* Logistics Section */}
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h3 
              className="text-4xl font-bold" 
              style={{ fontFamily: 'Rajdhani, sans-serif' }}
              data-testid="logistics-heading"
            >
              LOGISTICS & OPERATIONAL
              <br/>
              SUPPORT
            </h3>
            <p className="text-lg leading-relaxed text-gray-300" data-testid="logistics-description">
              {SITE_CONTENT.lethality.logistics.description}
            </p>
            <button className="text-red-500 hover:text-red-400 underline" data-testid="logistics-learn-more">
              Learn more →
            </button>
          </div>
          <div className="aspect-video overflow-hidden rounded-lg border border-white/10">
            <img 
              src={SITE_CONTENT.lethality.logistics.image}
              alt="Logistics Support"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
        
        {/* Training Section */}
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="order-2 md:order-1 aspect-video overflow-hidden rounded-lg border border-white/10">
            <img 
              src={SITE_CONTENT.lethality.training.image}
              alt="Training Programs"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="order-1 md:order-2 space-y-6">
            <h3 
              className="text-4xl font-bold" 
              style={{ fontFamily: 'Rajdhani, sans-serif' }}
              data-testid="training-heading"
            >
              TRAINING PROGRAMS
            </h3>
            <p className="text-lg leading-relaxed text-gray-300" data-testid="training-description">
              {SITE_CONTENT.lethality.training.description}
            </p>
            <button className="text-red-500 hover:text-red-400 underline" data-testid="training-view-details">
              View details →
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

// ============================================================================
// UPCOMING OPERATIONS SECTION
// ============================================================================
const UpcomingOperationsSection = () => {
  const [operations, setOperations] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const fetchOperations = async () => {
      try {
        const response = await axios.get(`${API}/operations`);
        setOperations(response.data.slice(0, 3));
      } catch (error) {
        console.error('Error fetching operations:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchOperations();
  }, []);
  
  const getOperationTypeColor = (type) => {
    const colors = {
      combat: 'bg-red-700',
      training: 'bg-blue-600',
      recon: 'bg-green-600',
      support: 'bg-yellow-600'
    };
    return colors[type] || 'bg-gray-600';
  };
  
  return (
    <section id="operations" className="py-24 px-6 bg-gradient-to-b from-black to-gray-900" data-testid="operations-section">
      <div className="container mx-auto max-w-7xl">
        <div className="text-center mb-16">
          <h2 
            className="text-6xl font-bold mb-4" 
            style={{ fontFamily: 'Rajdhani, sans-serif' }}
            data-testid="upcoming-ops-heading"
          >
            UPCOMING OPERATIONS
          </h2>
          <p className="text-xl text-gray-400">Join the next tactical mission</p>
        </div>
        
        {loading ? (
          <div className="text-center text-gray-500">Loading operations...</div>
        ) : operations.length === 0 ? (
          <div className="text-center text-gray-500">No upcoming operations scheduled</div>
        ) : (
          <div className="grid md:grid-cols-3 gap-8">
            {operations.map((op, idx) => (
              <Card 
                key={op.id} 
                className="glass-card operation-card hover:border-red-700/50"
                data-testid={`operation-card-${idx}`}
              >
                <CardHeader>
                  <div className="flex items-start justify-between mb-2">
                    <Badge className={`${getOperationTypeColor(op.operation_type)} text-white`}>
                      {op.operation_type.toUpperCase()}
                    </Badge>
                    {op.max_participants && (
                      <div className="text-sm text-gray-400">
                        <Users className="inline w-4 h-4 mr-1"/>
                        {op.rsvp_list?.length || 0}/{op.max_participants}
                      </div>
                    )}
                  </div>
                  <CardTitle className="text-2xl" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                    {op.title}
                  </CardTitle>
                  <CardDescription className="text-gray-400">
                    {op.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center text-gray-300">
                      <Calendar className="w-4 h-4 mr-2 text-red-500"/>
                      {op.date}
                    </div>
                    <div className="flex items-center text-gray-300">
                      <Clock className="w-4 h-4 mr-2 text-red-500"/>
                      {op.time}
                    </div>
                  </div>
                  <Button 
                    className="w-full mt-4 bg-red-700 hover:bg-red-800"
                    data-testid={`operation-rsvp-${idx}`}
                  >
                    RSVP NOW
                  </Button>
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
    const fetchAnnouncements = async () => {
      try {
        const response = await axios.get(`${API}/announcements`);
        setAnnouncements(response.data.slice(0, 4));
      } catch (error) {
        console.error('Error fetching announcements:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchAnnouncements();
  }, []);
  
  const getPriorityClass = (priority) => {
    const classes = {
      urgent: 'announcement-urgent',
      high: 'announcement-high',
      normal: 'announcement-normal',
      low: 'announcement-low'
    };
    return classes[priority] || 'announcement-normal';
  };
  
  return (
    <section className="py-24 px-6 bg-black" data-testid="announcements-section">
      <div className="container mx-auto max-w-7xl">
        <div className="text-center mb-16">
          <h2 
            className="text-6xl font-bold mb-4" 
            style={{ fontFamily: 'Rajdhani, sans-serif' }}
            data-testid="announcements-heading"
          >
            LATEST INTEL
          </h2>
          <p className="text-xl text-gray-400">Stay informed with our latest updates</p>
        </div>
        
        {loading ? (
          <div className="text-center text-gray-500">Loading announcements...</div>
        ) : announcements.length === 0 ? (
          <div className="text-center text-gray-500">No announcements</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {announcements.map((ann, idx) => (
              <Card 
                key={ann.id} 
                className={`glass-card ${getPriorityClass(ann.priority)}`}
                data-testid={`announcement-card-${idx}`}
              >
                <CardHeader>
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline" className="text-red-500 border-red-500">
                      {ann.priority.toUpperCase()}
                    </Badge>
                    <div className="text-xs text-gray-500">
                      {new Date(ann.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <CardTitle className="text-2xl" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                    {ann.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-300">{ann.content}</p>
                  <div className="mt-4 text-sm text-gray-500">
                    <Megaphone className="inline w-4 h-4 mr-1"/>
                    Posted by {ann.author_name}
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
const GallerySection = () => {
  return (
    <section className="py-24 px-6 bg-gradient-to-b from-gray-900 to-black" data-testid="gallery-section">
      <div className="container mx-auto max-w-7xl">
        <div className="text-center mb-16">
          <h2 
            className="text-6xl font-bold mb-4" 
            style={{ fontFamily: 'Rajdhani, sans-serif' }}
            data-testid="gallery-heading"
          >
            MISSION GALLERY
          </h2>
          <p className="text-xl text-gray-400">Moments from the field</p>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {SITE_CONTENT.gallery.showcaseImages.map((img, idx) => (
            <div 
              key={idx} 
              className="aspect-square overflow-hidden rounded-lg border border-white/10 hover:border-red-700/50 transition-colors cursor-pointer group"
              data-testid={`gallery-image-${idx}`}
            >
              <img 
                src={img} 
                alt={`Mission ${idx + 1}`}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              />
            </div>
          ))}
        </div>
        
        <div className="text-center mt-12">
          <Button 
            className="bg-red-700 hover:bg-red-800 px-8 py-6 text-lg"
            data-testid="gallery-view-all"
          >
            <ImageIcon className="mr-2"/>
            VIEW FULL GALLERY
          </Button>
        </div>
      </div>
    </section>
  );
};

// ============================================================================
// JOIN US SECTION
// ============================================================================
const JoinUsSection = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    specialization: '',
    message: ''
  });
  
  const handleSubmit = (e) => {
    e.preventDefault();
    alert('Thank you for your interest! Please create an account to complete your application.');
    window.location.href = '/login';
  };
  
  return (
    <section className="py-24 px-6 bg-black" data-testid="join-section">
      <div className="container mx-auto max-w-4xl">
        <div className="text-center mb-16">
          <h2 
            className="text-6xl font-bold mb-4" 
            style={{ fontFamily: 'Rajdhani, sans-serif' }}
            data-testid="join-heading"
          >
            ENLIST TODAY
          </h2>
          <p className="text-xl text-gray-400">Join the most professional MilSim unit</p>
        </div>
        
        <Card className="glass-card">
          <CardContent className="p-8">
            <form onSubmit={handleSubmit} className="space-y-6" data-testid="join-form">
              <div>
                <label className="block text-sm font-medium mb-2">Name</label>
                <Input 
                  type="text"
                  required
                  className="bg-black/50 border-white/20"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  data-testid="join-name-input"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Email</label>
                <Input 
                  type="email"
                  required
                  className="bg-black/50 border-white/20"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  data-testid="join-email-input"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Specialization</label>
                <Input 
                  type="text"
                  placeholder="e.g., Assault, Recon, Support, Medic"
                  className="bg-black/50 border-white/20"
                  value={formData.specialization}
                  onChange={(e) => setFormData({...formData, specialization: e.target.value})}
                  data-testid="join-specialization-input"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Why do you want to join?</label>
                <Textarea 
                  rows={4}
                  className="bg-black/50 border-white/20"
                  value={formData.message}
                  onChange={(e) => setFormData({...formData, message: e.target.value})}
                  data-testid="join-message-input"
                />
              </div>
              
              <Button 
                type="submit" 
                className="w-full bg-red-700 hover:bg-red-800 py-6 text-lg tactical-button"
                data-testid="join-submit-button"
              >
                <Shield className="mr-2"/>
                SUBMIT APPLICATION
              </Button>
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
const Footer = () => {
  return (
    <footer className="bg-black border-t border-white/10 py-12 px-6" data-testid="footer">
      <div className="container mx-auto max-w-7xl">
        <div className="grid md:grid-cols-3 gap-8 mb-8">
          <div>
            <h3 className="text-2xl font-bold mb-4" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
              AZIMUTH OPERATIONS GROUP
            </h3>
            <p className="text-gray-400">
              {SITE_CONTENT.footer.description}
            </p>
          </div>
          
          <div>
            <h4 className="text-lg font-bold mb-4" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
              QUICK LINKS
            </h4>
            <ul className="space-y-2 text-gray-400">
              <li><a href="#about" className="hover:text-red-500">About</a></li>
              <li><a href="#operations" className="hover:text-red-500">Operations</a></li>
              <li><a href="#training" className="hover:text-red-500">Training</a></li>
              <li><Link to="/login" className="hover:text-red-500">Member Portal</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="text-lg font-bold mb-4" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
              CONNECT
            </h4>
            <p className="text-gray-400">
              Discord: {SITE_CONTENT.footer.contact.discord}<br/>
              Email: {SITE_CONTENT.footer.contact.email}
            </p>
          </div>
        </div>
        
        <div className="border-t border-white/10 pt-8 text-center text-gray-500">
          <p>&copy; 2025 Azimuth Operations Group. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

// ============================================================================
// LANDING PAGE COMPONENT
// ============================================================================
const LandingPage = () => {
  const scrollToSection = (sectionId) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };
  
  return (
    <div className="App">
      <Navigation scrollToSection={scrollToSection} />
      <HeroSection />
      <AboutSection />
      <OperationalSuperioritySection />
      <LethalitySection />
      <UpcomingOperationsSection />
      <AnnouncementsSection />
      <GallerySection />
      <JoinUsSection />
      <Footer />
    </div>
  );
};

// ============================================================================
// LOGIN/REGISTER PAGE
// ============================================================================
const LoginPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    username: '',
    rank: '',
    specialization: ''
  });
  const [error, setError] = useState('');
  const navigate = useNavigate();
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const payload = isLogin 
        ? { email: formData.email, password: formData.password }
        : formData;
      
      const response = await axios.post(`${API}${endpoint}`, payload);
      
      // Store token and user data
      localStorage.setItem('token', response.data.access_token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      
      // Redirect to dashboard (to be built)
      alert('Login successful! Member portal coming soon.');
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || 'An error occurred');
    }
  };
  
  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 
            className="text-5xl font-bold mb-2" 
            style={{ fontFamily: 'Rajdhani, sans-serif' }}
          >
            AZIMUTH OPERATIONS
          </h1>
          <p className="text-gray-400">Member Access Portal</p>
        </div>
        
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-2xl text-center" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
              {isLogin ? 'MEMBER LOGIN' : 'NEW RECRUIT'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" data-testid="auth-form">
              {!isLogin && (
                <div>
                  <label className="block text-sm font-medium mb-2">Username</label>
                  <Input 
                    type="text"
                    required
                    className="bg-black/50 border-white/20"
                    value={formData.username}
                    onChange={(e) => setFormData({...formData, username: e.target.value})}
                    data-testid="auth-username-input"
                  />
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium mb-2">Email</label>
                <Input 
                  type="email"
                  required
                  className="bg-black/50 border-white/20"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  data-testid="auth-email-input"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Password</label>
                <Input 
                  type="password"
                  required
                  className="bg-black/50 border-white/20"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  data-testid="auth-password-input"
                />
              </div>
              
              {!isLogin && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-2">Rank (Optional)</label>
                    <Input 
                      type="text"
                      className="bg-black/50 border-white/20"
                      value={formData.rank}
                      onChange={(e) => setFormData({...formData, rank: e.target.value})}
                      data-testid="auth-rank-input"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-2">Specialization (Optional)</label>
                    <Input 
                      type="text"
                      placeholder="e.g., Assault, Recon, Support"
                      className="bg-black/50 border-white/20"
                      value={formData.specialization}
                      onChange={(e) => setFormData({...formData, specialization: e.target.value})}
                      data-testid="auth-specialization-input"
                    />
                  </div>
                </>
              )}
              
              {error && (
                <div className="text-red-500 text-sm text-center" data-testid="auth-error">
                  {error}
                </div>
              )}
              
              <Button 
                type="submit" 
                className="w-full bg-red-700 hover:bg-red-800 py-6 tactical-button"
                data-testid="auth-submit-button"
              >
                {isLogin ? 'LOGIN' : 'REGISTER'}
              </Button>
            </form>
            
            <div className="mt-6 text-center">
              <button 
                onClick={() => setIsLogin(!isLogin)}
                className="text-sm text-gray-400 hover:text-red-500"
                data-testid="auth-toggle-button"
              >
                {isLogin ? "Don't have an account? Register" : 'Already have an account? Login'}
              </button>
            </div>
          </CardContent>
        </Card>
        
        <div className="mt-6 text-center">
          <Link to="/" className="text-gray-400 hover:text-red-500">
            &larr; Back to Home
          </Link>
        </div>
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
      </Routes>
    </BrowserRouter>
  );
}

export default App;
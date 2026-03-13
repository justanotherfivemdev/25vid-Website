import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Image as ImageIcon, Home, LogOut, Shield, User, Users, Filter, ChevronLeft, LayoutDashboard } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const resolveImg = (url) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  if (url.startsWith('/uploads/')) return `${BACKEND_URL}/api${url}`;
  return `${BACKEND_URL}${url}`;
};

const normalizeUrl = (url) => resolveImg(url).split('?')[0].toLowerCase();

const GalleryHub = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [galleryImages, setGalleryImages] = useState([]);
  const [showcaseImages, setShowcaseImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');

  useEffect(() => {
    const fetchGallery = async () => {
      try {
        const [galleryRes, siteContentRes] = await Promise.all([
          axios.get(`${API}/gallery`),
          axios.get(`${API}/site-content`).catch(() => ({ data: null })),
        ]);

        setGalleryImages(galleryRes.data || []);
        setShowcaseImages(
          (siteContentRes.data?.gallery?.showcaseImages || []).filter((img) => typeof img === 'string' && img.trim())
        );
      } catch (err) {
        console.error('Failed to fetch gallery:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchGallery();
  }, []);

  const allImages = useMemo(() => {
    const mappedShowcase = showcaseImages.map((url, idx) => ({
      id: `showcase-${idx}`,
      title: `Showcase Image ${idx + 1}`,
      image_url: url,
      category: 'showcase',
      uploaded_by: 'Command Center',
      uploaded_at: null,
      source: 'showcase',
    }));

    const seen = new Set();
    const merged = [...galleryImages, ...mappedShowcase].filter((img) => {
      const key = normalizeUrl(img.image_url);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return merged;
  }, [galleryImages, showcaseImages]);

  const categories = useMemo(() => {
    const vals = new Set(allImages.map((img) => (img.category || 'general').toLowerCase()));
    return ['all', ...Array.from(vals)];
  }, [allImages]);

  const filteredImages = useMemo(() => {
    if (categoryFilter === 'all') return allImages;
    return allImages.filter((img) => (img.category || 'general').toLowerCase() === categoryFilter);
  }, [allImages, categoryFilter]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur border-b border-tropic-red/30" data-testid="member-gallery-nav">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={`${BACKEND_URL}/api/uploads/25th_id_patch.png`} alt="25th ID" className="w-8 h-8 object-contain" />
            <h1 className="text-xl font-bold tracking-wider text-tropic-gold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>25TH ID GALLERY</h1>
          </div>
          <div className="flex items-center space-x-4">
            <Link to="/hub/profile"><Button size="sm" variant="outline" className="border-gray-700"><User className="w-4 h-4 mr-1" />Profile</Button></Link>
            <Link to="/roster"><Button size="sm" variant="outline" className="border-gray-700"><Users className="w-4 h-4 mr-1" />Roster</Button></Link>
            <Link to="/hub"><Button size="sm" variant="outline" className="border-gray-700"><LayoutDashboard className="w-4 h-4 mr-1" />Hub</Button></Link>
            {user?.role === 'admin' && (
              <Link to="/admin"><Button size="sm" variant="outline" className="border-tropic-red/60 text-tropic-red hover:bg-tropic-red/10"><Shield className="w-4 h-4 mr-1" />Admin</Button></Link>
            )}
            <Link to="/"><Button size="sm" variant="outline" className="border-gray-700"><Home className="w-4 h-4 mr-1" />Home</Button></Link>
            <Button size="sm" variant="outline" onClick={handleLogout} className="border-gray-700" data-testid="member-gallery-logout"><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </nav>

      <div className="pt-24 pb-12 px-6">
        <div className="container mx-auto max-w-7xl space-y-6">
          <Card className="bg-gradient-to-r from-tropic-red/20 to-gray-900 border border-tropic-red/30" data-testid="gallery-hero-card">
            <CardHeader>
              <CardTitle className="text-3xl text-tropic-gold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>UNIT MEDIA FEED</CardTitle>
              <CardDescription className="text-gray-300">
                A combined stream of Gallery Manager uploads and Command Center showcase images for all logged-in personnel.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <ImageIcon className="w-4 h-4 text-tropic-gold" />
                <span>{allImages.length} media assets available</span>
              </div>
              <div className="w-full md:w-64">
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="bg-black border-gray-700" data-testid="gallery-filter-select">
                    <Filter className="w-4 h-4 mr-2 text-gray-400" />
                    <SelectValue placeholder="Filter by category" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-700 text-white">
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat} className="capitalize">{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <div className="text-center text-gray-400 py-16">Loading gallery...</div>
          ) : filteredImages.length === 0 ? (
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="py-12 text-center text-gray-500">No images are available for this filter yet.</CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="member-gallery-grid">
              {filteredImages.map((img) => (
                <Card key={img.id} className="bg-gray-900 border-gray-800 overflow-hidden group hover:border-tropic-gold/40 transition-colors">
                  <div className="aspect-square overflow-hidden">
                    <img src={resolveImg(img.image_url)} alt={img.title || 'Gallery image'} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  </div>
                  <CardHeader className="p-3 space-y-2">
                    <CardTitle className="text-sm line-clamp-1">{img.title || 'Untitled'}</CardTitle>
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className="text-[10px] border-gray-700 text-gray-300 capitalize">{img.category || 'general'}</Badge>
                      {img.uploaded_by && <span className="text-[10px] text-gray-500 line-clamp-1">{img.uploaded_by}</span>}
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}

          <div className="pt-2">
            <Link to="/hub">
              <Button className="bg-tropic-red hover:bg-tropic-red-dark" data-testid="gallery-back-to-hub">
                <ChevronLeft className="w-4 h-4 mr-2" />Back to Member Hub
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GalleryHub;

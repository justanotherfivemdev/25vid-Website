import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Save, Image as ImageIcon, AlertCircle, CheckCircle } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const SiteContentManager = () => {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    fetchContent();
  }, []);

  const fetchContent = async () => {
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const response = await axios.get(`${API}/admin/site-content`, config);
      setContent(response.data);
    } catch (error) {
      console.error('Error fetching content:', error);
      setMessage({ type: 'error', text: 'Failed to load site content' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      await axios.put(`${API}/admin/site-content`, content, config);
      setMessage({ type: 'success', text: 'Site content updated successfully! Refresh the homepage to see changes.' });
    } catch (error) {
      console.error('Error saving content:', error);
      setMessage({ type: 'error', text: 'Failed to save site content' });
    } finally {
      setSaving(false);
    }
  };

  const updateField = (section, field, value) => {
    setContent(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  const updateNestedField = (section, subsection, field, value) => {
    setContent(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [subsection]: {
          ...prev[section][subsection],
          [field]: value
        }
      }
    }));
  };

  const updateGalleryImage = (index, value) => {
    const newImages = [...(content.gallery?.showcaseImages || [])];
    newImages[index] = value;
    setContent(prev => ({
      ...prev,
      gallery: {
        ...prev.gallery,
        showcaseImages: newImages
      }
    }));
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="text-center py-12">Loading site content...</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-8 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
              BRANDING & IMAGE MANAGEMENT
            </h1>
            <p className="text-gray-400">
              Control all visual content and branding across your website
            </p>
          </div>
          <Button 
            onClick={handleSave} 
            disabled={saving}
            className="bg-red-700 hover:bg-red-800"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save All Changes'}
          </Button>
        </div>

        {/* Success/Error Messages */}
        {message.text && (
          <Alert className={message.type === 'success' ? 'bg-green-900/20 border-green-700' : 'bg-red-900/20 border-red-700'}>
            {message.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        {/* HERO SECTION */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center">
              <ImageIcon className="w-6 h-6 mr-3 text-red-500" />
              Hero Section
            </CardTitle>
            <CardDescription>
              Main homepage banner - First thing visitors see
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Hero Background */}
            <div className="space-y-3">
              <Label className="text-lg font-semibold">Hero Background Image</Label>
              <p className="text-sm text-gray-400">
                📍 <strong>Location:</strong> Full-screen background on homepage
                <br/>
                💡 <strong>Purpose:</strong> Sets the tactical, professional tone
                <br/>
                📏 <strong>Recommended:</strong> 1920x1080px or larger, landscape
                <br/>
                🎯 <strong>Best content:</strong> Tactical scenes, operations, team photos
              </p>
              <Input 
                value={content?.hero?.backgroundImage || ''}
                onChange={(e) => updateField('hero', 'backgroundImage', e.target.value)}
                placeholder="https://your-image-url.com/hero.jpg"
                className="bg-black border-gray-700"
              />
              {content?.hero?.backgroundImage && (
                <div className="mt-3 border border-gray-700 rounded-lg overflow-hidden">
                  <img 
                    src={content.hero.backgroundImage} 
                    alt="Hero Preview"
                    className="w-full h-48 object-cover"
                    onError={(e) => e.target.style.display = 'none'}
                  />
                </div>
              )}
            </div>

            {/* Hero Tagline */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tagline Line 1</Label>
                <Input 
                  value={content?.hero?.tagline?.line1 || ''}
                  onChange={(e) => updateNestedField('hero', 'tagline', 'line1', e.target.value)}
                  className="bg-black border-gray-700"
                />
              </div>
              <div className="space-y-2">
                <Label>Tagline Line 2</Label>
                <Input 
                  value={content?.hero?.tagline?.line2 || ''}
                  onChange={(e) => updateNestedField('hero', 'tagline', 'line2', e.target.value)}
                  className="bg-black border-gray-700"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ABOUT SECTION */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center">
              <ImageIcon className="w-6 h-6 mr-3 text-red-500" />
              About Section
            </CardTitle>
            <CardDescription>
              Company background and founder quote area
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Logo/Emblem */}
            <div className="space-y-3">
              <Label className="text-lg font-semibold">Unit Logo/Emblem</Label>
              <p className="text-sm text-gray-400">
                📍 <strong>Location:</strong> About section, near company description
                <br/>
                💡 <strong>Purpose:</strong> Unit patch, emblem, or secondary logo
                <br/>
                📏 <strong>Recommended:</strong> 300x300px square, PNG with transparency
                <br/>
                🎯 <strong>Best content:</strong> Unit patch, emblem, insignia
              </p>
              <Input 
                value={content?.about?.logoImage || ''}
                onChange={(e) => updateField('about', 'logoImage', e.target.value)}
                placeholder="https://your-image-url.com/patch.png"
                className="bg-black border-gray-700"
              />
              {content?.about?.logoImage && (
                <div className="mt-3 border border-gray-700 rounded-lg p-4 bg-black inline-block">
                  <img 
                    src={content.about.logoImage} 
                    alt="Logo Preview"
                    className="w-32 h-32 object-contain"
                    onError={(e) => e.target.style.display = 'none'}
                  />
                </div>
              )}
            </div>

            {/* Quote Section Background */}
            <div className="space-y-3">
              <Label className="text-lg font-semibold">Founder Quote Background</Label>
              <p className="text-sm text-gray-400">
                📍 <strong>Location:</strong> Behind the founder's quote in About section
                <br/>
                💡 <strong>Purpose:</strong> Adds visual interest to quote area
                <br/>
                📏 <strong>Recommended:</strong> 1200x600px, landscape
                <br/>
                🎯 <strong>Best content:</strong> Tactical photos, team operations, professional scenes
              </p>
              <Input 
                value={content?.about?.quote?.backgroundImage || ''}
                onChange={(e) => updateNestedField('about', 'quote', 'backgroundImage', e.target.value)}
                placeholder="https://your-image-url.com/quote-bg.jpg"
                className="bg-black border-gray-700"
              />
              {content?.about?.quote?.backgroundImage && (
                <div className="mt-3 border border-gray-700 rounded-lg overflow-hidden">
                  <img 
                    src={content.about.quote.backgroundImage} 
                    alt="Quote Background Preview"
                    className="w-full h-32 object-cover"
                    onError={(e) => e.target.style.display = 'none'}
                  />
                </div>
              )}
            </div>

            {/* Quote Text */}
            <div className="space-y-2">
              <Label>Founder Quote</Label>
              <Textarea 
                value={content?.about?.quote?.text || ''}
                onChange={(e) => updateNestedField('about', 'quote', 'text', e.target.value)}
                rows={3}
                className="bg-black border-gray-700"
              />
            </div>

            <div className="space-y-2">
              <Label>Quote Author</Label>
              <Input 
                value={content?.about?.quote?.author || ''}
                onChange={(e) => updateNestedField('about', 'quote', 'author', e.target.value)}
                placeholder="- B. Bishop (CEO and Founder)"
                className="bg-black border-gray-700"
              />
            </div>
          </CardContent>
        </Card>

        {/* OPERATIONAL SUPERIORITY */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center">
              <ImageIcon className="w-6 h-6 mr-3 text-red-500" />
              Operational Superiority Images
            </CardTitle>
            <CardDescription>
              Three vertical showcase images highlighting tactical operations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-gray-400">
              📍 <strong>Location:</strong> Operational Superiority section (3-column grid)
              <br/>
              💡 <strong>Purpose:</strong> Showcase tactical capabilities and operations
              <br/>
              📏 <strong>Recommended:</strong> 400x600px each, vertical/portrait orientation
              <br/>
              🎯 <strong>Best content:</strong> Action shots, team operations, tactical scenes
            </p>
            
            {[0, 1, 2].map(index => (
              <div key={index} className="space-y-2">
                <Label>Image {index + 1}</Label>
                <Input 
                  value={content?.operationalSuperiority?.images?.[index] || ''}
                  onChange={(e) => {
                    const newImages = [...(content?.operationalSuperiority?.images || ['', '', ''])];
                    newImages[index] = e.target.value;
                    updateField('operationalSuperiority', 'images', newImages);
                  }}
                  placeholder={`https://your-image-url.com/operation-${index + 1}.jpg`}
                  className="bg-black border-gray-700"
                />
                {content?.operationalSuperiority?.images?.[index] && (
                  <div className="mt-2 border border-gray-700 rounded-lg overflow-hidden inline-block">
                    <img 
                      src={content.operationalSuperiority.images[index]} 
                      alt={`Operation ${index + 1} Preview`}
                      className="w-32 h-48 object-cover"
                      onError={(e) => e.target.style.display = 'none'}
                    />
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* MISSION GALLERY */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center">
              <ImageIcon className="w-6 h-6 mr-3 text-red-500" />
              Mission Gallery Showcase
            </CardTitle>
            <CardDescription>
              Homepage gallery grid - 6 featured images
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-gray-400">
              📍 <strong>Location:</strong> Mission Gallery section on homepage
              <br/>
              💡 <strong>Purpose:</strong> Showcase recent operations and team photos
              <br/>
              📏 <strong>Recommended:</strong> 600x600px each, square format
              <br/>
              🎯 <strong>Best content:</strong> Mission photos, team shots, equipment, locations
            </p>
            
            <div className="grid grid-cols-2 gap-4">
              {[0, 1, 2, 3, 4, 5].map(index => (
                <div key={index} className="space-y-2">
                  <Label>Gallery Image {index + 1}</Label>
                  <Input 
                    value={content?.gallery?.showcaseImages?.[index] || ''}
                    onChange={(e) => updateGalleryImage(index, e.target.value)}
                    placeholder={`https://your-image-url.com/gallery-${index + 1}.jpg`}
                    className="bg-black border-gray-700"
                  />
                  {content?.gallery?.showcaseImages?.[index] && (
                    <div className="mt-2 border border-gray-700 rounded-lg overflow-hidden inline-block">
                      <img 
                        src={content.gallery.showcaseImages[index]} 
                        alt={`Gallery ${index + 1} Preview`}
                        className="w-24 h-24 object-cover"
                        onError={(e) => e.target.style.display = 'none'}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* LOGIN PAGE */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center">
              <ImageIcon className="w-6 h-6 mr-3 text-red-500" />
              Login Page Background
            </CardTitle>
            <CardDescription>
              Member login and registration page
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <Label className="text-lg font-semibold">Login Background Image</Label>
              <p className="text-sm text-gray-400">
                📍 <strong>Location:</strong> Full background on /login page
                <br/>
                💡 <strong>Purpose:</strong> Professional, branded login experience
                <br/>
                📏 <strong>Recommended:</strong> 1920x1080px or larger
                <br/>
                🎯 <strong>Best content:</strong> Unit logo collages, tactical backgrounds
              </p>
              <Input 
                value={content?.login?.backgroundImage || ''}
                onChange={(e) => updateField('login', 'backgroundImage', e.target.value)}
                placeholder="https://your-image-url.com/login-bg.jpg"
                className="bg-black border-gray-700"
              />
              {content?.login?.backgroundImage && (
                <div className="mt-3 border border-gray-700 rounded-lg overflow-hidden">
                  <img 
                    src={content.login.backgroundImage} 
                    alt="Login Background Preview"
                    className="w-full h-48 object-cover"
                    onError={(e) => e.target.style.display = 'none'}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Save Button at Bottom */}
        <div className="flex justify-end pt-6 border-t border-gray-800">
          <Button 
            onClick={handleSave} 
            disabled={saving}
            className="bg-red-700 hover:bg-red-800 px-12 py-6 text-lg"
          >
            <Save className="w-5 h-5 mr-2" />
            {saving ? 'Saving All Changes...' : 'Save All Changes'}
          </Button>
        </div>

        {/* Help Note */}
        <Alert className="bg-blue-900/20 border-blue-700">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Image URL Tips:</strong><br/>
            • Upload images to Imgur, Cloudinary, or your image host<br/>
            • Copy the direct image URL (must end in .jpg, .png, .webp, etc.)<br/>
            • Paste the URL in the fields above<br/>
            • Click "Save All Changes" to update your website<br/>
            • Changes appear immediately - no rebuild needed!
          </AlertDescription>
        </Alert>
      </div>
    </AdminLayout>
  );
};

export default SiteContentManager;

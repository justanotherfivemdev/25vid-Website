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
import ImageUpload from '@/components/admin/ImageUpload';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const SiteContentManager = () => {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => { fetchContent(); }, []);

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
    setContent(prev => ({ ...prev, [section]: { ...prev[section], [field]: value } }));
  };

  const updateNestedField = (section, subsection, field, value) => {
    setContent(prev => ({
      ...prev,
      [section]: { ...prev[section], [subsection]: { ...prev[section]?.[subsection], [field]: value } }
    }));
  };

  const updateArrayItem = (section, field, index, value) => {
    const arr = [...(content?.[section]?.[field] || [])];
    arr[index] = value;
    updateField(section, field, arr);
  };

  if (loading) {
    return <AdminLayout><div className="text-center py-12">Loading site content...</div></AdminLayout>;
  }

  return (
    <AdminLayout>
      <div className="space-y-8 max-w-6xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2" style={{ fontFamily: 'Rajdhani, sans-serif' }} data-testid="site-content-title">
              BRANDING & IMAGE MANAGEMENT
            </h1>
            <p className="text-gray-400">Control all visual content and branding across your website. Upload images or paste URLs.</p>
          </div>
          <Button onClick={handleSave} disabled={saving} className="bg-red-700 hover:bg-red-800" data-testid="save-content-btn">
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save All Changes'}
          </Button>
        </div>

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
              <ImageIcon className="w-6 h-6 mr-3 text-red-500" /> Hero Section
            </CardTitle>
            <CardDescription>Main homepage banner - First thing visitors see</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <ImageUpload
              value={content?.hero?.backgroundImage || ''}
              onChange={(url) => updateField('hero', 'backgroundImage', url)}
              label="Hero Background Image"
              description="Location: Full-screen background on homepage. Purpose: Sets the tactical, professional tone. Recommended: 1920x1080px or larger, landscape."
              previewClass="w-full h-48 object-cover"
            />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tagline Line 1</Label>
                <Input value={content?.hero?.tagline?.line1 || ''} onChange={(e) => updateNestedField('hero', 'tagline', 'line1', e.target.value)} className="bg-black border-gray-700" />
              </div>
              <div className="space-y-2">
                <Label>Tagline Line 2</Label>
                <Input value={content?.hero?.tagline?.line2 || ''} onChange={(e) => updateNestedField('hero', 'tagline', 'line2', e.target.value)} className="bg-black border-gray-700" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ABOUT SECTION */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center">
              <ImageIcon className="w-6 h-6 mr-3 text-red-500" /> About Section
            </CardTitle>
            <CardDescription>Company background, logo, and founder quote</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <ImageUpload
              value={content?.about?.logoImage || ''}
              onChange={(url) => updateField('about', 'logoImage', url)}
              label="Unit Logo/Emblem"
              description="Location: About section, near company description. Purpose: Unit patch, emblem, or secondary logo. Recommended: 300x300px square, PNG with transparency."
              previewClass="w-32 h-32 object-contain"
            />
            <div className="space-y-2">
              <Label>About Paragraph 1</Label>
              <Textarea value={content?.about?.paragraph1 || ''} onChange={(e) => updateField('about', 'paragraph1', e.target.value)} rows={3} className="bg-black border-gray-700" />
            </div>
            <div className="space-y-2">
              <Label>About Paragraph 2</Label>
              <Textarea value={content?.about?.paragraph2 || ''} onChange={(e) => updateField('about', 'paragraph2', e.target.value)} rows={3} className="bg-black border-gray-700" />
            </div>
            <ImageUpload
              value={content?.about?.quote?.backgroundImage || ''}
              onChange={(url) => updateNestedField('about', 'quote', 'backgroundImage', url)}
              label="Founder Quote Background"
              description="Location: Behind the founder's quote in About section. Purpose: Adds visual interest. Recommended: 1200x600px, landscape."
              previewClass="w-full h-32 object-cover"
            />
            <div className="space-y-2">
              <Label>Founder Quote</Label>
              <Textarea value={content?.about?.quote?.text || ''} onChange={(e) => updateNestedField('about', 'quote', 'text', e.target.value)} rows={3} className="bg-black border-gray-700" />
            </div>
            <div className="space-y-2">
              <Label>Quote Author</Label>
              <Input value={content?.about?.quote?.author || ''} onChange={(e) => updateNestedField('about', 'quote', 'author', e.target.value)} className="bg-black border-gray-700" placeholder="- B. Bishop (CEO and Founder)" />
            </div>
          </CardContent>
        </Card>

        {/* OPERATIONAL SUPERIORITY */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center">
              <ImageIcon className="w-6 h-6 mr-3 text-red-500" /> Operational Superiority Images
            </CardTitle>
            <CardDescription>Three vertical showcase images highlighting tactical operations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Section Description</Label>
              <Textarea value={content?.operationalSuperiority?.description || ''} onChange={(e) => updateField('operationalSuperiority', 'description', e.target.value)} rows={2} className="bg-black border-gray-700" />
            </div>
            {[0, 1, 2].map(index => (
              <ImageUpload
                key={index}
                value={content?.operationalSuperiority?.images?.[index] || ''}
                onChange={(url) => updateArrayItem('operationalSuperiority', 'images', index, url)}
                label={`Operational Image ${index + 1}`}
                description={`Location: Operational Superiority section, column ${index + 1}. Recommended: 400x600px, portrait.`}
                previewClass="w-32 h-48 object-cover"
              />
            ))}
          </CardContent>
        </Card>

        {/* LETHALITY ON DEMAND */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center">
              <ImageIcon className="w-6 h-6 mr-3 text-red-500" /> Lethality on Demand Section
            </CardTitle>
            <CardDescription>Logistics & Training subsection images and descriptions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Logistics Description</Label>
              <Textarea value={content?.lethality?.logistics?.description || ''} onChange={(e) => updateNestedField('lethality', 'logistics', 'description', e.target.value)} rows={2} className="bg-black border-gray-700" />
            </div>
            <ImageUpload
              value={content?.lethality?.logistics?.image || ''}
              onChange={(url) => updateNestedField('lethality', 'logistics', 'image', url)}
              label="Logistics Image"
              description="Location: Next to Logistics description. Recommended: 800x450px landscape."
              previewClass="w-full h-32 object-cover"
            />
            <div className="space-y-2">
              <Label>Training Description</Label>
              <Textarea value={content?.lethality?.training?.description || ''} onChange={(e) => updateNestedField('lethality', 'training', 'description', e.target.value)} rows={2} className="bg-black border-gray-700" />
            </div>
            <ImageUpload
              value={content?.lethality?.training?.image || ''}
              onChange={(url) => updateNestedField('lethality', 'training', 'image', url)}
              label="Training Image"
              description="Location: Next to Training description. Recommended: 800x450px landscape."
              previewClass="w-full h-32 object-cover"
            />
          </CardContent>
        </Card>

        {/* MISSION GALLERY */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center">
              <ImageIcon className="w-6 h-6 mr-3 text-red-500" /> Mission Gallery Showcase
            </CardTitle>
            <CardDescription>Homepage gallery grid - 6 featured images</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[0, 1, 2, 3, 4, 5].map(index => (
                <ImageUpload
                  key={index}
                  value={content?.gallery?.showcaseImages?.[index] || ''}
                  onChange={(url) => updateArrayItem('gallery', 'showcaseImages', index, url)}
                  label={`Gallery Image ${index + 1}`}
                  description={`Location: Mission Gallery section. Recommended: 600x600px, square.`}
                  previewClass="w-24 h-24 object-cover"
                />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* LOGIN PAGE */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center">
              <ImageIcon className="w-6 h-6 mr-3 text-red-500" /> Login Page Background
            </CardTitle>
            <CardDescription>Member login and registration page</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <ImageUpload
              value={content?.login?.backgroundImage || ''}
              onChange={(url) => updateField('login', 'backgroundImage', url)}
              label="Login Background Image"
              description="Location: Full background on /login page. Purpose: Professional, branded login experience. Recommended: 1920x1080px or larger."
              previewClass="w-full h-48 object-cover"
            />
          </CardContent>
        </Card>

        {/* FOOTER */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center">
              <ImageIcon className="w-6 h-6 mr-3 text-red-500" /> Footer
            </CardTitle>
            <CardDescription>Footer description and contact information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Footer Description</Label>
              <Input value={content?.footer?.description || ''} onChange={(e) => updateField('footer', 'description', e.target.value)} className="bg-black border-gray-700" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Discord</Label>
                <Input value={content?.footer?.contact?.discord || ''} onChange={(e) => updateNestedField('footer', 'contact', 'discord', e.target.value)} className="bg-black border-gray-700" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={content?.footer?.contact?.email || ''} onChange={(e) => updateNestedField('footer', 'contact', 'email', e.target.value)} className="bg-black border-gray-700" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Save Button at Bottom */}
        <div className="flex justify-end pt-6 border-t border-gray-800">
          <Button onClick={handleSave} disabled={saving} className="bg-red-700 hover:bg-red-800 px-12 py-6 text-lg" data-testid="save-content-btn-bottom">
            <Save className="w-5 h-5 mr-2" />
            {saving ? 'Saving All Changes...' : 'Save All Changes'}
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
};

export default SiteContentManager;

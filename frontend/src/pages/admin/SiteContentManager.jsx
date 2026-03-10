import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Save, AlertCircle, CheckCircle, Globe, Type, Image as ImageIcon, Layout, FileText, Hash } from 'lucide-react';
import ImageUpload from '@/components/admin/ImageUpload';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/* ─── tiny label component ─── */
const FieldHint = ({ location, purpose, recommended }) => (
  <div className="text-xs text-gray-500 space-y-0.5 mt-1 leading-snug">
    {location && <div><span className="text-gray-400 font-medium">Appears on:</span> {location}</div>}
    {purpose && <div><span className="text-gray-400 font-medium">Purpose:</span> {purpose}</div>}
    {recommended && <div><span className="text-gray-400 font-medium">Recommended:</span> {recommended}</div>}
  </div>
);

/* ─── section wrapper ─── */
const SectionCard = ({ number, icon: Icon, title, subtitle, children }) => (
  <Card className="bg-gray-900 border-gray-800 overflow-hidden" data-testid={`section-${number}`}>
    <CardHeader className="bg-gray-900/80 border-b border-gray-800/60">
      <div className="flex items-center gap-4">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-red-900/30 text-red-500 font-bold text-sm shrink-0">{number}</div>
        <div className="flex-1">
          <CardTitle className="text-xl flex items-center gap-2">
            <Icon className="w-5 h-5 text-red-500" />{title}
          </CardTitle>
          <CardDescription className="mt-0.5">{subtitle}</CardDescription>
        </div>
      </div>
    </CardHeader>
    <CardContent className="space-y-6 pt-6">{children}</CardContent>
  </Card>
);

const SiteContentManager = () => {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => { fetchContent(); }, []);

  const fetchContent = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API}/admin/site-content`, { headers: { Authorization: `Bearer ${token}` } });
      setContent(res.data || {});
    } catch (e) {
      setMessage({ type: 'error', text: 'Failed to load site content' });
    } finally { setLoading(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API}/admin/site-content`, content, { headers: { Authorization: `Bearer ${token}` } });
      setMessage({ type: 'success', text: 'All changes saved. Refresh the public site to see updates.' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setMessage({ type: 'error', text: 'Failed to save. Please try again.' });
    } finally { setSaving(false); }
  };

  /* helpers */
  const get = (path) => {
    const keys = path.split('.');
    let v = content;
    for (const k of keys) { v = v?.[k]; }
    return v || '';
  };
  const set = (path, value) => {
    const keys = path.split('.');
    setContent(prev => {
      const next = JSON.parse(JSON.stringify(prev || {}));
      let ref = next;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!ref[keys[i]] || typeof ref[keys[i]] !== 'object') ref[keys[i]] = {};
        ref = ref[keys[i]];
      }
      ref[keys[keys.length - 1]] = value;
      return next;
    });
  };
  const setArr = (path, idx, value) => {
    const keys = path.split('.');
    setContent(prev => {
      const next = JSON.parse(JSON.stringify(prev || {}));
      let ref = next;
      for (let i = 0; i < keys.length; i++) {
        if (!ref[keys[i]]) ref[keys[i]] = i === keys.length - 1 ? [] : {};
        ref = ref[keys[i]];
      }
      while (ref.length <= idx) ref.push('');
      ref[idx] = value;
      return next;
    });
  };

  if (loading) return <AdminLayout><div className="text-center py-12">Loading content editor...</div></AdminLayout>;

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between sticky top-0 z-10 bg-gray-950/95 backdrop-blur-sm py-4 -mx-2 px-2 border-b border-gray-800/50">
          <div>
            <h1 className="text-3xl font-bold tracking-wider" data-testid="site-content-title">COMMAND CENTER</h1>
            <p className="text-sm text-gray-500 mt-1">Edit all website branding, text, and imagery. Changes are live after saving.</p>
          </div>
          <Button onClick={handleSave} disabled={saving} className="bg-red-700 hover:bg-red-800 px-8" data-testid="save-content-btn">
            <Save className="w-4 h-4 mr-2" />{saving ? 'Saving...' : 'Save All'}
          </Button>
        </div>

        {message.text && (
          <Alert className={message.type === 'success' ? 'bg-green-900/20 border-green-700' : 'bg-red-900/20 border-red-700'}>
            {message.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        {/* 1 — NAVIGATION BAR */}
        <SectionCard number="01" icon={Globe} title="Navigation Bar" subtitle="Top navigation bar visible on every page">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Brand Name</Label>
              <FieldHint location="Top-left of nav bar on every page" purpose="Your unit's display name" />
              <Input value={get('nav.brandName')} onChange={e => set('nav.brandName', e.target.value)} className="bg-black border-gray-700 mt-2" placeholder="AZIMUTH OPERATIONS GROUP" data-testid="nav-brand-input" />
            </div>
            <div>
              <Label>CTA Button Text</Label>
              <FieldHint location="Top-right of nav bar + hero section" purpose="Primary call-to-action button" />
              <Input value={get('nav.buttonText')} onChange={e => set('nav.buttonText', e.target.value)} className="bg-black border-gray-700 mt-2" placeholder="JOIN NOW" data-testid="nav-btn-input" />
            </div>
          </div>
        </SectionCard>

        {/* 2 — HERO SECTION */}
        <SectionCard number="02" icon={ImageIcon} title="Hero Banner" subtitle="Full-screen header — first thing visitors see on the homepage">
          <ImageUpload value={get('hero.backgroundImage')} onChange={url => set('hero.backgroundImage', url)} label="Background Image"
            description="Appears on: Full-screen behind logo and tagline. Purpose: Sets the tactical, immersive first impression. Recommended: 1920x1080px or larger, dark landscape photo."
            previewClass="w-full h-44 object-cover rounded" />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Tagline Line 1</Label>
              <FieldHint location="Centered below compass logo" purpose="Bold headline, first line" />
              <Input value={get('hero.tagline.line1')} onChange={e => set('hero.tagline.line1', e.target.value)} className="bg-black border-gray-700 mt-2" data-testid="hero-line1-input" />
            </div>
            <div>
              <Label>Tagline Line 2</Label>
              <FieldHint location="Centered below line 1" purpose="Bold headline, second line" />
              <Input value={get('hero.tagline.line2')} onChange={e => set('hero.tagline.line2', e.target.value)} className="bg-black border-gray-700 mt-2" data-testid="hero-line2-input" />
            </div>
          </div>
        </SectionCard>

        {/* 3 — ABOUT SECTION */}
        <SectionCard number="03" icon={FileText} title="About Section" subtitle="Unit background, emblem, and founder quote — below the hero">
          <ImageUpload value={get('about.logoImage')} onChange={url => set('about.logoImage', url)} label="Unit Emblem / Patch"
            description="Appears on: Left side of About section. Purpose: Unit identity badge. Recommended: 300x300px square PNG with transparency."
            previewClass="w-28 h-28 object-contain" />
          <div>
            <Label>About Paragraph 1</Label>
            <FieldHint location="About section, main body text" purpose="Unit origin story or description" />
            <Textarea value={get('about.paragraph1')} onChange={e => set('about.paragraph1', e.target.value)} rows={3} className="bg-black border-gray-700 mt-2" />
          </div>
          <div>
            <Label>About Paragraph 2</Label>
            <FieldHint location="About section, below paragraph 1" purpose="Mission statement or community description" />
            <Textarea value={get('about.paragraph2')} onChange={e => set('about.paragraph2', e.target.value)} rows={3} className="bg-black border-gray-700 mt-2" />
          </div>
          <div className="border-t border-gray-800 pt-6">
            <h4 className="text-sm font-bold text-gray-400 tracking-wider mb-4">FOUNDER QUOTE BLOCK</h4>
            <ImageUpload value={get('about.quote.backgroundImage')} onChange={url => set('about.quote.backgroundImage', url)} label="Quote Background Image"
              description="Appears on: Behind the quote text box. Purpose: Atmospheric tactical backdrop. Recommended: 1200x600px landscape."
              previewClass="w-full h-28 object-cover rounded" />
            <div className="mt-4">
              <Label>Quote Text</Label>
              <FieldHint location="About section, quote block" purpose="Featured motivational / leadership quote" />
              <Textarea value={get('about.quote.text')} onChange={e => set('about.quote.text', e.target.value)} rows={2} className="bg-black border-gray-700 mt-2" />
            </div>
            <div className="mt-4">
              <Label>Quote Author</Label>
              <FieldHint location="Below the quote text" purpose="Attribution line" />
              <Input value={get('about.quote.author')} onChange={e => set('about.quote.author', e.target.value)} className="bg-black border-gray-700 mt-2" placeholder="- B. Bishop (CEO and Founder)" />
            </div>
          </div>
        </SectionCard>

        {/* 4 — OPERATIONAL SUPERIORITY */}
        <SectionCard number="04" icon={ImageIcon} title="Operational Superiority" subtitle="3-column tactical image showcase with description text">
          <div>
            <Label>Section Description</Label>
            <FieldHint location="Right side of heading" purpose="Describes the unit's operational capability" />
            <Textarea value={get('operationalSuperiority.description')} onChange={e => set('operationalSuperiority.description', e.target.value)} rows={2} className="bg-black border-gray-700 mt-2" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[0, 1, 2].map(i => (
              <ImageUpload key={i} value={get(`operationalSuperiority.images`)?.[i] || ''} onChange={url => setArr('operationalSuperiority.images', i, url)}
                label={`Column ${i + 1}`} description={`Appears on: Operational Superiority, position ${i + 1}. Recommended: 400x600px portrait.`}
                previewClass="w-full h-32 object-cover rounded" />
            ))}
          </div>
        </SectionCard>

        {/* 5 — LETHALITY ON DEMAND */}
        <SectionCard number="05" icon={Layout} title="Lethality on Demand" subtitle="Logistics and training showcase sections">
          <div className="border border-gray-800 rounded-lg p-4 space-y-4">
            <h4 className="text-sm font-bold text-gray-400 tracking-wider">LOGISTICS BLOCK</h4>
            <div>
              <Label>Logistics Description</Label>
              <FieldHint location="Left of logistics image" purpose="Logistical support overview" />
              <Textarea value={get('lethality.logistics.description')} onChange={e => set('lethality.logistics.description', e.target.value)} rows={2} className="bg-black border-gray-700 mt-2" />
            </div>
            <ImageUpload value={get('lethality.logistics.image')} onChange={url => set('lethality.logistics.image', url)} label="Logistics Image"
              description="Appears on: Right of logistics text. Recommended: 800x450px landscape." previewClass="w-full h-28 object-cover rounded" />
          </div>
          <div className="border border-gray-800 rounded-lg p-4 space-y-4">
            <h4 className="text-sm font-bold text-gray-400 tracking-wider">TRAINING BLOCK</h4>
            <div>
              <Label>Training Description</Label>
              <FieldHint location="Right of training image" purpose="Training program overview" />
              <Textarea value={get('lethality.training.description')} onChange={e => set('lethality.training.description', e.target.value)} rows={2} className="bg-black border-gray-700 mt-2" />
            </div>
            <ImageUpload value={get('lethality.training.image')} onChange={url => set('lethality.training.image', url)} label="Training Image"
              description="Appears on: Left of training text. Recommended: 800x450px landscape." previewClass="w-full h-28 object-cover rounded" />
          </div>
        </SectionCard>

        {/* 6 — SECTION HEADINGS */}
        <SectionCard number="06" icon={Type} title="Section Headings & Subtexts" subtitle="Control the title and description text above each homepage section">
          {[
            { key: 'operations', label: 'Upcoming Operations', defaultH: 'UPCOMING OPERATIONS', defaultS: 'Join the next tactical mission' },
            { key: 'intel', label: 'Latest Intel / Announcements', defaultH: 'LATEST INTEL', defaultS: 'Stay informed with our latest updates' },
            { key: 'gallery', label: 'Mission Gallery', defaultH: 'MISSION GALLERY', defaultS: 'Moments from the field' },
            { key: 'enlist', label: 'Enlist / Join Section', defaultH: 'ENLIST TODAY', defaultS: 'Join the most professional MilSim unit' },
            { key: 'lethality', label: 'Lethality on Demand', defaultH: 'LETHALITY ON DEMAND', defaultS: '' },
            { key: 'operationalSuperiority', label: 'Operational Superiority', defaultH: 'OPERATIONAL SUPERIORITY', defaultS: '' },
          ].map(({ key, label, defaultH, defaultS }) => (
            <div key={key} className="grid grid-cols-[1fr,1fr] gap-4 pb-4 border-b border-gray-800/50 last:border-0">
              <div>
                <Label>{label} — Heading</Label>
                <Input value={get(`sectionHeadings.${key}.heading`) || ''} onChange={e => set(`sectionHeadings.${key}.heading`, e.target.value)} className="bg-black border-gray-700 mt-1" placeholder={defaultH} />
              </div>
              {defaultS !== '' ? (
                <div>
                  <Label>{label} — Subtext</Label>
                  <Input value={get(`sectionHeadings.${key}.subtext`) || ''} onChange={e => set(`sectionHeadings.${key}.subtext`, e.target.value)} className="bg-black border-gray-700 mt-1" placeholder={defaultS} />
                </div>
              ) : <div></div>}
            </div>
          ))}
        </SectionCard>

        {/* 7 — GALLERY SHOWCASE */}
        <SectionCard number="07" icon={ImageIcon} title="Mission Gallery Showcase" subtitle="6 featured images displayed in a grid on the homepage">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[0, 1, 2, 3, 4, 5].map(i => (
              <ImageUpload key={i} value={get('gallery.showcaseImages')?.[i] || ''} onChange={url => setArr('gallery.showcaseImages', i, url)}
                label={`Slot ${i + 1}`} description={`Appears on: Gallery grid, position ${i + 1}. Recommended: 600x600px.`}
                previewClass="w-full h-20 object-cover rounded" />
            ))}
          </div>
        </SectionCard>

        {/* 8 — LOGIN PAGE */}
        <SectionCard number="08" icon={ImageIcon} title="Login Page Background" subtitle="Background image for the member login / registration page">
          <ImageUpload value={get('login.backgroundImage')} onChange={url => set('login.backgroundImage', url)} label="Login Background Image"
            description="Appears on: Full-screen background on /login. Purpose: Branded login experience. Recommended: 1920x1080px."
            previewClass="w-full h-44 object-cover rounded" />
        </SectionCard>

        {/* 9 — FOOTER */}
        <SectionCard number="09" icon={Hash} title="Footer" subtitle="Bottom section — description and contact info on every page">
          <div>
            <Label>Footer Tagline</Label>
            <FieldHint location="Footer, below brand name" purpose="Short unit description or slogan" />
            <Input value={get('footer.description')} onChange={e => set('footer.description', e.target.value)} className="bg-black border-gray-700 mt-2" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Discord</Label>
              <FieldHint location="Footer, Connect column" />
              <Input value={get('footer.contact.discord')} onChange={e => set('footer.contact.discord', e.target.value)} className="bg-black border-gray-700 mt-2" />
            </div>
            <div>
              <Label>Email</Label>
              <FieldHint location="Footer, Connect column" />
              <Input value={get('footer.contact.email')} onChange={e => set('footer.contact.email', e.target.value)} className="bg-black border-gray-700 mt-2" />
            </div>
          </div>
        </SectionCard>

        {/* Bottom save */}
        <div className="flex justify-between items-center pt-8 border-t border-gray-800">
          <p className="text-sm text-gray-600">All fields are optional. Empty fields fall back to defaults.</p>
          <Button onClick={handleSave} disabled={saving} className="bg-red-700 hover:bg-red-800 px-10 py-5 text-base" data-testid="save-content-btn-bottom">
            <Save className="w-5 h-5 mr-2" />{saving ? 'Saving...' : 'Save All Changes'}
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
};

export default SiteContentManager;

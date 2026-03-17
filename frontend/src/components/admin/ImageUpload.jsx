import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, X, Loader2 } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const ImageUpload = ({ value, onChange, label, description, previewClass = "w-full h-48 object-cover" }) => {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');


  const mediaKind = (url) => {
    if (!url) return 'none';
    const clean = url.split('?')[0].toLowerCase();
    if (/\.(mp4|webm|mov|m4v)$/.test(clean)) return 'video';
    if (/\.(mp3|ogg|wav)$/.test(clean)) return 'audio';
    if (/\.(jpg|jpeg|png|gif|webp|svg|ico)$/.test(clean)) return 'image';
    return 'image';
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon',
      'video/mp4', 'video/webm', 'video/quicktime',
      'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav'
    ];
    if (!allowed.includes(file.type)) {
      setError('Invalid file type. Use image/video/audio formats (JPG, PNG, WebP, SVG, ICO, MP4, WebM, MOV, MP3, OGG).');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('File too large. Max 10MB.');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API}/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Upload failed');
      }

      const data = await res.json();
      onChange(data.url);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleClear = () => {
    onChange('');
    setError('');
  };

  const getDisplayUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    // Handle both old /uploads/ and new /api/uploads/ paths
    if (url.startsWith('/uploads/')) return `${BACKEND_URL}/api${url}`;
    return `${BACKEND_URL}${url}`;
  };

  return (
    <div className="space-y-3" data-testid={`image-upload-${label?.toLowerCase().replace(/\s+/g, '-')}`}>
      {label && <label className="text-lg font-semibold block">{label}</label>}
      {description && <p className="text-sm text-gray-400">{description}</p>}

      <div className="flex gap-2">
        <Input
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Paste URL or upload a file..."
          className="bg-black border-gray-700 flex-1"
        />
        <Button
          type="button"
          variant="outline"
          className="border-gray-700 shrink-0"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        </Button>
        {value && (
          <Button
            type="button"
            variant="outline"
            className="border-tropic-red/60 text-tropic-red hover:bg-tropic-red/10 shrink-0"
            onClick={handleClear}
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*,.ico,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/mp3,audio/ogg,audio/wav"
        onChange={handleUpload}
        className="hidden"
      />

      {error && <p className="text-sm text-tropic-red">{error}</p>}

      {value && (
        <div className="mt-2 border border-gray-700 rounded-lg overflow-hidden inline-block">
          {mediaKind(value) === 'video' ? (
            <video src={getDisplayUrl(value)} className={previewClass} muted loop autoPlay playsInline controls />
          ) : mediaKind(value) === 'audio' ? (
            <div className="p-4 bg-black/40 min-w-[280px]">
              <audio src={getDisplayUrl(value)} className="w-full" controls />
            </div>
          ) : (
            <img
              src={getDisplayUrl(value)}
              alt="Preview"
              className={previewClass}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default ImageUpload;

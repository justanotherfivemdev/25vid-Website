import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, X, Save, CheckCircle, AlertCircle, Building2, Users, Shield, Target, Award } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Tag categories configuration
const TAG_CATEGORIES = [
  { key: 'ranks', label: 'Ranks', icon: Shield, color: 'text-amber-500', description: 'Military ranks for the unit hierarchy' },
  { key: 'companies', label: 'Companies', icon: Building2, color: 'text-tropic-gold', description: 'Company-level units (e.g., Alpha, Bravo, HQ)' },
  { key: 'platoons', label: 'Platoons', icon: Users, color: 'text-green-500', description: 'Platoon-level units within companies' },
  { key: 'squads', label: 'Squads', icon: Target, color: 'text-purple-500', description: 'Squad-level teams within platoons' },
  { key: 'billets', label: 'Billets / Positions', icon: Award, color: 'text-yellow-500', description: 'Job titles and positions (e.g., Squad Leader, Medic)' },
  { key: 'specializations', label: 'Specializations / MOS', icon: Target, color: 'text-tropic-gold', description: 'Military occupational specialties' },
];

const TagCategoryCard = ({ category, tags, customTags, onAddTag, onRemoveCustomTag }) => {
  const [newTag, setNewTag] = useState('');
  const Icon = category.icon;
  
  const handleAdd = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      onAddTag(category.key, newTag.trim());
      setNewTag('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader className="pb-3">
        <CardTitle className={`text-lg tracking-wider flex items-center gap-2 ${category.color}`}>
          <Icon className="w-5 h-5" /> {category.label}
        </CardTitle>
        <p className="text-xs text-gray-500">{category.description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add new tag */}
        <div className="flex gap-2">
          <Input
            value={newTag}
            onChange={e => setNewTag(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Add new ${category.label.toLowerCase().slice(0, -1)}...`}
            className="bg-black border-gray-700 flex-1"
            data-testid={`add-${category.key}-input`}
          />
          <Button 
            onClick={handleAdd} 
            disabled={!newTag.trim()}
            className="bg-amber-700 hover:bg-amber-800"
            data-testid={`add-${category.key}-btn`}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        {/* Tag list */}
        <div className="flex flex-wrap gap-2">
          {tags.map(tag => {
            const isCustom = customTags?.includes(tag);
            return (
              <Badge 
                key={tag} 
                variant="outline" 
                className={`${isCustom ? 'bg-amber-900/30 border-amber-700/50 text-amber-300' : 'bg-gray-800/50 border-gray-700 text-gray-300'} px-2 py-1 text-xs flex items-center gap-1`}
              >
                {tag}
                {isCustom && (
                  <button 
                    onClick={() => onRemoveCustomTag(category.key, tag)}
                    className="ml-1 hover:text-red-400 transition-colors"
                    data-testid={`remove-${category.key}-${tag}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </Badge>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-[10px] text-gray-600 pt-2 border-t border-gray-800">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-gray-600"></span> Default
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-600"></span> Custom (removable)
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

const UnitTagsManager = () => {
  const [tags, setTags] = useState(null);
  const [customTags, setCustomTags] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    fetchTags();
  }, []);

  const fetchTags = async () => {
    try {
      const res = await axios.get(`${API}/unit-tags`);
      setTags(res.data);
      // Try to load custom tags from localStorage or separate endpoint
      // For now, we track added tags locally
      const savedCustom = localStorage.getItem('customUnitTags');
      if (savedCustom) {
        try {
          setCustomTags(JSON.parse(savedCustom));
        } catch (e) {}
      }
    } catch (e) {
      console.error('Failed to load tags', e);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTag = (category, tag) => {
    // Update local state
    setTags(prev => ({
      ...prev,
      [category]: [...(prev[category] || []), tag]
    }));
    
    // Track as custom
    setCustomTags(prev => {
      const updated = {
        ...prev,
        [category]: [...(prev[category] || []), tag]
      };
      localStorage.setItem('customUnitTags', JSON.stringify(updated));
      return updated;
    });
  };

  const handleRemoveCustomTag = (category, tag) => {
    // Remove from tags
    setTags(prev => ({
      ...prev,
      [category]: (prev[category] || []).filter(t => t !== tag)
    }));
    
    // Remove from custom tracking
    setCustomTags(prev => {
      const updated = {
        ...prev,
        [category]: (prev[category] || []).filter(t => t !== tag)
      };
      localStorage.setItem('customUnitTags', JSON.stringify(updated));
      return updated;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      // Only save custom tags to the backend
      await axios.put(`${API}/admin/unit-tags`, customTags);
      setMessage({ type: 'success', text: 'Unit tags saved successfully!' });
    } catch (e) {
      setMessage({ type: 'error', text: e.response?.data?.detail || 'Failed to save tags' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="text-center py-12">Loading unit tags...</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-wider" style={{ fontFamily: 'Rajdhani, sans-serif' }} data-testid="unit-tags-title">
              UNIT CONFIGURATION
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage ranks, units, billets, and other organizational tags. Custom tags extend the defaults.
            </p>
          </div>
          <Button onClick={handleSave} disabled={saving} className="bg-amber-700 hover:bg-amber-800" data-testid="save-tags-btn">
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>

        {/* Message */}
        {message.text && (
          <Alert className={message.type === 'success' ? 'bg-green-900/20 border-green-700' : 'bg-amber-900/20 border-red-700'}>
            {message.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        {/* Info box */}
        <div className="bg-tropic-gold/10 border border-tropic-gold/30 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-tropic-gold mb-1">How Unit Tags Work</h3>
          <ul className="text-xs text-gray-400 space-y-1 list-disc list-inside">
            <li>Default tags (gray) are built-in and cannot be removed</li>
            <li>Custom tags (amber) that you add can be removed anytime</li>
            <li>These options appear in dropdown menus when editing member profiles</li>
            <li>Members can also type custom values directly — these lists just provide quick options</li>
          </ul>
        </div>

        {/* Tag Category Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {TAG_CATEGORIES.map(category => (
            <TagCategoryCard
              key={category.key}
              category={category}
              tags={tags?.[category.key] || []}
              customTags={customTags[category.key]}
              onAddTag={handleAddTag}
              onRemoveCustomTag={handleRemoveCustomTag}
            />
          ))}
        </div>
      </div>
    </AdminLayout>
  );
};

export default UnitTagsManager;

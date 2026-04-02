import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Layers, Plus, Edit, Trash2, Package, Copy, RefreshCw } from 'lucide-react';
import { API } from '@/utils/api';

const ModPresets = () => {
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', scenario_id: '', mods: '[]' });

  const fetchPresets = useCallback(async () => {
    try {
      setError('');
      const res = await axios.get(`${API}/servers/presets`);
      setPresets(res.data);
    } catch (err) {
      setError('Failed to load presets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPresets(); }, [fetchPresets]);

  const openCreate = () => {
    setEditingPreset(null);
    setForm({ name: '', description: '', scenario_id: '', mods: '[]' });
    setDialogOpen(true);
  };

  const openEdit = (preset) => {
    setEditingPreset(preset);
    setForm({
      name: preset.name,
      description: preset.description || '',
      scenario_id: preset.scenario_id || '',
      mods: JSON.stringify(preset.mods || [], null, 2),
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    try {
      let mods;
      try { mods = JSON.parse(form.mods); } catch { setError('Invalid JSON in mods field'); return; }
      const payload = { name: form.name, description: form.description, scenario_id: form.scenario_id, mods };
      if (editingPreset) {
        await axios.put(`${API}/servers/presets/${editingPreset.id}`, payload);
      } else {
        await axios.post(`${API}/servers/presets`, payload);
      }
      setDialogOpen(false);
      fetchPresets();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save preset');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this preset?')) return;
    try {
      await axios.delete(`${API}/servers/presets/${id}`);
      fetchPresets();
    } catch (err) {
      setError('Failed to delete preset');
    }
  };

  const handleDuplicate = async (preset) => {
    try {
      await axios.post(`${API}/servers/presets`, {
        name: `${preset.name} (Copy)`,
        description: preset.description,
        scenario_id: preset.scenario_id,
        mods: preset.mods,
      });
      fetchPresets();
    } catch (err) {
      setError('Failed to duplicate preset');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-[0.15em] text-tropic-gold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
            MOD PRESETS
          </h1>
          <p className="text-sm text-gray-500 mt-1">Saved mod configurations for quick server setup</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchPresets} variant="outline" size="sm" className="border-gray-700 text-gray-400 hover:text-white">
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          <Button onClick={openCreate} size="sm" className="bg-tropic-gold text-black hover:bg-tropic-gold/80">
            <Plus className="w-4 h-4 mr-1" /> New Preset
          </Button>
        </div>
      </div>

      {error && <div className="bg-red-900/30 border border-red-700/50 text-red-300 px-4 py-2 rounded text-sm">{error}</div>}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-48 bg-gray-900/50 rounded-lg animate-pulse" />)}
        </div>
      ) : presets.length === 0 ? (
        <Card className="bg-gray-900/50 border-gray-800">
          <CardContent className="flex flex-col items-center justify-center py-16 text-gray-500">
            <Layers className="w-12 h-12 mb-4 opacity-30" />
            <p className="text-lg font-medium">No presets yet</p>
            <p className="text-sm mt-1">Create a mod preset to quickly configure servers</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {presets.map(preset => (
            <Card key={preset.id} className="bg-gray-900/50 border-gray-800 hover:border-tropic-gold/30 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base text-white">{preset.name}</CardTitle>
                  <Badge variant="outline" className="text-tropic-gold border-tropic-gold/30 text-xs">
                    <Package className="w-3 h-3 mr-1" />
                    {(preset.mods || []).length} mods
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {preset.description && <p className="text-sm text-gray-400 line-clamp-2">{preset.description}</p>}
                {preset.scenario_id && (
                  <p className="text-xs text-gray-500 font-mono truncate">Scenario: {preset.scenario_id}</p>
                )}
                <div className="flex gap-2 pt-2">
                  <Button onClick={() => openEdit(preset)} variant="outline" size="sm" className="border-gray-700 text-gray-400 hover:text-white flex-1">
                    <Edit className="w-3 h-3 mr-1" /> Edit
                  </Button>
                  <Button onClick={() => handleDuplicate(preset)} variant="outline" size="sm" className="border-gray-700 text-gray-400 hover:text-white">
                    <Copy className="w-3 h-3" />
                  </Button>
                  <Button onClick={() => handleDelete(preset.id)} variant="outline" size="sm" className="border-red-800/50 text-red-400 hover:text-red-300 hover:bg-red-900/20">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-gray-950 border-gray-800 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-tropic-gold">{editingPreset ? 'Edit Preset' : 'Create Preset'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Name *</label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="bg-gray-900 border-gray-700 text-white" placeholder="e.g., Standard Ops" />
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Description</label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="bg-gray-900 border-gray-700 text-white" rows={2} />
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Scenario ID</label>
              <Input value={form.scenario_id} onChange={e => setForm(f => ({ ...f, scenario_id: e.target.value }))} className="bg-gray-900 border-gray-700 text-white font-mono text-sm" />
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Mods (JSON array)</label>
              <Textarea value={form.mods} onChange={e => setForm(f => ({ ...f, mods: e.target.value }))} className="bg-gray-900 border-gray-700 text-white font-mono text-sm" rows={6} placeholder='[{"modId":"...","name":"...","version":"..."}]' />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-gray-700 text-gray-400">Cancel</Button>
              <Button onClick={handleSubmit} disabled={!form.name} className="bg-tropic-gold text-black hover:bg-tropic-gold/80">
                {editingPreset ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ModPresets;

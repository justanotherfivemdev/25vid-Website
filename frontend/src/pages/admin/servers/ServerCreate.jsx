import React, { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Server, Plus, X, Save } from 'lucide-react';
import { API } from '@/utils/api';

const DEFAULT_CONFIG = {
  a2s: { address: '0.0.0.0', port: 17777 },
  rcon: { address: '0.0.0.0', port: 19999, password: '', permission: '' },
  game: {
    name: '',
    password: '',
    passwordAdmin: '',
    admins: [],
    scenarioId: '{ECC61978EDCC2B5A}Missions/23_Campaign.conf',
    maxPlayers: 32,
    visible: true,
    supportedPlatforms: ['PLATFORM_PC'],
    gameProperties: {
      serverMaxViewDistance: 1600,
      serverMinGrassDistance: 50,
      networkViewDistance: 1500,
      disableThirdPerson: false,
      fastValidation: true,
      battleEye: true,
    },
  },
  mods: [],
};

function ServerCreate() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    description: '',
    docker_image: 'rouhim/arma-reforger-server',
    game_port: 2001,
    query_port: 17777,
    rcon_port: 19999,
    tags: [],
    auto_restart: false,
    max_restart_attempts: 3,
  });

  const [tagInput, setTagInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  // Build live config preview with the current server name
  const configPreview = useMemo(() => {
    const cfg = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    cfg.game.name = form.name || '';
    cfg.a2s.port = Number(form.query_port) || 17777;
    cfg.rcon.port = Number(form.rcon_port) || 19999;
    return JSON.stringify(cfg, null, 2);
  }, [form.name, form.query_port, form.rcon_port]);

  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (tag && !form.tags.includes(tag)) {
      updateField('tags', [...form.tags, tag]);
    }
    setTagInput('');
  };

  const handleRemoveTag = (tagToRemove) => {
    updateField(
      'tags',
      form.tags.filter((t) => t !== tagToRemove),
    );
  };

  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const validate = () => {
    const errors = {};
    if (!form.name.trim()) errors.name = 'Server name is required.';
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        docker_image: form.docker_image.trim(),
        game_port: Number(form.game_port),
        query_port: Number(form.query_port),
        rcon_port: Number(form.rcon_port),
        tags: form.tags,
        auto_restart: form.auto_restart,
        max_restart_attempts: Number(form.max_restart_attempts),
      };

      const res = await axios.post(`${API}/servers`, payload);
      const newId = res.data?.id || res.data?.server_id || res.data?._id;
      navigate(newId ? `/admin/servers/${newId}` : '/admin/servers');
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Failed to create server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/admin/servers">
          <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </Link>
        <div>
          <h1
            className="text-3xl font-bold tracking-wider text-tropic-gold"
            style={{ fontFamily: 'Rajdhani, sans-serif' }}
          >
            CREATE SERVER
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Deploy a new Arma Reforger game server instance.
          </p>
        </div>
      </div>

      {/* Global error */}
      {error && (
        <div className="bg-red-900/20 border border-red-700/60 rounded-lg p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg tracking-wider flex items-center gap-2 text-tropic-gold">
              <Server className="w-5 h-5" /> SERVER DETAILS
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Server Name */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Server Name <span className="text-red-400">*</span>
              </Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="e.g. 25VID Main Server"
                className={`bg-black border-gray-700 ${fieldErrors.name ? 'border-red-500' : ''}`}
              />
              {fieldErrors.name && (
                <p className="text-xs text-red-400">{fieldErrors.name}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="Brief description of this server instance..."
                className="bg-black border-gray-700 min-h-[80px]"
              />
            </div>

            {/* Docker Image */}
            <div className="space-y-2">
              <Label htmlFor="docker_image">Docker Image</Label>
              <Input
                id="docker_image"
                value={form.docker_image}
                onChange={(e) => updateField('docker_image', e.target.value)}
                className="bg-black border-gray-700 font-mono text-sm"
              />
            </div>
          </CardContent>
        </Card>

        {/* Network Ports */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg tracking-wider text-tropic-gold">
              NETWORK CONFIGURATION
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="game_port">Game Port</Label>
                <Input
                  id="game_port"
                  type="number"
                  value={form.game_port}
                  onChange={(e) => updateField('game_port', e.target.value)}
                  className="bg-black border-gray-700"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="query_port">Query Port</Label>
                <Input
                  id="query_port"
                  type="number"
                  value={form.query_port}
                  onChange={(e) => updateField('query_port', e.target.value)}
                  className="bg-black border-gray-700"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rcon_port">RCON Port</Label>
                <Input
                  id="rcon_port"
                  type="number"
                  value={form.rcon_port}
                  onChange={(e) => updateField('rcon_port', e.target.value)}
                  className="bg-black border-gray-700"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tags */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg tracking-wider text-tropic-gold">
              TAGS
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="Type a tag and press Enter..."
                className="bg-black border-gray-700 flex-1"
              />
              <Button
                type="button"
                onClick={handleAddTag}
                disabled={!tagInput.trim()}
                className="bg-tropic-gold hover:bg-tropic-gold-dark text-black"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="bg-tropic-gold/20 border-tropic-gold/40 text-tropic-gold px-2 py-1 text-xs flex items-center gap-1"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:text-red-400 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Restart Policy */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg tracking-wider text-tropic-gold">
              RESTART POLICY
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={form.auto_restart}
                onClick={() => updateField('auto_restart', !form.auto_restart)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  form.auto_restart ? 'bg-tropic-gold' : 'bg-gray-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transition-transform ${
                    form.auto_restart ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
              <Label>Auto Restart on Crash</Label>
            </div>

            {form.auto_restart && (
              <div className="space-y-2 max-w-xs">
                <Label htmlFor="max_restart_attempts">Max Restart Attempts</Label>
                <Input
                  id="max_restart_attempts"
                  type="number"
                  min={1}
                  max={10}
                  value={form.max_restart_attempts}
                  onChange={(e) => updateField('max_restart_attempts', e.target.value)}
                  className="bg-black border-gray-700"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Config Preview */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg tracking-wider text-tropic-gold">
              DEFAULT CONFIG TEMPLATE
            </CardTitle>
            <p className="text-xs text-gray-500">
              This default Arma Reforger server configuration will be applied. The server
              name auto-populates from the field above.
            </p>
          </CardHeader>
          <CardContent>
            <pre className="bg-black border border-gray-800 rounded-lg p-4 text-xs text-gray-300 font-mono overflow-x-auto max-h-96 overflow-y-auto">
              {configPreview}
            </pre>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link to="/admin/servers">
            <Button type="button" variant="outline" className="border-gray-700 text-gray-300">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={submitting}
            className="bg-tropic-gold hover:bg-tropic-gold-dark text-black"
          >
            <Save className="w-4 h-4 mr-2" />
            {submitting ? 'Creating...' : 'Create Server'}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default ServerCreate;

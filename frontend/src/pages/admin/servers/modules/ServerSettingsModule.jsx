import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertTriangle,
  Code,
  Eye,
  History,
  Loader2,
  RotateCcw,
  Save,
} from 'lucide-react';
import { API } from '@/utils/api';

function cloneConfig(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function setDeepValue(root, path, nextValue) {
  const copy = cloneConfig(root);
  const parts = path.split('.');
  let cursor = copy;

  parts.forEach((part, index) => {
    if (index === parts.length - 1) {
      cursor[part] = nextValue;
      return;
    }

    if (!cursor[part] || typeof cursor[part] !== 'object' || Array.isArray(cursor[part])) {
      cursor[part] = {};
    }
    cursor = cursor[part];
  });

  return copy;
}

function ensureConfigShape(config) {
  const next = cloneConfig(config);
  next.game = next.game || {};
  next.game.gameProperties = next.game.gameProperties || {};
  next.rcon = next.rcon || {};
  next.a2s = next.a2s || {};
  next.operating = next.operating || {};
  return next;
}

function ConfigField({ label, value, onChange, type = 'text', mono = false, readOnly = false }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label className="shrink-0 text-xs text-gray-500">{label}</label>
      <Input
        type={type}
        value={value ?? ''}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        className={`h-8 w-52 border-zinc-800 bg-black/60 text-right text-xs text-white ${mono ? 'font-mono' : ''} ${readOnly ? 'cursor-default text-gray-400' : ''}`}
      />
    </div>
  );
}

function ConfigToggle({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label className="text-xs text-gray-500">{label}</label>
      <Switch checked={!!checked} onCheckedChange={onChange} className="h-4 w-7" />
    </div>
  );
}

function ServerSettingsModule() {
  const { server, serverId, fetchServer } = useOutletContext();
  const [config, setConfig] = useState(null);
  const [configHistory, setConfigHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [createBackup, setCreateBackup] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      axios.get(`${API}/servers/${serverId}/config`),
      axios.get(`${API}/servers/${serverId}/config/history`),
    ]).then(([cfgRes, histRes]) => {
      if (cfgRes.status === 'fulfilled') {
        const nextConfig = ensureConfigShape(cfgRes.value.data?.config || cfgRes.value.data || server?.config || {});
        setConfig(nextConfig);
        setJsonText(JSON.stringify(nextConfig, null, 2));
      }

      if (histRes.status === 'fulfilled') {
        setConfigHistory(histRes.value.data?.history || histRes.value.data || []);
      }
    }).finally(() => setLoading(false));
  }, [serverId, server?.config]);

  const updateField = useCallback((path, value) => {
    setConfig((prev) => ensureConfigShape(setDeepValue(prev, path, value)));
    setDirty(true);
    setSaveError(null);
  }, []);

  const updateNumber = useCallback((path, value, fallback = 0) => {
    const numeric = Number.parseInt(value, 10);
    updateField(path, Number.isNaN(numeric) ? fallback : numeric);
  }, [updateField]);

  const handleJsonSave = useCallback(() => {
    try {
      const parsed = ensureConfigShape(JSON.parse(jsonText));
      setConfig(parsed);
      setDirty(true);
      setJsonError(null);
      setJsonMode(false);
    } catch (err) {
      setJsonError(err.message);
    }
  }, [jsonText]);

  const saveConfig = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      if (createBackup) {
        await axios.post(`${API}/servers/${serverId}/backups`).catch(() => {});
      }
      await axios.put(`${API}/servers/${serverId}`, { config });
      setDirty(false);
      await fetchServer(true);
    } catch (err) {
      setSaveError(err.response?.data?.detail || 'Failed to save server configuration.');
    } finally {
      setSaving(false);
    }
  }, [config, createBackup, fetchServer, serverId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-tropic-gold" />
      </div>
    );
  }

  const safeConfig = ensureConfigShape(config || {});
  const game = safeConfig.game;
  const gameProps = game.gameProperties;
  const rcon = safeConfig.rcon;
  const a2s = safeConfig.a2s;
  const operating = safeConfig.operating;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-wider text-gray-300" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
          SERVER SETTINGS
        </h2>
        <div className="flex items-center gap-2">
          {dirty && <Badge variant="outline" className="border-amber-600/30 text-xs text-amber-400">Unsaved</Badge>}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setHistoryOpen(true)}
            className="h-7 border-zinc-800 text-xs text-gray-400"
          >
            <History className="mr-1 h-3 w-3" /> History ({configHistory.length})
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setJsonMode((prev) => !prev);
              setJsonText(JSON.stringify(safeConfig, null, 2));
              setJsonError(null);
            }}
            className="h-7 border-zinc-800 text-xs text-gray-400"
          >
            <Code className="mr-1 h-3 w-3" /> {jsonMode ? 'Form View' : 'Raw JSON'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDiffOpen(true)}
            disabled={!dirty}
            className="h-7 border-zinc-800 text-xs text-gray-400"
          >
            <Eye className="mr-1 h-3 w-3" /> Preview
          </Button>
          <Button
            size="sm"
            onClick={saveConfig}
            disabled={!dirty || saving}
            className="h-7 bg-tropic-gold text-xs text-black hover:bg-tropic-gold-light"
          >
            {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
            Save
          </Button>
        </div>
      </div>

      <div className="rounded border border-amber-600/30 bg-amber-600/5 px-3 py-2 text-xs text-amber-400">
        Gameplay settings, RCON credentials, and operating options are editable here. Docker mounts, host paths, and assigned ports stay backend-managed and appear in Infrastructure and Troubleshooting.
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Switch checked={createBackup} onCheckedChange={setCreateBackup} className="h-4 w-7" />
        Create rollback point before saving
      </div>

      {saveError && (
        <div className="rounded border border-red-600/30 bg-red-600/10 px-3 py-2 text-xs text-red-400">
          {saveError}
        </div>
      )}

      {jsonMode ? (
        <Card className="border-zinc-800 bg-black/60">
          <CardContent className="p-4">
            <Textarea
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value);
                setJsonError(null);
              }}
              className="min-h-[60vh] border-zinc-800 bg-black/80 font-mono text-xs text-green-400 placeholder:text-gray-600"
            />
            {jsonError && (
              <div className="mt-2 text-xs text-red-400">
                <AlertTriangle className="mr-1 inline h-3 w-3" /> {jsonError}
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={handleJsonSave} className="bg-tropic-gold text-xs text-black hover:bg-tropic-gold-light">
                Apply JSON
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-zinc-800 bg-black/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold tracking-wider text-gray-400">GAME SETTINGS</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ConfigField label="Server Name" value={game.name || ''} onChange={(value) => updateField('game.name', value)} />
              <ConfigField label="Password" value={game.password || ''} onChange={(value) => updateField('game.password', value)} type="password" />
              <ConfigField label="Admin Password" value={game.passwordAdmin || ''} onChange={(value) => updateField('game.passwordAdmin', value)} type="password" />
              <ConfigField label="Scenario ID" value={game.scenarioId || ''} onChange={(value) => updateField('game.scenarioId', value)} mono />
              <ConfigField label="Max Players" value={game.maxPlayers ?? 64} onChange={(value) => updateNumber('game.maxPlayers', value, 64)} type="number" />
              <ConfigToggle label="Visible" checked={game.visible !== false} onChange={(value) => updateField('game.visible', value)} />
              <ConfigToggle label="Cross Platform" checked={game.crossPlatform !== false} onChange={(value) => updateField('game.crossPlatform', value)} />
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-black/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold tracking-wider text-gray-400">GAME PROPERTIES</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ConfigField label="Max View Distance" value={gameProps.serverMaxViewDistance ?? 2500} onChange={(value) => updateNumber('game.gameProperties.serverMaxViewDistance', value, 2500)} type="number" />
              <ConfigField label="Min Grass Distance" value={gameProps.serverMinGrassDistance ?? 50} onChange={(value) => updateNumber('game.gameProperties.serverMinGrassDistance', value, 50)} type="number" />
              <ConfigField label="Network View Distance" value={gameProps.networkViewDistance ?? 1000} onChange={(value) => updateNumber('game.gameProperties.networkViewDistance', value, 1000)} type="number" />
              <ConfigToggle label="Disable Third Person" checked={!!gameProps.disableThirdPerson} onChange={(value) => updateField('game.gameProperties.disableThirdPerson', value)} />
              <ConfigToggle label="Fast Validation" checked={gameProps.fastValidation !== false} onChange={(value) => updateField('game.gameProperties.fastValidation', value)} />
              <ConfigToggle label="BattlEye" checked={gameProps.battlEye !== false} onChange={(value) => updateField('game.gameProperties.battlEye', value)} />
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-black/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold tracking-wider text-gray-400">RCON</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ConfigField label="Password" value={rcon.password || ''} onChange={(value) => updateField('rcon.password', value)} type="password" />
              <ConfigField label="Permission" value={rcon.permission || 'admin'} onChange={(value) => updateField('rcon.permission', value)} />
              <ConfigField label="Max Clients" value={rcon.maxClients ?? 16} onChange={(value) => updateNumber('rcon.maxClients', value, 16)} type="number" />
              <ConfigField label="Assigned RCON Port" value={rcon.port ?? ''} onChange={() => {}} type="number" readOnly />
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-black/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold tracking-wider text-gray-400">OPERATING</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ConfigToggle label="Lobby Player Sync" checked={operating.lobbyPlayerSynchronise !== false} onChange={(value) => updateField('operating.lobbyPlayerSynchronise', value)} />
              <ConfigToggle label="Disable Navmesh Streaming" checked={Array.isArray(operating.disableNavmeshStreaming)} onChange={(value) => updateField('operating.disableNavmeshStreaming', value ? [] : undefined)} />
              <ConfigToggle label="Disable Server Shutdown" checked={!!operating.disableServerShutdown} onChange={(value) => updateField('operating.disableServerShutdown', value)} />
              <ConfigToggle label="Disable AI" checked={!!operating.disableAI} onChange={(value) => updateField('operating.disableAI', value)} />
              <ConfigField label="Player Save Time" value={operating.playerSaveTime ?? 120} onChange={(value) => updateNumber('operating.playerSaveTime', value, 120)} type="number" />
              <ConfigField label="AI Limit" value={operating.aiLimit ?? -1} onChange={(value) => updateNumber('operating.aiLimit', value, -1)} type="number" />
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-black/60 lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold tracking-wider text-gray-400">BACKEND-MANAGED NETWORK BINDINGS</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 lg:grid-cols-2">
              <ConfigField label="Bind Address" value={safeConfig.bindAddress || '0.0.0.0'} onChange={() => {}} mono readOnly />
              <ConfigField label="Game Port" value={safeConfig.bindPort ?? ''} onChange={() => {}} type="number" readOnly />
              <ConfigField label="Public Address" value={safeConfig.publicAddress || safeConfig.bindAddress || '0.0.0.0'} onChange={() => {}} mono readOnly />
              <ConfigField label="Public Port" value={safeConfig.publicPort ?? ''} onChange={() => {}} type="number" readOnly />
              <ConfigField label="A2S Port" value={a2s.port ?? ''} onChange={() => {}} type="number" readOnly />
              <ConfigField label="Protocol" value={safeConfig.protocol || 'UDP'} onChange={() => {}} mono readOnly />
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={diffOpen} onOpenChange={setDiffOpen}>
        <DialogContent className="max-w-2xl border-zinc-800 bg-zinc-950 text-white">
          <DialogHeader>
            <DialogTitle className="text-tropic-gold">Configuration Preview</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            <pre className="whitespace-pre-wrap rounded bg-black/80 p-4 font-mono text-xs text-green-400">
              {JSON.stringify(safeConfig, null, 2)}
            </pre>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDiffOpen(false)} className="border-zinc-700 text-gray-400">
              Close
            </Button>
            <Button size="sm" onClick={() => { saveConfig(); setDiffOpen(false); }} className="bg-tropic-gold text-black hover:bg-tropic-gold-light">
              <Save className="mr-1 h-3 w-3" /> Save Configuration
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-xl border-zinc-800 bg-zinc-950 text-white">
          <DialogHeader>
            <DialogTitle className="text-tropic-gold">Configuration History</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-auto">
            {configHistory.length === 0 ? (
              <p className="text-xs text-gray-500">No configuration changes recorded.</p>
            ) : (
              configHistory.map((entry, index) => (
                <div key={index} className="rounded border border-zinc-800 bg-black/60 p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-300">Version {configHistory.length - index}</span>
                    <span className="text-gray-600">{entry.changed_at ? new Date(entry.changed_at).toLocaleString() : ''}</span>
                  </div>
                  {entry.changed_by && <div className="mt-1 text-[10px] text-gray-500">by {entry.changed_by}</div>}
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 h-6 border-zinc-800 text-[10px] text-gray-400"
                    onClick={() => {
                      if (entry.config) {
                        const restored = ensureConfigShape(entry.config);
                        setConfig(restored);
                        setJsonText(JSON.stringify(restored, null, 2));
                        setDirty(true);
                        setHistoryOpen(false);
                      }
                    }}
                  >
                    <RotateCcw className="mr-1 h-3 w-3" /> Restore
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ServerSettingsModule;

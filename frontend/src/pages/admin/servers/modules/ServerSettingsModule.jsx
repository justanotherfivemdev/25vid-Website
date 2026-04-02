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
  Save,
  History,
  Code,
  AlertTriangle,
  Loader2,
  RotateCcw,
  Eye,
} from 'lucide-react';
import { API } from '@/utils/api';

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
  const [diffOpen, setDiffOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [createBackup, setCreateBackup] = useState(true);

  // Load config
  useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      axios.get(`${API}/servers/${serverId}/config`),
      axios.get(`${API}/servers/${serverId}/config/history`),
    ]).then(([cfgRes, histRes]) => {
      if (cfgRes.status === 'fulfilled') {
        const cfg = cfgRes.value.data?.config || cfgRes.value.data || server?.config || {};
        setConfig(cfg);
        setJsonText(JSON.stringify(cfg, null, 2));
      }
      if (histRes.status === 'fulfilled') {
        setConfigHistory(histRes.value.data?.history || histRes.value.data || []);
      }
    }).finally(() => setLoading(false));
  }, [serverId, server?.config]);

  const updateField = useCallback((path, value) => {
    setConfig(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      // Use a safe flat setter rather than dynamic path traversal
      const parts = path.split('.');
      // Reject dangerous keys
      if (parts.some(k => k === '__proto__' || k === 'constructor' || k === 'prototype')) return prev;
      // Only handle known depth levels (max 3) to avoid generic recursion
      if (parts.length === 1) {
        copy[parts[0]] = value;
      } else if (parts.length === 2) {
        if (!copy[parts[0]] || typeof copy[parts[0]] !== 'object') copy[parts[0]] = {};
        copy[parts[0]][parts[1]] = value;
      } else if (parts.length === 3) {
        if (!copy[parts[0]] || typeof copy[parts[0]] !== 'object') copy[parts[0]] = {};
        if (!copy[parts[0]][parts[1]] || typeof copy[parts[0]][parts[1]] !== 'object') copy[parts[0]][parts[1]] = {};
        copy[parts[0]][parts[1]][parts[2]] = value;
      }
      return copy;
    });
    setDirty(true);
  }, []);

  const handleJsonSave = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonText);
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
    try {
      if (createBackup) {
        await axios.post(`${API}/servers/${serverId}/backups`).catch(() => {});
      }
      await axios.put(`${API}/servers/${serverId}`, { config });
      setDirty(false);
      await fetchServer(true);
    } catch {
      // Error handling
    } finally {
      setSaving(false);
    }
  }, [config, serverId, fetchServer, createBackup]);

  // Config field helpers
  const game = config?.game || {};
  const gameProps = game.gameProperties || {};
  const rcon = config?.rcon || {};
  const a2s = config?.a2s || {};
  const operating = config?.operating || {};

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-tropic-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-wider text-gray-300" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
          SERVER SETTINGS
        </h2>
        <div className="flex items-center gap-2">
          {dirty && <Badge variant="outline" className="border-amber-600/30 text-amber-400 text-xs">Unsaved</Badge>}
          <Button size="sm" variant="outline" onClick={() => setHistoryOpen(true)}
            className="h-7 border-zinc-800 text-xs text-gray-400">
            <History className="mr-1 h-3 w-3" /> History ({configHistory.length})
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setJsonMode(!jsonMode); setJsonText(JSON.stringify(config, null, 2)); }}
            className="h-7 border-zinc-800 text-xs text-gray-400">
            <Code className="mr-1 h-3 w-3" /> {jsonMode ? 'Form View' : 'JSON Editor'}
          </Button>
          <Button size="sm" onClick={() => setDiffOpen(true)} disabled={!dirty}
            className="h-7 border-zinc-800 text-xs text-gray-400" variant="outline">
            <Eye className="mr-1 h-3 w-3" /> Preview
          </Button>
          <Button size="sm" onClick={saveConfig} disabled={!dirty || saving}
            className="h-7 bg-tropic-gold text-black hover:bg-tropic-gold-light text-xs">
            {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
            Save
          </Button>
        </div>
      </div>

      {/* Backup toggle */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Switch checked={createBackup} onCheckedChange={setCreateBackup} className="h-4 w-7" />
        Create rollback point before saving
      </div>

      {jsonMode ? (
        /* JSON Editor */
        <Card className="border-zinc-800 bg-black/60">
          <CardContent className="p-4">
            <Textarea
              value={jsonText}
              onChange={(e) => { setJsonText(e.target.value); setJsonError(null); }}
              className="min-h-[60vh] border-zinc-800 bg-black/80 font-mono text-xs text-green-400 placeholder:text-gray-600"
            />
            {jsonError && (
              <div className="mt-2 text-xs text-red-400">
                <AlertTriangle className="mr-1 inline h-3 w-3" /> {jsonError}
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={handleJsonSave} className="bg-tropic-gold text-black hover:bg-tropic-gold-light text-xs">
                Apply JSON
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Form-based editor */
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Game Settings */}
          <Card className="border-zinc-800 bg-black/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold tracking-wider text-gray-400">GAME SETTINGS</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ConfigField label="Server Name" value={game.name || ''} onChange={(v) => updateField('game.name', v)} />
              <ConfigField label="Password" value={game.password || ''} onChange={(v) => updateField('game.password', v)} type="password" />
              <ConfigField label="Admin Password" value={game.passwordAdmin || ''} onChange={(v) => updateField('game.passwordAdmin', v)} type="password" />
              <ConfigField label="Scenario ID" value={game.scenarioId || ''} onChange={(v) => updateField('game.scenarioId', v)} mono />
              <ConfigField label="Player Limit" value={game.playerCountLimit || 64} onChange={(v) => updateField('game.playerCountLimit', parseInt(v) || 64)} type="number" />
              <ConfigToggle label="Visible" checked={game.visible !== false} onChange={(v) => updateField('game.visible', v)} />
              <ConfigToggle label="Cross Platform" checked={game.crossPlatform !== false} onChange={(v) => updateField('game.crossPlatform', v)} />
            </CardContent>
          </Card>

          {/* Game Properties */}
          <Card className="border-zinc-800 bg-black/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold tracking-wider text-gray-400">GAME PROPERTIES</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ConfigField label="Max View Distance" value={gameProps.serverMaxViewDistance || 2500} onChange={(v) => updateField('game.gameProperties.serverMaxViewDistance', parseInt(v))} type="number" />
              <ConfigField label="Min Grass Distance" value={gameProps.serverMinGrassDistance || 50} onChange={(v) => updateField('game.gameProperties.serverMinGrassDistance', parseInt(v))} type="number" />
              <ConfigField label="Network View Distance" value={gameProps.networkViewDistance || 1000} onChange={(v) => updateField('game.gameProperties.networkViewDistance', parseInt(v))} type="number" />
              <ConfigToggle label="Disable Third Person" checked={!!gameProps.disableThirdPerson} onChange={(v) => updateField('game.gameProperties.disableThirdPerson', v)} />
              <ConfigToggle label="Fast Validation" checked={gameProps.fastValidation !== false} onChange={(v) => updateField('game.gameProperties.fastValidation', v)} />
              <ConfigToggle label="BattlEye" checked={gameProps.battlEye !== false} onChange={(v) => updateField('game.gameProperties.battlEye', v)} />
            </CardContent>
          </Card>

          {/* Network */}
          <Card className="border-zinc-800 bg-black/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold tracking-wider text-gray-400">NETWORK</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ConfigField label="Bind Address" value={config?.gameHostBindAddress || '0.0.0.0'} onChange={(v) => updateField('gameHostBindAddress', v)} mono />
              <ConfigField label="Game Port" value={config?.gameHostBindPort || 2001} onChange={(v) => updateField('gameHostBindPort', parseInt(v))} type="number" />
              <ConfigField label="Query Port" value={a2s.port || 17777} onChange={(v) => updateField('a2s.port', parseInt(v))} type="number" />
              <ConfigField label="RCON Port" value={rcon.port || 19999} onChange={(v) => updateField('rcon.port', parseInt(v))} type="number" />
              <ConfigField label="RCON Password" value={rcon.password || ''} onChange={(v) => updateField('rcon.password', v)} type="password" />
              <ConfigField label="RCON Max Clients" value={rcon.maxClients || 16} onChange={(v) => updateField('rcon.maxClients', parseInt(v))} type="number" />
            </CardContent>
          </Card>

          {/* Operating */}
          <Card className="border-zinc-800 bg-black/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold tracking-wider text-gray-400">OPERATING</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ConfigToggle label="Lobby Player Sync" checked={operating.lobbyPlayerSynchronise !== false} onChange={(v) => updateField('operating.lobbyPlayerSynchronise', v)} />
              <ConfigToggle label="Disable Navmesh Streaming" checked={!!operating.disableNavmeshStreaming} onChange={(v) => updateField('operating.disableNavmeshStreaming', v)} />
              <ConfigToggle label="Disable Server Shutdown" checked={!!operating.disableServerShutdown} onChange={(v) => updateField('operating.disableServerShutdown', v)} />
              <ConfigToggle label="Disable AI" checked={!!operating.disableAI} onChange={(v) => updateField('operating.disableAI', v)} />
              <ConfigField label="Player Save Time" value={operating.playerSaveTime || 120} onChange={(v) => updateField('operating.playerSaveTime', parseInt(v))} type="number" />
              <ConfigField label="AI Limit" value={operating.aiLimit ?? -1} onChange={(v) => updateField('operating.aiLimit', parseInt(v))} type="number" />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Diff Preview Dialog */}
      <Dialog open={diffOpen} onOpenChange={setDiffOpen}>
        <DialogContent className="max-w-2xl border-zinc-800 bg-zinc-950 text-white">
          <DialogHeader>
            <DialogTitle className="text-tropic-gold">Configuration Diff</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            <pre className="text-xs font-mono text-green-400 bg-black/80 rounded p-4 whitespace-pre-wrap">
              {JSON.stringify(config, null, 2)}
            </pre>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDiffOpen(false)}
              className="border-zinc-700 text-gray-400">Close</Button>
            <Button size="sm" onClick={() => { saveConfig(); setDiffOpen(false); }}
              className="bg-tropic-gold text-black hover:bg-tropic-gold-light">
              <Save className="mr-1 h-3 w-3" /> Save Configuration
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-xl border-zinc-800 bg-zinc-950 text-white">
          <DialogHeader>
            <DialogTitle className="text-tropic-gold">Configuration History</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto space-y-2">
            {configHistory.length === 0 ? (
              <p className="text-xs text-gray-500">No configuration changes recorded</p>
            ) : (
              configHistory.map((entry, i) => (
                <div key={i} className="rounded border border-zinc-800 bg-black/60 p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-300">Version {configHistory.length - i}</span>
                    <span className="text-gray-600">{entry.changed_at ? new Date(entry.changed_at).toLocaleString() : ''}</span>
                  </div>
                  {entry.changed_by && <div className="text-[10px] text-gray-500 mt-1">by {entry.changed_by}</div>}
                  <Button size="sm" variant="outline" className="mt-2 h-6 border-zinc-800 text-[10px] text-gray-400"
                    onClick={() => {
                      if (entry.config) {
                        setConfig(entry.config);
                        setDirty(true);
                        setHistoryOpen(false);
                      }
                    }}>
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

function ConfigField({ label, value, onChange, type = 'text', mono }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label className="shrink-0 text-xs text-gray-500">{label}</label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(type === 'number' ? (parseInt(e.target.value) || 0) : e.target.value)}
        className={`h-7 w-48 border-zinc-800 bg-black/60 text-right text-xs text-white ${mono ? 'font-mono' : ''}`}
      />
    </div>
  );
}

function ConfigToggle({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label className="text-xs text-gray-500">{label}</label>
      <Switch checked={checked} onCheckedChange={onChange} className="h-4 w-7" />
    </div>
  );
}

export default ServerSettingsModule;

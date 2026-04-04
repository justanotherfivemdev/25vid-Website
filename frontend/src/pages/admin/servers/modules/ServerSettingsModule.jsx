import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, BookOpen, Code, Eye, History, Loader2, RotateCcw, Save, Search, Wrench } from 'lucide-react';
import { API } from '@/utils/api';
import { SERVER_CONFIG_REFERENCE } from '@/config/serverConfigReference';

const PLATFORM_OPTIONS = ['PLATFORM_PC', 'PLATFORM_XBL', 'PLATFORM_PSN'];

function cloneConfig(value) { return JSON.parse(JSON.stringify(value || {})); }

function setDeepValue(root, path, nextValue) {
  const copy = cloneConfig(root);
  const parts = path.split('.');
  let cursor = copy;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) cursor[part] = nextValue;
    else {
      if (!cursor[part] || typeof cursor[part] !== 'object' || Array.isArray(cursor[part])) cursor[part] = {};
      cursor = cursor[part];
    }
  });
  return copy;
}

function unsetDeepValue(root, path) {
  const copy = cloneConfig(root);
  const parts = path.split('.');
  let cursor = copy;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (!cursor[part] || typeof cursor[part] !== 'object' || Array.isArray(cursor[part])) return copy;
    cursor = cursor[part];
  }
  delete cursor[parts[parts.length - 1]];
  return copy;
}

function ensureConfigShape(config) {
  const next = cloneConfig(config);
  next.game = next.game || {};
  next.game.gameProperties = next.game.gameProperties || {};
  next.game.persistence = next.game.persistence || {};
  next.rcon = next.rcon || {};
  next.a2s = next.a2s || {};
  next.operating = next.operating || {};
  return next;
}

function parseListInput(value) { return String(value || '').split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean); }
function formatListInput(values) { return Array.isArray(values) ? values.join('\n') : ''; }
function safeStringify(value) { return JSON.stringify(value || {}, null, 2); }
function normalizeRuntime(server) { return { log_stats_enabled: server?.log_stats_enabled !== false, max_fps: server?.max_fps ?? 120 }; }

function FieldShell({ label, help, children }) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</label>
      {children}
      {help ? <p className="text-[11px] text-gray-600">{help}</p> : null}
    </div>
  );
}

function ReadOnlyRow({ label, value, mono = false }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded border border-zinc-800/70 bg-black/40 px-3 py-2">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-right text-sm text-gray-300 ${mono ? 'font-mono text-xs' : ''}`}>{value || 'N/A'}</span>
    </div>
  );
}

function ReferenceCard({ item }) {
  return (
    <Card className="border-zinc-800 bg-black/40">
      <CardContent className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-white">{item.label}</span>
          <Badge variant="outline" className="border-zinc-700 text-[10px] text-gray-400">{item.section}</Badge>
          <Badge variant="outline" className="border-zinc-700 text-[10px] text-gray-500">{item.type}</Badge>
        </div>
        <div className="font-mono text-xs text-tropic-gold-dark">{item.path}</div>
        <p className="text-sm text-gray-300">{item.description}</p>
        <div className="text-xs text-gray-500">Default: {item.defaultValue}</div>
        {item.notes ? <p className="text-xs text-gray-600">{item.notes}</p> : null}
      </CardContent>
    </Card>
  );
}

function ServerSettingsModule() {
  const { server, serverId, fetchServer } = useOutletContext();
  const [config, setConfig] = useState(null);
  const [runtime, setRuntime] = useState(normalizeRuntime(server));
  const [configHistory, setConfigHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [createBackup, setCreateBackup] = useState(true);
  const [activeTab, setActiveTab] = useState('form');
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState(null);
  const [referenceQuery, setReferenceQuery] = useState('');
  const [textEditors, setTextEditors] = useState({
    startupParameters: '',
    admins: '',
    rconBlacklist: '',
    rconWhitelist: '',
    navmeshProjects: '',
    missionHeader: '{}',
    persistenceDatabases: '{}',
    persistenceStorages: '{}',
  });
  const [jsonFieldErrors, setJsonFieldErrors] = useState({
    missionHeader: null,
    persistenceDatabases: null,
    persistenceStorages: null,
  });

  const initializeEditors = useCallback((nextConfig, nextServer) => {
    const safe = ensureConfigShape(nextConfig);
    setConfig(safe);
    setRuntime(normalizeRuntime(nextServer));
    setJsonText(JSON.stringify(safe, null, 2));
    setTextEditors({
      startupParameters: formatListInput(nextServer?.startup_parameters || []),
      admins: formatListInput(safe.game?.admins || []),
      rconBlacklist: formatListInput(safe.rcon?.blacklist || []),
      rconWhitelist: formatListInput(safe.rcon?.whitelist || []),
      navmeshProjects: formatListInput(Array.isArray(safe.operating?.disableNavmeshStreaming) ? safe.operating.disableNavmeshStreaming : []),
      missionHeader: safeStringify(safe.game?.gameProperties?.missionHeader || {}),
      persistenceDatabases: safeStringify(safe.game?.persistence?.databases || {}),
      persistenceStorages: safeStringify(safe.game?.persistence?.storages || {}),
    });
    setJsonFieldErrors({ missionHeader: null, persistenceDatabases: null, persistenceStorages: null });
  }, []);

  const markDirty = useCallback(() => { setDirty(true); setSaveError(null); }, []);
  const updateField = useCallback((path, value) => { setConfig((prev) => ensureConfigShape(setDeepValue(prev, path, value))); markDirty(); }, [markDirty]);
  const clearField = useCallback((path) => { setConfig((prev) => ensureConfigShape(unsetDeepValue(prev, path))); markDirty(); }, [markDirty]);
  const updateNumber = useCallback((path, value, fallback = 0) => {
    const numeric = Number.parseInt(value, 10);
    updateField(path, Number.isNaN(numeric) ? fallback : numeric);
  }, [updateField]);
  const updateListEditor = useCallback((editorKey, path, value) => {
    setTextEditors((prev) => ({ ...prev, [editorKey]: value }));
    updateField(path, parseListInput(value));
  }, [updateField]);
  const updateJsonEditor = useCallback((editorKey, path, value, emptyValue = {}) => {
    setTextEditors((prev) => ({ ...prev, [editorKey]: value }));
    try {
      const parsed = JSON.parse(value || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        updateField(path, parsed);
        setJsonFieldErrors((prev) => ({ ...prev, [editorKey]: null }));
      } else setJsonFieldErrors((prev) => ({ ...prev, [editorKey]: 'Must be a JSON object.' }));
    } catch (error) {
      if (!value.trim()) {
        updateField(path, emptyValue);
        setJsonFieldErrors((prev) => ({ ...prev, [editorKey]: null }));
      } else setJsonFieldErrors((prev) => ({ ...prev, [editorKey]: error.message }));
    }
  }, [updateField]);

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      axios.get(`${API}/servers/${serverId}/config`),
      axios.get(`${API}/servers/${serverId}/config/history`),
    ]).then(([cfgRes, histRes]) => {
      if (cfgRes.status === 'fulfilled') {
        initializeEditors(cfgRes.value.data?.config || cfgRes.value.data || server?.config || {}, server);
      } else {
        initializeEditors(server?.config || {}, server);
      }
      if (histRes.status === 'fulfilled') setConfigHistory(histRes.value.data?.history || histRes.value.data || []);
      else setConfigHistory([]);
    }).finally(() => setLoading(false));
  }, [initializeEditors, server, serverId]);

  useEffect(() => {
    if (activeTab === 'json' && config) {
      setJsonText(JSON.stringify(ensureConfigShape(config), null, 2));
      setJsonError(null);
    }
  }, [activeTab, config]);

  const handleJsonApply = useCallback(() => {
    try {
      const parsed = ensureConfigShape(JSON.parse(jsonText));
      initializeEditors(parsed, {
        ...server,
        log_stats_enabled: runtime.log_stats_enabled,
        max_fps: runtime.max_fps,
        startup_parameters: parseListInput(textEditors.startupParameters),
      });
      markDirty();
      setJsonError(null);
    } catch (error) {
      setJsonError(error.message);
    }
  }, [initializeEditors, jsonText, markDirty, runtime.log_stats_enabled, runtime.max_fps, server, textEditors.startupParameters]);

  const handleRestoreHistory = useCallback((entry) => {
    if (!entry?.config) return;
    initializeEditors(entry.config, server);
    markDirty();
    setHistoryOpen(false);
  }, [initializeEditors, markDirty, server]);

  const saveConfig = useCallback(async () => {
    if (Object.values(jsonFieldErrors).some(Boolean)) {
      setSaveError('Resolve the JSON field errors before saving.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      if (createBackup) await axios.post(`${API}/servers/${serverId}/backups`).catch(() => {});
      await axios.put(`${API}/servers/${serverId}`, {
        config,
        log_stats_enabled: runtime.log_stats_enabled,
        max_fps: Math.max(30, parseInt(runtime.max_fps, 10) || 120),
        startup_parameters: parseListInput(textEditors.startupParameters),
      });
      setDirty(false);
      await fetchServer(true);
    } catch (error) {
      setSaveError(error.response?.data?.detail || 'Failed to save server configuration.');
    } finally {
      setSaving(false);
    }
  }, [config, createBackup, fetchServer, jsonFieldErrors, runtime.log_stats_enabled, runtime.max_fps, serverId, textEditors.startupParameters]);

  const safeConfig = ensureConfigShape(config || {});
  const game = safeConfig.game;
  const gameProps = safeConfig.game.gameProperties;
  const persistence = safeConfig.game.persistence || {};
  const rcon = safeConfig.rcon;
  const a2s = safeConfig.a2s;
  const operating = safeConfig.operating;

  const filteredReference = useMemo(() => {
    const query = referenceQuery.trim().toLowerCase();
    if (!query) return SERVER_CONFIG_REFERENCE;
    return SERVER_CONFIG_REFERENCE.filter((item) => `${item.section} ${item.label} ${item.path} ${item.description} ${item.notes || ''}`.toLowerCase().includes(query));
  }, [referenceQuery]);
  const groupedReference = useMemo(() => filteredReference.reduce((acc, item) => {
    if (!acc[item.section]) acc[item.section] = [];
    acc[item.section].push(item);
    return acc;
  }, {}), [filteredReference]);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-tropic-gold" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-wider text-gray-300" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
            SERVER SETTINGS
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Reforger runtime, JSON config, and the field reference live together here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty ? <Badge variant="outline" className="border-amber-600/30 text-xs text-amber-400">Unsaved</Badge> : null}
          <Button size="sm" variant="outline" onClick={() => setHistoryOpen(true)} className="h-7 border-zinc-800 text-xs text-gray-400">
            <History className="mr-1 h-3 w-3" /> History ({configHistory.length})
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDiffOpen(true)} className="h-7 border-zinc-800 text-xs text-gray-400">
            <Eye className="mr-1 h-3 w-3" /> Preview
          </Button>
          <Button size="sm" onClick={saveConfig} disabled={!dirty || saving} className="h-7 bg-tropic-gold text-xs text-black hover:bg-tropic-gold-light">
            {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
            Save
          </Button>
        </div>
      </div>

      <div className="rounded border border-amber-600/30 bg-amber-600/5 px-3 py-2 text-xs text-amber-400">
        New servers start with the minimum dashboard-ready config. Optional gameplay, persistence, and operating overrides stay effectively unset until you change them here. Host IPs, Docker mounts, and allocated ports remain backend-managed so users cannot break provisioning.
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Switch checked={createBackup} onCheckedChange={setCreateBackup} className="h-4 w-7" />
        Create rollback point before saving
      </div>

      {saveError ? (
        <div className="rounded border border-red-600/30 bg-red-600/10 px-3 py-2 text-xs text-red-400">
          {saveError}
        </div>
      ) : null}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 bg-black/60">
          <TabsTrigger value="form" className="text-xs"><Wrench className="mr-1 h-3 w-3" /> Form Editor</TabsTrigger>
          <TabsTrigger value="reference" className="text-xs"><BookOpen className="mr-1 h-3 w-3" /> Config Wiki</TabsTrigger>
          <TabsTrigger value="json" className="text-xs"><Code className="mr-1 h-3 w-3" /> Raw JSON</TabsTrigger>
        </TabsList>

        <TabsContent value="form" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="border-zinc-800 bg-black/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold tracking-wider text-gray-400">RCON & TELEMETRY</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FieldShell label="Enable logStats" help="Needed for FPS metrics and richer diagnostics.">
                  <div className="flex items-center justify-between rounded border border-zinc-800 bg-black/40 px-3 py-2">
                    <span className="text-sm text-gray-300">Collect engine performance stats in the log</span>
                    <Switch checked={runtime.log_stats_enabled} onCheckedChange={(value) => { setRuntime((prev) => ({ ...prev, log_stats_enabled: value })); markDirty(); }} />
                  </div>
                </FieldShell>
                <FieldShell label="Max FPS" help="Bohemia recommends limiting max FPS for public hosts.">
                  <Input type="number" min={30} max={240} value={runtime.max_fps} onChange={(e) => { setRuntime((prev) => ({ ...prev, max_fps: parseInt(e.target.value, 10) || 120 })); markDirty(); }} className="border-zinc-800 bg-black/60 text-white" />
                </FieldShell>
                <FieldShell label="Extra Startup Parameters" help="One parameter per line for advanced launch flags.">
                  <Textarea value={textEditors.startupParameters} onChange={(e) => { setTextEditors((prev) => ({ ...prev, startupParameters: e.target.value })); markDirty(); }} className="min-h-[120px] border-zinc-800 bg-black/60 font-mono text-xs text-white" placeholder="-profileVerbose" />
                </FieldShell>
              </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-black/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold tracking-wider text-gray-400">CORE SERVER</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FieldShell label="Server Name">
                  <Input value={game.name || ''} onChange={(e) => updateField('game.name', e.target.value)} className="border-zinc-800 bg-black/60 text-white" />
                </FieldShell>
                <FieldShell label="Join Password">
                  <Input type="password" value={game.password || ''} onChange={(e) => updateField('game.password', e.target.value)} className="border-zinc-800 bg-black/60 text-white" />
                </FieldShell>
                <FieldShell label="Admin Password" help="This password must not contain spaces.">
                  <Input type="password" value={game.passwordAdmin || ''} onChange={(e) => updateField('game.passwordAdmin', e.target.value)} className="border-zinc-800 bg-black/60 text-white" />
                </FieldShell>
                <FieldShell label="Scenario ID">
                  <Input value={game.scenarioId || ''} onChange={(e) => updateField('game.scenarioId', e.target.value)} className="border-zinc-800 bg-black/60 font-mono text-white" />
                </FieldShell>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FieldShell label="Max Players">
                    <Input type="number" value={game.maxPlayers ?? 32} onChange={(e) => updateNumber('game.maxPlayers', e.target.value, 32)} className="border-zinc-800 bg-black/60 text-white" />
                  </FieldShell>
                  <FieldShell label="Mods Required By Default">
                    <div className="flex items-center justify-between rounded border border-zinc-800 bg-black/40 px-3 py-2">
                      <span className="text-sm text-gray-300">Require client mods by default</span>
                      <Switch checked={game.modsRequiredByDefault !== false} onCheckedChange={(value) => updateField('game.modsRequiredByDefault', value)} />
                    </div>
                  </FieldShell>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FieldShell label="Visible">
                    <div className="flex items-center justify-between rounded border border-zinc-800 bg-black/40 px-3 py-2">
                      <span className="text-sm text-gray-300">Show in server browser</span>
                      <Switch checked={game.visible !== false} onCheckedChange={(value) => updateField('game.visible', value)} />
                    </div>
                  </FieldShell>
                  <FieldShell label="Cross Platform">
                    <div className="flex items-center justify-between rounded border border-zinc-800 bg-black/40 px-3 py-2">
                      <span className="text-sm text-gray-300">Accept all supported platforms</span>
                      <Switch checked={game.crossPlatform === true} onCheckedChange={(value) => updateField('game.crossPlatform', value)} />
                    </div>
                  </FieldShell>
                </div>
                <FieldShell label="Supported Platforms" help="Explicit PC, Xbox, and PlayStation allow-list.">
                  <div className="flex flex-wrap gap-2">
                    {PLATFORM_OPTIONS.map((platform) => {
                      const selected = (game.supportedPlatforms || []).includes(platform);
                      return (
                        <button
                          key={platform}
                          type="button"
                          onClick={() => {
                            const current = Array.isArray(game.supportedPlatforms) ? [...game.supportedPlatforms] : [];
                            const next = selected ? current.filter((value) => value !== platform) : [...current, platform];
                            updateField('game.supportedPlatforms', next);
                          }}
                          className={`rounded border px-3 py-2 text-xs ${selected ? 'border-tropic-gold/30 bg-tropic-gold/10 text-tropic-gold' : 'border-zinc-800 bg-black/40 text-gray-400'}`}
                        >
                          {platform}
                        </button>
                      );
                    })}
                  </div>
                </FieldShell>
                <FieldShell label="Listed Admins" help="One IdentityId or SteamId per line.">
                  <Textarea value={textEditors.admins} onChange={(e) => updateListEditor('admins', 'game.admins', e.target.value)} className="min-h-[110px] border-zinc-800 bg-black/60 font-mono text-xs text-white" />
                </FieldShell>
              </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-black/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold tracking-wider text-gray-400">OPTIONAL GAMEPLAY</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-gray-600">
                  These overrides are not pre-filled into new server configs. Leave them untouched to keep the deployed JSON minimal.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FieldShell label="Max View Distance">
                    <Input type="number" value={gameProps.serverMaxViewDistance ?? 2500} onChange={(e) => updateNumber('game.gameProperties.serverMaxViewDistance', e.target.value, 2500)} className="border-zinc-800 bg-black/60 text-white" />
                  </FieldShell>
                  <FieldShell label="Min Grass Distance">
                    <Input type="number" value={gameProps.serverMinGrassDistance ?? 50} onChange={(e) => updateNumber('game.gameProperties.serverMinGrassDistance', e.target.value, 50)} className="border-zinc-800 bg-black/60 text-white" />
                  </FieldShell>
                  <FieldShell label="Network View Distance">
                    <Input type="number" value={gameProps.networkViewDistance ?? 1000} onChange={(e) => updateNumber('game.gameProperties.networkViewDistance', e.target.value, 1000)} className="border-zinc-800 bg-black/60 text-white" />
                  </FieldShell>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    ['Disable Third Person', 'game.gameProperties.disableThirdPerson', !!gameProps.disableThirdPerson],
                    ['Fast Validation', 'game.gameProperties.fastValidation', gameProps.fastValidation !== false],
                    ['BattlEye', 'game.gameProperties.battlEye', gameProps.battlEye !== false],
                    ['Disable VON UI', 'game.gameProperties.VONDisableUI', !!gameProps.VONDisableUI],
                    ['Disable Direct Speech UI', 'game.gameProperties.VONDisableDirectSpeechUI', !!gameProps.VONDisableDirectSpeechUI],
                    ['Cross-Faction Radio', 'game.gameProperties.VONCanTransmitCrossFaction', !!gameProps.VONCanTransmitCrossFaction],
                  ].map(([label, path, checked]) => (
                    <FieldShell key={path} label={label}>
                      <div className="flex items-center justify-between rounded border border-zinc-800 bg-black/40 px-3 py-2">
                        <span className="text-sm text-gray-300">{label}</span>
                        <Switch checked={checked} onCheckedChange={(value) => updateField(path, value)} />
                      </div>
                    </FieldShell>
                  ))}
                </div>
                <FieldShell label="Mission Header Override" help="JSON object for scenario metadata, time, weather, and conflict-specific tuning.">
                  <Textarea value={textEditors.missionHeader} onChange={(e) => updateJsonEditor('missionHeader', 'game.gameProperties.missionHeader', e.target.value, {})} className="min-h-[180px] border-zinc-800 bg-black/60 font-mono text-xs text-white" />
                  {jsonFieldErrors.missionHeader ? <p className="text-xs text-red-400">{jsonFieldErrors.missionHeader}</p> : null}
                </FieldShell>
              </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-black/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold tracking-wider text-gray-400">RCON</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FieldShell label="RCON Password">
                  <Input type="password" value={rcon.password || ''} onChange={(e) => updateField('rcon.password', e.target.value)} className="border-zinc-800 bg-black/60 text-white" />
                </FieldShell>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FieldShell label="Permission">
                    <div className="flex gap-2">
                      {['admin', 'monitor'].map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => updateField('rcon.permission', value)}
                          className={`rounded border px-3 py-2 text-xs ${(rcon.permission || 'admin') === value ? 'border-tropic-gold/30 bg-tropic-gold/10 text-tropic-gold' : 'border-zinc-800 bg-black/40 text-gray-400'}`}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  </FieldShell>
                  <FieldShell label="Max Clients">
                    <Input type="number" value={rcon.maxClients ?? 16} onChange={(e) => updateNumber('rcon.maxClients', e.target.value, 16)} className="border-zinc-800 bg-black/60 text-white" />
                  </FieldShell>
                </div>
                <FieldShell label="Blacklist" help="One blocked command per line.">
                  <Textarea value={textEditors.rconBlacklist} onChange={(e) => updateListEditor('rconBlacklist', 'rcon.blacklist', e.target.value)} className="min-h-[100px] border-zinc-800 bg-black/60 font-mono text-xs text-white" />
                </FieldShell>
                <FieldShell label="Whitelist" help="If populated, only these commands may run.">
                  <Textarea value={textEditors.rconWhitelist} onChange={(e) => updateListEditor('rconWhitelist', 'rcon.whitelist', e.target.value)} className="min-h-[100px] border-zinc-800 bg-black/60 font-mono text-xs text-white" />
                </FieldShell>
              </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-black/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold tracking-wider text-gray-400">OPTIONAL PERSISTENCE</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-gray-600">
                  Persistence stays unset on new servers until you opt in. Configure overrides here only when the scenario or save model requires them.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FieldShell label="Auto Save Interval">
                    <Input type="number" value={persistence.autoSaveInterval ?? 10} onChange={(e) => updateNumber('game.persistence.autoSaveInterval', e.target.value, 10)} className="border-zinc-800 bg-black/60 text-white" />
                  </FieldShell>
                  <FieldShell label="Hive ID">
                    <Input type="number" value={persistence.hiveId ?? 0} onChange={(e) => updateNumber('game.persistence.hiveId', e.target.value, 0)} className="border-zinc-800 bg-black/60 text-white" />
                  </FieldShell>
                </div>
                <FieldShell label="Database Overrides" help="JSON object keyed by persistence database name.">
                  <Textarea value={textEditors.persistenceDatabases} onChange={(e) => updateJsonEditor('persistenceDatabases', 'game.persistence.databases', e.target.value, {})} className="min-h-[150px] border-zinc-800 bg-black/60 font-mono text-xs text-white" />
                  {jsonFieldErrors.persistenceDatabases ? <p className="text-xs text-red-400">{jsonFieldErrors.persistenceDatabases}</p> : null}
                </FieldShell>
                <FieldShell label="Storage Overrides" help="JSON object keyed by storage name.">
                  <Textarea value={textEditors.persistenceStorages} onChange={(e) => updateJsonEditor('persistenceStorages', 'game.persistence.storages', e.target.value, {})} className="min-h-[150px] border-zinc-800 bg-black/60 font-mono text-xs text-white" />
                  {jsonFieldErrors.persistenceStorages ? <p className="text-xs text-red-400">{jsonFieldErrors.persistenceStorages}</p> : null}
                </FieldShell>
              </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-black/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold tracking-wider text-gray-400">OPTIONAL OPERATING</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-gray-600">
                  Operating overrides are advanced host-level controls. Leave them at engine defaults unless you are solving a specific gameplay or performance problem.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    ['Lobby Player Synchronise', 'operating.lobbyPlayerSynchronise', operating.lobbyPlayerSynchronise !== false],
                    ['Disable Crash Reporter', 'operating.disableCrashReporter', !!operating.disableCrashReporter],
                    ['Disable Server Shutdown', 'operating.disableServerShutdown', !!operating.disableServerShutdown],
                    ['Disable AI', 'operating.disableAI', !!operating.disableAI],
                  ].map(([label, path, checked]) => (
                    <FieldShell key={path} label={label}>
                      <div className="flex items-center justify-between rounded border border-zinc-800 bg-black/40 px-3 py-2">
                        <span className="text-sm text-gray-300">{label}</span>
                        <Switch checked={checked} onCheckedChange={(value) => updateField(path, value)} />
                      </div>
                    </FieldShell>
                  ))}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FieldShell label="Player Save Time">
                    <Input type="number" value={operating.playerSaveTime ?? 120} onChange={(e) => updateNumber('operating.playerSaveTime', e.target.value, 120)} className="border-zinc-800 bg-black/60 text-white" />
                  </FieldShell>
                  <FieldShell label="AI Limit">
                    <Input type="number" value={operating.aiLimit ?? -1} onChange={(e) => updateNumber('operating.aiLimit', e.target.value, -1)} className="border-zinc-800 bg-black/60 text-white" />
                  </FieldShell>
                  <FieldShell label="Slot Reservation Timeout">
                    <Input type="number" value={operating.slotReservationTimeout ?? 60} onChange={(e) => updateNumber('operating.slotReservationTimeout', e.target.value, 60)} className="border-zinc-800 bg-black/60 text-white" />
                  </FieldShell>
                  <FieldShell label="Join Queue Size">
                    <Input type="number" value={operating.joinQueue?.maxSize ?? 0} onChange={(e) => updateNumber('operating.joinQueue.maxSize', e.target.value, 0)} className="border-zinc-800 bg-black/60 text-white" />
                  </FieldShell>
                </div>
                <FieldShell label="Disable Navmesh Streaming" help="Use engine default, disable all, or list project names one per line.">
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" className="border-zinc-800 text-xs text-gray-400" onClick={() => { clearField('operating.disableNavmeshStreaming'); setTextEditors((prev) => ({ ...prev, navmeshProjects: '' })); }}>
                      Use engine default
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="border-zinc-800 text-xs text-gray-400" onClick={() => { updateField('operating.disableNavmeshStreaming', []); setTextEditors((prev) => ({ ...prev, navmeshProjects: '' })); }}>
                      Disable all navmeshes
                    </Button>
                  </div>
                  <Textarea
                    value={textEditors.navmeshProjects}
                    onChange={(e) => {
                      const value = e.target.value;
                      setTextEditors((prev) => ({ ...prev, navmeshProjects: value }));
                      const parsed = parseListInput(value);
                      if (parsed.length > 0) updateField('operating.disableNavmeshStreaming', parsed);
                      else clearField('operating.disableNavmeshStreaming');
                    }}
                    className="min-h-[110px] border-zinc-800 bg-black/60 font-mono text-xs text-white"
                    placeholder="Soldiers&#10;BTRlike"
                  />
                </FieldShell>
              </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-black/60 xl:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold tracking-wider text-gray-400">BACKEND-MANAGED NETWORK BINDINGS</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 lg:grid-cols-2">
                <ReadOnlyRow label="Bind Address" value={safeConfig.bindAddress || '0.0.0.0'} mono />
                <ReadOnlyRow label="Game Port" value={String(safeConfig.bindPort || '')} mono />
                <ReadOnlyRow label="Public Address" value={safeConfig.publicAddress || safeConfig.bindAddress || '0.0.0.0'} mono />
                <ReadOnlyRow label="Public Port" value={String(safeConfig.publicPort || '')} mono />
                <ReadOnlyRow label="A2S Address" value={a2s.address || '0.0.0.0'} mono />
                <ReadOnlyRow label="A2S Port" value={String(a2s.port || '')} mono />
                <ReadOnlyRow label="RCON Address" value={rcon.address || '0.0.0.0'} mono />
                <ReadOnlyRow label="RCON Port" value={String(rcon.port || '')} mono />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="reference" className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <Input value={referenceQuery} onChange={(e) => setReferenceQuery(e.target.value)} placeholder="Search the Reforger config reference..." className="border-zinc-800 bg-black/60 pl-10 text-white placeholder:text-gray-600" />
          </div>
          <div className="space-y-5">
            {Object.keys(groupedReference).length === 0 ? (
              <Card className="border-zinc-800 bg-black/60">
                <CardContent className="py-10 text-center text-sm text-gray-500">No config reference entries match that search.</CardContent>
              </Card>
            ) : Object.entries(groupedReference).map(([section, items]) => (
              <div key={section} className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">{section}</div>
                <div className="grid gap-3 xl:grid-cols-2">
                  {items.map((item) => <ReferenceCard key={item.path} item={item} />)}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="json">
          <Card className="border-zinc-800 bg-black/60">
            <CardContent className="p-4">
              <Textarea value={jsonText} onChange={(e) => { setJsonText(e.target.value); setJsonError(null); }} className="min-h-[65vh] border-zinc-800 bg-black/80 font-mono text-xs text-green-400 placeholder:text-gray-600" />
              {jsonError ? <div className="mt-2 text-xs text-red-400"><AlertTriangle className="mr-1 inline h-3 w-3" /> {jsonError}</div> : null}
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={handleJsonApply} className="bg-tropic-gold text-xs text-black hover:bg-tropic-gold-light">Apply JSON</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={diffOpen} onOpenChange={setDiffOpen}>
        <DialogContent className="max-w-3xl border-zinc-800 bg-zinc-950 text-white">
          <DialogHeader><DialogTitle className="text-tropic-gold">Save Preview</DialogTitle></DialogHeader>
          <div className="max-h-[70vh] overflow-auto">
            <pre className="whitespace-pre-wrap rounded bg-black/80 p-4 font-mono text-xs text-green-400">
              {JSON.stringify({
                log_stats_enabled: runtime.log_stats_enabled,
                max_fps: runtime.max_fps,
                startup_parameters: parseListInput(textEditors.startupParameters),
                config: safeConfig,
              }, null, 2)}
            </pre>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDiffOpen(false)} className="border-zinc-700 text-gray-400">Close</Button>
            <Button size="sm" onClick={() => { saveConfig(); setDiffOpen(false); }} className="bg-tropic-gold text-black hover:bg-tropic-gold-light">
              <Save className="mr-1 h-3 w-3" /> Save Configuration
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-xl border-zinc-800 bg-zinc-950 text-white">
          <DialogHeader><DialogTitle className="text-tropic-gold">Configuration History</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-auto">
            {configHistory.length === 0 ? (
              <p className="text-xs text-gray-500">No configuration changes recorded.</p>
            ) : configHistory.map((entry, index) => (
              <div key={index} className="rounded border border-zinc-800 bg-black/60 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-300">Version {configHistory.length - index}</span>
                  <span className="text-gray-600">{entry.changed_at ? new Date(entry.changed_at).toLocaleString() : ''}</span>
                </div>
                {entry.changed_by ? <div className="mt-1 text-[10px] text-gray-500">by {entry.changed_by}</div> : null}
                <Button size="sm" variant="outline" className="mt-2 h-6 border-zinc-800 text-[10px] text-gray-400" onClick={() => handleRestoreHistory(entry)}>
                  <RotateCcw className="mr-1 h-3 w-3" /> Restore
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ServerSettingsModule;

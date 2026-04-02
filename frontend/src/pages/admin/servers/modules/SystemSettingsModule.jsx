import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Settings,
  Cpu,
  HardDrive,
  Save,
  Loader2,
  AlertTriangle,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  ShieldAlert,
} from 'lucide-react';
import { API } from '@/utils/api';

function SystemSettingsModule() {
  const { server, serverId, fetchServer, canManage } = useOutletContext();
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Server-level settings (not the Reforger config)
  const [dockerImage, setDockerImage] = useState(server?.docker_image || 'rouhim/arma-reforger-server');
  const containerName = server?.container_name || '';
  const [autoRestart, setAutoRestart] = useState(server?.auto_restart !== false);
  const [maxRestartAttempts, setMaxRestartAttempts] = useState(server?.max_restart_attempts || 3);
  const [healthCheckInterval, setHealthCheckInterval] = useState(server?.health_check_interval || 15);
  const [envVars, setEnvVars] = useState(Object.entries(server?.environment || {}).map(([k, v]) => ({ key: k, value: v, hidden: k.toLowerCase().includes('password') || k.toLowerCase().includes('secret') })));
  const [showSecrets, setShowSecrets] = useState(false);
  const [volumes, setVolumes] = useState(Object.entries(server?.volumes || {}).map(([k, v]) => ({ host: k, container: v })));

  // Sync local state when server data changes (unless user has unsaved edits)
  useEffect(() => {
    if (!dirty && server) {
      setDockerImage(server.docker_image || 'rouhim/arma-reforger-server');
      setAutoRestart(server.auto_restart !== false);
      setMaxRestartAttempts(server.max_restart_attempts || 3);
      setHealthCheckInterval(server.health_check_interval || 15);
      setEnvVars(Object.entries(server.environment || {}).map(([k, v]) => ({ key: k, value: v, hidden: k.toLowerCase().includes('password') || k.toLowerCase().includes('secret') })));
      setVolumes(Object.entries(server.volumes || {}).map(([k, v]) => ({ host: k, container: v })));
    }
  }, [server, dirty]);

  const markDirty = useCallback(() => setDirty(true), []);

  const addEnvVar = useCallback(() => {
    setEnvVars(prev => [...prev, { key: '', value: '', hidden: false }]);
    markDirty();
  }, [markDirty]);

  const removeEnvVar = useCallback((idx) => {
    setEnvVars(prev => prev.filter((_, i) => i !== idx));
    markDirty();
  }, [markDirty]);

  const updateEnvVar = useCallback((idx, field, val) => {
    setEnvVars(prev => prev.map((v, i) => i === idx ? { ...v, [field]: val } : v));
    markDirty();
  }, [markDirty]);

  const addVolume = useCallback(() => {
    setVolumes(prev => [...prev, { host: '', container: '' }]);
    markDirty();
  }, [markDirty]);

  const removeVolume = useCallback((idx) => {
    setVolumes(prev => prev.filter((_, i) => i !== idx));
    markDirty();
  }, [markDirty]);

  const saveSettings = useCallback(async () => {
    setSaving(true);
    try {
      const environment = {};
      envVars.forEach(v => { if (v.key) environment[v.key] = v.value; });
      const volumeMap = {};
      volumes.forEach(v => { if (v.host && v.container) volumeMap[v.host] = v.container; });

      await axios.put(`${API}/servers/${serverId}`, {
        docker_image: dockerImage,
        auto_restart: autoRestart,
        max_restart_attempts: maxRestartAttempts,
        health_check_interval: healthCheckInterval,
        environment,
        volumes: volumeMap,
      });
      setDirty(false);
      await fetchServer(true);
    } catch {
      // Error
    } finally {
      setSaving(false);
    }
  }, [serverId, dockerImage, autoRestart, maxRestartAttempts, healthCheckInterval, envVars, volumes, fetchServer]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-wider text-gray-300" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
          SYSTEM SETTINGS
        </h2>
        <div className="flex items-center gap-2">
          {dirty && <Badge variant="outline" className="border-amber-600/30 text-amber-400 text-xs">Unsaved</Badge>}
          <Button size="sm" onClick={saveSettings} disabled={!dirty || saving}
            className="h-7 bg-tropic-gold text-black hover:bg-tropic-gold-light text-xs">
            {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
            Save
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Container Settings */}
        <Card className="border-zinc-800 bg-black/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wider text-gray-400">
              <Cpu className="h-3.5 w-3.5 text-tropic-gold" /> CONTAINER
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <label className="shrink-0 text-xs text-gray-500">Docker Image</label>
              <Input value={dockerImage}
                onChange={(e) => { setDockerImage(e.target.value); markDirty(); }}
                className="h-7 w-64 border-zinc-800 bg-black/60 font-mono text-xs text-white" />
            </div>
            <div className="flex items-center justify-between gap-4">
              <label className="shrink-0 text-xs text-gray-500">Container Name</label>
              <span className="text-xs font-mono text-gray-400">{containerName || '—'}</span>
            </div>
          </CardContent>
        </Card>

        {/* Health & Restart */}
        <Card className="border-zinc-800 bg-black/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wider text-gray-400">
              <ShieldAlert className="h-3.5 w-3.5 text-tropic-gold" /> HEALTH & RESTART
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <label className="text-xs text-gray-500">Auto Restart</label>
              <Switch checked={autoRestart}
                onCheckedChange={(v) => { setAutoRestart(v); markDirty(); }}
                className="h-4 w-7" />
            </div>
            <div className="flex items-center justify-between gap-4">
              <label className="text-xs text-gray-500">Max Restart Attempts</label>
              <Input type="number" value={maxRestartAttempts}
                onChange={(e) => { setMaxRestartAttempts(parseInt(e.target.value) || 3); markDirty(); }}
                className="h-7 w-20 border-zinc-800 bg-black/60 text-right text-xs text-white" />
            </div>
            <div className="flex items-center justify-between gap-4">
              <label className="text-xs text-gray-500">Health Check Interval (s)</label>
              <Input type="number" value={healthCheckInterval}
                onChange={(e) => { setHealthCheckInterval(parseInt(e.target.value) || 15); markDirty(); }}
                className="h-7 w-20 border-zinc-800 bg-black/60 text-right text-xs text-white" />
            </div>
          </CardContent>
        </Card>

        {/* Environment Variables */}
        <Card className="border-zinc-800 bg-black/60 lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wider text-gray-400">
                <Settings className="h-3.5 w-3.5 text-tropic-gold" /> ENVIRONMENT VARIABLES
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setShowSecrets(!showSecrets)}
                  className="h-6 text-[10px] text-gray-500">
                  {showSecrets ? <EyeOff className="mr-1 h-3 w-3" /> : <Eye className="mr-1 h-3 w-3" />}
                  {showSecrets ? 'Hide' : 'Show'} secrets
                </Button>
                <Button size="sm" variant="outline" onClick={addEnvVar}
                  className="h-6 border-zinc-800 text-[10px] text-gray-400">
                  <Plus className="mr-1 h-3 w-3" /> Add
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {envVars.length === 0 ? (
              <p className="text-xs text-gray-600">No environment variables configured</p>
            ) : (
              envVars.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={v.key} onChange={(e) => updateEnvVar(i, 'key', e.target.value)}
                    placeholder="KEY" className="h-7 flex-1 border-zinc-800 bg-black/60 font-mono text-xs text-gray-300" />
                  <span className="text-gray-600">=</span>
                  <Input
                    type={v.hidden && !showSecrets ? 'password' : 'text'}
                    value={v.value}
                    onChange={(e) => updateEnvVar(i, 'value', e.target.value)}
                    placeholder="value"
                    className="h-7 flex-1 border-zinc-800 bg-black/60 font-mono text-xs text-gray-300"
                  />
                  <button onClick={() => removeEnvVar(i)} className="text-gray-600 hover:text-red-400">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Volumes */}
        <Card className="border-zinc-800 bg-black/60 lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wider text-gray-400">
                <HardDrive className="h-3.5 w-3.5 text-tropic-gold" /> VOLUME MOUNTS
              </CardTitle>
              <Button size="sm" variant="outline" onClick={addVolume}
                className="h-6 border-zinc-800 text-[10px] text-gray-400">
                <Plus className="mr-1 h-3 w-3" /> Add
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {volumes.length === 0 ? (
              <p className="text-xs text-gray-600">No custom volume mounts</p>
            ) : (
              volumes.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={v.host} onChange={(e) => { const updated = [...volumes]; updated[i].host = e.target.value; setVolumes(updated); markDirty(); }}
                    placeholder="/host/path" className="h-7 flex-1 border-zinc-800 bg-black/60 font-mono text-xs text-gray-300" />
                  <span className="text-gray-600">→</span>
                  <Input value={v.container} onChange={(e) => { const updated = [...volumes]; updated[i].container = e.target.value; setVolumes(updated); markDirty(); }}
                    placeholder="/container/path" className="h-7 flex-1 border-zinc-800 bg-black/60 font-mono text-xs text-gray-300" />
                  <button onClick={() => removeVolume(i)} className="text-gray-600 hover:text-red-400">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default SystemSettingsModule;

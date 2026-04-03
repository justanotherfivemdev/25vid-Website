import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Copy,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Shield,
  ShieldAlert,
  TimerReset,
  Wrench,
} from 'lucide-react';
import { API } from '@/utils/api';

const KNOWN_KEYS = new Set([
  'admins',
  'bans',
  'repeatedChatMessages',
  'scheduledChatMessages',
  'serverMessage',
  'serverMessageHeaderImage',
  'serverMessageDiscordLink',
  'serverMessageOpen',
  'statsFileName',
  'statsFileUpdateIntervalSeconds',
  'banReloadIntervalMinutes',
  'statsSaveConnectedPlayers',
  'eventsApiToken',
  'eventsApiAddress',
  'eventsApiRatelimitSeconds',
  'eventsApiEventsEnabled',
  'chatMessagesUtcTime',
  'repeatedChatMessagesCycle',
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function SatConfigModule() {
  const { serverId } = useOutletContext();
  const [configState, setConfigState] = useState({ available: false, status: 'pending', config: null });
  const [draft, setDraft] = useState(null);
  const [satStatus, setSatStatus] = useState(null);
  const [bans, setBans] = useState([]);
  const [advancedRaw, setAdvancedRaw] = useState('{}');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newBanId, setNewBanId] = useState('');
  const [newBanReason, setNewBanReason] = useState('');
  const [workingAction, setWorkingAction] = useState('');

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      const [configRes, statusRes, bansRes] = await Promise.allSettled([
        axios.get(`${API}/servers/${serverId}/sat-config`),
        axios.get(`${API}/servers/${serverId}/sat/status`),
        axios.get(`${API}/servers/${serverId}/sat/bans`),
      ]);

      if (configRes.status === 'fulfilled') {
        setConfigState(configRes.value.data);
        const nextDraft = configRes.value.data?.config ? clone(configRes.value.data.config) : null;
        setDraft(nextDraft);
        const advanced = {};
        Object.entries(nextDraft || {}).forEach(([key, value]) => {
          if (!KNOWN_KEYS.has(key)) advanced[key] = value;
        });
        setAdvancedRaw(JSON.stringify(advanced, null, 2));
      }
      if (statusRes.status === 'fulfilled') setSatStatus(statusRes.value.data);
      if (bansRes.status === 'fulfilled') setBans(bansRes.value.data?.bans || []);
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const updateField = useCallback((key, value) => {
    setDraft((current) => ({ ...(current || {}), [key]: value }));
  }, []);

  const updateArrayItem = useCallback((key, index, patch) => {
    setDraft((current) => {
      const next = clone(current || {});
      const list = Array.isArray(next[key]) ? [...next[key]] : [];
      list[index] = { ...(list[index] || {}), ...patch };
      next[key] = list;
      return next;
    });
  }, []);

  const addArrayItem = useCallback((key, item) => {
    setDraft((current) => {
      const next = clone(current || {});
      next[key] = [...(Array.isArray(next[key]) ? next[key] : []), item];
      return next;
    });
  }, []);

  const removeArrayItem = useCallback((key, index) => {
    setDraft((current) => {
      const next = clone(current || {});
      next[key] = (Array.isArray(next[key]) ? next[key] : []).filter((_, currentIndex) => currentIndex !== index);
      return next;
    });
  }, []);

  const saveConfig = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    try {
      let advanced = {};
      if (advancedRaw.trim()) {
        advanced = JSON.parse(advancedRaw);
      }

      const nextConfig = Object.fromEntries(
        Object.entries(draft).filter(([key]) => KNOWN_KEYS.has(key)),
      );

      await axios.put(`${API}/servers/${serverId}/sat-config`, {
        config: {
          ...nextConfig,
          ...advanced,
          bans: draft.bans,
        },
      });
      await refreshAll();
    } finally {
      setSaving(false);
    }
  }, [advancedRaw, draft, refreshAll, serverId]);

  const handleRestoreDefaults = useCallback(async () => {
    setWorkingAction('restore');
    try {
      await axios.post(`${API}/servers/${serverId}/sat/tools/restore-defaults`);
      await refreshAll();
    } finally {
      setWorkingAction('');
    }
  }, [refreshAll, serverId]);

  const handleCopyFromServer = useCallback(async () => {
    setWorkingAction('copy');
    try {
      await axios.post(`${API}/servers/${serverId}/sat/tools/copy-from-server`);
      await refreshAll();
    } finally {
      setWorkingAction('');
    }
  }, [refreshAll, serverId]);

  const addBan = useCallback(async () => {
    if (!newBanId.trim()) return;
    setWorkingAction('add-ban');
    try {
      await axios.post(`${API}/servers/${serverId}/sat/bans`, { player_id: newBanId.trim(), reason: newBanReason.trim() });
      setNewBanId('');
      setNewBanReason('');
      await refreshAll();
    } finally {
      setWorkingAction('');
    }
  }, [newBanId, newBanReason, refreshAll, serverId]);

  const removeBan = useCallback(async (playerId) => {
    setWorkingAction(`remove-${playerId}`);
    try {
      await axios.delete(`${API}/servers/${serverId}/sat/bans/${playerId}`);
      await refreshAll();
    } finally {
      setWorkingAction('');
    }
  }, [refreshAll, serverId]);

  const syncBans = useCallback(async () => {
    setWorkingAction('sync-bans');
    try {
      await axios.post(`${API}/servers/${serverId}/sat/bans/sync`);
      await refreshAll();
    } finally {
      setWorkingAction('');
    }
  }, [refreshAll, serverId]);

  const admins = useMemo(() => {
    const source = draft?.admins;
    if (Array.isArray(source)) return source.map((entry, index) => ({ id: entry.id || entry.playerId || `${index}`, name: entry.name || entry.label || '' }));
    if (source && typeof source === 'object') return Object.entries(source).map(([id, name]) => ({ id, name: String(name || '') }));
    return [];
  }, [draft?.admins]);

  if (loading && !draft) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-tropic-gold" />
      </div>
    );
  }

  if (!configState?.available) {
    return (
      <Card className="border-zinc-800 bg-black/60">
        <CardContent className="py-14 text-center text-gray-500">
          <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-gray-700" />
          <p className="text-sm">Server Admin Tools config is not available yet.</p>
          <p className="mt-1 text-xs">Current state: {configState?.status || 'pending'}. Start the server and let the profile finish generating before editing SAT.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-[0.24em] text-gray-200" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
            SERVER ADMIN TOOLS
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Structured SAT control surface with live status, ban management, operator messaging, events wiring, and recovery tools.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={refreshAll} className="h-8 border-zinc-800 text-xs text-gray-300">
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Refresh
          </Button>
          <Button size="sm" onClick={saveConfig} disabled={!draft || saving} className="h-8 bg-tropic-gold text-black hover:bg-tropic-gold-light">
            {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
            Save SAT
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <StatusTile label="SAT Status" value={satStatus?.sat_status || configState?.status || 'pending'} />
        <StatusTile label="Players" value={satStatus?.player_count ?? 'Unavailable'} />
        <StatusTile label="Server FPS" value={satStatus?.server_fps ?? 'Unavailable'} />
        <StatusTile label="Avg Ping" value={satStatus?.avg_player_ping_ms != null ? `${satStatus.avg_player_ping_ms} ms` : 'Unavailable'} />
      </div>

      <SectionCard title="Ban Manager" icon={Shield}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3">
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <Input value={newBanId} onChange={(event) => setNewBanId(event.target.value)} placeholder="Player ID / GUID" className="h-9 border-zinc-800 bg-black/50 text-white" />
              <Input value={newBanReason} onChange={(event) => setNewBanReason(event.target.value)} placeholder="Reason (optional)" className="h-9 border-zinc-800 bg-black/50 text-white" />
              <Button onClick={addBan} disabled={!newBanId.trim() || workingAction === 'add-ban'} className="h-9 bg-tropic-gold text-black hover:bg-tropic-gold-light">
                {workingAction === 'add-ban' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                Add ban
              </Button>
            </div>
            <div className="space-y-2">
              {bans.length === 0 ? (
                <p className="text-xs text-gray-500">No SAT bans are configured yet.</p>
              ) : (
                bans.map((ban) => (
                  <div key={ban.id} className="flex items-center gap-3 rounded-xl border border-zinc-800/70 bg-zinc-950/70 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-gray-100">{ban.id}</div>
                      <div className="text-xs text-gray-500">{ban.reason || 'No reason provided'}</div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => removeBan(ban.id)} className="text-gray-500 hover:text-red-400">
                      Remove
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/70 p-4">
            <div className="text-sm font-medium text-gray-100">Live Sync</div>
            <p className="mt-1 text-xs text-gray-500">
              Replay SAT bans against the live server when BattlEye RCON is available.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={syncBans}
              disabled={workingAction === 'sync-bans'}
              className="mt-4 h-8 border-zinc-700 text-gray-200"
            >
              {workingAction === 'sync-bans' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
              Sync bans to runtime
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Settings" icon={TimerReset}>
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-3">
            <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/70 p-4">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Admins</div>
              <div className="mt-3 space-y-2">
                {admins.length === 0 ? (
                  <p className="text-xs text-gray-500">No explicit SAT admins found in the current config.</p>
                ) : (
                  admins.map((admin) => (
                    <div key={admin.id} className="grid gap-2 md:grid-cols-[180px_minmax(0,1fr)]">
                      <Input value={admin.id} readOnly className="h-8 border-zinc-800 bg-black/40 font-mono text-xs text-gray-300" />
                      <Input value={admin.name} readOnly className="h-8 border-zinc-800 bg-black/40 text-xs text-gray-300" />
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/70 p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <LabeledInput label="Stats File" value={draft?.statsFileName || ''} onChange={(value) => updateField('statsFileName', value)} />
                <LabeledInput label="Stats File Update Interval (s)" type="number" value={draft?.statsFileUpdateIntervalSeconds ?? 0} onChange={(value) => updateField('statsFileUpdateIntervalSeconds', Number(value || 0))} />
                <LabeledInput label="Ban Reload Interval (min)" type="number" value={draft?.banReloadIntervalMinutes ?? 0} onChange={(value) => updateField('banReloadIntervalMinutes', Number(value || 0))} />
                <ToggleField label="Save Connected Players" checked={!!draft?.statsSaveConnectedPlayers} onCheckedChange={(value) => updateField('statsSaveConnectedPlayers', value)} />
                <ToggleField label="Chat Messages Use UTC" checked={!!draft?.chatMessagesUtcTime} onCheckedChange={(value) => updateField('chatMessagesUtcTime', value)} />
                <ToggleField label="Cycle Repeated Messages" checked={!!draft?.repeatedChatMessagesCycle} onCheckedChange={(value) => updateField('repeatedChatMessagesCycle', value)} />
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Repeated Chat Messages" icon={Copy}>
        <ArraySection
          items={draft?.repeatedChatMessages || []}
          onAdd={() => addArrayItem('repeatedChatMessages', { message: '', intervalMinutes: 15 })}
          onRemove={(index) => removeArrayItem('repeatedChatMessages', index)}
          renderItem={(item, index) => (
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_140px]">
              <Textarea value={item.message || ''} onChange={(event) => updateArrayItem('repeatedChatMessages', index, { message: event.target.value })} rows={3} className="border-zinc-800 bg-black/40 text-sm text-white" />
              <LabeledInput label="Interval (min)" type="number" value={item.intervalMinutes ?? 15} onChange={(value) => updateArrayItem('repeatedChatMessages', index, { intervalMinutes: Number(value || 0) })} />
            </div>
          )}
        />
      </SectionCard>

      <SectionCard title="Scheduled Chat Messages" icon={Copy}>
        <ArraySection
          items={draft?.scheduledChatMessages || []}
          onAdd={() => addArrayItem('scheduledChatMessages', { message: '', hour: 0, minute: 0 })}
          onRemove={(index) => removeArrayItem('scheduledChatMessages', index)}
          renderItem={(item, index) => (
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_120px_120px]">
              <Textarea value={item.message || ''} onChange={(event) => updateArrayItem('scheduledChatMessages', index, { message: event.target.value })} rows={3} className="border-zinc-800 bg-black/40 text-sm text-white" />
              <LabeledInput label="Hour" type="number" value={item.hour ?? 0} onChange={(value) => updateArrayItem('scheduledChatMessages', index, { hour: Number(value || 0) })} />
              <LabeledInput label="Minute" type="number" value={item.minute ?? 0} onChange={(value) => updateArrayItem('scheduledChatMessages', index, { minute: Number(value || 0) })} />
            </div>
          )}
        />
      </SectionCard>

      <SectionCard title="Welcome Message" icon={Copy}>
        <div className="grid gap-4 xl:grid-cols-2">
          <Textarea value={draft?.serverMessage || ''} onChange={(event) => updateField('serverMessage', event.target.value)} rows={8} className="border-zinc-800 bg-black/40 text-sm text-white" />
          <div className="space-y-3">
            <LabeledInput label="Header Image" value={draft?.serverMessageHeaderImage || ''} onChange={(value) => updateField('serverMessageHeaderImage', value)} />
            <LabeledInput label="Discord Link" value={draft?.serverMessageDiscordLink || ''} onChange={(value) => updateField('serverMessageDiscordLink', value)} />
            <ToggleField label="Open Welcome Message Automatically" checked={!!draft?.serverMessageOpen} onCheckedChange={(value) => updateField('serverMessageOpen', value)} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Events API" icon={Wrench}>
        <div className="grid gap-3 xl:grid-cols-2">
          <LabeledInput label="Events API Token" value={draft?.eventsApiToken || ''} onChange={(value) => updateField('eventsApiToken', value)} />
          <LabeledInput label="Events API Address" value={draft?.eventsApiAddress || ''} onChange={(value) => updateField('eventsApiAddress', value)} />
          <LabeledInput label="Rate Limit (s)" type="number" value={draft?.eventsApiRatelimitSeconds ?? 0} onChange={(value) => updateField('eventsApiRatelimitSeconds', Number(value || 0))} />
          <div>
            <div className="mb-1 text-xs font-medium text-gray-500">Enabled Events</div>
            <Textarea
              value={Array.isArray(draft?.eventsApiEventsEnabled) ? draft.eventsApiEventsEnabled.join(', ') : ''}
              onChange={(event) => updateField('eventsApiEventsEnabled', event.target.value.split(',').map((value) => value.trim()).filter(Boolean))}
              rows={4}
              className="border-zinc-800 bg-black/40 text-sm text-white"
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Tools" icon={RotateCcw}>
        <div className="grid gap-4 lg:grid-cols-2">
          <ToolCard
            title="Restore Defaults"
            description="Reapply the SAT baseline configured on the host."
            buttonLabel="Restore defaults"
            icon={RotateCcw}
            loading={workingAction === 'restore'}
            onClick={handleRestoreDefaults}
          />
          <ToolCard
            title="Copy From Server"
            description="Refresh this editor from the discovered SAT config currently on disk."
            buttonLabel="Copy from server"
            icon={Copy}
            loading={workingAction === 'copy'}
            onClick={handleCopyFromServer}
          />
        </div>
      </SectionCard>

      <SectionCard title="Advanced" icon={ShieldAlert}>
        <p className="mb-3 text-xs text-gray-500">
          Unknown SAT keys stay editable here so structured coverage can improve without blocking uncommon fields.
        </p>
        <Textarea value={advancedRaw} onChange={(event) => setAdvancedRaw(event.target.value)} rows={12} className="border-zinc-800 bg-black/40 font-mono text-xs text-white" />
      </SectionCard>
    </div>
  );
}

function StatusTile({ label, value }) {
  return (
    <Card className="border-zinc-800 bg-black/60">
      <CardContent className="p-4">
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-500">{label}</div>
        <div className="mt-2 text-2xl font-semibold text-white" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function SectionCard({ title, icon: Icon, children }) {
  return (
    <Card className="border-zinc-800 bg-black/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm tracking-[0.16em] text-gray-200">
          <Icon className="h-4 w-4 text-tropic-gold" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function LabeledInput({ label, value, onChange, type = 'text' }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-gray-500">{label}</div>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="h-9 border-zinc-800 bg-black/40 text-white" />
    </div>
  );
}

function ToggleField({ label, checked, onCheckedChange }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-zinc-800/70 bg-zinc-950/70 px-3 py-3">
      <div className="text-xs font-medium text-gray-300">{label}</div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} className="h-5 w-9" />
    </div>
  );
}

function ArraySection({ items, onAdd, onRemove, renderItem }) {
  return (
    <div className="space-y-3">
      {items.length === 0 && <p className="text-xs text-gray-500">No entries configured yet.</p>}
      {items.map((item, index) => (
        <div key={`item-${index}`} className="space-y-3 rounded-xl border border-zinc-800/70 bg-zinc-950/70 p-4">
          {renderItem(item, index)}
          <div className="flex justify-end">
            <Button size="sm" variant="ghost" onClick={() => onRemove(index)} className="text-gray-500 hover:text-red-400">
              Remove
            </Button>
          </div>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={onAdd} className="border-zinc-800 text-gray-200">
        Add entry
      </Button>
    </div>
  );
}

function ToolCard({ title, description, buttonLabel, icon: Icon, onClick, loading }) {
  return (
    <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/70 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-100">
        <Icon className="h-4 w-4 text-tropic-gold" /> {title}
      </div>
      <p className="mt-2 text-xs text-gray-500">{description}</p>
      <Button size="sm" variant="outline" onClick={onClick} disabled={loading} className="mt-4 border-zinc-700 text-gray-200">
        {loading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
        {buttonLabel}
      </Button>
    </div>
  );
}

export default SatConfigModule;

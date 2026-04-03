import React, { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { API } from '@/utils/api';
import {
  Loader2,
  RefreshCw,
  Save,
  Shield,
} from 'lucide-react';

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function setAtPath(root, path, nextValue) {
  const copy = cloneValue(root);
  let cursor = copy;
  for (let i = 0; i < path.length - 1; i += 1) {
    cursor = cursor[path[i]];
  }
  cursor[path[path.length - 1]] = nextValue;
  return copy;
}

function primitiveArrayToString(value) {
  return Array.isArray(value) ? value.join(', ') : '';
}

function SatValueEditor({ label, value, path, onChange }) {
  if (typeof value === 'boolean') {
    return (
      <div className="flex items-center justify-between gap-4 py-1">
        <span className="text-xs text-gray-400">{label}</span>
        <Switch checked={value} onCheckedChange={(next) => onChange(path, next)} className="h-4 w-7" />
      </div>
    );
  }

  if (typeof value === 'number') {
    return (
      <label className="space-y-1">
        <span className="text-xs text-gray-500">{label}</span>
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(path, Number(e.target.value || 0))}
          className="h-8 border-zinc-800 bg-black/60 text-xs text-white"
        />
      </label>
    );
  }

  if (typeof value === 'string') {
    return (
      <label className="space-y-1">
        <span className="text-xs text-gray-500">{label}</span>
        <Input
          value={value}
          onChange={(e) => onChange(path, e.target.value)}
          className="h-8 border-zinc-800 bg-black/60 text-xs text-white"
        />
      </label>
    );
  }

  if (Array.isArray(value) && value.every((item) => typeof item !== 'object')) {
    return (
      <label className="space-y-1">
        <span className="text-xs text-gray-500">{label}</span>
        <Input
          value={primitiveArrayToString(value)}
          onChange={(e) => onChange(path, e.target.value.split(',').map((item) => item.trim()).filter(Boolean))}
          className="h-8 border-zinc-800 bg-black/60 text-xs text-white"
        />
      </label>
    );
  }

  if (Array.isArray(value)) {
    return (
      <div className="space-y-3 rounded border border-zinc-800/70 bg-black/40 p-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</div>
        {value.map((item, index) => (
          <div key={`${label}-${index}`} className="rounded border border-zinc-800/50 bg-black/40 p-3">
            <div className="mb-2 text-[11px] text-gray-500">Item {index + 1}</div>
            <SatValueEditor label={`${label}-${index}`} value={item} path={[...path, index]} onChange={onChange} />
          </div>
        ))}
      </div>
    );
  }

  if (value && typeof value === 'object') {
    return (
      <div className="space-y-3 rounded border border-zinc-800/70 bg-black/40 p-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</div>
        <div className="grid gap-3 lg:grid-cols-2">
          {Object.entries(value).map(([childKey, childValue]) => (
            <SatValueEditor
              key={`${path.join('.')}-${childKey}`}
              label={childKey}
              value={childValue}
              path={[...path, childKey]}
              onChange={onChange}
            />
          ))}
        </div>
      </div>
    );
  }

  return null;
}

function SatConfigModule() {
  const { serverId } = useOutletContext();
  const [configState, setConfigState] = useState({ available: false, status: 'pending', config: null });
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/servers/${serverId}/sat-config`);
      setConfigState(res.data);
      setDraft(res.data?.config ? cloneValue(res.data.config) : null);
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const updateDraft = useCallback((path, value) => {
    setDraft((prev) => setAtPath(prev, path, value));
  }, []);

  const saveConfig = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await axios.put(`${API}/servers/${serverId}/sat-config`, { config: draft });
      await fetchConfig();
    } finally {
      setSaving(false);
    }
  }, [draft, fetchConfig, serverId]);

  if (loading && !draft) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-tropic-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wider text-gray-300" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
          SERVER ADMIN TOOLS
        </h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={fetchConfig} className="h-7 border-zinc-800 text-xs text-gray-400">
            <RefreshCw className="mr-1 h-3 w-3" /> Refresh
          </Button>
          <Button size="sm" onClick={saveConfig} disabled={!draft || saving} className="h-7 bg-tropic-gold text-black hover:bg-tropic-gold-light text-xs">
            {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
            Save
          </Button>
        </div>
      </div>

      {!configState?.available ? (
        <Card className="border-zinc-800 bg-black/60">
          <CardContent className="py-12 text-center text-gray-500">
            <Shield className="mx-auto mb-3 h-8 w-8 text-gray-700" />
            <p className="text-sm">Server Admin Tools config is not available yet.</p>
            <p className="mt-1 text-xs">Current state: {configState?.status || 'pending'}. Start the server and let the profile directory finish generating.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-zinc-800 bg-black/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wider text-gray-400">
              <Shield className="h-3.5 w-3.5 text-tropic-gold" /> STRUCTURED SAT CONFIG
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded border border-zinc-800/70 bg-black/40 px-3 py-2 text-xs text-gray-500">
              This editor is generated from the live SAT config file discovered inside the server profile. It only exposes fields that already exist in that file.
            </div>
            {draft && Object.entries(draft).map(([key, value]) => (
              <SatValueEditor key={key} label={key} value={value} path={[key]} onChange={updateDraft} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default SatConfigModule;

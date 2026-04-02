import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Bell,
  Plus,
  Trash2,
  Send,
  Loader2,
  Webhook,
} from 'lucide-react';
import { API } from '@/utils/api';

const EVENT_TYPES = [
  'schedule.success',
  'schedule.failure',
  'server.crash',
  'server.restart',
  'server.start',
  'server.stop',
  'incident.created',
  'incident.resolved',
  'mod.issue_detected',
  'health.warning',
];

function NotificationsModule() {
  const { serverId, canManage } = useOutletContext();
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newWebhook, setNewWebhook] = useState({ name: '', url: '', events: [], enabled: true });
  const [creating, setCreating] = useState(false);
  const [testing, setTesting] = useState(null);

  const fetchWebhooks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/servers/webhooks`);
      setWebhooks(res.data?.webhooks || res.data || []);
    } catch {
      setWebhooks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchWebhooks(); }, [fetchWebhooks]);

  const createWebhook = useCallback(async () => {
    if (!newWebhook.name || !newWebhook.url) return;
    setCreating(true);
    try {
      await axios.post(`${API}/servers/webhooks`, newWebhook);
      setDialogOpen(false);
      setNewWebhook({ name: '', url: '', events: [], enabled: true });
      await fetchWebhooks();
    } catch {
      // Error
    } finally {
      setCreating(false);
    }
  }, [newWebhook, fetchWebhooks]);

  const deleteWebhook = useCallback(async (id) => {
    try {
      await axios.delete(`${API}/servers/webhooks/${id}`);
      await fetchWebhooks();
    } catch {
      // Error
    }
  }, [fetchWebhooks]);

  const testWebhook = useCallback(async (webhook) => {
    setTesting(webhook.id);
    try {
      // Proxy test through backend to avoid CORS issues
      await axios.post(`${API}/servers/webhooks/${webhook.id}/test`);
    } catch {
      // Webhook test may fail if endpoint not reachable
    } finally {
      setTesting(null);
    }
  }, []);

  const toggleEvent = useCallback((event) => {
    setNewWebhook(prev => ({
      ...prev,
      events: prev.events.includes(event) ? prev.events.filter(e => e !== event) : [...prev.events, event],
    }));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wider text-gray-300" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
          NOTIFICATIONS
        </h2>
        <Button size="sm" onClick={() => setDialogOpen(true)}
          className="h-7 bg-tropic-gold text-black hover:bg-tropic-gold-light text-xs">
          <Plus className="mr-1 h-3 w-3" /> Add Webhook
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-tropic-gold" />
        </div>
      ) : webhooks.length === 0 ? (
        <Card className="border-zinc-800 bg-black/60">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Bell className="mb-2 h-8 w-8 text-gray-700" />
            <p className="text-sm text-gray-500">No webhooks configured</p>
            <p className="mt-1 text-xs text-gray-600">Add webhooks to receive notifications for server events</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {webhooks.map((wh) => (
            <Card key={wh.id} className="border-zinc-800 bg-black/60">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Webhook className="h-4 w-4 text-tropic-gold" />
                      <span className="text-sm font-medium text-gray-200">{wh.name}</span>
                      <Badge variant="outline" className={`text-[10px] ${wh.enabled ? 'border-green-600/30 text-green-400' : 'border-zinc-600/30 text-gray-500'}`}>
                        {wh.enabled ? 'Active' : 'Disabled'}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs font-mono text-gray-500 truncate">{wh.url}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(wh.events || []).map((ev) => (
                        <Badge key={ev} variant="outline" className="border-zinc-700 text-[9px] text-gray-400">{ev}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => testWebhook(wh)}
                      disabled={testing === wh.id}
                      className="h-7 border-zinc-800 text-[10px] text-gray-400">
                      {testing === wh.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteWebhook(wh.id)}
                      className="h-7 text-gray-500 hover:text-red-400">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Webhook Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md border-zinc-800 bg-zinc-950 text-white">
          <DialogHeader>
            <DialogTitle className="text-tropic-gold">Add Webhook</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-400">Name</label>
              <Input value={newWebhook.name} onChange={(e) => setNewWebhook(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g., Discord Alerts" className="mt-1 border-zinc-800 bg-black/60 text-sm text-white" />
            </div>
            <div>
              <label className="text-xs text-gray-400">URL</label>
              <Input value={newWebhook.url} onChange={(e) => setNewWebhook(p => ({ ...p, url: e.target.value }))}
                placeholder="https://discord.com/api/webhooks/..."
                className="mt-1 border-zinc-800 bg-black/60 font-mono text-sm text-white" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-2 block">Events</label>
              <div className="grid grid-cols-2 gap-1.5">
                {EVENT_TYPES.map((ev) => (
                  <button key={ev} onClick={() => toggleEvent(ev)}
                    className={`rounded border px-2 py-1.5 text-left text-[10px] transition-colors ${
                      newWebhook.events.includes(ev)
                        ? 'border-tropic-gold/30 bg-tropic-gold/10 text-tropic-gold'
                        : 'border-zinc-800 text-gray-500 hover:border-zinc-700'
                    }`}>
                    {ev}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={newWebhook.enabled}
                onCheckedChange={(v) => setNewWebhook(p => ({ ...p, enabled: v }))}
                className="h-4 w-7" />
              <span className="text-xs text-gray-400">Enabled</span>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}
              className="border-zinc-700 text-gray-400">Cancel</Button>
            <Button size="sm" onClick={createWebhook} disabled={creating || !newWebhook.name || !newWebhook.url}
              className="bg-tropic-gold text-black hover:bg-tropic-gold-light">
              {creating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
              Create Webhook
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default NotificationsModule;

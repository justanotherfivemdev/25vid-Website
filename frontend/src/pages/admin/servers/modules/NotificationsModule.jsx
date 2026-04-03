import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Bell,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Plus,
  Send,
  Trash2,
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

const SEVERITY_STYLES = {
  info: 'border-sky-600/20 bg-sky-600/5 text-sky-300',
  warning: 'border-amber-600/20 bg-amber-600/5 text-amber-300',
  error: 'border-orange-600/20 bg-orange-600/5 text-orange-300',
  critical: 'border-red-600/20 bg-red-600/5 text-red-300',
};

function NotificationsModule() {
  const { serverId } = useOutletContext();
  const [notifications, setNotifications] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCleared, setShowCleared] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newWebhook, setNewWebhook] = useState({ name: '', url: '', events: [], enabled: true });
  const [creating, setCreating] = useState(false);
  const [testing, setTesting] = useState(null);
  const [notificationAction, setNotificationAction] = useState(null);

  const fetchModuleData = useCallback(async () => {
    setLoading(true);
    try {
      const [notificationsRes, webhooksRes] = await Promise.allSettled([
        axios.get(`${API}/servers/${serverId}/notifications`, {
          params: { include_cleared: showCleared },
        }),
        axios.get(`${API}/servers/webhooks`),
      ]);

      if (notificationsRes.status === 'fulfilled') {
        setNotifications(notificationsRes.value.data?.notifications || []);
      } else {
        setNotifications([]);
      }

      if (webhooksRes.status === 'fulfilled') {
        setWebhooks(webhooksRes.value.data?.webhooks || webhooksRes.value.data || []);
      } else {
        setWebhooks([]);
      }
    } finally {
      setLoading(false);
    }
  }, [serverId, showCleared]);

  useEffect(() => {
    fetchModuleData();
  }, [fetchModuleData]);

  const createWebhook = useCallback(async () => {
    if (!newWebhook.name || !newWebhook.url) return;
    setCreating(true);
    try {
      await axios.post(`${API}/servers/webhooks`, newWebhook);
      setDialogOpen(false);
      setNewWebhook({ name: '', url: '', events: [], enabled: true });
      await fetchModuleData();
    } finally {
      setCreating(false);
    }
  }, [fetchModuleData, newWebhook]);

  const deleteWebhook = useCallback(async (id) => {
    await axios.delete(`${API}/servers/webhooks/${id}`);
    await fetchModuleData();
  }, [fetchModuleData]);

  const testWebhook = useCallback(async (webhook) => {
    setTesting(webhook.id);
    try {
      await axios.post(`${API}/servers/webhooks/${webhook.id}/test`);
    } finally {
      setTesting(null);
    }
  }, []);

  const acknowledgeNotification = useCallback(async (notificationId) => {
    setNotificationAction(notificationId);
    try {
      await axios.post(`${API}/servers/${serverId}/notifications/${notificationId}/acknowledge`);
      await fetchModuleData();
    } finally {
      setNotificationAction(null);
    }
  }, [fetchModuleData, serverId]);

  const clearNotification = useCallback(async (notificationId) => {
    setNotificationAction(notificationId);
    try {
      await axios.post(`${API}/servers/${serverId}/notifications/${notificationId}/clear`);
      await fetchModuleData();
    } finally {
      setNotificationAction(null);
    }
  }, [fetchModuleData, serverId]);

  const toggleEvent = useCallback((event) => {
    setNewWebhook((prev) => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter((existing) => existing !== event)
        : [...prev.events, event],
    }));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-wider text-gray-300" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
            NOTIFICATIONS
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Provisioning follow-up, runtime faults, and delivery webhooks live here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded border border-zinc-800 bg-black/40 px-3 py-1.5 text-xs text-gray-400">
            <span>Show cleared</span>
            <Switch checked={showCleared} onCheckedChange={setShowCleared} className="h-4 w-7" />
          </div>
          <Button
            size="sm"
            onClick={() => setDialogOpen(true)}
            className="h-7 bg-tropic-gold text-black hover:bg-tropic-gold-light text-xs"
          >
            <Plus className="mr-1 h-3 w-3" /> Add Webhook
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-tropic-gold" />
        </div>
      ) : (
        <>
          <Card className="border-zinc-800 bg-black/60">
            <CardContent className="p-4">
              <div className="mb-4 flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-gray-500">
                <ClipboardList className="h-4 w-4 text-tropic-gold" />
                ACTIVE SERVER NOTIFICATIONS
              </div>

              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <CheckCircle2 className="mb-2 h-8 w-8 text-green-500/60" />
                  <p className="text-sm text-gray-400">No actionable server notifications.</p>
                  <p className="mt-1 text-xs text-gray-600">
                    When provisioning or runtime checks need attention, they will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {notifications.map((notification) => {
                    const severityClass = SEVERITY_STYLES[notification.severity] || SEVERITY_STYLES.warning;
                    const isBusy = notificationAction === notification.id;
                    return (
                      <Card key={notification.id} className={`border ${severityClass}`}>
                        <CardContent className="p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-white">{notification.title}</span>
                                <Badge variant="outline" className="border-white/10 text-[10px] uppercase tracking-wider text-gray-200">
                                  {notification.severity}
                                </Badge>
                                {notification.acknowledged && (
                                  <Badge variant="outline" className="border-green-600/30 text-[10px] text-green-300">
                                    Acknowledged
                                  </Badge>
                                )}
                                {notification.status === 'cleared' && (
                                  <Badge variant="outline" className="border-zinc-700 text-[10px] text-gray-400">
                                    Cleared
                                  </Badge>
                                )}
                              </div>

                              {notification.message && (
                                <p className="text-sm text-gray-300">{notification.message}</p>
                              )}

                              {Array.isArray(notification.checklist) && notification.checklist.length > 0 && (
                                <div className="space-y-1 rounded border border-zinc-800/80 bg-black/40 p-3">
                                  <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">
                                    Follow-Up Checklist
                                  </div>
                                  {notification.checklist.map((item, index) => (
                                    <div key={`${notification.id}-${index}`} className="text-xs text-gray-400">
                                      <span className="font-medium text-gray-300">{item.stage || 'check'}:</span> {item.message}
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-600">
                                <span>{notification.source || 'system'}</span>
                                {notification.created_at && <span>{new Date(notification.created_at).toLocaleString()}</span>}
                                {notification.acknowledged_at && (
                                  <span>Ack: {new Date(notification.acknowledged_at).toLocaleString()}</span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {notification.status !== 'cleared' && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={isBusy || notification.acknowledged}
                                    onClick={() => acknowledgeNotification(notification.id)}
                                    className="h-8 border-zinc-800 text-xs text-gray-300"
                                  >
                                    {isBusy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                                    Acknowledge
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => clearNotification(notification.id)}
                                    disabled={isBusy}
                                    className="h-8 bg-tropic-gold text-xs text-black hover:bg-tropic-gold-light"
                                  >
                                    {isBusy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                                    Clear
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-black/60">
            <CardContent className="p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-gray-500">
                    <Bell className="h-4 w-4 text-tropic-gold" />
                    DELIVERY WEBHOOKS
                  </div>
                  <p className="mt-1 text-xs text-gray-600">
                    Configure outbound notifications for schedules, crashes, and server events.
                  </p>
                </div>
              </div>

              {webhooks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Webhook className="mb-2 h-8 w-8 text-gray-700" />
                  <p className="text-sm text-gray-500">No webhooks configured</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {webhooks.map((wh) => (
                    <Card key={wh.id} className="border-zinc-800 bg-black/40">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Webhook className="h-4 w-4 text-tropic-gold" />
                              <span className="text-sm font-medium text-gray-200">{wh.name}</span>
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${wh.enabled ? 'border-green-600/30 text-green-400' : 'border-zinc-600/30 text-gray-500'}`}
                              >
                                {wh.enabled ? 'Active' : 'Disabled'}
                              </Badge>
                            </div>
                            <div className="mt-1 truncate font-mono text-xs text-gray-500">{wh.url}</div>
                            <div className="mt-2 flex flex-wrap gap-1">
                              {(wh.events || []).map((ev) => (
                                <Badge key={ev} variant="outline" className="border-zinc-700 text-[9px] text-gray-400">
                                  {ev}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => testWebhook(wh)}
                              disabled={testing === wh.id}
                              className="h-7 border-zinc-800 text-[10px] text-gray-400"
                            >
                              {testing === wh.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteWebhook(wh.id)}
                              className="h-7 text-gray-500 hover:text-red-400"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md border-zinc-800 bg-zinc-950 text-white">
          <DialogHeader>
            <DialogTitle className="text-tropic-gold">Add Webhook</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-400">Name</label>
              <Input
                value={newWebhook.name}
                onChange={(e) => setNewWebhook((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Discord Alerts"
                className="mt-1 border-zinc-800 bg-black/60 text-sm text-white"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400">URL</label>
              <Input
                value={newWebhook.url}
                onChange={(e) => setNewWebhook((prev) => ({ ...prev, url: e.target.value }))}
                placeholder="https://discord.com/api/webhooks/..."
                className="mt-1 border-zinc-800 bg-black/60 font-mono text-sm text-white"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs text-gray-400">Events</label>
              <div className="grid grid-cols-2 gap-1.5">
                {EVENT_TYPES.map((ev) => (
                  <button
                    key={ev}
                    onClick={() => toggleEvent(ev)}
                    className={`rounded border px-2 py-1.5 text-left text-[10px] transition-colors ${
                      newWebhook.events.includes(ev)
                        ? 'border-tropic-gold/30 bg-tropic-gold/10 text-tropic-gold'
                        : 'border-zinc-800 text-gray-500 hover:border-zinc-700'
                    }`}
                  >
                    {ev}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={newWebhook.enabled}
                onCheckedChange={(value) => setNewWebhook((prev) => ({ ...prev, enabled: value }))}
                className="h-4 w-7"
              />
              <span className="text-xs text-gray-400">Enabled</span>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialogOpen(false)}
              className="border-zinc-700 text-gray-400"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={createWebhook}
              disabled={creating || !newWebhook.name || !newWebhook.url}
              className="bg-tropic-gold text-black hover:bg-tropic-gold-light"
            >
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

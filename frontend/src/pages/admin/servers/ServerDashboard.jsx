import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import {
  Server, Plus, Search, RefreshCw, Activity, AlertTriangle,
  Gauge, Wifi, X, Save,
} from 'lucide-react';
import { API } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';
import { hasPermission, PERMISSIONS } from '@/utils/permissions';
import ServerCard from '@/components/servers/ServerCard';

const AUTO_REFRESH_MS = 15_000;
const METRICS_REFRESH_MS = 30_000;
const PERIOD_API_MAP = { '1d': '24h', '7d': '7d', '30d': '7d' };

const EMPTY_FORM = {
  name: '',
  description: '',
  auto_restart: false,
  max_restart_attempts: 3,
  tags: [],
};

function ServerDashboard() {
  const { user } = useAuth();

  /* ── server state ──────────────────────────────────────────────────── */
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [actionError, setActionError] = useState(null);

  /* ── metrics state ─────────────────────────────────────────────────── */
  const [serverMetrics, setServerMetrics] = useState({});
  const [serverPeriods, setServerPeriods] = useState({});
  const periodsRef = useRef(serverPeriods);
  useEffect(() => { periodsRef.current = serverPeriods; }, [serverPeriods]);

  /* ── create-modal state ────────────────────────────────────────────── */
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [tagInput, setTagInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const canManage = user && hasPermission(user.role, PERMISSIONS.MANAGE_SERVERS);

  /* ── fetch servers ─────────────────────────────────────────────────── */
  const fetchServers = useCallback(async (opts = {}) => {
    const { silent = false } = opts;
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const res = await axios.get(`${API}/servers`);
      setServers(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch servers:', err);
      if (!silent) setError(err.response?.data?.detail || 'Failed to load servers.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchServers(); }, [fetchServers]);

  useEffect(() => {
    const id = setInterval(() => fetchServers({ silent: true }), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchServers]);

  /* ── fetch metrics for all servers ─────────────────────────────────── */
  const fetchAllMetrics = useCallback(async (serverList) => {
    if (!serverList || serverList.length === 0) return;
    const currentPeriods = periodsRef.current;
    const results = {};

    await Promise.allSettled(
      serverList.map(async (srv) => {
        const period = currentPeriods[srv.id] || '1d';
        const apiPeriod = PERIOD_API_MAP[period] || '24h';
        try {
          const [summaryRes, tsRes] = await Promise.allSettled([
            axios.get(`${API}/servers/${srv.id}/metrics/summary`),
            axios.get(`${API}/servers/${srv.id}/metrics`, {
              params: { period: apiPeriod, resolution: '5m' },
            }),
          ]);
          results[srv.id] = {
            latest: summaryRes.status === 'fulfilled' ? summaryRes.value.data?.latest ?? null : null,
            timeseries: tsRes.status === 'fulfilled' ? (tsRes.value.data?.metrics ?? []) : [],
          };
        } catch {
          results[srv.id] = { latest: null, timeseries: [] };
        }
      }),
    );

    setServerMetrics((prev) => ({ ...prev, ...results }));
  }, []); // stable — reads periods via ref

  useEffect(() => {
    if (servers.length > 0) fetchAllMetrics(servers);
  }, [servers, fetchAllMetrics]);

  useEffect(() => {
    if (servers.length === 0) return;
    const id = setInterval(() => fetchAllMetrics(servers), METRICS_REFRESH_MS);
    return () => clearInterval(id);
  }, [servers, fetchAllMetrics]);

  /* ── period change (per-server) ────────────────────────────────────── */
  const handlePeriodChange = useCallback(async (serverId, newPeriod) => {
    setServerPeriods((prev) => ({ ...prev, [serverId]: newPeriod }));
    const apiPeriod = PERIOD_API_MAP[newPeriod] || '24h';
    try {
      const res = await axios.get(`${API}/servers/${serverId}/metrics`, {
        params: { period: apiPeriod, resolution: '5m' },
      });
      setServerMetrics((prev) => ({
        ...prev,
        [serverId]: { ...prev[serverId], timeseries: res.data?.metrics ?? [] },
      }));
    } catch (err) {
      console.error(`Failed to fetch metrics for period ${newPeriod}:`, err);
    }
  }, []);

  /* ── quick actions (start / stop / restart) ────────────────────────── */
  const handleAction = useCallback(async (serverId, action) => {
    try {
      await axios.post(`${API}/servers/${serverId}/${action}`);
      setActionError(null);
      await fetchServers({ silent: true });
    } catch (err) {
      console.error(`Server ${action} failed:`, err);
      setActionError(err.response?.data?.detail || `Failed to ${action} server.`);
    }
  }, [fetchServers]);

  const onStart   = useCallback((id) => handleAction(id, 'start'),   [handleAction]);
  const onStop    = useCallback((id) => handleAction(id, 'stop'),    [handleAction]);
  const onRestart = useCallback((id) => handleAction(id, 'restart'), [handleAction]);

  /* ── create server ─────────────────────────────────────────────────── */
  const handleCreate = useCallback(async () => {
    if (!form.name.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await axios.post(`${API}/servers`, {
        name: form.name.trim(),
        description: form.description.trim(),
        tags: form.tags,
        auto_restart: form.auto_restart,
        max_restart_attempts: form.auto_restart ? form.max_restart_attempts : undefined,
      });
      setShowCreateModal(false);
      setForm(EMPTY_FORM);
      setTagInput('');
      await fetchServers({ silent: true });
    } catch (err) {
      console.error('Failed to create server:', err);
      setCreateError(err.response?.data?.detail || 'Failed to create server.');
    } finally {
      setCreating(false);
    }
  }, [form, fetchServers]);

  const addTag = useCallback(() => {
    const tag = tagInput.trim();
    if (tag && !form.tags.includes(tag)) {
      setForm((prev) => ({ ...prev, tags: [...prev.tags, tag] }));
    }
    setTagInput('');
  }, [tagInput, form.tags]);

  const removeTag = useCallback((tag) => {
    setForm((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }));
  }, []);

  /* ── derived data ──────────────────────────────────────────────────── */
  const stats = useMemo(() => {
    const total   = servers.length;
    const running = servers.filter((s) => s.status === 'running').length;
    const issues  = servers.filter((s) => s.status === 'error' || s.status === 'crash_loop').length;
    return { total, running, issues };
  }, [servers]);

  const filteredServers = useMemo(() => {
    if (!searchQuery.trim()) return servers;
    const q = searchQuery.toLowerCase();
    return servers.filter((s) => s.name?.toLowerCase().includes(q));
  }, [servers, searchQuery]);

  /* ── summary bar cards ─────────────────────────────────────────────── */
  const summaryCards = useMemo(() => [
    {
      label: 'Total Servers',
      value: stats.total,
      icon: Server,
      color: 'text-tropic-gold',
      glow: '',
    },
    {
      label: 'Active Servers',
      value: stats.running,
      icon: Activity,
      color: 'text-green-400',
      glow: 'shadow-[0_0_10px_rgba(34,197,94,0.1)]',
    },
    {
      label: 'Issues',
      value: stats.issues,
      icon: AlertTriangle,
      color: 'text-red-400',
      glow: stats.issues > 0 ? 'shadow-[0_0_10px_rgba(248,113,113,0.15)]' : '',
    },
    {
      label: 'Avg FPS',
      value: '\u2014', // em-dash — not available from backend yet
      icon: Gauge,
      color: 'text-emerald-400',
      glow: '',
    },
    {
      label: 'Avg Ping',
      value: '\u2014',
      icon: Wifi,
      color: 'text-blue-400',
      glow: '',
    },
  ], [stats]);

  const openCreateModal = useCallback(() => {
    setForm(EMPTY_FORM);
    setTagInput('');
    setCreateError(null);
    setShowCreateModal(true);
  }, []);

  /* ── render ────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1
            className="text-4xl font-bold tracking-widest text-tropic-gold"
            style={{ fontFamily: 'Rajdhani, sans-serif' }}
          >
            DASHBOARD
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Real-time operational overview {'\u2014'} all 25VID servers.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => fetchServers({ silent: true })}
            className="border-tropic-gold-dark/30 text-tropic-gold hover:bg-tropic-gold/10"
          >
            <RefreshCw className={`mr-1.5 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          {canManage && (
            <Button
              size="sm"
              className="bg-tropic-gold text-black hover:bg-tropic-gold-light"
              onClick={openCreateModal}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              New Server
            </Button>
          )}
        </div>
      </div>

      {/* ── Error banners ───────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-600/30 bg-red-600/10 px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchServers()}
            className="ml-auto text-red-400 hover:text-red-300"
          >
            Retry
          </Button>
        </div>
      )}

      {actionError && (
        <div className="flex items-center gap-3 rounded-lg border border-red-600/30 bg-red-600/10 px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>{actionError}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActionError(null)}
            className="ml-auto text-red-400 hover:text-red-300"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* ── Loading skeleton ────────────────────────────────────────── */}
      {loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} className="animate-pulse border-tropic-gold-dark/10 bg-black/60">
                <CardHeader className="pb-2">
                  <div className="h-4 w-20 rounded bg-zinc-800" />
                </CardHeader>
                <CardContent>
                  <div className="h-7 w-10 rounded bg-zinc-800" />
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Card key={i} className="animate-pulse border-tropic-gold-dark/10 bg-black/60">
                <CardContent className="space-y-3 p-6">
                  <div className="h-5 w-3/4 rounded bg-zinc-800" />
                  <div className="h-4 w-1/2 rounded bg-zinc-800" />
                  <div className="h-4 w-2/3 rounded bg-zinc-800" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── Main content ────────────────────────────────────────────── */}
      {!loading && (
        <>
          {/* Command Center Summary Bar */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {summaryCards.map((stat) => {
              const Icon = stat.icon;
              return (
                <Card
                  key={stat.label}
                  className={`border-tropic-gold-dark/10 bg-black/60 backdrop-blur-sm ${stat.glow}`}
                >
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-xs font-medium uppercase tracking-wider text-gray-500">
                      {stat.label}
                    </CardTitle>
                    <Icon className={`h-4 w-4 ${stat.color}`} />
                  </CardHeader>
                  <CardContent>
                    <div
                      className="text-2xl font-bold text-white"
                      style={{ fontFamily: 'Rajdhani, sans-serif' }}
                    >
                      {stat.value}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search servers by name\u2026"
              className="border-tropic-gold-dark/20 bg-black/60 pl-10 text-white placeholder:text-gray-500 focus-visible:ring-tropic-gold/40"
            />
          </div>

          {/* Server grid — 2 columns on lg */}
          {filteredServers.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {filteredServers.map((server) => (
                <ServerCard
                  key={server.id}
                  server={server}
                  metrics={serverMetrics[server.id] ?? null}
                  period={serverPeriods[server.id] || '1d'}
                  onPeriodChange={handlePeriodChange}
                  onStart={onStart}
                  onStop={onStop}
                  onRestart={onRestart}
                />
              ))}
            </div>
          ) : (
            <Card className="border-tropic-gold-dark/10 bg-black/60">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Activity className="mb-4 h-12 w-12 text-tropic-gold-dark/40" />
                <p className="text-lg font-semibold text-gray-300">
                  {searchQuery ? 'No servers match your search' : 'No servers configured'}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  {searchQuery ? 'Try a different search term.' : 'Add a server to get started.'}
                </p>
                {!searchQuery && canManage && (
                  <Button
                    size="sm"
                    className="mt-4 bg-tropic-gold text-black hover:bg-tropic-gold-light"
                    onClick={openCreateModal}
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    New Server
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Live indicator */}
          <div className="flex items-center justify-end gap-2 text-xs text-gray-600">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-tropic-gold/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-tropic-gold" />
            </span>
            Auto-refreshing every 15 s
          </div>
        </>
      )}

      {/* ── Create Server Modal ─────────────────────────────────────── */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="border-tropic-gold-dark/20 bg-zinc-950 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle
              className="text-xl font-bold tracking-wider text-tropic-gold"
              style={{ fontFamily: 'Rajdhani, sans-serif' }}
            >
              NEW SERVER
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-400">
              Configure a new game server instance.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="srv-name" className="text-sm text-gray-300">
                Server Name <span className="text-red-400">*</span>
              </Label>
              <Input
                id="srv-name"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. US East #1"
                className="border-tropic-gold-dark/20 bg-black/60 text-white placeholder:text-gray-600"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="srv-desc" className="text-sm text-gray-300">
                Description
              </Label>
              <Textarea
                id="srv-desc"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Optional server description\u2026"
                className="border-tropic-gold-dark/20 bg-black/60 text-white placeholder:text-gray-600"
                rows={3}
              />
            </div>

            {/* Auto Restart toggle */}
            <div className="flex items-center justify-between rounded-lg border border-tropic-gold-dark/10 bg-black/40 px-4 py-3">
              <Label htmlFor="srv-autorestart" className="text-sm text-gray-300">
                Auto Restart
              </Label>
              <Switch
                id="srv-autorestart"
                checked={form.auto_restart}
                onCheckedChange={(v) => setForm((p) => ({ ...p, auto_restart: v }))}
              />
            </div>

            {/* Max Restart Attempts — only when auto_restart is on */}
            {form.auto_restart && (
              <div className="space-y-2">
                <Label htmlFor="srv-maxrestart" className="text-sm text-gray-300">
                  Max Restart Attempts
                </Label>
                <Input
                  id="srv-maxrestart"
                  type="number"
                  min={1}
                  max={99}
                  value={form.max_restart_attempts}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      max_restart_attempts: parseInt(e.target.value, 10) || 1,
                    }))
                  }
                  className="w-24 border-tropic-gold-dark/20 bg-black/60 text-white"
                />
              </div>
            )}

            {/* Tags */}
            <div className="space-y-2">
              <Label className="text-sm text-gray-300">Tags</Label>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); addTag(); }
                  }}
                  placeholder="Add tag and press Enter"
                  className="border-tropic-gold-dark/20 bg-black/60 text-white placeholder:text-gray-600"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addTag}
                  className="border-tropic-gold-dark/30 text-tropic-gold hover:bg-tropic-gold/10"
                >
                  Add
                </Button>
              </div>
              {form.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {form.tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="gap-1 bg-tropic-gold/10 text-tropic-gold"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="ml-0.5 rounded-full hover:text-red-400"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Create error */}
            {createError && (
              <div className="rounded-md border border-red-600/30 bg-red-600/10 px-3 py-2 text-sm text-red-400">
                {createError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowCreateModal(false)}
              className="text-gray-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !form.name.trim()}
              className="bg-tropic-gold text-black hover:bg-tropic-gold-light"
            >
              {creating ? (
                <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-4 w-4" />
              )}
              {creating ? 'Creating\u2026' : 'Create Server'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ServerDashboard;

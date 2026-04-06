import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  Gauge, Wifi, X, Save, ChevronDown, ChevronRight,
} from 'lucide-react';
import { API } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';
import { hasPermission, PERMISSIONS } from '@/utils/permissions';
import { isServerDegraded, normalizeServer } from '@/utils/serverStatus';
import ServerCard from '@/components/servers/ServerCard';
import { TerminalTransition, buildServerConnectLines, buildServerProvisionLines } from '@/components/tactical/TerminalTransition';

const AUTO_REFRESH_MS = 15_000;
const METRICS_REFRESH_MS = 30_000;
const PERIOD_API_MAP = { '1d': '24h', '7d': '7d', '30d': '30d' };
const PERIOD_RESOLUTION_MAP = { '1d': '5m', '7d': '1h', '30d': '1h' };

function normalizeMetricPoint(point) {
  return {
    ...point,
    player_count: point.player_count ?? point.max_player_count ?? point.avg_player_count ?? null,
    fps: point.server_fps ?? point.avg_server_fps ?? point.fps ?? null,
    ping: point.avg_player_ping_ms ?? point.ping ?? null,
  };
}

const SECTION_STORAGE_KEY = 'dashboard-sections';

/** Persist collapsible section state to localStorage. */
function loadSections() {
  try {
    const raw = localStorage.getItem(SECTION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveSections(state) {
  try { localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(state)); } catch {}
}

/** Collapsible section header — mirrors AdminLayout SidebarGroup pattern. */
function SectionHeader({ label, open, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-2 py-2 text-[10px] font-bold tracking-[0.25em] text-[#4a6070] hover:text-[#e8c547] transition-colors"
      style={{ fontFamily: "'Oswald', sans-serif" }}
    >
      {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      {label}
    </button>
  );
}

const EMPTY_FORM = {
  name: '',
  description: '',
  auto_restart: false,
  max_restart_attempts: 3,
  log_stats_enabled: true,
  max_fps: 120,
  startup_parameters: '',
  tags: [],
  sat_enabled: true,
};

function ServerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

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

  /* ── collapsible section state (persisted) ─────────────────────────── */
  const [sections, setSections] = useState(() => {
    const stored = loadSections();
    return stored ?? { status: true, servers: true };
  });
  const toggleSection = useCallback((key) => {
    setSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveSections(next);
      return next;
    });
  }, []);

  /* ── terminal transition state ─────────────────────────────────────── */
  const [transition, setTransition] = useState(null);

  /* ── create-modal state ────────────────────────────────────────────── */
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [tagInput, setTagInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  // Only admin / s1_personnel can create servers (matches backend auth)
  const canManage =
    user && hasPermission(user.role, PERMISSIONS.MANAGE_SERVERS) &&
    ['admin', 's1_personnel'].includes(user.role);

  /* ── fetch servers ─────────────────────────────────────────────────── */
  const fetchServers = useCallback(async (opts = {}) => {
    const { silent = false } = opts;
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const res = await axios.get(`${API}/servers`);
      setServers(Array.isArray(res.data) ? res.data.map(normalizeServer) : []);
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
              params: { period: apiPeriod, resolution: PERIOD_RESOLUTION_MAP[period] || '5m' },
            }),
          ]);
          results[srv.id] = {
            latest: summaryRes.status === 'fulfilled' ? summaryRes.value.data?.latest ?? null : null,
            timeseries: tsRes.status === 'fulfilled' ? (tsRes.value.data?.metrics ?? []).map(normalizeMetricPoint) : [],
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
        params: { period: apiPeriod, resolution: PERIOD_RESOLUTION_MAP[newPeriod] || '5m' },
      });
      setServerMetrics((prev) => ({
        ...prev,
        [serverId]: { ...prev[serverId], timeseries: (res.data?.metrics ?? []).map(normalizeMetricPoint) },
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
      const res = await axios.post(`${API}/servers`, {
        name: form.name.trim(),
        description: form.description.trim(),
        tags: form.tags,
        auto_restart: form.auto_restart,
        max_restart_attempts: form.auto_restart ? form.max_restart_attempts : undefined,
        log_stats_enabled: form.log_stats_enabled,
        max_fps: Math.max(30, parseInt(form.max_fps, 10) || 120),
        startup_parameters: String(form.startup_parameters || '')
          .split(/\r?\n|,/)
          .map((value) => value.trim())
          .filter(Boolean),
        sat_enabled: form.sat_enabled,
      });
      const createdServer = normalizeServer(res.data);
      if (createdServer.deployment_state !== 'created') {
        setCreateError(
          createdServer.summary_message
          || createdServer.last_docker_error
          || 'Server creation failed before the container was created.'
        );
        await fetchServers({ silent: true });
        return;
      }
      setShowCreateModal(false);
      setForm(EMPTY_FORM);
      setTagInput('');
      await fetchServers({ silent: true });
      setTransition({ lines: buildServerProvisionLines(createdServer.name), dest: `/admin/servers/${createdServer.id}` });
    } catch (err) {
      console.error('Failed to create server:', err);
      setCreateError(err.response?.data?.detail || 'Failed to create server.');
    } finally {
      setCreating(false);
    }
  }, [fetchServers, form, navigate]);

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
    const issues  = servers.filter((s) => ['error', 'crash_loop'].includes(s.status) || isServerDegraded(s)).length;
    return { total, running, issues };
  }, [servers]);

  const dashboardAverages = useMemo(() => {
    const latestMetrics = Object.values(serverMetrics)
      .map((entry) => entry?.latest)
      .filter(Boolean);

    const averageOf = (values) => {
      const numeric = values.filter((value) => Number.isFinite(value));
      if (!numeric.length) return null;
      return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
    };

    return {
      fps: averageOf(latestMetrics.map((metric) => metric.server_fps ?? metric.fps ?? null)),
      ping: averageOf(latestMetrics.map((metric) => metric.avg_player_ping_ms ?? metric.ping ?? null)),
    };
  }, [serverMetrics]);

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
      color: 'text-[#e8c547]',
      glow: '',
    },
    {
      label: 'Active Servers',
      value: stats.running,
      icon: Activity,
      color: 'text-[#e8c547]',
      glow: 'shadow-[0_0_10px_rgba(201,162,39,0.1)]',
    },
    {
      label: 'Issues',
      value: stats.issues,
      icon: AlertTriangle,
      color: 'text-[#ff3333]',
      glow: stats.issues > 0 ? 'shadow-[0_0_10px_rgba(255,51,51,0.15)]' : '',
    },
    {
      label: 'Avg FPS',
      value: dashboardAverages.fps != null ? `${dashboardAverages.fps.toFixed(1)}` : '\u2014',
      icon: Gauge,
      color: 'text-[#e8c547]',
      glow: '',
    },
    {
      label: 'Avg Ping',
      value: dashboardAverages.ping != null ? `${dashboardAverages.ping.toFixed(0)} ms` : '\u2014',
      icon: Wifi,
      color: 'text-[#00aaff]',
      glow: '',
    },
  ], [dashboardAverages.fps, dashboardAverages.ping, stats]);

  const openCreateModal = useCallback(() => {
    setForm(EMPTY_FORM);
    setTagInput('');
    setCreateError(null);
    setShowCreateModal(true);
  }, []);

  const handleServerNavigate = useCallback((serverId, serverName) => {
    setTransition({ lines: buildServerConnectLines(serverName), dest: `/admin/servers/${serverId}` });
  }, []);

  /* ── render ────────────────────────────────────────────────────────── */

  if (transition) {
    return (
      <TerminalTransition
        lines={transition.lines}
        onComplete={() => navigate(transition.dest)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="relative corner-bracket border border-[rgba(201,162,39,0.15)] bg-[radial-gradient(circle_at_top,rgba(201,162,39,0.06),#050a0e_58%)] px-6 py-7 shadow-2xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#c9a227]" style={{ fontFamily: "'Oswald', sans-serif" }}>Server Nerve Center</p>
            <h1
              className="mt-2 text-4xl font-black uppercase tracking-[0.12em] text-[#e8c547]"
              style={{ fontFamily: "'Share Tech', sans-serif" }}
            >
              DASHBOARD
            </h1>
            <p className="mt-2 text-sm text-[#8a9aa8]" style={{ fontFamily: "'Inter', sans-serif" }}>
              Real-time operational overview {'\u2014'} all 25VID servers.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              disabled={refreshing}
              onClick={() => fetchServers({ silent: true })}
              className="tactical-button px-4 py-2 text-xs font-bold uppercase tracking-wider bg-[#111a24] text-[#e8c547] border border-[rgba(201,162,39,0.3)] hover:bg-[rgba(201,162,39,0.08)] hover:border-[rgba(201,162,39,0.5)] disabled:opacity-40 transition-colors"
              style={{ fontFamily: "'Oswald', sans-serif" }}
            >
              <RefreshCw className={`mr-1.5 h-4 w-4 inline-block ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            {canManage && (
              <button
                onClick={openCreateModal}
                className="tactical-button px-4 py-2 text-xs font-bold uppercase tracking-wider bg-[#111a24] text-[#e8c547] border border-[rgba(201,162,39,0.3)] hover:bg-[rgba(201,162,39,0.08)] hover:border-[rgba(201,162,39,0.5)] transition-colors"
                style={{ fontFamily: "'Oswald', sans-serif" }}
              >
                <Plus className="mr-1.5 h-4 w-4 inline-block" />
                New Server
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Error banners ───────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-3 border border-[rgba(255,51,51,0.3)] bg-[rgba(255,51,51,0.06)] px-4 py-3 text-sm text-[#ff3333]">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{error}</span>
          <button
            onClick={() => fetchServers()}
            className="tactical-button ml-auto px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#ff3333] border border-[rgba(255,51,51,0.3)] hover:bg-[rgba(255,51,51,0.08)] transition-colors"
            style={{ fontFamily: "'Oswald', sans-serif" }}
          >
            Retry
          </button>
        </div>
      )}

      {actionError && (
        <div className="flex items-center gap-3 border border-[rgba(255,51,51,0.3)] bg-[rgba(255,51,51,0.06)] px-4 py-3 text-sm text-[#ff3333]">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="tactical-button ml-auto px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#ff3333] border border-[rgba(255,51,51,0.3)] hover:bg-[rgba(255,51,51,0.08)] transition-colors"
            style={{ fontFamily: "'Oswald', sans-serif" }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Loading skeleton ────────────────────────────────────────── */}
      {loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="relative animate-pulse border border-[rgba(201,162,39,0.08)] bg-[#0c1117] p-0">
                <div className="px-5 pt-4 pb-2">
                  <div className="h-4 w-20 bg-[#111a24]" />
                </div>
                <div className="px-5 pb-5">
                  <div className="h-7 w-10 bg-[#111a24]" />
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="relative animate-pulse border border-[rgba(201,162,39,0.08)] bg-[#0c1117] p-6 space-y-3">
                <div className="h-5 w-3/4 bg-[#111a24]" />
                <div className="h-4 w-1/2 bg-[#111a24]" />
                <div className="h-4 w-2/3 bg-[#111a24]" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Main content ────────────────────────────────────────────── */}
      {!loading && (
        <>
          {/* ── STATUS OVERVIEW (collapsible) ───────────────────────── */}
          <SectionHeader
            label="STATUS OVERVIEW"
            open={sections.status}
            onToggle={() => toggleSection('status')}
          />
          <div
            className="overflow-hidden transition-all duration-200 ease-in-out"
            style={{
              maxHeight: sections.status ? '1000px' : '0px',
              opacity: sections.status ? 1 : 0,
            }}
          >
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {summaryCards.map((stat) => {
                const Icon = stat.icon;
                return (
                  <div
                    key={stat.label}
                    className={`relative border border-[rgba(201,162,39,0.1)] bg-[#0c1117] shadow-xl ${stat.glow}`}
                  >
                    <div className="corner-bracket" />
                    <div className="flex items-center justify-between px-5 pt-4 pb-2">
                      <span
                        className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4a6070]"
                        style={{ fontFamily: "'Oswald', sans-serif" }}
                      >
                        {stat.label}
                      </span>
                      <div className="border border-[rgba(201,162,39,0.15)] bg-[#050a0e] p-2">
                        <Icon className={`h-4 w-4 ${stat.color}`} />
                      </div>
                    </div>
                    <div className="px-5 pb-5">
                      <div
                        className="text-2xl font-bold text-[#e8c547]"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {stat.value}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── SERVERS (collapsible) ────────────────────────────────── */}
          <SectionHeader
            label="SERVERS"
            open={sections.servers}
            onToggle={() => toggleSection('servers')}
          />
          <div
            className="overflow-hidden transition-all duration-200 ease-in-out space-y-6"
            style={{
              maxHeight: sections.servers ? '9999px' : '0px',
              opacity: sections.servers ? 1 : 0,
            }}
          >
            {/* Search bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4a6070]" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search servers by name..."
                className="border-[rgba(201,162,39,0.15)] bg-[#050a0e] pl-10 text-[#d0d8e0] placeholder:text-[#4a6070] focus-visible:ring-[rgba(201,162,39,0.3)] rounded-none"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
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
                    onNavigate={handleServerNavigate}
                  />
                ))}
              </div>
            ) : (
              <div className="relative border border-[rgba(201,162,39,0.1)] bg-[#0c1117]">
                <div className="corner-bracket" />
                <div className="flex flex-col items-center justify-center py-16 text-center px-5">
                  <Activity className="mb-4 h-12 w-12 text-[#4a6070]" />
                  <p className="text-lg font-semibold text-[#d0d8e0]" style={{ fontFamily: "'Share Tech', sans-serif" }}>
                    {searchQuery ? 'No servers match your search' : 'No servers configured'}
                  </p>
                  <p className="mt-1 text-sm text-[#4a6070]" style={{ fontFamily: "'Inter', sans-serif" }}>
                    {searchQuery ? 'Try a different search term.' : 'Add a server to get started.'}
                  </p>
                  {!searchQuery && canManage && (
                    <button
                      className="tactical-button mt-4 px-4 py-2 text-xs font-bold uppercase tracking-wider bg-[#111a24] text-[#e8c547] border border-[rgba(201,162,39,0.3)] hover:bg-[rgba(201,162,39,0.08)] transition-colors"
                      style={{ fontFamily: "'Oswald', sans-serif" }}
                      onClick={openCreateModal}
                    >
                      <Plus className="mr-1.5 h-4 w-4 inline-block" />
                      New Server
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Live indicator */}
          <div className="flex items-center justify-end gap-2 text-xs text-[#4a6070]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            <span className="status-dot status-dot-online" />
            Auto-refreshing every 15 s
          </div>
        </>
      )}

      {/* ── Create Server Modal ─────────────────────────────────────── */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="border-[rgba(201,162,39,0.15)] bg-[#0c1117] rounded-none sm:max-w-lg">
          <DialogHeader>
            <DialogTitle
              className="text-xl font-black uppercase tracking-[0.12em] text-[#e8c547]"
              style={{ fontFamily: "'Share Tech', sans-serif" }}
            >
              NEW SERVER
            </DialogTitle>
            <DialogDescription className="text-sm text-[#8a9aa8]" style={{ fontFamily: "'Inter', sans-serif" }}>
              Create the dashboard record and container now. First-boot provisioning continues inside the server workspace after deployment succeeds.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="srv-name" className="text-xs uppercase tracking-wider text-[#8a9aa8]" style={{ fontFamily: "'Oswald', sans-serif" }}>
                Server Name <span className="text-[#ff3333]">*</span>
              </Label>
              <Input
                id="srv-name"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. US East #1"
                className="border-[rgba(201,162,39,0.15)] bg-[#050a0e] text-[#d0d8e0] placeholder:text-[#4a6070] rounded-none"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="srv-desc" className="text-xs uppercase tracking-wider text-[#8a9aa8]" style={{ fontFamily: "'Oswald', sans-serif" }}>
                Description
              </Label>
              <Textarea
                id="srv-desc"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Optional server description..."
                className="border-[rgba(201,162,39,0.15)] bg-[#050a0e] text-[#d0d8e0] placeholder:text-[#4a6070] rounded-none"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
                rows={3}
              />
            </div>

            {/* Auto Restart toggle */}
            <div className="flex items-center justify-between border border-[rgba(201,162,39,0.1)] bg-[#050a0e] px-4 py-3">
              <Label htmlFor="srv-autorestart" className="text-xs uppercase tracking-wider text-[#8a9aa8]" style={{ fontFamily: "'Oswald', sans-serif" }}>
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
                <Label htmlFor="srv-maxrestart" className="text-xs uppercase tracking-wider text-[#8a9aa8]" style={{ fontFamily: "'Oswald', sans-serif" }}>
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
                  className="w-24 border-[rgba(201,162,39,0.15)] bg-[#050a0e] text-[#d0d8e0] rounded-none"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                />
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between border border-[rgba(201,162,39,0.1)] bg-[#050a0e] px-4 py-3">
                <Label htmlFor="srv-logstats" className="text-xs uppercase tracking-wider text-[#8a9aa8]" style={{ fontFamily: "'Oswald', sans-serif" }}>
                  Enable logStats
                </Label>
                <Switch
                  id="srv-logstats"
                  checked={form.log_stats_enabled}
                  onCheckedChange={(value) => setForm((prev) => ({ ...prev, log_stats_enabled: value }))}
                />
              </div>
              <div className="flex items-center justify-between border border-[rgba(201,162,39,0.1)] bg-[#050a0e] px-4 py-3">
                <div>
                  <Label htmlFor="srv-sat" className="text-xs uppercase tracking-wider text-[#8a9aa8]" style={{ fontFamily: "'Oswald', sans-serif" }}>
                    Server Admin Tools
                  </Label>
                  <p className="mt-0.5 text-[10px] text-[#4a6070]">Auto-inject the SAT mod for admin tooling</p>
                </div>
                <Switch
                  id="srv-sat"
                  checked={form.sat_enabled}
                  onCheckedChange={(value) => setForm((prev) => ({ ...prev, sat_enabled: value }))}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="srv-maxfps" className="text-xs uppercase tracking-wider text-[#8a9aa8]" style={{ fontFamily: "'Oswald', sans-serif" }}>
                  Max FPS
                </Label>
                <Input
                  id="srv-maxfps"
                  type="number"
                  min={30}
                  max={240}
                  value={form.max_fps}
                  onChange={(e) => setForm((prev) => ({ ...prev, max_fps: parseInt(e.target.value, 10) || 120 }))}
                  className="border-[rgba(201,162,39,0.15)] bg-[#050a0e] text-[#d0d8e0] rounded-none"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="srv-startup-params" className="text-xs uppercase tracking-wider text-[#8a9aa8]" style={{ fontFamily: "'Oswald', sans-serif" }}>
                Extra Startup Parameters
              </Label>
              <Textarea
                id="srv-startup-params"
                value={form.startup_parameters}
                onChange={(e) => setForm((prev) => ({ ...prev, startup_parameters: e.target.value }))}
                placeholder="-profileVerbose&#10;-SomeFlag value"
                className="border-[rgba(201,162,39,0.15)] bg-[#050a0e] text-[#d0d8e0] placeholder:text-[#4a6070] rounded-none"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
                rows={3}
              />
              <p className="text-xs text-[#4a6070]" style={{ fontFamily: "'Inter', sans-serif" }}>
                One parameter per line. <code className="text-[#e8c547]">-logstats</code> and the default telemetry flags are managed separately so the dashboard stays ready by default.
              </p>
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-[#8a9aa8]" style={{ fontFamily: "'Oswald', sans-serif" }}>Tags</Label>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); addTag(); }
                  }}
                  placeholder="Add tag and press Enter"
                  className="border-[rgba(201,162,39,0.15)] bg-[#050a0e] text-[#d0d8e0] placeholder:text-[#4a6070] rounded-none"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                />
                <button
                  type="button"
                  onClick={addTag}
                  className="tactical-button px-3 py-1.5 text-xs font-bold uppercase tracking-wider bg-[#111a24] text-[#e8c547] border border-[rgba(201,162,39,0.3)] hover:bg-[rgba(201,162,39,0.08)] transition-colors"
                  style={{ fontFamily: "'Oswald', sans-serif" }}
                >
                  Add
                </button>
              </div>
              {form.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {form.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 border border-[rgba(201,162,39,0.2)] bg-[rgba(201,162,39,0.06)] px-2 py-0.5 text-xs text-[#e8c547]"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="ml-0.5 hover:text-[#ff3333]"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Create error */}
            {createError && (
              <div className="border border-[rgba(255,51,51,0.3)] bg-[rgba(255,51,51,0.06)] px-3 py-2 text-sm text-[#ff3333]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {createError}
              </div>
            )}
          </div>

          <DialogFooter>
            <button
              onClick={() => setShowCreateModal(false)}
              className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#8a9aa8] hover:text-[#d0d8e0] transition-colors"
              style={{ fontFamily: "'Oswald', sans-serif" }}
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !form.name.trim()}
              className="tactical-button px-4 py-2 text-xs font-bold uppercase tracking-wider bg-[#111a24] text-[#e8c547] border border-[rgba(201,162,39,0.3)] hover:bg-[rgba(201,162,39,0.08)] hover:border-[rgba(201,162,39,0.5)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              style={{ fontFamily: "'Oswald', sans-serif" }}
            >
              {creating ? (
                <RefreshCw className="mr-1.5 h-4 w-4 animate-spin inline-block" />
              ) : (
                <Save className="mr-1.5 h-4 w-4 inline-block" />
              )}
              {creating ? 'Creating...' : 'Create And Open'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ServerDashboard;

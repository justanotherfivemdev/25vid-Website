import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Activity,
  Clock,
  Users,
  Cpu,
  HardDrive,
  AlertTriangle,
  Puzzle,
  Settings,
  Network,
  Server,
  Loader2,
  CheckCircle,
  BarChart3,
  Play,
  Square,
  RotateCcw,
  ShieldAlert,
  RefreshCw,
  Lock,
} from 'lucide-react';
import { API } from '@/utils/api';
import { canRestartServer, canStartServer, canStopServer, isServerDegraded, normalizeServer } from '@/utils/serverStatus';

function OverviewModule() {
  const { server: rawServer, serverId, fetchServer, handleServerAction, actionLoading } = useOutletContext();
  const server = normalizeServer(rawServer);
  const [metricsSummary, setMetricsSummary] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const fetchOverviewData = useCallback(async () => {
    try {
      const [metricsRes, incidentsRes] = await Promise.allSettled([
        axios.get(`${API}/servers/${serverId}/metrics/summary`),
        axios.get(`${API}/servers/${serverId}/incidents?status=open`),
      ]);
      if (metricsRes.status === 'fulfilled') setMetricsSummary(metricsRes.value.data);
      if (incidentsRes.status === 'fulfilled') setIncidents(incidentsRes.value.data?.incidents || incidentsRes.value.data || []);
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => { fetchOverviewData(); }, [fetchOverviewData]);

  useEffect(() => {
    const iv = setInterval(fetchOverviewData, 15_000);
    return () => clearInterval(iv);
  }, [fetchOverviewData]);

  const latest = metricsSummary?.latest || {};
  const trend = metricsSummary?.trend_24h || {};
  const status = server?.status || 'stopped';
  const isRunning = status === 'running';
  const canStart = canStartServer(server);
  const canStop = canStopServer(server);
  const canRestart = canRestartServer(server);
  const modCount = server?.mods?.length || 0;
  const ports = server?.ports || {};
  const troubleshooting = server?.troubleshooting || {};
  const serverAdminToolsConfigTarget = troubleshooting.profile_directory || troubleshooting.cd_target || '';
  const serverAdminToolsInstalled = (server?.mods || []).some((mod) => {
    const haystack = `${mod.name || ''} ${mod.mod_id || mod.modId || ''}`.toLowerCase();
    return haystack.includes('server admin tools');
  });
  const startupParameters = Array.isArray(server?.startup_parameters) ? server.startup_parameters : [];
  const logStatsEnabled = server?.log_stats_enabled !== false;
  const maxFps = server?.max_fps ?? 120;
  const [locking, setLocking] = useState(false);

  const handleLockdown = useCallback(async () => {
    setLocking(true);
    try {
      await axios.post(`${API}/servers/${serverId}/rcon`, { command: '#lock' });
    } finally {
      setLocking(false);
    }
  }, [serverId]);

  const handleReset = useCallback(async () => {
    setResetting(true);
    try {
      await axios.post(`${API}/servers/${serverId}/reset`);
      await fetchServer(true);
      await fetchOverviewData();
      setResetDialogOpen(false);
    } finally {
      setResetting(false);
    }
  }, [fetchOverviewData, fetchServer, serverId]);

  const formatUptime = (seconds) => {
    if (!seconds) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
    return `${h}h ${m}m`;
  };

  const healthCards = [
    {
      label: 'CPU Usage',
      value: latest.cpu_host_percent != null || latest.cpu_percent != null ? `${(latest.cpu_host_percent ?? latest.cpu_percent).toFixed(1)}%` : 'Unavailable',
      icon: Cpu,
      color: 'text-blue-400',
      border: 'border-blue-600/20',
      trend: trend.avg_cpu != null ? `Avg: ${trend.avg_cpu.toFixed(1)}%` : 'Container metric',
    },
    {
      label: 'Memory',
      value: latest.memory_mb != null ? `${latest.memory_mb.toFixed(0)} MB` : 'Unavailable',
      icon: HardDrive,
      color: 'text-purple-400',
      border: 'border-purple-600/20',
      trend: trend.avg_memory != null ? `Avg: ${trend.avg_memory.toFixed(0)} MB` : 'Container metric',
    },
    {
      label: 'Players',
      value: latest.player_count != null ? `${latest.player_count}/${latest.max_players || '?'}` : 'Unavailable',
      icon: Users,
      color: 'text-green-400',
      border: 'border-green-600/20',
      trend: latest.metric_sources?.player_count ? `Source: ${latest.metric_sources.player_count}` : 'Awaiting live RCON data',
    },
    {
      label: 'Uptime',
      value: formatUptime(latest.uptime_seconds),
      icon: Clock,
      color: 'text-tropic-gold',
      border: 'border-tropic-gold-dark/20',
      trend: server?.last_started ? `Since: ${new Date(server.last_started).toLocaleString()}` : null,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Health Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {healthCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className={`${card.border} bg-black/60 backdrop-blur-sm`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-gray-500">{card.label}</span>
                  <Icon className={`h-4 w-4 ${card.color}`} />
                </div>
                <div className="mt-2 text-2xl font-bold text-white" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                  {loading ? <div className="h-8 w-16 animate-pulse rounded bg-zinc-800" /> : card.value}
                </div>
                {card.trend && (
                  <div className="mt-1 text-[11px] text-gray-600">{card.trend}</div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Provisioning Stages */}
      {(isServerDegraded(server) || server?.status === 'error') &&
        server?.provisioning_stages && Object.keys(server.provisioning_stages).length > 0 && (
        <Card className={`border ${
          isServerDegraded(server)
            ? 'border-amber-600/30 bg-amber-600/5'
            : 'border-red-600/30 bg-red-600/5'
        }`}>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className={`h-4 w-4 ${
                isServerDegraded(server) ? 'text-amber-300' : 'text-red-400'
              }`} />
              <span className={isServerDegraded(server) ? 'text-amber-300' : 'text-red-400'}>
                {isServerDegraded(server)
                  ? 'Provisioning Stages — Created With Follow-up Work'
                  : 'Provisioning Stages — Failed Before Runtime'}
              </span>
            </div>
            <div className="space-y-2">
              {Object.values(server.provisioning_stages).map((stage) => (
                <div key={stage.name} className="flex items-center gap-3 text-xs">
                  <div className={`flex h-5 w-5 items-center justify-center rounded-full ${
                    stage.status === 'success' ? 'bg-green-600/20' :
                    stage.status === 'failed' ? 'bg-red-600/20' :
                    'bg-zinc-600/20'
                  }`}>
                    {stage.status === 'success' ? (
                      <CheckCircle className="h-3 w-3 text-green-400" />
                    ) : stage.status === 'failed' ? (
                      <AlertTriangle className="h-3 w-3 text-red-400" />
                    ) : (
                      <Activity className="h-3 w-3 text-gray-600" />
                    )}
                  </div>
                  <div className="flex-1">
                    <span className={`font-medium capitalize ${
                      stage.status === 'success' ? 'text-green-400' :
                      stage.status === 'failed' ? 'text-red-400' :
                      'text-gray-500'
                    }`}>
                      {stage.name.replace(/_/g, ' ')}
                    </span>
                    {stage.message && (
                      <span className="ml-2 text-gray-600">{stage.message}</span>
                    )}
                  </div>
                  {stage.error && (
                    <span className="text-red-400/80">{stage.error}</span>
                  )}
                </div>
              ))}
            </div>
            {(server.summary_message || server.last_docker_error) && (
              <p className="mt-3 border-t border-zinc-800 pt-2 text-xs text-gray-500">{server.summary_message || server.last_docker_error}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Open Incidents Alert */}
      {incidents.length > 0 && (
        <div className="rounded-lg border border-red-600/30 bg-red-600/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-400">
            <AlertTriangle className="h-4 w-4" />
            {incidents.length} Open Incident{incidents.length > 1 ? 's' : ''}
          </div>
          <div className="space-y-2">
            {incidents.slice(0, 3).map((inc, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-gray-400">
                <Badge variant="outline" className={`text-[10px] ${
                  inc.severity === 'critical' ? 'border-red-600/50 text-red-400' :
                  inc.severity === 'high' ? 'border-amber-600/50 text-amber-400' :
                  'border-zinc-600/50 text-zinc-400'
                }`}>
                  {inc.severity?.toUpperCase()}
                </Badge>
                <span className="text-gray-300">{inc.title}</span>
                <span className="ml-auto text-gray-600">{inc.detected_at ? new Date(inc.detected_at).toLocaleString() : ''}</span>
              </div>
            ))}
          </div>
          <Link to="admin/incidents" className="mt-2 inline-block text-xs text-red-400 hover:text-red-300">
            View all incidents →
          </Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Server Identity */}
        <Card className="border-zinc-800 bg-black/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-wider text-gray-300">
              <Server className="h-4 w-4 text-tropic-gold" /> SERVER IDENTITY
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Name" value={server.name} />
            <DetailRow label="Description" value={server.description || '—'} />
            <DetailRow label="Docker Image" value={server.docker_image} mono />
            <DetailRow label="Container" value={troubleshooting.actual_container_name || server.container_name} mono />
            <DetailRow label="Created By" value={server.created_by || '—'} />
            <DetailRow label="Created" value={server.created_at ? new Date(server.created_at).toLocaleString() : '—'} />
          </CardContent>
        </Card>

        {/* Network & Ports */}
        <Card className="border-zinc-800 bg-black/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-wider text-gray-300">
              <Network className="h-4 w-4 text-tropic-gold" /> NETWORK
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Game Port" value={ports.game || '2001'} mono />
            <DetailRow label="Query Port" value={ports.query || '17777'} mono />
            <DetailRow label="RCON Port" value={ports.rcon || '19999'} mono />
            <div className="pt-2">
              <span className="text-xs font-medium text-gray-500">Tags</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {(server.tags || []).length > 0 ? server.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="border-tropic-gold-dark/30 text-tropic-gold text-[10px]">
                    {tag}
                  </Badge>
                )) : <span className="text-xs text-gray-600">No tags</span>}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Mods Summary */}
        <Card className="border-zinc-800 bg-black/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-wider text-gray-300">
              <Puzzle className="h-4 w-4 text-tropic-gold" /> MODS
              <Badge variant="outline" className="ml-auto border-zinc-700 text-xs text-gray-400">{modCount}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {modCount > 0 ? (
              <div className="space-y-1.5">
                {server.mods.slice(0, 5).map((mod, i) => (
                  <div key={i} className="flex items-center gap-2 rounded border border-zinc-800/50 bg-zinc-900/30 px-3 py-1.5 text-xs">
                    <span className="text-gray-400">{i + 1}.</span>
                    <span className="text-gray-200">{mod.name || mod.mod_id || mod.modId}</span>
                  </div>
                ))}
                {modCount > 5 && (
                  <Link to="mods" className="block pt-1 text-xs text-tropic-gold hover:text-tropic-gold-light">
                    +{modCount - 5} more mods →
                  </Link>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-600">No mods configured</p>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="border-zinc-800 bg-black/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-wider text-gray-300">
              <Activity className="h-4 w-4 text-tropic-gold" /> OPERATIONS
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="outline" size="sm" onClick={() => handleServerAction?.('start')} disabled={!canStart || actionLoading === 'start' || resetting}
                className="justify-start border-green-700/30 text-green-400 hover:bg-green-700/10 hover:text-green-300">
                {actionLoading === 'start' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />} Start
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleServerAction?.('stop')} disabled={!canStop || actionLoading === 'stop' || resetting}
                className="justify-start border-red-700/30 text-red-400 hover:bg-red-700/10 hover:text-red-300">
                {actionLoading === 'stop' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Square className="mr-2 h-4 w-4" />} Shutdown
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleServerAction?.('restart')} disabled={!canRestart || actionLoading === 'restart' || resetting}
                className="justify-start border-amber-700/30 text-amber-400 hover:bg-amber-700/10 hover:text-amber-300">
                {actionLoading === 'restart' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />} Restart
              </Button>
              <Button variant="outline" size="sm" onClick={handleLockdown} disabled={!isRunning || locking || !!actionLoading}
                className="justify-start border-purple-700/30 text-purple-400 hover:bg-purple-700/10 hover:text-purple-300">
                {locking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />} Lockdown
              </Button>
              <Button variant="outline" size="sm" onClick={() => setResetDialogOpen(true)} disabled={resetting || !!actionLoading}
                className="justify-start border-red-800/40 text-red-300 hover:bg-red-900/20 hover:text-red-200 sm:col-span-2">
                {resetting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Reset
              </Button>
            </div>
            <p className="rounded border border-red-700/30 bg-red-900/10 px-3 py-2 text-xs text-gray-300">
              Reset removes all mods, restores baseline server settings, and returns the server to its original post-creation state.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Link to="console" className="block">
                <Button variant="outline" size="sm" className="w-full justify-start border-zinc-800 text-gray-300 hover:border-tropic-gold-dark/30 hover:text-tropic-gold">
                  <Activity className="mr-2 h-4 w-4" /> View Console Logs
                </Button>
              </Link>
              <Link to="rcon" className="block">
                <Button variant="outline" size="sm" className="w-full justify-start border-zinc-800 text-gray-300 hover:border-tropic-gold-dark/30 hover:text-tropic-gold">
                  <Settings className="mr-2 h-4 w-4" /> Open RCON Console
                </Button>
              </Link>
              <Link to="config/server" className="block">
                <Button variant="outline" size="sm" className="w-full justify-start border-zinc-800 text-gray-300 hover:border-tropic-gold-dark/30 hover:text-tropic-gold">
                  <Settings className="mr-2 h-4 w-4" /> Edit Configuration
                </Button>
              </Link>
              <Link to="metrics" className="block">
                <Button variant="outline" size="sm" className="w-full justify-start border-zinc-800 text-gray-300 hover:border-tropic-gold-dark/30 hover:text-tropic-gold">
                  <BarChart3 className="mr-2 h-4 w-4" /> View Metrics
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-zinc-800 bg-black/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-wider text-gray-300">
              <ShieldAlert className="h-4 w-4 text-tropic-gold" /> SERVER ADMIN TOOLS
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Installed" value={serverAdminToolsInstalled ? 'Detected in mod list' : 'Not detected'} />
            <DetailRow label="Config Target" value={serverAdminToolsConfigTarget ? `${serverAdminToolsConfigTarget}/ServerAdminTools_Config.json` : '—'} mono />
            <DetailRow label="Bootstrap Status" value={serverAdminToolsInstalled ? 'Ready for admin troubleshooting' : 'Awaiting mod installation'} />
            <DetailRow label="logStats" value={logStatsEnabled ? 'Enabled by runtime defaults' : 'Disabled'} />
            <DetailRow label="Max FPS" value={String(maxFps)} mono />
            <div>
              <span className="text-xs font-medium text-gray-500">Startup Parameters</span>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {startupParameters.length > 0 ? startupParameters.map((param) => (
                  <Badge key={param} variant="outline" className="border-zinc-700 text-gray-300">{param}</Badge>
                )) : <span className="text-xs text-gray-600">No extra startup parameters configured</span>}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-black/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-wider text-gray-300">
              <Settings className="h-4 w-4 text-tropic-gold" /> TROUBLESHOOTING
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Actual Container" value={troubleshooting.actual_container_name || '—'} mono />
            <DetailRow label="Working Path" value={troubleshooting.working_directory || '—'} mono />
            <DetailRow label="Config Directory" value={troubleshooting.config_directory || '—'} mono />
            <DetailRow label="Profile Directory" value={troubleshooting.profile_directory || '—'} mono />
            <DetailRow label="Tell admin to cd into" value={troubleshooting.cd_target || '—'} mono />
          </CardContent>
        </Card>
      </div>

      {/* Auto-refresh indicator */}
      <div className="flex items-center justify-end gap-2 text-xs text-gray-600">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-tropic-gold/60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-tropic-gold" />
        </span>
        Auto-refreshing
      </div>

      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="border-red-700/30 bg-zinc-950 text-white">
          <DialogHeader>
            <DialogTitle className="text-red-300">Reset Server</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-300">
            This will remove all mods, restore baseline server settings, and return the server to its original post-creation state.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setResetDialogOpen(false)} className="border-zinc-700 text-gray-300">
              Cancel
            </Button>
            <Button size="sm" onClick={handleReset} disabled={resetting} className="bg-red-600 text-white hover:bg-red-500">
              {resetting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
              Confirm Reset
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ label, value, mono }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <span className={`text-right text-sm text-gray-200 ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}

export default OverviewModule;

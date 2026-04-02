import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Activity,
  Clock,
  Users,
  Cpu,
  HardDrive,
  AlertTriangle,
  Play,
  Square,
  RotateCcw,
  Puzzle,
  Settings,
  Tag,
  Calendar,
  Network,
  Server,
  Loader2,
  CheckCircle,
  XCircle,
  ArrowUpRight,
  BarChart3,
} from 'lucide-react';
import { API } from '@/utils/api';

function OverviewModule() {
  const { server, serverId, fetchServer, canManage } = useOutletContext();
  const [metricsSummary, setMetricsSummary] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);

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
  const modCount = server?.mods?.length || 0;
  const ports = server?.ports || {};

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
      value: latest.cpu_percent != null ? `${latest.cpu_percent.toFixed(1)}%` : '—',
      icon: Cpu,
      color: 'text-blue-400',
      border: 'border-blue-600/20',
      trend: trend.avg_cpu != null ? `Avg: ${trend.avg_cpu.toFixed(1)}%` : null,
    },
    {
      label: 'Memory',
      value: latest.memory_mb != null ? `${latest.memory_mb.toFixed(0)} MB` : '—',
      icon: HardDrive,
      color: 'text-purple-400',
      border: 'border-purple-600/20',
      trend: trend.avg_memory != null ? `Avg: ${trend.avg_memory.toFixed(0)} MB` : null,
    },
    {
      label: 'Players',
      value: latest.player_count != null ? `${latest.player_count}/${latest.max_players || '?'}` : '—',
      icon: Users,
      color: 'text-green-400',
      border: 'border-green-600/20',
      trend: trend.max_player_count != null ? `Peak: ${trend.max_player_count}` : null,
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
            <DetailRow label="Container" value={server.container_name} mono />
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
              <Activity className="h-4 w-4 text-tropic-gold" /> QUICK ACTIONS
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
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

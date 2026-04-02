import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  BarChart3,
  Cpu,
  HardDrive,
  Network,
  Users,
  Clock,
  RefreshCw,
  Loader2,
  TrendingUp,
  TrendingDown,
  Activity,
} from 'lucide-react';
import { API } from '@/utils/api';

const PERIODS = [
  { value: '1h', label: '1 Hour' },
  { value: '6h', label: '6 Hours' },
  { value: '24h', label: '24 Hours' },
  { value: '7d', label: '7 Days' },
];

function MetricsModule() {
  const { server, serverId } = useOutletContext();
  const [metrics, setMetrics] = useState([]);
  const [summary, setSummary] = useState(null);
  const [period, setPeriod] = useState('1h');
  const [loading, setLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const [metricsRes, summaryRes] = await Promise.allSettled([
        axios.get(`${API}/servers/${serverId}/metrics?period=${period}&resolution=${period === '7d' ? '1h' : period === '24h' ? '5m' : '1m'}`),
        axios.get(`${API}/servers/${serverId}/metrics/summary`),
      ]);
      if (metricsRes.status === 'fulfilled') setMetrics(metricsRes.value.data?.metrics || []);
      if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value.data);
    } finally {
      setLoading(false);
    }
  }, [serverId, period]);

  useEffect(() => { fetchMetrics(); }, [fetchMetrics]);

  useEffect(() => {
    const iv = setInterval(fetchMetrics, 30_000);
    return () => clearInterval(iv);
  }, [fetchMetrics]);

  const latest = summary?.latest || {};
  const trend = summary?.trend_24h || {};

  const summaryCards = [
    {
      label: 'CPU',
      value: latest.cpu_percent != null ? `${latest.cpu_percent.toFixed(1)}%` : '—',
      avg: trend.avg_cpu != null ? `${trend.avg_cpu.toFixed(1)}%` : null,
      icon: Cpu,
      color: 'text-blue-400',
      border: 'border-blue-600/20',
      bg: 'bg-blue-600/5',
    },
    {
      label: 'Memory',
      value: latest.memory_mb != null ? `${latest.memory_mb.toFixed(0)} MB` : '—',
      avg: trend.avg_memory != null ? `${trend.avg_memory.toFixed(0)} MB` : null,
      icon: HardDrive,
      color: 'text-purple-400',
      border: 'border-purple-600/20',
      bg: 'bg-purple-600/5',
    },
    {
      label: 'Network RX',
      value: latest.network_rx_bytes != null ? formatBytes(latest.network_rx_bytes) : '—',
      icon: Network,
      color: 'text-cyan-400',
      border: 'border-cyan-600/20',
      bg: 'bg-cyan-600/5',
    },
    {
      label: 'Network TX',
      value: latest.network_tx_bytes != null ? formatBytes(latest.network_tx_bytes) : '—',
      icon: Network,
      color: 'text-teal-400',
      border: 'border-teal-600/20',
      bg: 'bg-teal-600/5',
    },
    {
      label: 'Players',
      value: latest.player_count != null ? `${latest.player_count}` : '—',
      avg: trend.max_player_count != null ? `Peak: ${trend.max_player_count}` : null,
      icon: Users,
      color: 'text-green-400',
      border: 'border-green-600/20',
      bg: 'bg-green-600/5',
    },
    {
      label: 'Uptime',
      value: latest.uptime_seconds != null ? formatUptime(latest.uptime_seconds) : '—',
      icon: Clock,
      color: 'text-tropic-gold',
      border: 'border-tropic-gold-dark/20',
      bg: 'bg-tropic-gold/5',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wider text-gray-300" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
          PERFORMANCE METRICS
        </h2>
        <div className="flex items-center gap-2">
          {PERIODS.map((p) => (
            <Button key={p.value} size="sm" variant={period === p.value ? 'default' : 'outline'}
              onClick={() => setPeriod(p.value)}
              className={`h-7 text-xs ${period === p.value
                ? 'bg-tropic-gold text-black hover:bg-tropic-gold-light'
                : 'border-zinc-800 text-gray-400 hover:text-white'
              }`}>
              {p.label}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={fetchMetrics}
            className="h-7 border-zinc-800 text-xs text-gray-400">
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className={`${card.border} ${card.bg}`}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">{card.label}</span>
                  <Icon className={`h-3.5 w-3.5 ${card.color}`} />
                </div>
                <div className="mt-1.5 text-xl font-bold text-white" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                  {loading ? <div className="h-6 w-12 animate-pulse rounded bg-zinc-800" /> : card.value}
                </div>
                {card.avg && <div className="mt-0.5 text-[10px] text-gray-600">{card.avg}</div>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Metrics timeline - simplified chart using CSS */}
      <Card className="border-zinc-800 bg-black/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-wider text-gray-300">
            <Activity className="h-4 w-4 text-tropic-gold" /> RESOURCE USAGE TIMELINE
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-tropic-gold" />
            </div>
          ) : metrics.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-600">
              <BarChart3 className="mb-3 h-8 w-8 text-gray-700" />
              <p className="text-sm">No metrics data available</p>
              <p className="mt-1 text-xs">Metrics are collected every 15 seconds for running servers</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* CPU Chart */}
              <MetricBar
                label="CPU Usage"
                data={metrics}
                dataKey="cpu_percent"
                unit="%"
                maxVal={100}
                color="bg-blue-500"
                trackColor="bg-blue-500/10"
              />
              {/* Memory Chart */}
              <MetricBar
                label="Memory"
                data={metrics}
                dataKey="memory_mb"
                unit=" MB"
                maxVal={Math.max(...metrics.map(m => m.memory_limit_mb || m.memory_mb || 1), 1)}
                color="bg-purple-500"
                trackColor="bg-purple-500/10"
              />
              {/* Player Count Chart */}
              <MetricBar
                label="Players"
                data={metrics}
                dataKey="player_count"
                unit=""
                maxVal={Math.max(...metrics.map(m => m.max_players || 64), 1)}
                color="bg-green-500"
                trackColor="bg-green-500/10"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data point count */}
      <div className="flex items-center justify-end text-xs text-gray-600">
        {metrics.length} data points • {period} window
      </div>
    </div>
  );
}

function MetricBar({ label, data, dataKey, unit, maxVal, color, trackColor }) {
  if (!data.length) return null;
  const values = data.map(d => d[dataKey] ?? 0);
  const latest = values[values.length - 1];
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const maxV = Math.max(...values);

  // Show last ~60 data points as a mini bar chart
  const displayData = data.slice(-60);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-400">{label}</span>
        <div className="flex items-center gap-3 text-[10px] text-gray-500">
          <span>Current: <strong className="text-gray-300">{typeof latest === 'number' ? latest.toFixed(1) : latest}{unit}</strong></span>
          <span>Avg: <strong className="text-gray-400">{avg.toFixed(1)}{unit}</strong></span>
          <span>Max: <strong className="text-gray-400">{maxV.toFixed(1)}{unit}</strong></span>
        </div>
      </div>
      <div className={`flex h-10 items-end gap-px overflow-hidden rounded ${trackColor}`}>
        {displayData.map((d, i) => {
          const val = d[dataKey] ?? 0;
          const pct = maxVal > 0 ? Math.min(100, (val / maxVal) * 100) : 0;
          return (
            <div key={i} className="flex-1" title={`${val.toFixed?.(1) ?? val}${unit}`}>
              <div className={`${color} rounded-t transition-all`} style={{ height: `${Math.max(1, pct)}%` }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let idx = 0;
  let val = bytes;
  while (val >= 1024 && idx < units.length - 1) { val /= 1024; idx++; }
  return `${val.toFixed(1)} ${units[idx]}`;
}

function formatUptime(seconds) {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${m}m`;
}

export default MetricsModule;

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  BarChart3,
  Clock,
  Cpu,
  HardDrive,
  Loader2,
  Network,
  RefreshCw,
  Users,
} from 'lucide-react';
import { API } from '@/utils/api';

const PERIODS = [
  { value: '1h', label: '1 Hour' },
  { value: '6h', label: '6 Hours' },
  { value: '24h', label: '1 Day' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
];

const RESOLUTION_MAP = {
  '1h': '1m',
  '6h': '1m',
  '24h': '5m',
  '7d': '1h',
  '30d': '1h',
};

function normalizeMetricPoint(point) {
  return {
    ...point,
    cpu_percent: point.cpu_host_percent ?? point.cpu_percent ?? point.avg_cpu_percent ?? 0,
    cpu_host_percent: point.cpu_host_percent ?? point.cpu_percent ?? point.avg_cpu_percent ?? 0,
    cpu_raw_percent: point.cpu_raw_percent ?? point.avg_cpu_raw_percent ?? 0,
    memory_mb: point.memory_mb ?? point.avg_memory_mb ?? 0,
    player_count: point.player_count ?? point.max_player_count ?? point.avg_player_count ?? 0,
    server_fps: point.server_fps ?? point.avg_server_fps ?? point.fps ?? null,
    avg_player_ping_ms: point.avg_player_ping_ms ?? point.ping ?? null,
    network_rx_bytes: point.network_rx_bytes ?? point.max_network_rx_bytes ?? 0,
    network_tx_bytes: point.network_tx_bytes ?? point.max_network_tx_bytes ?? 0,
  };
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let index = 0;
  let value = bytes;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[index]}`;
}

function formatUptime(seconds) {
  if (!seconds) return 'N/A';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  return `${hours}h ${minutes}m`;
}

function formatTick(timestamp, period) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (period === '7d' || period === '30d') {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded border border-zinc-800 bg-[#050a0e]/95 px-3 py-2 text-xs shadow-xl">
      <div className="mb-2 text-[#8a9aa8]">{label}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4">
          <span style={{ color: entry.color }}>{entry.name}</span>
          <span className="text-[#d0d8e0]">
            {entry.value == null ? 'N/A' : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function getNumericValues(points, key) {
  return points
    .map((point) => point[key])
    .filter((value) => Number.isFinite(value));
}

function getPaddedDomain(values, { floor = 0, minimumSpan = 1 } = {}) {
  if (!values.length) return [floor, floor + minimumSpan];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    const pad = Math.max(minimumSpan, Math.abs(max) * 0.15 || minimumSpan);
    return [Math.max(floor, min - pad), max + pad];
  }
  const span = Math.max(max - min, minimumSpan);
  const pad = Math.max(minimumSpan * 0.2, span * 0.15);
  return [Math.max(floor, min - pad), max + pad];
}

function ChartShell({ title, subtitle, icon: Icon, children }) {
  return (
    <Card className="border-zinc-800 bg-[#050a0e]/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-wider text-[#8a9aa8]">
          <Icon className="h-4 w-4 text-tropic-gold" />
          {title}
        </CardTitle>
        {subtitle ? <p className="text-xs text-[#4a6070]">{subtitle}</p> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function EmptyChartState({ loading }) {
  return (
    <div className="flex h-[280px] flex-col items-center justify-center text-[#4a6070]">
      {loading ? <Loader2 className="mb-3 h-6 w-6 animate-spin text-tropic-gold" /> : <BarChart3 className="mb-3 h-8 w-8 text-[#4a6070]" />}
      <p className="text-sm">{loading ? 'Loading metrics...' : 'No metrics available yet'}</p>
      <p className="mt-1 text-xs">Metrics are collected while the server is running.</p>
    </div>
  );
}

function SparseChartState({ label }) {
  return (
    <div className="flex h-[280px] flex-col items-center justify-center text-[#4a6070]">
      <BarChart3 className="mb-3 h-8 w-8 text-[#4a6070]" />
      <p className="text-sm">More telemetry is needed for {label.toLowerCase()}.</p>
      <p className="mt-1 text-xs">The summary cards show the current sample, but the chart waits for a usable series.</p>
    </div>
  );
}

function MetricsModule() {
  const { serverId } = useOutletContext();
  const [metrics, setMetrics] = useState([]);
  const [summary, setSummary] = useState(null);
  const [period, setPeriod] = useState('24h');
  const [loading, setLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const [metricsRes, summaryRes] = await Promise.allSettled([
        axios.get(`${API}/servers/${serverId}/metrics`, {
          params: { period, resolution: RESOLUTION_MAP[period] || '5m' },
        }),
        axios.get(`${API}/servers/${serverId}/metrics/summary`),
      ]);

      if (metricsRes.status === 'fulfilled') {
        setMetrics((metricsRes.value.data?.metrics || []).map(normalizeMetricPoint));
      } else {
        setMetrics([]);
      }

      if (summaryRes.status === 'fulfilled') {
        setSummary(summaryRes.value.data);
      } else {
        setSummary(null);
      }
    } finally {
      setLoading(false);
    }
  }, [period, serverId]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  useEffect(() => {
    const intervalId = setInterval(fetchMetrics, 30_000);
    return () => clearInterval(intervalId);
  }, [fetchMetrics]);

  const latest = summary?.latest || {};
  const trend = summary?.trend_24h || {};

  const chartData = useMemo(() => metrics.map((point) => ({
    ...point,
    tick: formatTick(point.timestamp, period),
    rx_mb: Number((point.network_rx_bytes / (1024 * 1024)).toFixed(2)),
    tx_mb: Number((point.network_tx_bytes / (1024 * 1024)).toFixed(2)),
    ping_ms: point.avg_player_ping_ms != null ? Number(point.avg_player_ping_ms.toFixed(1)) : null,
    fps: point.server_fps != null ? Number(point.server_fps.toFixed(1)) : null,
  })), [metrics, period]);

  const cpuValues = getNumericValues(chartData, 'cpu_host_percent');
  const memoryValues = getNumericValues(chartData, 'memory_mb');
  const playerValues = getNumericValues(chartData, 'player_count');
  const pingValues = getNumericValues(chartData, 'ping_ms');
  const fpsValues = getNumericValues(chartData, 'fps');
  const rxValues = getNumericValues(chartData, 'rx_mb');
  const txValues = getNumericValues(chartData, 'tx_mb');

  const cpuMemoryPointCount = Math.max(cpuValues.length, memoryValues.length);
  const playerPingPointCount = Math.max(playerValues.length, pingValues.length);
  const fpsPointCount = fpsValues.length;
  const networkPointCount = Math.max(rxValues.length, txValues.length);

  const cpuDomain = getPaddedDomain(cpuValues, { floor: 0, minimumSpan: 10 });
  const memoryDomain = getPaddedDomain(memoryValues, { floor: 0, minimumSpan: 64 });
  const playerDomain = getPaddedDomain(playerValues, { floor: 0, minimumSpan: 4 });
  const pingDomain = getPaddedDomain(pingValues, { floor: 0, minimumSpan: 20 });
  const fpsDomain = getPaddedDomain(fpsValues, { floor: 0, minimumSpan: 10 });
  const networkDomain = getPaddedDomain([...rxValues, ...txValues], { floor: 0, minimumSpan: 1 });

  const summaryCards = [
    {
      label: 'CPU',
      value: latest.cpu_host_percent != null || latest.cpu_percent != null ? `${(latest.cpu_host_percent ?? latest.cpu_percent).toFixed(1)}%` : 'Unavailable',
      avg: trend.avg_cpu != null ? `${trend.avg_cpu.toFixed(1)}% avg` : 'Container metric',
      icon: Cpu,
      color: 'text-blue-400',
      border: 'border-blue-600/20',
      bg: 'bg-blue-600/5',
    },
    {
      label: 'Memory',
      value: latest.memory_mb != null ? `${latest.memory_mb.toFixed(0)} MB` : 'Unavailable',
      avg: trend.avg_memory != null ? `${trend.avg_memory.toFixed(0)} MB avg` : 'Container metric',
      icon: HardDrive,
      color: 'text-purple-400',
      border: 'border-purple-600/20',
      bg: 'bg-purple-600/5',
    },
    {
      label: 'Server FPS',
      value: latest.server_fps != null ? `${latest.server_fps.toFixed(1)}` : 'Unavailable',
      avg: trend.avg_server_fps != null ? `${trend.avg_server_fps.toFixed(1)} avg` : 'Requires logStats',
      icon: Activity,
      color: 'text-emerald-400',
      border: 'border-emerald-600/20',
      bg: 'bg-emerald-600/5',
    },
    {
      label: 'Players',
      value: latest.player_count != null ? `${latest.player_count}/${latest.max_players || '?'}` : 'Unavailable',
      avg: trend.max_player_count != null ? `Peak ${trend.max_player_count}` : 'A2S / RCON metric',
      icon: Users,
      color: 'text-green-400',
      border: 'border-green-600/20',
      bg: 'bg-green-600/5',
    },
    {
      label: 'Avg Ping',
      value: latest.avg_player_ping_ms != null ? `${latest.avg_player_ping_ms.toFixed(0)} ms` : 'Unavailable',
      avg: trend.avg_player_ping_ms != null ? `${trend.avg_player_ping_ms.toFixed(0)} ms avg` : 'Requires live players',
      icon: Users,
      color: 'text-amber-300',
      border: 'border-amber-500/20',
      bg: 'bg-amber-500/5',
    },
    {
      label: 'Network RX',
      value: latest.network_rx_bytes != null ? formatBytes(latest.network_rx_bytes) : 'Unavailable',
      avg: null,
      icon: Network,
      color: 'text-cyan-400',
      border: 'border-cyan-600/20',
      bg: 'bg-cyan-600/5',
    },
    {
      label: 'Network TX',
      value: latest.network_tx_bytes != null ? formatBytes(latest.network_tx_bytes) : 'Unavailable',
      avg: null,
      icon: Network,
      color: 'text-teal-400',
      border: 'border-teal-600/20',
      bg: 'bg-teal-600/5',
    },
    {
      label: 'Uptime',
      value: latest.uptime_seconds != null ? formatUptime(latest.uptime_seconds) : 'Unavailable',
      avg: null,
      icon: Clock,
      color: 'text-tropic-gold',
      border: 'border-tropic-gold-dark/20',
      bg: 'bg-tropic-gold/5',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wider text-[#8a9aa8]" style={{ fontFamily: "'Share Tech', sans-serif" }}>
          PERFORMANCE METRICS
        </h2>
        <div className="flex items-center gap-2">
          {PERIODS.map((option) => (
            <Button
              key={option.value}
              size="sm"
              variant={period === option.value ? 'default' : 'outline'}
              onClick={() => setPeriod(option.value)}
              className={`h-7 text-xs ${
                period === option.value
                  ? 'bg-tropic-gold text-black hover:bg-tropic-gold-light'
                  : 'border-zinc-800 text-[#8a9aa8] hover:text-white'
              }`}
            >
              {option.label}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={fetchMetrics} className="h-7 border-zinc-800 text-xs text-[#8a9aa8]">
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className={`${card.border} ${card.bg}`}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-[#4a6070]">{card.label}</span>
                  <Icon className={`h-3.5 w-3.5 ${card.color}`} />
                </div>
                <div className="mt-1.5 text-xl font-bold text-white" style={{ fontFamily: "'Share Tech', sans-serif" }}>
                  {loading ? <div className="h-6 w-12 animate-pulse rounded bg-zinc-800" /> : card.value}
                </div>
                {card.avg ? <div className="mt-0.5 text-[10px] text-[#4a6070]">{card.avg}</div> : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartShell title="CPU & Memory" subtitle="Container load over time." icon={Cpu}>
          {chartData.length === 0 ? (
            <EmptyChartState loading={loading} />
          ) : cpuMemoryPointCount < 2 ? (
            <SparseChartState label="CPU and memory" />
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="cpuFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="memoryFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#27272a" vertical={false} />
                  <XAxis dataKey="tick" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} minTickGap={24} />
                  <YAxis yAxisId="cpu" domain={cpuDomain} tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} width={36} />
                  <YAxis yAxisId="memory" domain={memoryDomain} orientation="right" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} width={42} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area yAxisId="cpu" type="monotone" dataKey="cpu_host_percent" name="CPU %" stroke="#60a5fa" fill="url(#cpuFill)" strokeWidth={2} />
                  <Area yAxisId="memory" type="monotone" dataKey="memory_mb" name="Memory MB" stroke="#a855f7" fill="url(#memoryFill)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartShell>

        <ChartShell title="Players & Ping" subtitle="Population and latency, with A2S and RCON fallbacks." icon={Users}>
          {chartData.length === 0 ? (
            <EmptyChartState loading={loading} />
          ) : playerPingPointCount < 2 ? (
            <SparseChartState label="players and ping" />
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#27272a" vertical={false} />
                  <XAxis dataKey="tick" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} minTickGap={24} />
                  <YAxis yAxisId="players" domain={playerDomain} tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} width={36} />
                  <YAxis yAxisId="ping" domain={pingDomain} orientation="right" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} width={42} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line yAxisId="players" type="monotone" dataKey="player_count" name="Players" stroke="#22c55e" strokeWidth={2} dot={playerValues.length <= 2 ? { r: 2 } : false} connectNulls />
                  <Line yAxisId="ping" type="monotone" dataKey="ping_ms" name="Ping ms" stroke="#f59e0b" strokeWidth={2} dot={pingValues.length <= 2 ? { r: 2 } : false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartShell>

        <ChartShell title="Server FPS" subtitle="Derived from logStats. Provisioning now enables it by default." icon={Activity}>
          {chartData.length === 0 || !chartData.some((point) => point.fps != null) ? (
            <EmptyChartState loading={loading} />
          ) : fpsPointCount < 2 ? (
            <SparseChartState label="server FPS" />
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#27272a" vertical={false} />
                  <XAxis dataKey="tick" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} minTickGap={24} />
                  <YAxis domain={fpsDomain} tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} width={36} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="fps" name="Server FPS" stroke="#10b981" strokeWidth={2.5} dot={fpsValues.length <= 2 ? { r: 2 } : false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartShell>

        <ChartShell title="Network Throughput" subtitle="RX and TX volume captured from Docker stats." icon={Network}>
          {chartData.length === 0 ? (
            <EmptyChartState loading={loading} />
          ) : networkPointCount < 2 ? (
            <SparseChartState label="network throughput" />
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="rxFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="txFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#14b8a6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#27272a" vertical={false} />
                  <XAxis dataKey="tick" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} minTickGap={24} />
                  <YAxis domain={networkDomain} tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="rx_mb" name="RX MB" stroke="#06b6d4" fill="url(#rxFill)" strokeWidth={2} />
                  <Area type="monotone" dataKey="tx_mb" name="TX MB" stroke="#14b8a6" fill="url(#txFill)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartShell>
      </div>

      <div className="flex items-center justify-end text-xs text-[#4a6070]">
        {chartData.length} data points - {PERIODS.find((option) => option.value === period)?.label || period}
      </div>
    </div>
  );
}

export default MetricsModule;

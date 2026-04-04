import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, Square, RotateCcw, Users, Gauge, Wifi } from 'lucide-react';
import { LineChart, Line, Tooltip, ResponsiveContainer, YAxis } from 'recharts';
import { canRestartServer, canStartServer, canStopServer, isServerDegraded, normalizeServer } from '@/utils/serverStatus';

const PERIODS = ['1d', '7d', '30d'];

function getStatusVisuals(status) {
  switch (status) {
    case 'running':
      return {
        glow: 'shadow-[0_0_15px_rgba(34,197,94,0.15)]',
        dotCls: 'h-2.5 w-2.5 rounded-full bg-green-400 animate-pulse',
      };
    case 'degraded':
      return {
        glow: 'shadow-[0_0_18px_rgba(245,158,11,0.22)]',
        dotCls: 'h-2.5 w-2.5 rounded-full bg-amber-300 animate-pulse',
      };
    case 'error':
    case 'crash_loop':
      return {
        glow: 'shadow-[0_0_15px_rgba(239,68,68,0.2)]',
        dotCls: 'h-2.5 w-2.5 rounded-full bg-red-500 animate-[blink_1s_step-end_infinite]',
      };
    case 'starting':
    case 'stopping':
      return {
        glow: '',
        dotCls: 'h-2.5 w-2.5 rounded-full bg-amber-400 animate-spin border-t-2 border-amber-200',
      };
    case 'stopped':
    case 'created':
    default:
      return {
        glow: '',
        dotCls: 'h-2.5 w-2.5 rounded-full bg-zinc-600',
      };
  }
}

function formatGraphTime(timestamp) {
  if (!timestamp) return '';
  try {
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded border border-tropic-gold-dark/30 bg-[#050a0e]/95 px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 text-tropic-gold-dark">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}: {entry.value ?? '-'}
        </p>
      ))}
    </div>
  );
}

function getNumericValues(series, key) {
  return series
    .map((item) => item[key])
    .filter((value) => Number.isFinite(value));
}

function getPaddedDomain(values, minimumSpan = 1) {
  if (!values.length) return [0, minimumSpan];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    const pad = Math.max(minimumSpan, Math.abs(max) * 0.15 || minimumSpan);
    return [Math.max(0, min - pad), max + pad];
  }
  const span = Math.max(max - min, minimumSpan);
  const pad = Math.max(minimumSpan * 0.2, span * 0.15);
  return [Math.max(0, min - pad), max + pad];
}

function StatBox({ icon: Icon, label, value }) {
  return (
    <div className="flex flex-1 items-center gap-2 rounded bg-zinc-900/60 px-3 py-2">
      <Icon className="h-3.5 w-3.5 shrink-0 text-tropic-gold-dark" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-tropic-gold-dark">{label}</p>
        <p className="truncate text-sm font-semibold text-[#d0d8e0]">{value ?? '-'}</p>
      </div>
    </div>
  );
}

function MetricSparkline({ label, value, data, dataKey, color, emptyLabel }) {
  const numericValues = getNumericValues(data, dataKey);
  const domain = getPaddedDomain(numericValues, dataKey === 'Players' ? 2 : 1);

  return (
    <div className="grid grid-cols-[64px_72px_1fr] items-center gap-3 rounded-lg bg-zinc-950/60 px-3 py-2">
      <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-tropic-gold-dark">{label}</span>
      <span className="text-sm font-semibold text-[#d0d8e0]">{value}</span>
      {numericValues.length < 2 ? (
        <div className="flex h-10 items-center justify-end text-[11px] text-zinc-500">
          {emptyLabel}
        </div>
      ) : (
        <div className="h-10">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
              <YAxis hide domain={domain} />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey={dataKey}
                name={label}
                stroke={color}
                strokeWidth={2}
                dot={numericValues.length <= 2 ? { r: 2 } : false}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function ServerCard({ server, metrics, onStart, onStop, onRestart, onPeriodChange, period = '1d' }) {
  if (!server) return null;

  const normalized = normalizeServer(server);
  const displayStatus = normalized.status === 'running' && isServerDegraded(normalized) ? 'degraded' : normalized.status;
  const { id, name, description } = normalized;
  const { glow, dotCls } = getStatusVisuals(displayStatus);

  const latest = metrics?.latest;
  const timeseries = metrics?.timeseries;
  const hasTimeseries = Array.isArray(timeseries) && timeseries.length > 0;

  const graphData = hasTimeseries
    ? timeseries.map((point) => ({
        time: formatGraphTime(point.timestamp),
        FPS: point.fps ?? null,
        Players: point.player_count ?? null,
        Ping: point.ping ?? null,
      }))
    : [];

  const canStart = canStartServer(normalized);
  const canStop = canStopServer(normalized);
  const canRestart = canRestartServer(normalized);
  const showFooter = (canStart && onStart) || (canStop && onStop) || (canRestart && onRestart);

  return (
    <Card
      className={`group flex flex-col border-tropic-gold-dark/15 bg-[#050a0e]/80 backdrop-blur-sm transition-all duration-200 hover:border-tropic-gold/30 hover:bg-[#050a0e]/90 ${glow}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <Link to={`/admin/servers/${id}`} className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-tropic-gold-light transition-colors group-hover:text-tropic-gold">
              {name || 'Unnamed Server'}
            </h3>
          </Link>
          <span className={dotCls} role="img" aria-hidden="true" />
          <span className="sr-only">Server status: {displayStatus}</span>
        </div>
        {description && (
          <p className="mt-1 line-clamp-1 text-xs text-[#4a6070]">{description}</p>
        )}
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3 pb-3">
        <div className="flex gap-2">
          <StatBox icon={Users} label="Players" value={latest?.player_count ?? 'Unavailable'} />
          <StatBox icon={Gauge} label="FPS" value={latest?.server_fps ?? latest?.fps ?? 'Unavailable'} />
          <StatBox icon={Wifi} label="Ping" value={latest?.avg_player_ping_ms != null ? `${latest.avg_player_ping_ms}ms` : 'Unavailable'} />
        </div>

        <div className="flex-1 rounded bg-zinc-900/40 p-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-tropic-gold-dark">
              Performance Trends
            </span>
            <div className="flex gap-1">
              {PERIODS.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={period === value}
                  onClick={() => onPeriodChange?.(id, value)}
                  className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    period === value
                      ? 'bg-tropic-gold/20 text-tropic-gold'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          {hasTimeseries ? (
            <div className="space-y-2">
              <MetricSparkline
                label="FPS"
                value={latest?.server_fps != null || latest?.fps != null ? `${latest?.server_fps ?? latest?.fps}` : 'N/A'}
                data={graphData}
                dataKey="FPS"
                color="#22c55e"
                emptyLabel="Waiting for logStats samples"
              />
              <MetricSparkline
                label="Players"
                value={latest?.player_count != null ? `${latest.player_count}` : 'N/A'}
                data={graphData}
                dataKey="Players"
                color="#c9a227"
                emptyLabel="Collecting player samples"
              />
              <MetricSparkline
                label="Ping"
                value={latest?.avg_player_ping_ms != null ? `${latest.avg_player_ping_ms}ms` : 'N/A'}
                data={graphData}
                dataKey="Ping"
                color="#3b82f6"
                emptyLabel="Collecting latency samples"
              />
            </div>
          ) : (
            <div className="flex h-[120px] items-center justify-center text-xs text-zinc-600">
              Collecting telemetry
            </div>
          )}
        </div>
      </CardContent>

      {showFooter && (
        <CardFooter className="gap-2 border-t border-tropic-gold-dark/10 pt-3">
          {canStart && onStart && (
            <Button
              variant="outline"
              size="sm"
              className="border-green-700/40 text-green-400 transition-all hover:bg-green-600/15 hover:text-green-300 hover:shadow-[0_0_14px_rgba(34,197,94,0.18)]"
              onClick={() => onStart(id)}
            >
              <Play className="mr-1 h-3.5 w-3.5" />
              Start
            </Button>
          )}

          {canStop && onStop && (
            <Button
              variant="outline"
              size="sm"
              className="border-red-700/40 text-red-400 transition-all hover:bg-red-600/15 hover:text-red-300 hover:shadow-[0_0_14px_rgba(239,68,68,0.18)]"
              onClick={() => onStop(id)}
            >
              <Square className="mr-1 h-3.5 w-3.5" />
              Stop
            </Button>
          )}

          {canRestart && onRestart && (
            <Button
              variant="outline"
              size="sm"
              className="border-amber-700/40 text-amber-400 transition-all hover:bg-amber-600/15 hover:text-amber-300 hover:shadow-[0_0_14px_rgba(245,158,11,0.18)]"
              onClick={() => onRestart(id)}
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Restart
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  );
}

export default ServerCard;

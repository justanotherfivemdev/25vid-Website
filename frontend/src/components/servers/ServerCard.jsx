import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, Square, RotateCcw, Users, Gauge, Wifi } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const STARTABLE = new Set(['stopped', 'created', 'error']);
const STOPPABLE = new Set(['running']);
const RESTARTABLE = new Set(['running']);

const PERIODS = ['1d', '7d'];

function getStatusVisuals(status) {
  switch (status) {
    case 'running':
      return {
        glow: 'shadow-[0_0_15px_rgba(34,197,94,0.15)]',
        dotCls: 'h-2.5 w-2.5 rounded-full bg-green-400 animate-pulse',
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
      return {
        glow: '',
        dotCls: 'h-2.5 w-2.5 rounded-full bg-zinc-600',
      };
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
    const d = new Date(timestamp);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded border border-tropic-gold-dark/30 bg-black/95 px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 text-tropic-gold-dark">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}: {entry.value ?? '—'}
        </p>
      ))}
    </div>
  );
}

function StatBox({ icon: Icon, label, value }) {
  return (
    <div className="flex flex-1 items-center gap-2 rounded bg-zinc-900/60 px-3 py-2">
      <Icon className="h-3.5 w-3.5 shrink-0 text-tropic-gold-dark" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-tropic-gold-dark">{label}</p>
        <p className="truncate text-sm font-semibold text-gray-200">{value ?? '—'}</p>
      </div>
    </div>
  );
}

function ServerCard({ server, metrics, onStart, onStop, onRestart, onPeriodChange, period = '1d' }) {
  if (!server) return null;

  const { id, name, description, status } = server;
  const { glow, dotCls } = getStatusVisuals(status);

  const latest = metrics?.latest;
  const timeseries = metrics?.timeseries;
  const hasTimeseries = Array.isArray(timeseries) && timeseries.length > 0;

  const graphData = hasTimeseries
    ? timeseries.map((pt) => ({
        time: formatGraphTime(pt.timestamp),
        FPS: pt.fps ?? null,
        Players: pt.player_count ?? null,
        Ping: pt.ping ?? null,
      }))
    : [];

  const canStart = STARTABLE.has(status);
  const canStop = STOPPABLE.has(status);
  const canRestart = RESTARTABLE.has(status);
  const showFooter = (canStart && onStart) || (canStop && onStop) || (canRestart && onRestart);

  return (
    <Card
      className={`group flex flex-col border-tropic-gold-dark/15 bg-black/80 backdrop-blur-sm transition-all duration-200 hover:border-tropic-gold/30 hover:bg-black/90 ${glow}`}
    >
      {/* Top Section */}
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <Link to={`/admin/servers/${id}`} className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-tropic-gold-light transition-colors group-hover:text-tropic-gold">
              {name || 'Unnamed Server'}
            </h3>
          </Link>
          <span className={dotCls} role="img" aria-label={status} />
          <span className="sr-only">{status}</span>
        </div>
        {description && (
          <p className="mt-1 text-xs text-gray-500 line-clamp-1">{description}</p>
        )}
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3 pb-3">
        {/* Metrics Row */}
        <div className="flex gap-2">
          <StatBox icon={Users} label="Players" value={latest?.player_count} />
          <StatBox icon={Gauge} label="FPS" value={latest?.fps} />
          <StatBox icon={Wifi} label="Ping" value={latest?.ping != null ? `${latest.ping}ms` : undefined} />
        </div>

        {/* Graph Area */}
        <div className="flex-1 rounded bg-zinc-900/40 p-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-tropic-gold-dark">
              Performance
            </span>
            <div className="flex gap-1">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={period === p}
                  onClick={() => onPeriodChange?.(id, p)}
                  className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    period === p
                      ? 'bg-tropic-gold/20 text-tropic-gold'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {hasTimeseries ? (
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={graphData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 9, fill: '#71717a' }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 9, fill: '#71717a' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="FPS"
                  name="FPS"
                  stroke="#22c55e"
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="Players"
                  name="Players"
                  stroke="#c9a227"
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="Ping"
                  name="Ping"
                  stroke="#3b82f6"
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[120px] items-center justify-center text-xs text-zinc-600">
              No data available
            </div>
          )}
        </div>
      </CardContent>

      {/* Quick Actions Footer */}
      {showFooter && (
        <CardFooter className="gap-2 border-t border-tropic-gold-dark/10 pt-3">
          {canStart && onStart && (
            <Button
              variant="outline"
              size="sm"
              className="border-green-700/40 text-green-400 hover:bg-green-600/15 hover:text-green-300"
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
              className="border-red-700/40 text-red-400 hover:bg-red-600/15 hover:text-red-300"
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
              className="border-amber-700/40 text-amber-400 hover:bg-amber-600/15 hover:text-amber-300"
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

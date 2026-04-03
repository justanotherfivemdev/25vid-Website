import React from 'react';
import { Badge } from '@/components/ui/badge';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle,
  Circle,
  HelpCircle,
  Info,
  Loader2,
} from 'lucide-react';
import { getOperationalSummary, normalizeServer } from '@/utils/serverStatus';

const STATUS_CONFIG = {
  running: {
    icon: CheckCircle,
    label: 'OPERATIONAL',
    action: 'Server is live and healthy.',
    bg: 'bg-green-900/30 border-green-700/50',
    text: 'text-green-400',
    badgeCls: 'bg-green-600/20 text-green-400 border-green-600/30',
    pulse: false,
  },
  degraded: {
    icon: AlertTriangle,
    label: 'RUNNING WITH ATTENTION',
    action: 'Server is live, but follow-up stages need review.',
    bg: 'bg-amber-900/30 border-amber-700/50',
    text: 'text-amber-300',
    badgeCls: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    pulse: false,
  },
  starting: {
    icon: Loader2,
    label: 'STARTING',
    action: 'Server is spinning up.',
    bg: 'bg-amber-900/30 border-amber-700/50',
    text: 'text-amber-400',
    badgeCls: 'bg-amber-600/20 text-amber-400 border-amber-600/30',
    pulse: true,
  },
  stopping: {
    icon: Loader2,
    label: 'SHUTTING DOWN',
    action: 'Graceful shutdown in progress.',
    bg: 'bg-amber-900/30 border-amber-700/50',
    text: 'text-amber-400',
    badgeCls: 'bg-amber-600/20 text-amber-400 border-amber-600/30',
    pulse: false,
  },
  stopped: {
    icon: Circle,
    label: 'OFFLINE',
    action: 'Server is stopped.',
    bg: 'bg-zinc-800/50 border-zinc-700/50',
    text: 'text-zinc-400',
    badgeCls: 'bg-zinc-600/20 text-zinc-400 border-zinc-600/30',
    pulse: false,
  },
  error: {
    icon: AlertTriangle,
    label: 'ERROR',
    action: 'Creation or startup failed before the server became operational.',
    bg: 'bg-red-900/30 border-red-700/50',
    text: 'text-red-400',
    badgeCls: 'bg-red-600/20 text-red-400 border-red-600/30',
    pulse: false,
  },
  crash_loop: {
    icon: AlertOctagon,
    label: 'CRASH LOOP',
    action: 'Auto-restart is exhausted and manual intervention is required.',
    bg: 'bg-red-900/40 border-red-600/60',
    text: 'text-red-400',
    badgeCls: 'bg-red-600/20 text-red-400 border-red-600/30',
    pulse: true,
  },
  created: {
    icon: Info,
    label: 'CREATED',
    action: 'Server has not been started yet.',
    bg: 'bg-blue-900/30 border-blue-700/50',
    text: 'text-blue-400',
    badgeCls: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
    pulse: false,
  },
};

const DEFAULT_CONFIG = {
  icon: HelpCircle,
  label: 'UNKNOWN',
  action: 'Status could not be determined.',
  bg: 'bg-orange-900/30 border-orange-700/50',
  text: 'text-orange-400',
  badgeCls: 'bg-orange-600/20 text-orange-400 border-orange-600/30',
  pulse: false,
};

function formatTimestamp(ts) {
  if (!ts) return null;
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return null;
  }
}

function ServerStatusBanner({ server }) {
  if (!server) return null;

  const normalized = normalizeServer(server);
  const summary = getOperationalSummary(normalized);
  const displayStatus = normalized.status === 'running' && summary.state === 'degraded'
    ? 'degraded'
    : normalized.status;
  const { name, last_stopped } = normalized;
  const cfg = STATUS_CONFIG[displayStatus] || DEFAULT_CONFIG;
  const Icon = cfg.icon;
  const spinning = cfg.icon === Loader2;
  const stoppedAt = displayStatus === 'stopped' ? formatTimestamp(last_stopped) : null;

  return (
    <div className={`w-full rounded-lg border px-4 py-3 ${cfg.bg} ${cfg.pulse ? 'animate-pulse' : ''}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <Icon className={`h-4 w-4 shrink-0 ${cfg.text} ${spinning ? 'animate-spin' : ''}`} />
          <Badge variant="outline" className={`${cfg.badgeCls} text-[10px] font-bold tracking-wider`}>
            {cfg.label}
          </Badge>
          {name && (
            <span className="max-w-[200px] truncate text-sm font-medium text-tropic-gold-light sm:max-w-none">
              {name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className={`${cfg.text} opacity-80`}>{summary.detail || cfg.action}</span>
          {stoppedAt && (
            <span className="hidden text-xs text-zinc-500 sm:inline">
              Last stopped {stoppedAt}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default ServerStatusBanner;

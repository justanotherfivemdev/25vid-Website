import React from 'react';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle,
  Loader2,
  Circle,
  AlertTriangle,
  AlertOctagon,
  Info,
  HelpCircle,
} from 'lucide-react';

const STATUS_CONFIG = {
  running: {
    icon: CheckCircle,
    label: 'OPERATIONAL',
    action: 'Server is live — players may connect.',
    bg: 'bg-green-900/30 border-green-700/50',
    text: 'text-green-400',
    badgeCls: 'bg-green-600/20 text-green-400 border-green-600/30',
    pulse: false,
  },
  starting: {
    icon: Loader2,
    label: 'STARTING',
    action: 'Server is spinning up — stand by.',
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
    action: 'Check server logs for details.',
    bg: 'bg-red-900/30 border-red-700/50',
    text: 'text-red-400',
    badgeCls: 'bg-red-600/20 text-red-400 border-red-600/30',
    pulse: false,
  },
  crash_loop: {
    icon: AlertOctagon,
    label: 'CRASH LOOP',
    action: 'Auto-restart disabled — manual intervention required.',
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

  const { status, name, last_started, last_stopped } = server;
  const cfg = STATUS_CONFIG[status] || DEFAULT_CONFIG;
  const Icon = cfg.icon;
  const spinning = cfg.icon === Loader2;

  const stoppedAt = status === 'stopped' ? formatTimestamp(last_stopped) : null;

  return (
    <div
      className={`w-full rounded-lg border px-4 py-3 ${cfg.bg} ${cfg.pulse ? 'animate-pulse' : ''}`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <Icon
            className={`h-4 w-4 shrink-0 ${cfg.text} ${spinning ? 'animate-spin' : ''}`}
          />
          <Badge
            variant="outline"
            className={`${cfg.badgeCls} text-[10px] font-bold tracking-wider`}
          >
            {cfg.label}
          </Badge>
          {name && (
            <span className="text-sm font-medium text-tropic-gold-light truncate max-w-[200px] sm:max-w-none">
              {name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className={`${cfg.text} opacity-80`}>{cfg.action}</span>
          {stoppedAt && (
            <span className="text-zinc-500 text-xs hidden sm:inline">
              · Last stopped {stoppedAt}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default ServerStatusBanner;

import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Play,
  Square,
  RotateCcw,
  Container,
  Tag,
  Puzzle,
  Network,
  Clock,
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
    label: 'RUNNING',
    badgeCls: 'bg-green-600/20 text-green-400 border-green-600/30',
    dotCls: 'bg-green-400',
  },
  starting: {
    icon: Loader2,
    label: 'STARTING',
    badgeCls: 'bg-amber-600/20 text-amber-400 border-amber-600/30',
    dotCls: 'bg-amber-400',
    spin: true,
  },
  stopping: {
    icon: Loader2,
    label: 'STOPPING',
    badgeCls: 'bg-amber-600/20 text-amber-400 border-amber-600/30',
    dotCls: 'bg-amber-400',
    spin: true,
  },
  stopped: {
    icon: Circle,
    label: 'STOPPED',
    badgeCls: 'bg-zinc-600/20 text-zinc-400 border-zinc-600/30',
    dotCls: 'bg-zinc-500',
  },
  created: {
    icon: Info,
    label: 'CREATED',
    badgeCls: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
    dotCls: 'bg-blue-400',
  },
  error: {
    icon: AlertTriangle,
    label: 'ERROR',
    badgeCls: 'bg-red-600/20 text-red-400 border-red-600/30',
    dotCls: 'bg-red-400',
  },
  crash_loop: {
    icon: AlertOctagon,
    label: 'CRASH LOOP',
    badgeCls: 'bg-red-600/20 text-red-400 border-red-600/30',
    dotCls: 'bg-red-400',
  },
};

const DEFAULT_STATUS = {
  icon: HelpCircle,
  label: 'UNKNOWN',
  badgeCls: 'bg-orange-600/20 text-orange-400 border-orange-600/30',
  dotCls: 'bg-orange-400',
};

const STARTABLE = new Set(['stopped', 'created', 'error']);
const STOPPABLE = new Set(['running']);
const RESTARTABLE = new Set(['running']);

function formatTimestamp(ts) {
  if (!ts) return null;
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return null;
  }
}

function formatPorts(ports) {
  if (!ports || ports.length === 0) return null;
  if (ports.length <= 2) return ports.join(', ');
  return `${ports[0]}, ${ports[1]} +${ports.length - 2}`;
}

function ServerCard({ server, onStart, onStop, onRestart }) {
  if (!server) return null;

  const {
    id,
    name,
    description,
    status,
    docker_image,
    tags,
    mods,
    last_started,
    ports,
  } = server;

  const cfg = STATUS_CONFIG[status] || DEFAULT_STATUS;
  const StatusIcon = cfg.icon;
  const portDisplay = formatPorts(ports);
  const lastStartedDisplay = formatTimestamp(last_started);
  const modCount = Array.isArray(mods) ? mods.length : 0;

  const canStart = STARTABLE.has(status);
  const canStop = STOPPABLE.has(status);
  const canRestart = RESTARTABLE.has(status);
  const showFooter = (canStart && onStart) || (canStop && onStop) || (canRestart && onRestart);

  return (
    <Card className="group border-tropic-gold-dark/15 bg-black/80 backdrop-blur-sm transition-all duration-200 hover:border-tropic-gold/30 hover:bg-black/90">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <Link
            to={`/admin/servers/${id}`}
            className="min-w-0 flex-1"
          >
            <CardTitle className="text-base font-semibold text-tropic-gold-light transition-colors group-hover:text-tropic-gold truncate">
              {name || 'Unnamed Server'}
            </CardTitle>
          </Link>

          <Badge
            variant="outline"
            className={`${cfg.badgeCls} shrink-0 text-[10px] font-bold tracking-wider`}
          >
            <StatusIcon
              className={`mr-1 h-3 w-3 ${cfg.spin ? 'animate-spin' : ''}`}
            />
            {cfg.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pb-3">
        {description && (
          <p className="text-sm text-gray-400 line-clamp-2">{description}</p>
        )}

        {docker_image && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Container className="h-3.5 w-3.5 shrink-0 text-tropic-gold-dark" />
            <code className="truncate rounded bg-zinc-800/60 px-1.5 py-0.5 font-mono text-gray-300">
              {docker_image}
            </code>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500">
          {modCount > 0 && (
            <span className="flex items-center gap-1">
              <Puzzle className="h-3 w-3 text-tropic-gold-dark" />
              {modCount} mod{modCount !== 1 ? 's' : ''}
            </span>
          )}

          {portDisplay && (
            <span className="flex items-center gap-1">
              <Network className="h-3 w-3 text-tropic-gold-dark" />
              {portDisplay}
            </span>
          )}

          {lastStartedDisplay && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-tropic-gold-dark" />
              {lastStartedDisplay}
            </span>
          )}
        </div>

        {tags && tags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Tag className="h-3 w-3 shrink-0 text-tropic-gold-dark" />
            {tags.map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="border-tropic-gold-dark/20 bg-tropic-gold/5 text-[10px] text-tropic-gold-light"
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>

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

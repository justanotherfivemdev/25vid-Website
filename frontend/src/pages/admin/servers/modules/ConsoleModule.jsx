import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Copy,
  Download,
  Loader2,
  Pause,
  Play,
  Search,
  Terminal,
  Trash2,
} from 'lucide-react';
import { API } from '@/utils/api';
import { buildServerWsUrl } from '@/utils/serverRealtime';
import { normalizeServer } from '@/utils/serverStatus';

function normalizeEntry(entry, fallbackId) {
  return {
    id: entry.cursor || fallbackId,
    cursor: entry.cursor || String(fallbackId),
    text: entry.line || entry.raw || '',
    ts: entry.timestamp || new Date().toISOString(),
    source: entry.source || entry.stream || 'docker',
    path: entry.path || '',
  };
}

function formatConsoleLine(log) {
  return `[${log.ts}] [${log.source}] ${log.text}`;
}

function formatTimestamp(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function sourceTone(source) {
  const base = String(source || 'docker').split(':')[0];
  if (base === 'docker') return 'border-zinc-700 text-zinc-300';
  if (base === 'console' || base === 'profile') return 'border-blue-600/30 text-blue-300';
  if (base === 'engine' || base === 'backend') return 'border-purple-600/30 text-purple-300';
  if (base === 'rcon') return 'border-amber-600/30 text-amber-300';
  return 'border-zinc-700 text-zinc-300';
}

const MAX_LOG_BUFFER = 2000;
/** Distance in pixels from scroll bottom to consider user "at bottom". */
const SCROLL_THRESHOLD = 60;
const MAX_CURSOR_CACHE = 5000;
const TRIMMED_CURSOR_CACHE = 3000;

function ConsoleModule() {
  const { server: rawServer, serverId } = useOutletContext();
  const server = normalizeServer(rawServer);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState('');
  const [connectionState, setConnectionState] = useState('idle');

  const logRef = useRef(null);
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const seenCursorsRef = useRef(new Set());
  const lastSeenTimestampRef = useRef(null);
  const pendingEntriesRef = useRef([]);
  const flushRafRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const pausedRef = useRef(paused);

  // Keep paused ref in sync
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // Detect user scrolling to auto-pause/resume
  const handleScroll = useCallback(() => {
    const el = logRef.current;
    if (!el) return;
    const atBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) < SCROLL_THRESHOLD;
    isNearBottomRef.current = atBottom;
    // Auto-resume if user scrolls back to bottom
    if (atBottom && pausedRef.current) {
      setPaused(false);
    }
  }, []);

  // Flush pending log entries in batches using rAF for smooth rendering
  const scheduleFlush = useCallback(() => {
    if (flushRafRef.current) return;
    flushRafRef.current = requestAnimationFrame(() => {
      flushRafRef.current = null;
      const batch = pendingEntriesRef.current;
      if (batch.length === 0) return;
      pendingEntriesRef.current = [];
      setLogs((prev) => {
        const merged = [...prev, ...batch];
        return merged.length > MAX_LOG_BUFFER ? merged.slice(-MAX_LOG_BUFFER) : merged;
      });
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => () => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (wsRef.current) wsRef.current.close();
    if (flushRafRef.current) cancelAnimationFrame(flushRafRef.current);
  }, []);

  // Load initial history
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLogs([]);
    seenCursorsRef.current = new Set();
    lastSeenTimestampRef.current = null;
    pendingEntriesRef.current = [];

    axios.get(`${API}/servers/${serverId}/logs/recent?tail=500`)
      .then((res) => {
        if (cancelled) return;
        const entries = Array.isArray(res.data?.entries)
          ? res.data.entries.map((entry, index) => normalizeEntry(entry, `${index}`))
          : [];
        entries.forEach((entry) => seenCursorsRef.current.add(entry.cursor));
        if (entries.length > 0) {
          lastSeenTimestampRef.current = entries[entries.length - 1].ts;
        }
        setLogs(entries);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [serverId]);

  // WebSocket connection for live streaming
  useEffect(() => {
    if (server?.status !== 'running') {
      setConnectionState('offline');
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) wsRef.current.close();
      return undefined;
    }

    let disposed = false;

    const connect = () => {
      if (disposed) return;
      // On reconnect, request recent history to backfill any missed entries.
      // The backend deduplication via seen_cursors will handle overlaps.
      const isReconnect = reconnectAttemptRef.current > 0;
      const url = buildServerWsUrl(`/api/ws/servers/${serverId}/logs`, {
        tail: isReconnect ? 100 : 0,
        since: lastSeenTimestampRef.current || '',
      });
      setConnectionState(isReconnect ? 'reconnecting' : 'connecting');

      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          reconnectAttemptRef.current = 0;
          setConnectionState('live');
        };

        ws.onmessage = (event) => {
          let payload;
          try {
            payload = JSON.parse(event.data);
          } catch {
            payload = { type: 'log', line: event.data };
          }

          if (payload.type === 'status') {
            setConnectionState(payload.state === 'connected' ? 'live' : payload.state || 'live');
            return;
          }
          if (payload.type === 'pong' || payload.type === 'heartbeat') return;
          if (payload.type !== 'log') return;

          const entry = normalizeEntry(payload, Date.now());
          if (seenCursorsRef.current.has(entry.cursor)) return;
          seenCursorsRef.current.add(entry.cursor);
          // Trim cursor cache to prevent memory leak
          if (seenCursorsRef.current.size > MAX_CURSOR_CACHE) {
            const arr = [...seenCursorsRef.current];
            seenCursorsRef.current = new Set(arr.slice(-TRIMMED_CURSOR_CACHE));
          }
          lastSeenTimestampRef.current = entry.ts;
          pendingEntriesRef.current.push(entry);
          scheduleFlush();
        };

        ws.onclose = (event) => {
          if (disposed || server?.status !== 'running') return;
          // Stop reconnecting on authentication / permission failures
          if (event.code === 4001) {
            setConnectionState('auth_failed');
            return;
          }
          if (event.code === 4003) {
            setConnectionState('no_permission');
            return;
          }
          reconnectAttemptRef.current += 1;
          const nextDelay = Math.min(10_000, 1000 * 2 ** Math.min(reconnectAttemptRef.current, 3));
          setConnectionState('reconnecting');
          reconnectTimerRef.current = setTimeout(connect, nextDelay);
        };

        ws.onerror = () => {
          setConnectionState('reconnecting');
        };
      } catch {
        setConnectionState('reconnecting');
      }
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [server?.status, serverId, scheduleFlush]);

  // Auto-scroll to bottom when new logs arrive (unless paused or user scrolled up)
  useEffect(() => {
    if (paused) return;
    const el = logRef.current;
    if (!el) return;
    // Use rAF for smooth scroll anchoring
    requestAnimationFrame(() => {
      if (isNearBottomRef.current) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }, [logs, paused]);

  const filteredLogs = useMemo(() => (
    filter
      ? logs.filter((log) => `${log.source} ${log.path} ${log.text}`.toLowerCase().includes(filter.toLowerCase()))
      : logs
  ), [filter, logs]);

  const handleCopy = async () => {
    const text = filteredLogs.map((log) => formatConsoleLine(log)).join('\n');
    await navigator.clipboard?.writeText(text);
  };

  const handleDownload = () => {
    const text = filteredLogs.map((log) => formatConsoleLine(log)).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${server?.name || 'server'}-logs-${new Date().toISOString().slice(0, 10)}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const getLineClass = (text) => {
    const lower = text.toLowerCase();
    if (lower.includes('error') || lower.includes('fatal') || lower.includes('crash')) return 'text-red-400';
    if (lower.includes('warn') || lower.includes('warning')) return 'text-amber-300';
    if (lower.includes('restart') || lower.includes('shutdown')) return 'text-blue-400 font-semibold';
    return 'text-[#8a9aa8]';
  };

  const connectionLabel = {
    idle: 'Waiting to connect',
    offline: 'Server offline',
    connecting: 'Connecting to live stream',
    live: 'Live stream connected',
    reconnecting: 'Reconnecting to live stream',
    auth_failed: 'Authentication failed — please refresh and log in',
    no_permission: 'Insufficient permissions for live console',
  }[connectionState] || 'Waiting to connect';

  const dotColor = {
    offline: 'bg-zinc-600',
    connecting: 'bg-amber-400',
    live: 'bg-[#c9a227]',
    reconnecting: 'bg-amber-300',
    auth_failed: 'bg-red-500',
    no_permission: 'bg-red-500',
  }[connectionState] || 'bg-zinc-600';

  const textColor = {
    offline: 'text-zinc-500',
    connecting: 'text-amber-300',
    live: 'text-[#c9a227]',
    reconnecting: 'text-amber-300',
    auth_failed: 'text-red-400',
    no_permission: 'text-red-400',
  }[connectionState] || 'text-zinc-500';

  const handleTogglePause = useCallback(() => {
    setPaused((current) => {
      const next = !current;
      if (!next && logRef.current) {
        // Resuming — jump to bottom
        isNearBottomRef.current = true;
        requestAnimationFrame(() => {
          if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
        });
      }
      return next;
    });
  }, []);

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#4a6070]" />
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter console lines"
            className="h-8 border-zinc-800 bg-[#050a0e]/60 pl-9 text-xs text-white placeholder:text-[#4a6070]"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleTogglePause}
          className={`h-8 border-zinc-800 text-xs ${paused ? 'text-amber-300' : 'text-[#8a9aa8]'}`}
        >
          {paused ? <Play className="mr-1 h-3.5 w-3.5" /> : <Pause className="mr-1 h-3.5 w-3.5" />}
          {paused ? 'Resume auto-scroll' : 'Pause auto-scroll'}
        </Button>
        <Button size="sm" variant="outline" onClick={handleCopy} className="h-8 border-zinc-800 text-xs text-[#8a9aa8]">
          <Copy className="mr-1 h-3.5 w-3.5" /> Copy
        </Button>
        <Button size="sm" variant="outline" onClick={handleDownload} className="h-8 border-zinc-800 text-xs text-[#8a9aa8]">
          <Download className="mr-1 h-3.5 w-3.5" /> Download
        </Button>
        <Button size="sm" variant="outline" onClick={() => setLogs([])} className="h-8 border-zinc-800 text-xs text-[#8a9aa8]">
          <Trash2 className="mr-1 h-3.5 w-3.5" /> Clear buffer
        </Button>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className={`h-2 w-2 rounded-full ${dotColor} ${connectionState === 'live' ? 'animate-pulse' : ''}`} />
        <span className={textColor}>{connectionLabel}</span>
        {paused && (
          <Badge variant="outline" className="ml-2 border-amber-500/30 text-[10px] text-amber-300">
            AUTO-SCROLL PAUSED
          </Badge>
        )}
        {!paused && !isNearBottomRef.current && connectionState === 'live' && (
          <Badge variant="outline" className="ml-2 border-zinc-600 text-[10px] text-zinc-400">
            SCROLLED UP
          </Badge>
        )}
        <span className="ml-auto text-[#4a6070]">{filteredLogs.length} entries in view</span>
      </div>

      <Card className="flex-1 border-zinc-800 bg-[#050a0e]/80">
        <CardContent className="p-0">
          <div
            ref={logRef}
            onScroll={handleScroll}
            className="h-[60vh] overflow-y-auto font-mono text-xs leading-relaxed"
            style={{ scrollBehavior: 'auto' }}
          >
            {loading ? (
              <div className="flex items-center justify-center py-12 text-[#4a6070]">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading logs...
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-[#4a6070]">
                <Terminal className="mb-2 h-8 w-8 text-[#4a6070]" />
                <p>{filter ? 'No matching log lines' : 'No merged logs available yet'}</p>
              </div>
            ) : (
              <div className="p-3">
                {filteredLogs.map((log) => (
                  <div key={log.id} className="grid grid-cols-[72px_132px_1fr] gap-3 py-1 hover:bg-zinc-900/50">
                    <span className="pt-0.5 text-[10px] text-zinc-600">{formatTimestamp(log.ts)}</span>
                    <div className="pt-0.5">
                      <Badge variant="outline" className={`text-[10px] uppercase ${sourceTone(log.source)}`}>
                        {String(log.source || 'docker').replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    <div className={`whitespace-pre-wrap break-words ${getLineClass(log.text)}`}>
                      {log.text}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default ConsoleModule;

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
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
import { buildServerWsUrl } from '@/utils/serverRealtime';
import { normalizeServer } from '@/utils/serverStatus';

function normalizeEntry(entry, fallbackId) {
  return {
    id: entry.cursor || fallbackId,
    cursor: entry.cursor || String(fallbackId),
    seq: entry.seq || 0,
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
  const [backfillInfo, setBackfillInfo] = useState(null);

  const logRef = useRef(null);
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const seenCursorsRef = useRef(new Set());
  const lastSeqRef = useRef(0);
  const pendingEntriesRef = useRef([]);
  const flushRafRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const pausedRef = useRef(paused);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const handleScroll = useCallback(() => {
    const el = logRef.current;
    if (!el) return;
    const atBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) < SCROLL_THRESHOLD;
    isNearBottomRef.current = atBottom;
    if (atBottom && pausedRef.current) {
      setPaused(false);
    }
  }, []);

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

  // WebSocket connection — this is now the ONLY data path (no REST initial fetch)
  useEffect(() => {
    if (server?.status !== 'running') {
      setConnectionState('offline');
      setLoading(false);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) wsRef.current.close();
      return undefined;
    }

    let disposed = false;

    const connect = () => {
      if (disposed) return;
      const isReconnect = reconnectAttemptRef.current > 0;

      // Build URL with sequence-based reconnect
      const params = {};
      if (isReconnect && lastSeqRef.current > 0) {
        // Reconnect: use sequence number for precise backfill
        params.since_seq = lastSeqRef.current;
        params.tail = 0;
      } else {
        // First connect: request full initial history
        params.tail = 500;
      }

      const url = buildServerWsUrl(`/api/ws/servers/${serverId}/logs`, params);
      setConnectionState(isReconnect ? 'reconnecting' : 'connecting');
      setLoading(!isReconnect);

      // Reset state for first connect
      if (!isReconnect) {
        setLogs([]);
        seenCursorsRef.current = new Set();
        lastSeqRef.current = 0;
        pendingEntriesRef.current = [];
        setBackfillInfo(null);
      }

      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          reconnectAttemptRef.current = 0;
          // Don't set 'live' yet — wait for backend status message
        };

        ws.onmessage = (event) => {
          let payload;
          try {
            payload = JSON.parse(event.data);
          } catch {
            payload = { type: 'log', line: event.data };
          }

          // Handle status messages from backend
          if (payload.type === 'status') {
            if (payload.state === 'connected') {
              setConnectionState('connecting');
            } else if (payload.state === 'backfilling') {
              setConnectionState('backfilling');
              setBackfillInfo({ count: payload.count || 0 });
            } else if (payload.state === 'live') {
              setConnectionState('live');
              setLoading(false);
              setBackfillInfo(null);
            }
            return;
          }

          // Handle heartbeat
          if (payload.type === 'heartbeat') {
            // Connection is alive — no action needed
            return;
          }

          // Handle errors from backend
          if (payload.type === 'error') {
            console.error('[Console] Stream error:', payload.code, payload.message);
            setConnectionState('stream_failed');
            return;
          }

          if (payload.type !== 'log') return;

          const entry = normalizeEntry(payload, `${Date.now()}-${Math.random()}`);

          // Dedup by cursor
          if (entry.cursor && seenCursorsRef.current.has(entry.cursor)) return;
          if (entry.cursor) {
            seenCursorsRef.current.add(entry.cursor);
            if (seenCursorsRef.current.size > MAX_CURSOR_CACHE) {
              const arr = [...seenCursorsRef.current];
              seenCursorsRef.current = new Set(arr.slice(-TRIMMED_CURSOR_CACHE));
            }
          }

          // Track sequence number for reconnect
          if (entry.seq > lastSeqRef.current) {
            lastSeqRef.current = entry.seq;
          }

          pendingEntriesRef.current.push(entry);
          scheduleFlush();
        };

        ws.onclose = (event) => {
          if (disposed) return;

          // Non-retriable close codes — stop reconnecting
          switch (event.code) {
            case 4001:
              setConnectionState('auth_failed');
              setLoading(false);
              return;
            case 4003:
              setConnectionState('no_permission');
              setLoading(false);
              return;
            case 4004:
              setConnectionState('server_not_found');
              setLoading(false);
              return;
            case 4005:
              setConnectionState('container_not_found');
              setLoading(false);
              return;
            case 4006:
              setConnectionState('server_not_running');
              setLoading(false);
              return;
            default:
              break;
          }

          // Don't reconnect if server is no longer running
          if (server?.status !== 'running') {
            setConnectionState('offline');
            setLoading(false);
            return;
          }

          // Retriable — reconnect with exponential backoff
          reconnectAttemptRef.current += 1;
          const attempt = reconnectAttemptRef.current;
          // 1s, 2s, 4s, 8s, 10s cap
          const nextDelay = Math.min(10_000, 1000 * 2 ** Math.min(attempt - 1, 3));
          setConnectionState('reconnecting');
          reconnectTimerRef.current = setTimeout(connect, nextDelay);
        };

        ws.onerror = () => {
          // onerror always fires before onclose; let onclose handle state
        };
      } catch {
        reconnectAttemptRef.current += 1;
        const nextDelay = Math.min(10_000, 1000 * 2 ** Math.min(reconnectAttemptRef.current, 3));
        setConnectionState('reconnecting');
        reconnectTimerRef.current = setTimeout(connect, nextDelay);
      }
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [server?.status, serverId, scheduleFlush]);

  // Auto-scroll
  useEffect(() => {
    if (paused) return;
    const el = logRef.current;
    if (!el) return;
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
    backfilling: backfillInfo
      ? `Loading ${backfillInfo.count} recent lines...`
      : 'Loading recent history...',
    live: 'Live stream connected',
    reconnecting: 'Reconnecting to live stream',
    stream_failed: 'Stream source failed — check server status',
    auth_failed: 'Authentication failed — please refresh and log in',
    no_permission: 'Insufficient permissions for live console',
    server_not_found: 'Server not found',
    container_not_found: 'Server container not found — it may have been removed',
    server_not_running: 'Server is not running',
  }[connectionState] || 'Waiting to connect';

  const dotColor = {
    offline: 'bg-zinc-600',
    connecting: 'bg-amber-400',
    backfilling: 'bg-blue-400',
    live: 'bg-[#c9a227]',
    reconnecting: 'bg-amber-300',
    stream_failed: 'bg-red-500',
    auth_failed: 'bg-red-500',
    no_permission: 'bg-red-500',
    server_not_found: 'bg-red-500',
    container_not_found: 'bg-red-500',
    server_not_running: 'bg-zinc-600',
  }[connectionState] || 'bg-zinc-600';

  const textColor = {
    offline: 'text-zinc-500',
    connecting: 'text-amber-300',
    backfilling: 'text-blue-300',
    live: 'text-[#c9a227]',
    reconnecting: 'text-amber-300',
    stream_failed: 'text-red-400',
    auth_failed: 'text-red-400',
    no_permission: 'text-red-400',
    server_not_found: 'text-red-400',
    container_not_found: 'text-red-400',
    server_not_running: 'text-zinc-500',
  }[connectionState] || 'text-zinc-500';

  const handleTogglePause = useCallback(() => {
    setPaused((current) => {
      const next = !current;
      if (!next && logRef.current) {
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
        <span className={`h-2 w-2 rounded-full ${dotColor} ${connectionState === 'live' ? 'animate-pulse' : ''} ${connectionState === 'backfilling' ? 'animate-pulse' : ''}`} />
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

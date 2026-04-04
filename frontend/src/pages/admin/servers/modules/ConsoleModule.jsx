import React, { useEffect, useMemo, useRef, useState } from 'react';
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

  useEffect(() => () => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (wsRef.current) wsRef.current.close();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLogs([]);
    seenCursorsRef.current = new Set();
    lastSeenTimestampRef.current = null;

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
      const url = buildServerWsUrl(`/api/ws/servers/${serverId}/logs`, {
        tail: 0,
        since: lastSeenTimestampRef.current || '',
      });
      setConnectionState(reconnectAttemptRef.current > 0 ? 'reconnecting' : 'connecting');

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
          if (payload.type !== 'log') return;

          const entry = normalizeEntry(payload, Date.now());
          if (seenCursorsRef.current.has(entry.cursor)) return;
          seenCursorsRef.current.add(entry.cursor);
          lastSeenTimestampRef.current = entry.ts;
          setLogs((prev) => [...prev.slice(-1999), entry]);
        };

        ws.onclose = () => {
          if (disposed || server?.status !== 'running') return;
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
  }, [server?.status, serverId]);

  useEffect(() => {
    if (!paused && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
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
  }[connectionState] || 'Waiting to connect';

  const dotColor = {
    offline: 'bg-zinc-600',
    connecting: 'bg-amber-400',
    live: 'bg-[#c9a227]',
    reconnecting: 'bg-amber-300',
  }[connectionState] || 'bg-zinc-600';

  const textColor = {
    offline: 'text-zinc-500',
    connecting: 'text-amber-300',
    live: 'text-[#c9a227]',
    reconnecting: 'text-amber-300',
  }[connectionState] || 'text-zinc-500';

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
          onClick={() => setPaused((current) => !current)}
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
        <span className={`h-2 w-2 rounded-full ${dotColor}`} />
        <span className={textColor}>{connectionLabel}</span>
        {paused && (
          <Badge variant="outline" className="ml-2 border-amber-500/30 text-[10px] text-amber-300">
            AUTO-SCROLL PAUSED
          </Badge>
        )}
        <span className="ml-auto text-[#4a6070]">{filteredLogs.length} entries in view</span>
      </div>

      <Card className="flex-1 border-zinc-800 bg-[#050a0e]/80">
        <CardContent className="p-0">
          <div
            ref={logRef}
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

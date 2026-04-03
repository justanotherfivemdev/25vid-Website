import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Terminal,
  Pause,
  Play,
  Trash2,
  Download,
  Copy,
  Search,
  RefreshCw,
  AlertTriangle,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { API } from '@/utils/api';

const WS_BASE = (process.env.REACT_APP_BACKEND_URL || window.location.origin || '').replace(/^http/, 'ws').replace(/\/$/, '');

function ConsoleModule() {
  const { server, serverId } = useOutletContext();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState('');
  const [wsConnected, setWsConnected] = useState(false);
  const logRef = useRef(null);
  const wsRef = useRef(null);
  const pausedRef = useRef(false);

  // Keep ref in sync
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  // Fetch initial logs
  useEffect(() => {
    setLoading(true);
    axios.get(`${API}/servers/${serverId}/logs/recent?tail=500`)
      .then(res => {
        const lines = (res.data?.logs || '').split('\n').filter(Boolean);
        setLogs(lines.map((line, i) => ({ id: i, text: line, ts: Date.now() })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [serverId]);

  // WebSocket streaming
  useEffect(() => {
    if (server?.status !== 'running') return;
    const token = document.cookie.split(';').find(c => c.trim().startsWith('session='))?.split('=')?.[1] || '';
    const url = `${WS_BASE}/api/ws/servers/${serverId}/logs?token=${token}&tail=0`;
    let ws;
    try {
      ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => setWsConnected(true);
      ws.onmessage = (e) => {
        if (pausedRef.current) return;
        let text = e.data;
        // Backend sends JSON frames with a `line` field
        try {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed.line === 'string') text = parsed.line;
        } catch {
          // raw text, use as-is
        }
        if (text) {
          setLogs(prev => [...prev.slice(-2000), { id: Date.now() + Math.random(), text, ts: Date.now() }]);
        }
      };
      ws.onclose = () => setWsConnected(false);
      ws.onerror = () => setWsConnected(false);
    } catch {
      // WS not available
    }
    return () => { if (ws) ws.close(); };
  }, [serverId, server?.status]);

  // Auto-scroll
  useEffect(() => {
    if (!paused && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs, paused]);

  const filteredLogs = filter
    ? logs.filter(l => l.text.toLowerCase().includes(filter.toLowerCase()))
    : logs;

  const handleCopy = useCallback(() => {
    const text = filteredLogs.map(l => l.text).join('\n');
    navigator.clipboard?.writeText(text);
  }, [filteredLogs]);

  const handleDownload = useCallback(() => {
    const text = filteredLogs.map(l => l.text).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${server?.name || 'server'}-logs-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredLogs, server?.name]);

  const handleClear = useCallback(() => { setLogs([]); }, []);

  const getLineClass = (text) => {
    const lower = text.toLowerCase();
    if (lower.includes('error') || lower.includes('fatal') || lower.includes('crash')) return 'text-red-400';
    if (lower.includes('warn') || lower.includes('warning')) return 'text-amber-400';
    if (lower.includes('restart') || lower.includes('shutdown')) return 'text-blue-400 font-semibold';
    return 'text-gray-300';
  };

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter logs..."
            className="h-8 border-zinc-800 bg-black/60 pl-9 text-xs text-white placeholder:text-gray-600"
          />
        </div>
        <Button size="sm" variant="outline" onClick={() => setPaused(!paused)}
          className={`h-8 border-zinc-800 text-xs ${paused ? 'text-amber-400' : 'text-gray-400'}`}>
          {paused ? <Play className="mr-1 h-3.5 w-3.5" /> : <Pause className="mr-1 h-3.5 w-3.5" />}
          {paused ? 'Resume' : 'Pause'}
        </Button>
        <Button size="sm" variant="outline" onClick={handleCopy} className="h-8 border-zinc-800 text-xs text-gray-400">
          <Copy className="mr-1 h-3.5 w-3.5" /> Copy
        </Button>
        <Button size="sm" variant="outline" onClick={handleDownload} className="h-8 border-zinc-800 text-xs text-gray-400">
          <Download className="mr-1 h-3.5 w-3.5" /> Download
        </Button>
        <Button size="sm" variant="outline" onClick={handleClear} className="h-8 border-zinc-800 text-xs text-gray-400">
          <Trash2 className="mr-1 h-3.5 w-3.5" /> Clear
        </Button>
      </div>

      {/* Connection status */}
      <div className="flex items-center gap-2 text-xs">
        <span className={`h-2 w-2 rounded-full ${wsConnected ? 'bg-green-400' : 'bg-zinc-600'}`} />
        <span className={wsConnected ? 'text-green-400' : 'text-gray-600'}>
          {wsConnected ? 'Live streaming' : server?.status === 'running' ? 'Connecting...' : 'Server offline'}
        </span>
        {paused && <Badge variant="outline" className="ml-2 border-amber-600/30 text-amber-400 text-[10px]">PAUSED</Badge>}
        <span className="ml-auto text-gray-600">{filteredLogs.length} lines</span>
      </div>

      {/* Log container */}
      <Card className="flex-1 border-zinc-800 bg-black/80">
        <CardContent className="p-0">
          <div
            ref={logRef}
            className="h-[60vh] overflow-y-auto font-mono text-xs leading-relaxed"
            style={{ scrollBehavior: paused ? 'auto' : 'smooth' }}
          >
            {loading ? (
              <div className="flex items-center justify-center py-12 text-gray-600">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading logs...
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-600">
                <Terminal className="mb-2 h-8 w-8 text-gray-700" />
                <p>{filter ? 'No matching log lines' : 'No logs available'}</p>
              </div>
            ) : (
              <div className="p-3">
                {filteredLogs.map((log) => (
                  <div key={log.id} className={`py-0.5 ${getLineClass(log.text)} hover:bg-zinc-900/50`}>
                    {log.text}
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

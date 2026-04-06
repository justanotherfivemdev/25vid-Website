import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { API } from '@/utils/api';
import { buildServerWsUrl } from '@/utils/serverRealtime';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle,
  ChevronRight,
  Clock,
  Loader2,
  Monitor,
  RefreshCw,
  Send,
  Trash2,
  Zap,
} from 'lucide-react';

const QUICK_COMMANDS = [
  { label: '#status', cmd: '#status', desc: 'Server status' },
  { label: '#players', cmd: '#players', desc: 'List players' },
  { label: '#kick', cmd: '#kick ', desc: 'Kick player' },
  { label: '#ban', cmd: '#ban ', desc: 'Ban player' },
  { label: '#restart', cmd: '#restart 30', desc: 'Restart in 30s' },
  { label: '#shutdown', cmd: '#shutdown', desc: 'Shutdown server' },
];

const SAVED_SNIPPETS_KEY = 'rcon_saved_snippets';

// Map backend error codes to user-friendly messages
const ERROR_MESSAGES = {
  auth_failed: 'Wrong RCON password — update it in Server Settings → RCON, then restart the server.',
  timeout: 'RCON command timed out — the server may be unresponsive or the RCON port is blocked.',
  disabled: 'RCON is not configured — set an RCON password in Server Settings → RCON.',
  unreachable: 'RCON port unreachable — check that the firewall allows UDP on the RCON port.',
  rate_limited: 'Too many commands — please wait a moment before sending more.',
  invalid_command: 'Invalid command format.',
  execution_failed: 'RCON command execution failed unexpectedly.',
};

function classifyError(payload) {
  if (!payload) return 'RCON command failed';
  const code = payload.code || '';
  const message = payload.message || payload.response || '';
  return ERROR_MESSAGES[code] || message || 'RCON command failed';
}

const STATUS_TEXT = {
  offline: 'Server is offline.',
  disabled: 'RCON is disabled because no password is configured. Set one in Server Settings → RCON, then restart.',
  auth_failed: 'RCON rejected the configured credentials. Restart the server after changing the password in Server Settings.',
  unavailable: 'RCON is not reachable. Check that the firewall allows UDP on the RCON port and the container published it.',
  error: 'RCON returned an unexpected error.',
  connected: 'BattlEye RCON is connected.',
};

function RconModule() {
  const { server, serverId } = useOutletContext();
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [rconStatus, setRconStatus] = useState({ state: 'offline', detail: 'Server is offline.' });
  const [savedSnippets, setSavedSnippets] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(SAVED_SNIPPETS_KEY) || '[]');
    } catch {
      return [];
    }
  });
  const [newSnippetName, setNewSnippetName] = useState('');
  const historyRef = useRef(null);
  const inputRef = useRef(null);
  const historyIdx = useRef(-1);
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const pendingEntryIdRef = useRef(null);
  const [wsState, setWsState] = useState('idle');
  const wsStateRef = useRef('idle');

  // Keep wsStateRef in sync
  useEffect(() => {
    wsStateRef.current = wsState;
  }, [wsState]);

  const fetchStatus = useCallback(async () => {
    if (server?.status !== 'running') {
      setRconStatus({ state: 'offline', detail: STATUS_TEXT.offline });
      setStatusLoading(false);
      return;
    }
    // Don't re-probe while WS is connected and working
    if (wsStateRef.current === 'live') {
      setStatusLoading(false);
      return;
    }
    setStatusLoading(true);
    try {
      const res = await axios.get(`${API}/servers/${serverId}/rcon/status`);
      setRconStatus(res.data);
    } catch (err) {
      setRconStatus({
        state: 'error',
        detail: err.response?.data?.detail || 'Failed to probe RCON.',
      });
    } finally {
      setStatusLoading(false);
    }
  }, [server?.status, serverId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Probe every 60s (was 30s), skip while WS is connected
  useEffect(() => {
    if (server?.status !== 'running') return undefined;
    const interval = setInterval(fetchStatus, 60_000);
    return () => clearInterval(interval);
  }, [server?.status, fetchStatus]);

  useEffect(() => () => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (wsRef.current) wsRef.current.close();
  }, []);

  // WebSocket connection — opens when server is running, NOT gated on probe
  useEffect(() => {
    if (server?.status !== 'running') {
      setWsState('offline');
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) wsRef.current.close();
      return undefined;
    }

    let disposed = false;
    let reconnectAttempt = 0;

    const connect = () => {
      if (disposed) return;
      const url = buildServerWsUrl(`/api/ws/servers/${serverId}/rcon`);
      setWsState((current) => (current === 'live' ? current : 'connecting'));

      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          reconnectAttempt = 0;
          // Don't set 'live' yet — wait for backend {type: "status", state: "ready"}
        };

        ws.onmessage = (event) => {
          let payload = null;
          try {
            payload = JSON.parse(event.data);
          } catch {
            payload = null;
          }
          if (!payload) return;

          // Handle status messages
          if (payload.type === 'status') {
            if (payload.state === 'ready') {
              setWsState('live');
              setRconStatus({ state: 'connected', detail: STATUS_TEXT.connected });
            }
            return;
          }

          if (payload.type === 'heartbeat') {
            return;
          }

          // Handle error messages (can come unprompted or as command responses)
          if (payload.type === 'error') {
            const friendlyMessage = classifyError(payload);

            // Resolve any pending command entry — use pendingEntryIdRef regardless of
            // whether payload.command is present (e.g. invalid_command / rate_limited
            // now include it, but we fall back to the ref so the UI never stays stuck).
            const pendingId = pendingEntryIdRef.current;
            if (pendingId != null) {
              setHistory((prev) => prev.map((item) => (
                item.id === pendingId
                  ? { ...item, error: friendlyMessage, duration_ms: payload.duration_ms }
                  : item
              )));
              pendingEntryIdRef.current = null;
              setLoading(false);
              setTimeout(() => {
                if (historyRef.current) historyRef.current.scrollTop = historyRef.current.scrollHeight;
              }, 50);
            } else if (payload.code === 'disabled') {
              // RCON not configured — update status
              setRconStatus({ state: 'disabled', detail: friendlyMessage });
              setWsState('error');
            } else {
              // Non-command error — show as status
              setRconStatus((prev) => ({ ...prev, detail: friendlyMessage }));
            }
            return;
          }

          // Handle command responses
          if (payload.type === 'response') {
            const pendingId = pendingEntryIdRef.current;
            if (pendingId != null) {
              setHistory((prev) => prev.map((item) => (
                item.id === pendingId
                  ? {
                      ...item,
                      response: payload.response || 'OK',
                      error: payload.success ? null : (payload.response || 'RCON command failed'),
                      duration_ms: payload.duration_ms,
                    }
                  : item
              )));
              pendingEntryIdRef.current = null;
              setLoading(false);
              setTimeout(() => {
                if (historyRef.current) historyRef.current.scrollTop = historyRef.current.scrollHeight;
              }, 50);
            }
            return;
          }
        };

        ws.onclose = (event) => {
          // Resolve any pending command
          if (pendingEntryIdRef.current != null) {
            const pendingId = pendingEntryIdRef.current;
            setHistory((prev) => prev.map((item) => (
              item.id === pendingId ? { ...item, error: 'RCON connection closed before command completed.' } : item
            )));
            pendingEntryIdRef.current = null;
            setLoading(false);
          }

          if (disposed) return;

          // Non-retriable close codes
          switch (event.code) {
            case 4001:
              setWsState('auth_failed');
              setRconStatus({ state: 'auth_failed', detail: 'WebSocket authentication failed — please refresh and log in.' });
              return;
            case 4003:
              setWsState('no_permission');
              setRconStatus({ state: 'error', detail: 'Insufficient permissions for RCON.' });
              return;
            case 4004:
              setWsState('error');
              setRconStatus({ state: 'error', detail: 'Server not found.' });
              return;
            case 4006:
              setWsState('offline');
              setRconStatus({ state: 'offline', detail: 'Server is not running.' });
              return;
            case 4007:
              setWsState('error');
              setRconStatus({ state: 'disabled', detail: STATUS_TEXT.disabled });
              return;
            default:
              break;
          }

          if (server?.status !== 'running') {
            setWsState('offline');
            return;
          }

          // Retriable — reconnect with backoff
          reconnectAttempt += 1;
          const nextDelay = Math.min(10_000, 1500 * 2 ** Math.min(reconnectAttempt - 1, 3));
          setWsState('reconnecting');
          reconnectTimerRef.current = setTimeout(connect, nextDelay);
        };

        ws.onerror = () => {
          // Let onclose handle state
        };
      } catch {
        reconnectAttempt += 1;
        const nextDelay = Math.min(10_000, 1500 * 2 ** Math.min(reconnectAttempt, 3));
        setWsState('reconnecting');
        reconnectTimerRef.current = setTimeout(connect, nextDelay);
      }
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [server?.status, serverId]);

  // canExecute: WS must be live (not gated on probe anymore)
  const canExecute = wsState === 'live';

  const sendCommand = useCallback(async (cmd) => {
    const trimmed = (cmd || command).trim();
    if (!trimmed || !canExecute || loading) return;
    setLoading(true);
    const entry = { id: Date.now(), command: trimmed, response: null, error: null, ts: new Date() };
    setHistory((prev) => {
      const next = [...prev, entry];
      return next.length > 500 ? next.slice(-500) : next;
    });

    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        pendingEntryIdRef.current = entry.id;
        wsRef.current.send(JSON.stringify({ command: trimmed }));
      } else {
        // HTTP fallback
        const res = await axios.post(`${API}/servers/${serverId}/rcon`, { command: trimmed });
        if (res.data?.executed) {
          setHistory((prev) => prev.map((item) => (
            item.id === entry.id ? { ...item, response: res.data?.response || 'OK' } : item
          )));
        } else {
          setHistory((prev) => prev.map((item) => (
            item.id === entry.id ? { ...item, error: res.data?.response || 'RCON command failed' } : item
          )));
        }
        setLoading(false);
      }
    } catch (err) {
      setHistory((prev) => prev.map((item) => (
        item.id === entry.id
          ? { ...item, error: err.response?.data?.detail || 'RCON command failed' }
          : item
      )));
      pendingEntryIdRef.current = null;
      setLoading(false);
    } finally {
      setCommand('');
      historyIdx.current = -1;
      setTimeout(() => {
        if (historyRef.current) historyRef.current.scrollTop = historyRef.current.scrollHeight;
      }, 50);
    }
  }, [canExecute, command, loading, serverId]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      sendCommand();
      return;
    }
    const cmds = history.filter((item) => item.command);
    if (e.key === 'ArrowUp' && cmds.length) {
      e.preventDefault();
      const idx = historyIdx.current < 0 ? cmds.length - 1 : Math.max(0, historyIdx.current - 1);
      historyIdx.current = idx;
      setCommand(cmds[idx].command);
    }
    if (e.key === 'ArrowDown' && cmds.length) {
      e.preventDefault();
      if (historyIdx.current >= cmds.length - 1) {
        historyIdx.current = -1;
        setCommand('');
      } else {
        historyIdx.current += 1;
        setCommand(cmds[historyIdx.current].command);
      }
    }
  }, [history, sendCommand]);

  const saveSnippet = useCallback(() => {
    if (!command.trim() || !newSnippetName.trim()) return;
    const updated = [...savedSnippets, { name: newSnippetName.trim(), command: command.trim() }];
    setSavedSnippets(updated);
    localStorage.setItem(SAVED_SNIPPETS_KEY, JSON.stringify(updated));
    setNewSnippetName('');
  }, [command, newSnippetName, savedSnippets]);

  const removeSnippet = useCallback((idx) => {
    const updated = savedSnippets.filter((_, i) => i !== idx);
    setSavedSnippets(updated);
    localStorage.setItem(SAVED_SNIPPETS_KEY, JSON.stringify(updated));
  }, [savedSnippets]);

  const socketDetail = {
    idle: 'Connecting...',
    offline: 'Server offline.',
    connecting: 'Opening RCON connection...',
    live: 'RCON connected and ready.',
    reconnecting: 'Reconnecting RCON...',
    auth_failed: 'WebSocket authentication failed.',
    no_permission: 'Insufficient permissions.',
    error: rconStatus?.detail || 'RCON error.',
  }[wsState] || '';

  const statusIcon = wsState === 'live'
    ? <CheckCircle className="h-4 w-4 text-green-400" />
    : statusLoading
      ? <Loader2 className="h-4 w-4 animate-spin" />
      : <AlertTriangle className="h-4 w-4" />;

  const statusBarClass = wsState === 'live'
    ? 'border-green-600/30 bg-green-600/10 text-green-300'
    : 'border-amber-600/30 bg-amber-600/10 text-amber-400';

  return (
    <div className="flex h-full flex-col gap-4">
      <div className={`flex items-center gap-2 rounded border px-3 py-2 text-xs ${statusBarClass}`}>
        {statusIcon}
        <span>{statusLoading ? 'Checking RCON availability...' : socketDetail}</span>
        {wsState !== 'live' && rconStatus?.detail && wsState !== 'error' && (
          <span className="ml-1 text-[#4a6070]">({rconStatus.detail})</span>
        )}
        <Button size="sm" variant="ghost" onClick={fetchStatus} className="ml-auto h-6 px-2 text-[10px] text-inherit hover:bg-white/5">
          <RefreshCw className="mr-1 h-3 w-3" /> Retry
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="flex flex-col gap-3">
          <Card className="border-zinc-800 bg-[#050a0e]/80">
            <CardContent className="p-0">
              <div ref={historyRef} className="h-[50vh] overflow-y-auto font-mono text-xs">
                {history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-[#4a6070]">
                    <Monitor className="mb-3 h-8 w-8 text-[#4a6070]" />
                    <p>RCON console ready.</p>
                    <p className="mt-1 text-[10px]">
                      {wsState === 'live'
                        ? 'RCON is connected. Send a command to get started.'
                        : 'Waiting for RCON connection...'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 p-3">
                    {history.map((entry) => (
                      <div key={entry.id} className="border-l-2 border-zinc-800 pl-3">
                        <div className="flex items-center gap-2 text-tropic-gold">
                          <ChevronRight className="h-3 w-3" />
                          <span className="font-semibold">{entry.command}</span>
                          <span className="ml-auto text-[10px] text-[#4a6070]">
                            {entry.ts.toLocaleTimeString()}
                            {entry.duration_ms != null && ` (${entry.duration_ms}ms)`}
                          </span>
                        </div>
                        {entry.response && !entry.error && (
                          <div className="mt-1 whitespace-pre-wrap text-[#8a9aa8]">{entry.response}</div>
                        )}
                        {entry.error && <div className="mt-1 text-red-400">{entry.error}</div>}
                        {!entry.response && !entry.error && (
                          <div className="mt-1 text-[#4a6070]">
                            <Loader2 className="inline h-3 w-3 animate-spin" /> Executing...
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <ChevronRight className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tropic-gold" />
              <Input
                ref={inputRef}
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={!canExecute || loading}
                placeholder={canExecute ? 'Enter BattlEye RCON command...' : 'Waiting for RCON connection...'}
                className="h-10 border-zinc-800 bg-[#050a0e]/80 pl-9 font-mono text-sm text-white placeholder:text-[#4a6070]"
              />
            </div>
            <Button
              onClick={() => sendCommand()}
              disabled={!canExecute || loading || !command.trim()}
              className="h-10 bg-tropic-gold text-black hover:bg-tropic-gold-light"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <Card className="border-zinc-800 bg-[#050a0e]/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wider text-[#8a9aa8]">
                <Zap className="h-3.5 w-3.5 text-tropic-gold" /> QUICK COMMANDS
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {QUICK_COMMANDS.map((qc) => (
                <button
                  key={qc.cmd}
                  onClick={() => { setCommand(qc.cmd); inputRef.current?.focus(); }}
                  disabled={!canExecute}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-zinc-800/50 disabled:opacity-50"
                >
                  <code className="text-tropic-gold">{qc.label}</code>
                  <span className="ml-auto text-[10px] text-[#4a6070]">{qc.desc}</span>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-[#050a0e]/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wider text-[#8a9aa8]">
                <BookOpen className="h-3.5 w-3.5 text-tropic-gold" /> SAVED SNIPPETS
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {savedSnippets.length === 0 ? (
                <p className="text-[10px] text-[#4a6070]">No saved snippets. Type a command and save it.</p>
              ) : (
                savedSnippets.map((snippet, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <button
                      onClick={() => sendCommand(snippet.command)}
                      disabled={!canExecute || loading}
                      className="flex-1 rounded border border-zinc-800 px-2 py-1 text-left text-xs text-[#8a9aa8] hover:border-tropic-gold-dark/30 hover:text-tropic-gold disabled:opacity-50"
                    >
                      <span className="font-medium">{snippet.name}</span>
                      <span className="ml-1 text-[#4a6070]">-&gt;</span>
                      <code className="ml-1 text-[10px] text-[#4a6070]">{snippet.command}</code>
                    </button>
                    <button onClick={() => removeSnippet(index)} className="text-[#4a6070] hover:text-red-400">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))
              )}
              {command.trim() && (
                <div className="flex gap-1 pt-1">
                  <Input
                    value={newSnippetName}
                    onChange={(e) => setNewSnippetName(e.target.value)}
                    placeholder="Snippet name..."
                    className="h-7 border-zinc-800 bg-[#050a0e]/60 text-[10px] text-white"
                  />
                  <Button size="sm" onClick={saveSnippet} disabled={!newSnippetName.trim()} className="h-7 bg-zinc-800 text-[10px] text-[#8a9aa8] hover:bg-zinc-700">
                    Save
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-[#050a0e]/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wider text-[#8a9aa8]">
                <Clock className="h-3.5 w-3.5 text-tropic-gold" /> COMMAND HISTORY
              </CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-[10px] text-[#4a6070]">No commands sent this session.</p>
              ) : (
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {[...history].reverse().slice(0, 20).map((entry) => (
                    <div key={entry.id} className="flex items-center gap-2 text-[10px]">
                      <span className={entry.error ? 'text-red-400' : 'text-green-400'}>*</span>
                      <code className="text-[#8a9aa8]">{entry.command}</code>
                      <span className="ml-auto text-[#4a6070]">{entry.ts.toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default RconModule;

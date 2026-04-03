import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { API } from '@/utils/api';
import {
  AlertTriangle,
  BookOpen,
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

const STATUS_TEXT = {
  offline: 'Server is offline.',
  disabled: 'RCON is disabled because no password is configured.',
  auth_failed: 'RCON rejected the configured credentials.',
  unavailable: 'RCON is not reachable on the Docker host.',
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

  const fetchStatus = useCallback(async () => {
    if (server?.status !== 'running') {
      setRconStatus({ state: 'offline', detail: STATUS_TEXT.offline });
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

  const canExecute = server?.status === 'running' && rconStatus?.state === 'connected';

  const sendCommand = useCallback(async (cmd) => {
    const trimmed = (cmd || command).trim();
    if (!trimmed || !canExecute) return;
    setLoading(true);
    const entry = { id: Date.now(), command: trimmed, response: null, error: null, ts: new Date() };
    setHistory((prev) => [...prev, entry].slice(-500));

    try {
      const res = await axios.post(`${API}/servers/${serverId}/rcon`, { command: trimmed });
      setHistory((prev) => prev.map((item) => (
        item.id === entry.id ? { ...item, response: res.data?.response || 'OK' } : item
      )));
    } catch (err) {
      setHistory((prev) => prev.map((item) => (
        item.id === entry.id
          ? { ...item, error: err.response?.data?.detail || 'RCON command failed' }
          : item
      )));
    } finally {
      setLoading(false);
      setCommand('');
      historyIdx.current = -1;
      setTimeout(() => {
        if (historyRef.current) historyRef.current.scrollTop = historyRef.current.scrollHeight;
      }, 50);
    }
  }, [canExecute, command, serverId]);

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

  const statusDetail = rconStatus?.detail || STATUS_TEXT[rconStatus?.state] || 'Unknown RCON state.';

  return (
    <div className="flex h-full flex-col gap-4">
      <div className={`flex items-center gap-2 rounded border px-3 py-2 text-xs ${
        canExecute ? 'border-green-600/30 bg-green-600/10 text-green-400' : 'border-amber-600/30 bg-amber-600/10 text-amber-400'
      }`}>
        {statusLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
        <span>{statusLoading ? 'Checking RCON availability...' : statusDetail}</span>
        <Button size="sm" variant="ghost" onClick={fetchStatus} className="ml-auto h-6 px-2 text-[10px] text-inherit hover:bg-white/5">
          <RefreshCw className="mr-1 h-3 w-3" /> Retry
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="flex flex-col gap-3">
          <Card className="border-zinc-800 bg-black/80">
            <CardContent className="p-0">
              <div ref={historyRef} className="h-[50vh] overflow-y-auto font-mono text-xs">
                {history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-600">
                    <Monitor className="mb-3 h-8 w-8 text-gray-700" />
                    <p>RCON console ready.</p>
                    <p className="mt-1 text-[10px]">Use quick commands or send a manual command when RCON is connected.</p>
                  </div>
                ) : (
                  <div className="space-y-3 p-3">
                    {history.map((entry) => (
                      <div key={entry.id} className="border-l-2 border-zinc-800 pl-3">
                        <div className="flex items-center gap-2 text-tropic-gold">
                          <ChevronRight className="h-3 w-3" />
                          <span className="font-semibold">{entry.command}</span>
                          <span className="ml-auto text-[10px] text-gray-600">{entry.ts.toLocaleTimeString()}</span>
                        </div>
                        {entry.response && <div className="mt-1 whitespace-pre-wrap text-gray-300">{entry.response}</div>}
                        {entry.error && <div className="mt-1 text-red-400">{entry.error}</div>}
                        {!entry.response && !entry.error && (
                          <div className="mt-1 text-gray-600">
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
                placeholder={canExecute ? 'Enter BattlEye RCON command...' : 'RCON unavailable'}
                className="h-10 border-zinc-800 bg-black/80 pl-9 font-mono text-sm text-white placeholder:text-gray-600"
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
          <Card className="border-zinc-800 bg-black/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wider text-gray-400">
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
                  <span className="ml-auto text-[10px] text-gray-600">{qc.desc}</span>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-black/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wider text-gray-400">
                <BookOpen className="h-3.5 w-3.5 text-tropic-gold" /> SAVED SNIPPETS
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {savedSnippets.length === 0 ? (
                <p className="text-[10px] text-gray-600">No saved snippets. Type a command and save it.</p>
              ) : (
                savedSnippets.map((snippet, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <button
                      onClick={() => sendCommand(snippet.command)}
                      disabled={!canExecute}
                      className="flex-1 rounded border border-zinc-800 px-2 py-1 text-left text-xs text-gray-300 hover:border-tropic-gold-dark/30 hover:text-tropic-gold disabled:opacity-50"
                    >
                      <span className="font-medium">{snippet.name}</span>
                      <span className="ml-1 text-gray-600">-&gt;</span>
                      <code className="ml-1 text-[10px] text-gray-500">{snippet.command}</code>
                    </button>
                    <button onClick={() => removeSnippet(index)} className="text-gray-600 hover:text-red-400">
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
                    className="h-7 border-zinc-800 bg-black/60 text-[10px] text-white"
                  />
                  <Button size="sm" onClick={saveSnippet} disabled={!newSnippetName.trim()} className="h-7 bg-zinc-800 text-[10px] text-gray-300 hover:bg-zinc-700">
                    Save
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-black/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wider text-gray-400">
                <Clock className="h-3.5 w-3.5 text-tropic-gold" /> COMMAND HISTORY
              </CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-[10px] text-gray-600">No commands sent this session.</p>
              ) : (
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {[...history].reverse().slice(0, 20).map((entry) => (
                    <div key={entry.id} className="flex items-center gap-2 text-[10px]">
                      <span className={entry.error ? 'text-red-400' : 'text-green-400'}>*</span>
                      <code className="text-gray-400">{entry.command}</code>
                      <span className="ml-auto text-gray-600">{entry.ts.toLocaleTimeString()}</span>
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

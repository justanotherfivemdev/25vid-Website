import React, { useState, useRef, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Monitor,
  Send,
  Trash2,
  Clock,
  ChevronRight,
  Loader2,
  BookOpen,
  Zap,
} from 'lucide-react';
import { API } from '@/utils/api';
import ServerOfflinePanel from '@/components/servers/ServerOfflinePanel';

const QUICK_COMMANDS = [
  { label: '#status', cmd: '#status', desc: 'Server status' },
  { label: '#players', cmd: '#players', desc: 'List players' },
  { label: '#kick', cmd: '#kick ', desc: 'Kick player' },
  { label: '#ban', cmd: '#ban ', desc: 'Ban player' },
  { label: '#restart', cmd: '#restart 30', desc: 'Restart in 30s' },
  { label: '#shutdown', cmd: '#shutdown', desc: 'Shutdown server' },
];

const SAVED_SNIPPETS_KEY = 'rcon_saved_snippets';

function RconModule() {
  const { server, serverId, handleServerAction, actionLoading } = useOutletContext();
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savedSnippets, setSavedSnippets] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SAVED_SNIPPETS_KEY) || '[]'); }
    catch { return []; }
  });
  const [newSnippetName, setNewSnippetName] = useState('');
  const historyRef = useRef(null);
  const inputRef = useRef(null);
  const historyIdx = useRef(-1);
  const isRunning = server?.status === 'running';

  const sendCommand = useCallback(async (cmd) => {
    const trimmed = (cmd || command).trim();
    if (!trimmed) return;
    setLoading(true);
    const entry = { id: Date.now(), command: trimmed, response: null, error: null, ts: new Date() };
    setHistory(prev => [...prev, entry]);

    try {
      const res = await axios.post(`${API}/servers/${serverId}/rcon`, { command: trimmed });
      setHistory(prev => prev.map(h => h.id === entry.id ? { ...h, response: res.data?.response || res.data?.output || 'OK' } : h));
    } catch (err) {
      setHistory(prev => prev.map(h => h.id === entry.id ? { ...h, error: err.response?.data?.detail || 'RCON command failed' } : h));
    } finally {
      setLoading(false);
      setCommand('');
      historyIdx.current = -1;
      setTimeout(() => {
        if (historyRef.current) historyRef.current.scrollTop = historyRef.current.scrollHeight;
      }, 50);
    }
  }, [command, serverId]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') { sendCommand(); return; }
    const cmds = history.filter(h => h.command);
    if (e.key === 'ArrowUp' && cmds.length) {
      e.preventDefault();
      const idx = historyIdx.current < 0 ? cmds.length - 1 : Math.max(0, historyIdx.current - 1);
      historyIdx.current = idx;
      setCommand(cmds[idx].command);
    }
    if (e.key === 'ArrowDown' && cmds.length) {
      e.preventDefault();
      if (historyIdx.current >= cmds.length - 1) { historyIdx.current = -1; setCommand(''); }
      else { historyIdx.current++; setCommand(cmds[historyIdx.current].command); }
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

  return (
    <div className="flex h-full flex-col gap-4">
      {!isRunning && (
        <ServerOfflinePanel
          title="RCON is unavailable while the server is offline"
          description="RCON commands, live server statistics, and other real-time admin tools are unavailable until the server is started."
          onStart={() => handleServerAction?.('start')}
          starting={actionLoading === 'start'}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        {/* Main console */}
        <div className="flex flex-col gap-3">
          {/* Response panel */}
          <Card className="border-zinc-800 bg-black/80">
            <CardContent className="p-0">
              <div ref={historyRef} className="h-[50vh] overflow-y-auto font-mono text-xs">
                {history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-600">
                    <Monitor className="mb-3 h-8 w-8 text-gray-700" />
                    <p>RCON Console Ready</p>
                    <p className="mt-1 text-[10px]">Type a command or use a quick action</p>
                  </div>
                ) : (
                  <div className="p-3 space-y-3">
                    {history.map((entry) => (
                      <div key={entry.id} className="border-l-2 border-zinc-800 pl-3">
                        <div className="flex items-center gap-2 text-tropic-gold">
                          <ChevronRight className="h-3 w-3" />
                          <span className="font-semibold">{entry.command}</span>
                          <span className="ml-auto text-[10px] text-gray-600">
                            {entry.ts.toLocaleTimeString()}
                          </span>
                        </div>
                        {entry.response && (
                          <div className="mt-1 whitespace-pre-wrap text-gray-300">{entry.response}</div>
                        )}
                        {entry.error && (
                          <div className="mt-1 text-red-400">{entry.error}</div>
                        )}
                        {!entry.response && !entry.error && (
                          <div className="mt-1 text-gray-600">
                            <Loader2 className="inline h-3 w-3 animate-spin" /> Executing…
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Command input */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <ChevronRight className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tropic-gold" />
              <Input
                ref={inputRef}
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={!isRunning || loading}
                placeholder={isRunning ? 'Enter RCON command…' : 'Server offline'}
                className="h-10 border-zinc-800 bg-black/80 pl-9 font-mono text-sm text-white placeholder:text-gray-600"
              />
            </div>
            <Button onClick={() => sendCommand()} disabled={!isRunning || loading || !command.trim()}
              className="h-10 bg-tropic-gold text-black hover:bg-tropic-gold-light">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          {/* Quick commands */}
          <Card className="border-zinc-800 bg-black/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wider text-gray-400">
                <Zap className="h-3.5 w-3.5 text-tropic-gold" /> QUICK COMMANDS
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {QUICK_COMMANDS.map((qc) => (
                <button key={qc.cmd} onClick={() => { setCommand(qc.cmd); inputRef.current?.focus(); }}
                  disabled={!isRunning}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-zinc-800/50 disabled:opacity-50">
                  <code className="text-tropic-gold">{qc.label}</code>
                  <span className="ml-auto text-[10px] text-gray-600">{qc.desc}</span>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Saved snippets */}
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
                savedSnippets.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <button onClick={() => sendCommand(s.command)} disabled={!isRunning}
                      className="flex-1 rounded border border-zinc-800 px-2 py-1 text-left text-xs text-gray-300 hover:border-tropic-gold-dark/30 hover:text-tropic-gold disabled:opacity-50">
                      <span className="font-medium">{s.name}</span>
                      <span className="ml-1 text-gray-600">→</span>
                      <code className="ml-1 text-[10px] text-gray-500">{s.command}</code>
                    </button>
                    <button onClick={() => removeSnippet(i)} className="text-gray-600 hover:text-red-400">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))
              )}
              {command.trim() && (
                <div className="flex gap-1 pt-1">
                  <Input value={newSnippetName} onChange={(e) => setNewSnippetName(e.target.value)}
                    placeholder="Snippet name…" className="h-7 border-zinc-800 bg-black/60 text-[10px] text-white" />
                  <Button size="sm" onClick={saveSnippet} disabled={!newSnippetName.trim()}
                    className="h-7 bg-zinc-800 text-[10px] text-gray-300 hover:bg-zinc-700">Save</Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Audit log */}
          <Card className="border-zinc-800 bg-black/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wider text-gray-400">
                <Clock className="h-3.5 w-3.5 text-tropic-gold" /> COMMAND HISTORY
              </CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-[10px] text-gray-600">No commands sent this session</p>
              ) : (
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {[...history].reverse().slice(0, 20).map((h) => (
                    <div key={h.id} className="flex items-center gap-2 text-[10px]">
                      <span className={h.error ? 'text-red-400' : 'text-green-400'}>●</span>
                      <code className="text-gray-400">{h.command}</code>
                      <span className="ml-auto text-gray-600">{h.ts.toLocaleTimeString()}</span>
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

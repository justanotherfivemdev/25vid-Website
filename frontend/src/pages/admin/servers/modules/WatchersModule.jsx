import React, { useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Eye,
  Plus,
  Trash2,
  Bell,
  Activity,
  FileText,
  AlertTriangle,
} from 'lucide-react';

const STORAGE_KEY_PREFIX = 'server_watchers_';

const WATCHER_TYPES = [
  { value: 'health', label: 'Health Watcher', desc: 'Monitor server health metrics' },
  { value: 'log', label: 'Log Watcher', desc: 'Watch logs for patterns (regex)' },
  { value: 'threshold', label: 'Threshold Watcher', desc: 'Alert on metric thresholds' },
];

function WatchersModule() {
  const { serverId } = useOutletContext();
  const storageKey = `${STORAGE_KEY_PREFIX}${serverId}`;

  const [watchers, setWatchers] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); }
    catch { return []; }
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newWatcher, setNewWatcher] = useState({
    name: '',
    type: 'health',
    pattern: '',
    metric: 'cpu_percent',
    threshold: 90,
    enabled: true,
    notify: true,
  });

  const save = useCallback((updated) => {
    setWatchers(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
  }, [storageKey]);

  const addWatcher = useCallback(() => {
    if (!newWatcher.name.trim()) return;
    save([...watchers, {
      ...newWatcher,
      id: Date.now(),
      created: new Date().toISOString(),
      triggers: 0,
      lastTriggered: null,
    }]);
    setDialogOpen(false);
    setNewWatcher({ name: '', type: 'health', pattern: '', metric: 'cpu_percent', threshold: 90, enabled: true, notify: true });
  }, [newWatcher, watchers, save]);

  const toggleWatcher = useCallback((id) => {
    save(watchers.map(w => w.id === id ? { ...w, enabled: !w.enabled } : w));
  }, [watchers, save]);

  const removeWatcher = useCallback((id) => {
    save(watchers.filter(w => w.id !== id));
  }, [watchers, save]);

  const typeIcon = (type) => {
    if (type === 'health') return <Activity className="h-4 w-4 text-green-400" />;
    if (type === 'log') return <FileText className="h-4 w-4 text-blue-400" />;
    return <AlertTriangle className="h-4 w-4 text-amber-400" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wider text-gray-300" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
          WATCHERS
        </h2>
        <Button size="sm" onClick={() => setDialogOpen(true)}
          className="h-7 bg-tropic-gold text-black hover:bg-tropic-gold-light text-xs">
          <Plus className="mr-1 h-3 w-3" /> Add Watcher
        </Button>
      </div>

      {watchers.length === 0 ? (
        <Card className="border-zinc-800 bg-black/60">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Eye className="mb-2 h-8 w-8 text-gray-700" />
            <p className="text-sm text-gray-500">No watchers configured</p>
            <p className="mt-1 text-xs text-gray-600">Set up health, log, or threshold watchers for this server</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {watchers.map((watcher) => (
            <Card key={watcher.id} className={`border-zinc-800 bg-black/60 ${!watcher.enabled ? 'opacity-50' : ''}`}>
              <CardContent className="flex items-center gap-3 p-4">
                {typeIcon(watcher.type)}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-200">{watcher.name}</span>
                    <Badge variant="outline" className={`text-[9px] ${
                      watcher.type === 'health' ? 'border-green-600/30 text-green-400' :
                      watcher.type === 'log' ? 'border-blue-600/30 text-blue-400' :
                      'border-amber-600/30 text-amber-400'
                    }`}>{watcher.type}</Badge>
                    {watcher.notify && (
                      <Bell className="h-3 w-3 text-gray-600" />
                    )}
                  </div>
                  <div className="mt-0.5 text-[10px] text-gray-500">
                    {watcher.type === 'log' && watcher.pattern && (
                      <span>Pattern: <code className="text-gray-400">{watcher.pattern}</code></span>
                    )}
                    {watcher.type === 'threshold' && (
                      <span>{watcher.metric} &gt; {watcher.threshold}</span>
                    )}
                    {watcher.type === 'health' && <span>Monitoring server health status</span>}
                    {watcher.triggers > 0 && (
                      <span className="ml-2 text-amber-400">• Triggered {watcher.triggers}×</span>
                    )}
                  </div>
                </div>
                <Switch checked={watcher.enabled} onCheckedChange={() => toggleWatcher(watcher.id)}
                  className="h-4 w-7" />
                <button onClick={() => removeWatcher(watcher.id)} className="text-gray-600 hover:text-red-400">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Watcher Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md border-zinc-800 bg-zinc-950 text-white">
          <DialogHeader>
            <DialogTitle className="text-tropic-gold">Add Watcher</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-400">Name</label>
              <Input value={newWatcher.name} onChange={(e) => setNewWatcher(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g., High CPU Alert"
                className="mt-1 border-zinc-800 bg-black/60 text-sm text-white" />
            </div>
            <div>
              <label className="text-xs text-gray-400">Type</label>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {WATCHER_TYPES.map((wt) => (
                  <button key={wt.value} onClick={() => setNewWatcher(p => ({ ...p, type: wt.value }))}
                    className={`rounded border p-2 text-left text-xs transition-colors ${
                      newWatcher.type === wt.value
                        ? 'border-tropic-gold/30 bg-tropic-gold/10 text-tropic-gold'
                        : 'border-zinc-800 text-gray-500 hover:border-zinc-700'
                    }`}>
                    <div className="font-medium">{wt.label}</div>
                    <div className="text-[10px] mt-0.5 opacity-70">{wt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {newWatcher.type === 'log' && (
              <div>
                <label className="text-xs text-gray-400">Regex Pattern</label>
                <Input value={newWatcher.pattern} onChange={(e) => setNewWatcher(p => ({ ...p, pattern: e.target.value }))}
                  placeholder="error|fatal|crash"
                  className="mt-1 border-zinc-800 bg-black/60 font-mono text-sm text-white" />
              </div>
            )}

            {newWatcher.type === 'threshold' && (
              <>
                <div>
                  <label className="text-xs text-gray-400">Metric</label>
                  <select value={newWatcher.metric} onChange={(e) => setNewWatcher(p => ({ ...p, metric: e.target.value }))}
                    className="mt-1 w-full rounded border border-zinc-800 bg-black/60 px-3 py-2 text-sm text-white">
                    <option value="cpu_percent">CPU %</option>
                    <option value="memory_mb">Memory MB</option>
                    <option value="player_count">Player Count</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400">Threshold</label>
                  <Input type="number" value={newWatcher.threshold}
                    onChange={(e) => {
                      const n = parseInt(e.target.value);
                      setNewWatcher(p => ({ ...p, threshold: Number.isFinite(n) ? n : 0 }));
                    }}
                    className="mt-1 border-zinc-800 bg-black/60 text-sm text-white" />
                </div>
              </>
            )}

            <div className="flex items-center gap-2">
              <Switch checked={newWatcher.notify}
                onCheckedChange={(v) => setNewWatcher(p => ({ ...p, notify: v }))}
                className="h-4 w-7" />
              <span className="text-xs text-gray-400">Send notification on trigger</span>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}
              className="border-zinc-700 text-gray-400">Cancel</Button>
            <Button size="sm" onClick={addWatcher} disabled={!newWatcher.name.trim()}
              className="bg-tropic-gold text-black hover:bg-tropic-gold-light">
              Create Watcher
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default WatchersModule;

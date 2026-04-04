import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Activity,
  AlertTriangle,
  Bell,
  Eye,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { API } from '@/utils/api';

const WATCHER_TYPES = [
  { value: 'health', label: 'Health Watcher', desc: 'Watch server state and readiness' },
  { value: 'log', label: 'Log Watcher', desc: 'Match log output with a regex pattern' },
  { value: 'threshold', label: 'Threshold Watcher', desc: 'Alert when a metric exceeds a limit' },
];

const SEVERITY_OPTIONS = ['low', 'medium', 'high', 'critical'];
const VERDICT_OPTIONS = ['active', 'monitoring', 'resolved', 'false_positive'];

function watcherIcon(type) {
  if (type === 'health') return <Activity className="h-4 w-4 text-green-400" />;
  if (type === 'log') return <FileText className="h-4 w-4 text-blue-400" />;
  return <AlertTriangle className="h-4 w-4 text-amber-400" />;
}

function severityTone(severity) {
  return {
    low: 'border-zinc-700 text-zinc-300',
    medium: 'border-blue-600/30 text-blue-300',
    high: 'border-amber-600/30 text-amber-300',
    critical: 'border-red-600/30 text-red-300',
  }[severity] || 'border-zinc-700 text-zinc-300';
}

function verdictTone(status) {
  return {
    active: 'border-red-600/30 text-red-300',
    monitoring: 'border-amber-600/30 text-amber-300',
    resolved: 'border-green-600/30 text-green-300',
    false_positive: 'border-zinc-700 text-zinc-300',
  }[status] || 'border-zinc-700 text-zinc-300';
}

function WatchersModule() {
  const { serverId } = useOutletContext();
  const [watchers, setWatchers] = useState([]);
  const [detections, setDetections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [newWatcher, setNewWatcher] = useState({
    name: '',
    type: 'health',
    pattern: '',
    metric: 'cpu_percent',
    threshold: 90,
    enabled: true,
    notify: true,
    severity: 'medium',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [watchersRes, detectionsRes] = await Promise.allSettled([
        axios.get(`${API}/servers/${serverId}/watchers`),
        axios.get(`${API}/servers/${serverId}/detections`),
      ]);

      if (watchersRes.status === 'fulfilled') setWatchers(Array.isArray(watchersRes.value.data) ? watchersRes.value.data : []);
      else setWatchers([]);

      if (detectionsRes.status === 'fulfilled') setDetections(Array.isArray(detectionsRes.value.data) ? detectionsRes.value.data : []);
      else setDetections([]);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load watchers.');
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const detectionsByWatcher = useMemo(() => detections.reduce((map, detection) => {
    const watcherId = detection.watcher_id || 'unassigned';
    if (!map[watcherId]) map[watcherId] = [];
    map[watcherId].push(detection);
    return map;
  }, {}), [detections]);

  const addWatcher = useCallback(async () => {
    if (!newWatcher.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      await axios.post(`${API}/servers/${serverId}/watchers`, {
        name: newWatcher.name.trim(),
        type: newWatcher.type,
        pattern: newWatcher.pattern,
        metric: newWatcher.metric,
        threshold: Number(newWatcher.threshold) || 0,
        enabled: newWatcher.enabled,
        notify: newWatcher.notify,
        severity: newWatcher.severity,
      });
      setDialogOpen(false);
      setNewWatcher({
        name: '',
        type: 'health',
        pattern: '',
        metric: 'cpu_percent',
        threshold: 90,
        enabled: true,
        notify: true,
        severity: 'medium',
      });
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create watcher.');
    } finally {
      setSaving(false);
    }
  }, [fetchData, newWatcher, serverId]);

  const updateWatcher = useCallback(async (watcherId, updates) => {
    try {
      await axios.put(`${API}/servers/${serverId}/watchers/${watcherId}`, updates);
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update watcher.');
    }
  }, [fetchData, serverId]);

  const removeWatcher = useCallback(async (watcherId) => {
    try {
      await axios.delete(`${API}/servers/${serverId}/watchers/${watcherId}`);
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete watcher.');
    }
  }, [fetchData, serverId]);

  const updateDetectionVerdict = useCallback(async (detectionId, status) => {
    try {
      await axios.post(`${API}/servers/detections/${detectionId}/verdict`, { status });
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update detection verdict.');
    }
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-wider text-gray-300" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
            WATCHERS
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Backend watchers now evaluate health state, log patterns, and metric thresholds on a schedule.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={fetchData} className="h-7 border-zinc-800 text-xs text-gray-400">
            <RefreshCw className={`mr-1 h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)} className="h-7 bg-tropic-gold text-black hover:bg-tropic-gold-light text-xs">
            <Plus className="mr-1 h-3 w-3" /> Add Watcher
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-600/30 bg-red-600/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-tropic-gold" />
        </div>
      ) : watchers.length === 0 ? (
        <Card className="border-zinc-800 bg-black/60">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Eye className="mb-2 h-8 w-8 text-gray-700" />
            <p className="text-sm text-gray-500">No watchers configured</p>
            <p className="mt-1 text-xs text-gray-600">Set up health, log, or threshold watchers for this server.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {watchers.map((watcher) => {
            const watcherDetections = detectionsByWatcher[watcher.id] || [];
            return (
              <Card key={watcher.id} className={`border-zinc-800 bg-black/60 ${!watcher.enabled ? 'opacity-60' : ''}`}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <div className="pt-0.5">{watcherIcon(watcher.type)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-gray-200">{watcher.name}</span>
                        <Badge variant="outline" className="border-zinc-700 text-[10px] text-gray-400">
                          {watcher.type}
                        </Badge>
                        <Badge variant="outline" className={`text-[10px] ${severityTone(watcher.severity)}`}>
                          {watcher.severity}
                        </Badge>
                        {watcher.notify && <Bell className="h-3 w-3 text-gray-500" />}
                      </div>
                      <div className="mt-1 text-[11px] text-gray-500">
                        {watcher.type === 'log' && watcher.pattern && (
                          <span>Pattern: <code className="text-gray-400">{watcher.pattern}</code></span>
                        )}
                        {watcher.type === 'threshold' && (
                          <span>{watcher.metric} &gt; {watcher.threshold}</span>
                        )}
                        {watcher.type === 'health' && <span>Monitoring deployment state, runtime health, and degraded readiness.</span>}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-gray-600">
                        <span>Triggers: {watcher.trigger_count || 0}</span>
                        <span>Recent detections: {watcherDetections.length}</span>
                        {watcher.last_triggered_at && <span>Last triggered: {new Date(watcher.last_triggered_at).toLocaleString()}</span>}
                      </div>
                    </div>
                    <Switch checked={watcher.enabled} onCheckedChange={() => updateWatcher(watcher.id, { enabled: !watcher.enabled })} className="h-4 w-7" />
                    <button onClick={() => removeWatcher(watcher.id)} className="text-gray-600 hover:text-red-400">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {watcherDetections.length > 0 && (
                    <div className="rounded-lg border border-zinc-800/70 bg-zinc-950/60 p-3">
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
                        Recent Detections
                      </div>
                      <div className="space-y-2">
                        {watcherDetections.slice(0, 3).map((detection) => (
                          <div key={detection.id} className="rounded border border-zinc-800 bg-black/40 p-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-medium text-gray-200">{detection.title}</span>
                              <Badge variant="outline" className={`text-[10px] ${verdictTone(detection.status)}`}>
                                {detection.status}
                              </Badge>
                              <Badge variant="outline" className="border-zinc-700 text-[10px] text-gray-400">
                                {detection.source_category}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs text-gray-400">{detection.summary}</p>
                            <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-gray-600">
                              <span>{detection.occurrence_count || 0} observations</span>
                              {detection.last_seen && <span>Last seen: {new Date(detection.last_seen).toLocaleString()}</span>}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {VERDICT_OPTIONS.map((status) => (
                                <Button
                                  key={status}
                                  size="sm"
                                  variant="outline"
                                  onClick={() => updateDetectionVerdict(detection.id, status)}
                                  className={`h-6 text-[10px] ${detection.status === status ? 'border-tropic-gold/40 text-tropic-gold' : 'border-zinc-800 text-gray-400'}`}
                                >
                                  {status.replace(/_/g, ' ')}
                                </Button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {detections.length > 0 && (
        <Card className="border-zinc-800 bg-black/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm tracking-[0.16em] text-gray-200">
              <ShieldCheck className="h-4 w-4 text-tropic-gold" /> DETECTIONS
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {detections.slice(0, 8).map((detection) => (
              <div key={detection.id} className="rounded-xl border border-zinc-800/70 bg-zinc-950/70 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-gray-200">{detection.title}</span>
                  <Badge variant="outline" className={`text-[10px] ${verdictTone(detection.status)}`}>
                    {detection.status}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {(detection.source_streams || []).join(', ') || 'No source streams recorded'}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md border-zinc-800 bg-zinc-950 text-white">
          <DialogHeader>
            <DialogTitle className="text-tropic-gold">Add Watcher</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-400">Name</label>
              <Input
                value={newWatcher.name}
                onChange={(e) => setNewWatcher((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. High CPU Alert"
                className="mt-1 border-zinc-800 bg-black/60 text-sm text-white"
              />
            </div>

            <div>
              <label className="text-xs text-gray-400">Type</label>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {WATCHER_TYPES.map((watcherType) => (
                  <button
                    key={watcherType.value}
                    onClick={() => setNewWatcher((prev) => ({ ...prev, type: watcherType.value }))}
                    className={`rounded border p-2 text-left text-xs transition-colors ${
                      newWatcher.type === watcherType.value
                        ? 'border-tropic-gold/30 bg-tropic-gold/10 text-tropic-gold'
                        : 'border-zinc-800 text-gray-500 hover:border-zinc-700'
                    }`}
                  >
                    <div className="font-medium">{watcherType.label}</div>
                    <div className="mt-0.5 text-[10px] opacity-70">{watcherType.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-gray-400">Severity</label>
                <select
                  value={newWatcher.severity}
                  onChange={(e) => setNewWatcher((prev) => ({ ...prev, severity: e.target.value }))}
                  className="mt-1 w-full rounded border border-zinc-800 bg-black/60 px-3 py-2 text-sm text-white"
                >
                  {SEVERITY_OPTIONS.map((severity) => (
                    <option key={severity} value={severity}>{severity}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-black/40 px-4 py-3">
                <span className="text-sm text-gray-300">Notify on trigger</span>
                <Switch checked={newWatcher.notify} onCheckedChange={(value) => setNewWatcher((prev) => ({ ...prev, notify: value }))} className="h-4 w-7" />
              </div>
            </div>

            {newWatcher.type === 'log' && (
              <div>
                <label className="text-xs text-gray-400">Regex Pattern</label>
                <Input
                  value={newWatcher.pattern}
                  onChange={(e) => setNewWatcher((prev) => ({ ...prev, pattern: e.target.value }))}
                  placeholder="error|fatal|crash"
                  className="mt-1 border-zinc-800 bg-black/60 font-mono text-sm text-white"
                />
              </div>
            )}

            {newWatcher.type === 'threshold' && (
              <>
                <div>
                  <label className="text-xs text-gray-400">Metric</label>
                  <select
                    value={newWatcher.metric}
                    onChange={(e) => setNewWatcher((prev) => ({ ...prev, metric: e.target.value }))}
                    className="mt-1 w-full rounded border border-zinc-800 bg-black/60 px-3 py-2 text-sm text-white"
                  >
                    <option value="cpu_percent">CPU %</option>
                    <option value="memory_mb">Memory MB</option>
                    <option value="player_count">Player Count</option>
                    <option value="server_fps">Server FPS</option>
                    <option value="avg_player_ping_ms">Avg Ping</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400">Threshold</label>
                  <Input
                    type="number"
                    value={newWatcher.threshold}
                    onChange={(e) => setNewWatcher((prev) => ({ ...prev, threshold: Number(e.target.value) || 0 }))}
                    className="mt-1 border-zinc-800 bg-black/60 text-sm text-white"
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} className="border-zinc-700 text-gray-400">
              Cancel
            </Button>
            <Button size="sm" onClick={addWatcher} disabled={!newWatcher.name.trim() || saving} className="bg-tropic-gold text-black hover:bg-tropic-gold-light">
              {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              Create Watcher
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default WatchersModule;

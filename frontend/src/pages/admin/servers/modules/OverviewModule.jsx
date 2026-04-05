import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Activity,
  Clock,
  Users,
  Cpu,
  HardDrive,
  AlertTriangle,
  Puzzle,
  Settings,
  Network,
  Server,
  Loader2,
  CheckCircle,
  BarChart3,
  Play,
  Square,
  RotateCcw,
  ShieldAlert,
  RefreshCw,
  Lock,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  ShieldCheck,
  FileText,
  X,
} from 'lucide-react';
import { API } from '@/utils/api';
import { canRestartServer, canStartServer, canStopServer, isServerDegraded, normalizeServer } from '@/utils/serverStatus';

/* ── Human-friendly severity helpers ──────────────────────────────────── */

const SEVERITY_CONFIG = {
  critical: { cls: 'border-red-600/30 bg-red-600/5', dot: 'bg-red-500', text: 'text-red-300' },
  high: { cls: 'border-orange-600/30 bg-orange-600/5', dot: 'bg-orange-500', text: 'text-orange-300' },
  medium: { cls: 'border-amber-600/30 bg-amber-600/5', dot: 'bg-amber-500', text: 'text-amber-300' },
  low: { cls: 'border-zinc-600/30 bg-zinc-600/5', dot: 'bg-zinc-500', text: 'text-zinc-400' },
};

/* ── Collapsible section ──────────────────────────────────────────────── */

function CollapsibleSection({ title, icon: Icon, count, open, onToggle, badge, children }) {
  return (
    <div className="border border-zinc-800/60 rounded bg-[#050a0e]/40">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-zinc-900/40 transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3 text-[#4a6070]" /> : <ChevronRight className="h-3 w-3 text-[#4a6070]" />}
        {Icon && <Icon className="h-3.5 w-3.5 text-tropic-gold" />}
        <span className="font-semibold tracking-wider text-[#8a9aa8]" style={{ fontFamily: "'Share Tech', sans-serif" }}>{title}</span>
        {count != null && count > 0 && (
          <Badge variant="outline" className="ml-1 border-zinc-700 text-[9px] text-[#8a9aa8]">{count}</Badge>
        )}
        {badge}
        <span className="ml-auto text-[10px] text-[#4a6070]">{open ? 'collapse' : 'expand'}</span>
      </button>
      {open && <div className="border-t border-zinc-800/40 px-3 py-2">{children}</div>}
    </div>
  );
}

/* ── Evidence Viewer (log snapshot) ───────────────────────────────────── */

function EvidenceViewer({ snapshot, onClose }) {
  if (!snapshot || snapshot.length === 0) {
    return (
      <div className="rounded border border-zinc-800 bg-[#050a0e] p-3 text-xs text-[#4a6070]">
        No log evidence captured for this event.
      </div>
    );
  }

  return (
    <div className="rounded border border-zinc-800 bg-[#050a0e] overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-800/60 px-3 py-1.5">
        <span className="text-[10px] font-semibold tracking-wider text-[#4a6070]">LOG EVIDENCE</span>
        {onClose && (
          <button type="button" onClick={onClose} className="text-[#4a6070] hover:text-[#8a9aa8]">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="max-h-48 overflow-y-auto p-2 font-mono text-[11px] leading-relaxed">
        {snapshot.map((entry, idx) => (
          <div
            key={idx}
            className={`flex gap-2 px-1 py-0.5 rounded ${
              entry.is_trigger
                ? 'bg-amber-500/10 border-l-2 border-amber-500'
                : 'hover:bg-zinc-900/40'
            }`}
          >
            <span className="shrink-0 w-[60px] text-[10px] text-zinc-600 tabular-nums">
              {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
            </span>
            <span className="shrink-0 text-[10px] text-zinc-500 w-[50px] truncate">{entry.source || ''}</span>
            <span className={entry.is_trigger ? 'text-amber-200 font-medium' : 'text-[#8a9aa8]'}>
              {entry.line}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Single Diagnostic Item ───────────────────────────────────────────── */

function DiagnosticItem({ item, onMarkSafe, onReactivate, busy }) {
  const [expanded, setExpanded] = useState(false);
  const sev = SEVERITY_CONFIG[item.severity] || SEVERITY_CONFIG.medium;
  const isIgnored = item.status === 'ignored' || item.status === 'false_positive';

  return (
    <div className={`rounded border ${isIgnored ? 'border-zinc-800/40 opacity-60' : sev.cls} transition-all`}>
      <div className="flex items-start gap-2 px-3 py-2">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${sev.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-[#d0d8e0]">{item.title}</span>
            <Badge variant="outline" className="border-white/10 text-[9px] uppercase tracking-wider text-[#8a9aa8]">
              {item.severity}
            </Badge>
            {isIgnored && (
              <Badge variant="outline" className="border-zinc-700 text-[9px] text-zinc-500">
                safe / known
              </Badge>
            )}
          </div>
          {/* Human-friendly summary */}
          {item.human_summary && (
            <p className="mt-1 text-xs text-[#8a9aa8] leading-relaxed">{item.human_summary}</p>
          )}
          {!item.human_summary && item.summary && (
            <p className="mt-1 text-xs text-[#8a9aa8]">{item.summary}</p>
          )}
          {/* What this means + what to do */}
          {(item.human_impact || item.human_action) && (
            <div className="mt-1.5 space-y-1">
              {item.human_impact && (
                <div className="flex gap-1.5 text-[11px]">
                  <span className="shrink-0 font-semibold text-[#4a6070]">Impact:</span>
                  <span className="text-[#8a9aa8]">{item.human_impact}</span>
                </div>
              )}
              {item.human_action && (
                <div className="flex gap-1.5 text-[11px]">
                  <span className="shrink-0 font-semibold text-[#4a6070]">Action:</span>
                  <span className="text-[#8a9aa8]">{item.human_action}</span>
                </div>
              )}
            </div>
          )}
          {/* Recommended actions */}
          {!item.human_action && item.recommended_actions?.length > 0 && (
            <div className="mt-1.5 space-y-0.5">
              {item.recommended_actions.map((action, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[11px] text-[#4a6070]">
                  <span className="mt-0.5">→</span>
                  <span>{action}</span>
                </div>
              ))}
            </div>
          )}
          {/* Meta row */}
          <div className="mt-1.5 flex items-center gap-3 text-[10px] text-[#4a6070]">
            {item.source_type && <span>{item.source_type}</span>}
            {item.last_seen && <span>{new Date(item.last_seen).toLocaleString()}</span>}
            {item.occurrence_count > 1 && <span>×{item.occurrence_count}</span>}
            {(item.log_snapshot?.length > 0 || item.evidence?.length > 0) && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex items-center gap-1 text-tropic-gold hover:text-tropic-gold-light transition-colors"
              >
                <FileText className="h-3 w-3" />
                {expanded ? 'Hide evidence' : 'View evidence'}
              </button>
            )}
          </div>
        </div>
        {/* Actions */}
        <div className="shrink-0 flex items-center gap-1 pt-0.5">
          {!isIgnored ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onMarkSafe?.(item.id)}
              disabled={busy}
              className="h-6 px-2 text-[10px] border-zinc-800 text-[#8a9aa8] hover:text-green-400 hover:border-green-600/30"
              title="Mark as safe / known issue"
            >
              <ShieldCheck className="h-3 w-3 mr-1" /> Safe
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onReactivate?.(item.id)}
              disabled={busy}
              className="h-6 px-2 text-[10px] border-zinc-800 text-[#4a6070]"
              title="Return to active diagnostics"
            >
              <Eye className="h-3 w-3 mr-1" /> Reactivate
            </Button>
          )}
        </div>
      </div>
      {/* Evidence viewer */}
      {expanded && (
        <div className="border-t border-zinc-800/40 px-3 py-2">
          <EvidenceViewer
            snapshot={item.log_snapshot?.length > 0 ? item.log_snapshot : null}
            onClose={() => setExpanded(false)}
          />
        </div>
      )}
    </div>
  );
}

function OverviewModule() {
  const { server: rawServer, serverId, fetchServer, handleServerAction, actionLoading } = useOutletContext();
  const server = normalizeServer(rawServer);
  const [metricsSummary, setMetricsSummary] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [detections, setDetections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [showIgnored, setShowIgnored] = useState(false);
  const [verdictBusy, setVerdictBusy] = useState(false);

  /* ── Collapsible state ──────────────────────────────────────────── */
  const [diagOpen, setDiagOpen] = useState(true);
  const [stagesOpen, setStagesOpen] = useState(false);
  const [ignoredOpen, setIgnoredOpen] = useState(false);

  const fetchOverviewData = useCallback(async () => {
    try {
      const [metricsRes, incidentsRes, detectionsRes] = await Promise.allSettled([
        axios.get(`${API}/servers/${serverId}/metrics/summary`),
        axios.get(`${API}/servers/${serverId}/incidents?status=open`),
        axios.get(`${API}/servers/${serverId}/detections`, {
          params: { include_ignored: showIgnored },
        }),
      ]);
      if (metricsRes.status === 'fulfilled') setMetricsSummary(metricsRes.value.data);
      if (incidentsRes.status === 'fulfilled') setIncidents(incidentsRes.value.data?.incidents || incidentsRes.value.data || []);
      if (detectionsRes.status === 'fulfilled') {
        const data = detectionsRes.value.data;
        setDetections(Array.isArray(data) ? data : data?.detections || []);
      }
    } finally {
      setLoading(false);
    }
  }, [serverId, showIgnored]);

  useEffect(() => { fetchOverviewData(); }, [fetchOverviewData]);

  useEffect(() => {
    const iv = setInterval(fetchOverviewData, 15_000);
    return () => clearInterval(iv);
  }, [fetchOverviewData]);

  const latest = metricsSummary?.latest || {};
  const trend = metricsSummary?.trend_24h || {};
  const status = server?.status || 'stopped';
  const isRunning = status === 'running';
  const canStart = canStartServer(server);
  const canStop = canStopServer(server);
  const canRestart = canRestartServer(server);
  const modCount = server?.mods?.length || 0;
  const ports = server?.ports || {};
  const troubleshooting = server?.troubleshooting || {};
  const serverAdminToolsConfigTarget = troubleshooting.profile_directory || troubleshooting.cd_target || '';
  const serverAdminToolsInstalled = (server?.mods || []).some((mod) => {
    const haystack = `${mod.name || ''} ${mod.mod_id || mod.modId || ''}`.toLowerCase();
    return haystack.includes('server admin tools');
  });
  const startupParameters = Array.isArray(server?.startup_parameters) ? server.startup_parameters : [];
  const logStatsEnabled = server?.log_stats_enabled !== false;
  const maxFps = server?.max_fps ?? 120;
  const [locking, setLocking] = useState(false);

  const handleLockdown = useCallback(async () => {
    setLocking(true);
    try {
      await axios.post(`${API}/servers/${serverId}/rcon`, { command: '#lock' });
    } finally {
      setLocking(false);
    }
  }, [serverId]);

  const handleReset = useCallback(async () => {
    setResetting(true);
    try {
      await axios.post(`${API}/servers/${serverId}/reset`);
      await fetchServer(true);
      await fetchOverviewData();
      setResetDialogOpen(false);
    } finally {
      setResetting(false);
    }
  }, [fetchOverviewData, fetchServer, serverId]);

  const handleMarkSafe = useCallback(async (detectionId) => {
    setVerdictBusy(true);
    try {
      await axios.post(`${API}/servers/${serverId}/detections/${detectionId}/verdict`, {
        status: 'ignored',
        verdict_notes: 'Marked safe by operator',
      });
      await fetchOverviewData();
    } finally {
      setVerdictBusy(false);
    }
  }, [fetchOverviewData, serverId]);

  const handleReactivate = useCallback(async (detectionId) => {
    setVerdictBusy(true);
    try {
      await axios.post(`${API}/servers/${serverId}/detections/${detectionId}/verdict`, {
        status: 'active',
        verdict_notes: 'Reactivated by operator',
      });
      await fetchOverviewData();
    } finally {
      setVerdictBusy(false);
    }
  }, [fetchOverviewData, serverId]);

  const activeDetections = useMemo(
    () => detections.filter((d) => d.status === 'active' || d.status === 'monitoring'),
    [detections],
  );
  const ignoredDetections = useMemo(
    () => detections.filter((d) => d.status === 'ignored' || d.status === 'false_positive' || d.status === 'resolved'),
    [detections],
  );
  const hasProvisioningIssues = useMemo(() => {
    const stages = server?.provisioning_stages;
    if (!stages || typeof stages !== 'object') return false;
    return Object.values(stages).some(
      (stage) => stage && typeof stage === 'object' && (stage.status === 'failed' || stage.status === 'warning'),
    );
  }, [server?.provisioning_stages]);
  const showDiagnostics = activeDetections.length > 0 || ignoredDetections.length > 0 || isServerDegraded(server) || server?.status === 'error' || hasProvisioningIssues;

  const formatUptime = (seconds) => {
    if (!seconds) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
    return `${h}h ${m}m`;
  };

  const healthCards = [
    {
      label: 'CPU Usage',
      value: latest.cpu_host_percent != null || latest.cpu_percent != null ? `${(latest.cpu_host_percent ?? latest.cpu_percent).toFixed(1)}%` : 'Unavailable',
      icon: Cpu,
      color: 'text-blue-400',
      border: 'border-blue-600/20',
      trend: trend.avg_cpu != null ? `Avg: ${trend.avg_cpu.toFixed(1)}%` : 'Container metric',
    },
    {
      label: 'Memory',
      value: latest.memory_mb != null ? `${latest.memory_mb.toFixed(0)} MB` : 'Unavailable',
      icon: HardDrive,
      color: 'text-purple-400',
      border: 'border-purple-600/20',
      trend: trend.avg_memory != null ? `Avg: ${trend.avg_memory.toFixed(0)} MB` : 'Container metric',
    },
    {
      label: 'Players',
      value: latest.player_count != null ? `${latest.player_count}/${latest.max_players || '?'}` : 'Unavailable',
      icon: Users,
      color: 'text-green-400',
      border: 'border-green-600/20',
      trend: latest.metric_sources?.player_count ? `Source: ${latest.metric_sources.player_count}` : 'Awaiting live RCON data',
    },
    {
      label: 'Uptime',
      value: formatUptime(latest.uptime_seconds),
      icon: Clock,
      color: 'text-tropic-gold',
      border: 'border-tropic-gold-dark/20',
      trend: server?.last_started ? `Since: ${new Date(server.last_started).toLocaleString()}` : null,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Health Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {healthCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className={`${card.border} bg-[#050a0e]/60 backdrop-blur-sm`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-[#4a6070]">{card.label}</span>
                  <Icon className={`h-4 w-4 ${card.color}`} />
                </div>
                <div className="mt-2 text-2xl font-bold text-white" style={{ fontFamily: "'Share Tech', sans-serif" }}>
                  {loading ? <div className="h-8 w-16 animate-pulse rounded bg-zinc-800" /> : card.value}
                </div>
                {card.trend && (
                  <div className="mt-1 text-[11px] text-[#4a6070]">{card.trend}</div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Diagnostics Panel (compact, collapsible) ────────────────────── */}
      {showDiagnostics && (
        <div className="space-y-2">
          {/* Active diagnostics */}
          {activeDetections.length > 0 && (
            <CollapsibleSection
              title="ACTIVE DIAGNOSTICS"
              icon={AlertTriangle}
              count={activeDetections.length}
              open={diagOpen}
              onToggle={() => setDiagOpen((v) => !v)}
            >
              <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                {activeDetections.map((item) => (
                  <DiagnosticItem
                    key={item.id}
                    item={item}
                    onMarkSafe={handleMarkSafe}
                    onReactivate={handleReactivate}
                    busy={verdictBusy}
                  />
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Provisioning stages (collapsed by default when no issues) */}
          {hasProvisioningIssues && (isServerDegraded(server) || server?.status === 'error') && (
            <CollapsibleSection
              title="PROVISIONING STAGES"
              icon={Activity}
              count={Object.keys(server.provisioning_stages).length}
              open={stagesOpen}
              onToggle={() => setStagesOpen((v) => !v)}
              badge={
                isServerDegraded(server)
                  ? <Badge variant="outline" className="ml-1 border-amber-600/30 text-[9px] text-amber-300">needs review</Badge>
                  : server?.status === 'error'
                    ? <Badge variant="outline" className="ml-1 border-red-600/30 text-[9px] text-red-300">failed</Badge>
                    : null
              }
            >
              <div className="space-y-1.5 max-h-[30vh] overflow-y-auto">
                {Object.values(server.provisioning_stages).map((stage) => (
                  <div key={stage.name} className="flex items-center gap-2 text-xs py-0.5">
                    {stage.status === 'success' ? (
                      <CheckCircle className="h-3 w-3 shrink-0 text-green-400" />
                    ) : stage.status === 'failed' ? (
                      <AlertTriangle className="h-3 w-3 shrink-0 text-red-400" />
                    ) : (
                      <Activity className="h-3 w-3 shrink-0 text-[#4a6070]" />
                    )}
                    <span className={`capitalize ${
                      stage.status === 'success' ? 'text-green-400' :
                      stage.status === 'failed' ? 'text-red-400' :
                      'text-[#4a6070]'
                    }`}>
                      {stage.name.replace(/_/g, ' ')}
                    </span>
                    {stage.message && <span className="text-[#4a6070] truncate">{stage.message}</span>}
                    {stage.error && <span className="ml-auto text-red-400/80 text-[11px] truncate max-w-[40%]">{stage.error}</span>}
                  </div>
                ))}
                {(server.summary_message || server.last_docker_error) && (
                  <p className="mt-1 border-t border-zinc-800 pt-1 text-[11px] text-[#4a6070]">{server.summary_message || server.last_docker_error}</p>
                )}
              </div>
            </CollapsibleSection>
          )}

          {/* Ignored / archived diagnostics */}
          {showIgnored && ignoredDetections.length > 0 && (
            <CollapsibleSection
              title="RESOLVED / KNOWN SAFE"
              icon={EyeOff}
              count={ignoredDetections.length}
              open={ignoredOpen}
              onToggle={() => setIgnoredOpen((v) => !v)}
            >
              <div className="space-y-2 max-h-[30vh] overflow-y-auto">
                {ignoredDetections.map((item) => (
                  <DiagnosticItem
                    key={item.id}
                    item={item}
                    onMarkSafe={handleMarkSafe}
                    onReactivate={handleReactivate}
                    busy={verdictBusy}
                  />
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Toggle for showing ignored items */}
          <div className="flex items-center gap-2 text-[10px] text-[#4a6070]">
            <button
              type="button"
              onClick={() => setShowIgnored((v) => !v)}
              className="flex items-center gap-1 hover:text-[#8a9aa8] transition-colors"
            >
              {showIgnored ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {showIgnored ? 'Hide archived' : 'Show archived'}
            </button>
          </div>
        </div>
      )}

      {/* Open Incidents Alert */}
      {incidents.length > 0 && (
        <div className="rounded-lg border border-red-600/30 bg-red-600/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-400">
            <AlertTriangle className="h-4 w-4" />
            {incidents.length} Open Incident{incidents.length > 1 ? 's' : ''}
          </div>
          <div className="space-y-2">
            {incidents.slice(0, 3).map((inc, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-[#8a9aa8]">
                <Badge variant="outline" className={`text-[10px] ${
                  inc.severity === 'critical' ? 'border-red-600/50 text-red-400' :
                  inc.severity === 'high' ? 'border-amber-600/50 text-amber-400' :
                  'border-zinc-600/50 text-zinc-400'
                }`}>
                  {inc.severity?.toUpperCase()}
                </Badge>
                <span className="text-[#8a9aa8]">{inc.title}</span>
                <span className="ml-auto text-[#4a6070]">{inc.detected_at ? new Date(inc.detected_at).toLocaleString() : ''}</span>
              </div>
            ))}
          </div>
          <Link to="admin/incidents" className="mt-2 inline-block text-xs text-red-400 hover:text-red-300">
            View all incidents →
          </Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Server Identity */}
        <Card className="border-zinc-800 bg-[#050a0e]/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-wider text-[#8a9aa8]">
              <Server className="h-4 w-4 text-tropic-gold" /> SERVER IDENTITY
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Name" value={server.name} />
            <DetailRow label="Description" value={server.description || '—'} />
            <DetailRow label="Docker Image" value={server.docker_image} mono />
            <DetailRow label="Container" value={troubleshooting.actual_container_name || server.container_name} mono />
            <DetailRow label="Created By" value={server.created_by || '—'} />
            <DetailRow label="Created" value={server.created_at ? new Date(server.created_at).toLocaleString() : '—'} />
          </CardContent>
        </Card>

        {/* Network & Ports */}
        <Card className="border-zinc-800 bg-[#050a0e]/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-wider text-[#8a9aa8]">
              <Network className="h-4 w-4 text-tropic-gold" /> NETWORK
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Game Port" value={ports.game || '2001'} mono />
            <DetailRow label="Query Port" value={ports.query || '17777'} mono />
            <DetailRow label="RCON Port" value={ports.rcon || '19999'} mono />
            <div className="pt-2">
              <span className="text-xs font-medium text-[#4a6070]">Tags</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {(server.tags || []).length > 0 ? server.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="border-tropic-gold-dark/30 text-tropic-gold text-[10px]">
                    {tag}
                  </Badge>
                )) : <span className="text-xs text-[#4a6070]">No tags</span>}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Mods Summary */}
        <Card className="border-zinc-800 bg-[#050a0e]/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-wider text-[#8a9aa8]">
              <Puzzle className="h-4 w-4 text-tropic-gold" /> MODS
              <Badge variant="outline" className="ml-auto border-zinc-700 text-xs text-[#8a9aa8]">{modCount}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {modCount > 0 ? (
              <div className="space-y-1.5">
                {server.mods.slice(0, 5).map((mod, i) => (
                  <div key={i} className="flex items-center gap-2 rounded border border-zinc-800/50 bg-zinc-900/30 px-3 py-1.5 text-xs">
                    <span className="text-[#8a9aa8]">{i + 1}.</span>
                    <span className="text-[#d0d8e0]">{mod.name || mod.mod_id || mod.modId}</span>
                  </div>
                ))}
                {modCount > 5 && (
                  <Link to="mods" className="block pt-1 text-xs text-tropic-gold hover:text-tropic-gold-light">
                    +{modCount - 5} more mods →
                  </Link>
                )}
              </div>
            ) : (
              <p className="text-xs text-[#4a6070]">No mods configured</p>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="border-zinc-800 bg-[#050a0e]/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-wider text-[#8a9aa8]">
              <Activity className="h-4 w-4 text-tropic-gold" /> OPERATIONS
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="outline" size="sm" onClick={() => handleServerAction?.('start')} disabled={!canStart || actionLoading === 'start' || resetting}
                className="justify-start border-green-700/30 text-green-400 hover:bg-green-700/10 hover:text-green-300">
                {actionLoading === 'start' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />} Start
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleServerAction?.('stop')} disabled={!canStop || actionLoading === 'stop' || resetting}
                className="justify-start border-red-700/30 text-red-400 hover:bg-red-700/10 hover:text-red-300">
                {actionLoading === 'stop' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Square className="mr-2 h-4 w-4" />} Shutdown
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleServerAction?.('restart')} disabled={!canRestart || actionLoading === 'restart' || resetting}
                className="justify-start border-amber-700/30 text-amber-400 hover:bg-amber-700/10 hover:text-amber-300">
                {actionLoading === 'restart' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />} Restart
              </Button>
              <Button variant="outline" size="sm" onClick={handleLockdown} disabled={!isRunning || locking || !!actionLoading}
                className="justify-start border-purple-700/30 text-purple-400 hover:bg-purple-700/10 hover:text-purple-300">
                {locking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />} Lockdown
              </Button>
              <Button variant="outline" size="sm" onClick={() => setResetDialogOpen(true)} disabled={resetting || !!actionLoading}
                className="justify-start border-red-800/40 text-red-300 hover:bg-red-900/20 hover:text-red-200 sm:col-span-2">
                {resetting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Reset
              </Button>
            </div>
            <p className="rounded border border-red-700/30 bg-red-900/10 px-3 py-2 text-xs text-[#8a9aa8]">
              Reset removes all mods, restores baseline server settings, and returns the server to its original post-creation state.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Link to="console" className="block">
                <Button variant="outline" size="sm" className="w-full justify-start border-zinc-800 text-[#8a9aa8] hover:border-tropic-gold-dark/30 hover:text-tropic-gold">
                  <Activity className="mr-2 h-4 w-4" /> View Console Logs
                </Button>
              </Link>
              <Link to="rcon" className="block">
                <Button variant="outline" size="sm" className="w-full justify-start border-zinc-800 text-[#8a9aa8] hover:border-tropic-gold-dark/30 hover:text-tropic-gold">
                  <Settings className="mr-2 h-4 w-4" /> Open RCON Console
                </Button>
              </Link>
              <Link to="config/server" className="block">
                <Button variant="outline" size="sm" className="w-full justify-start border-zinc-800 text-[#8a9aa8] hover:border-tropic-gold-dark/30 hover:text-tropic-gold">
                  <Settings className="mr-2 h-4 w-4" /> Edit Configuration
                </Button>
              </Link>
              <Link to="metrics" className="block">
                <Button variant="outline" size="sm" className="w-full justify-start border-zinc-800 text-[#8a9aa8] hover:border-tropic-gold-dark/30 hover:text-tropic-gold">
                  <BarChart3 className="mr-2 h-4 w-4" /> View Metrics
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-zinc-800 bg-[#050a0e]/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-wider text-[#8a9aa8]">
              <ShieldAlert className="h-4 w-4 text-tropic-gold" /> SERVER ADMIN TOOLS
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Installed" value={serverAdminToolsInstalled ? 'Detected in mod list' : 'Not detected'} />
            <DetailRow label="Config Target" value={serverAdminToolsConfigTarget ? `${serverAdminToolsConfigTarget}/ServerAdminTools_Config.json` : '—'} mono />
            <DetailRow label="Bootstrap Status" value={serverAdminToolsInstalled ? 'Ready for admin troubleshooting' : 'Awaiting mod installation'} />
            <DetailRow label="logStats" value={logStatsEnabled ? 'Enabled by runtime defaults' : 'Disabled'} />
            <DetailRow label="Max FPS" value={String(maxFps)} mono />
            <div>
              <span className="text-xs font-medium text-[#4a6070]">Startup Parameters</span>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {startupParameters.length > 0 ? startupParameters.map((param) => (
                  <Badge key={param} variant="outline" className="border-zinc-700 text-[#8a9aa8]">{param}</Badge>
                )) : <span className="text-xs text-[#4a6070]">No extra startup parameters configured</span>}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-[#050a0e]/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-wider text-[#8a9aa8]">
              <Settings className="h-4 w-4 text-tropic-gold" /> TROUBLESHOOTING
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Actual Container" value={troubleshooting.actual_container_name || '—'} mono />
            <DetailRow label="Working Path" value={troubleshooting.working_directory || '—'} mono />
            <DetailRow label="Config Directory" value={troubleshooting.config_directory || '—'} mono />
            <DetailRow label="Profile Directory" value={troubleshooting.profile_directory || '—'} mono />
            <DetailRow label="Tell admin to cd into" value={troubleshooting.cd_target || '—'} mono />
          </CardContent>
        </Card>
      </div>

      {/* Auto-refresh indicator */}
      <div className="flex items-center justify-end gap-2 text-xs text-[#4a6070]">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-tropic-gold/60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-tropic-gold" />
        </span>
        Auto-refreshing
      </div>

      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="border-red-700/30 bg-zinc-950 text-white">
          <DialogHeader>
            <DialogTitle className="text-red-300">Reset Server</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#8a9aa8]">
            This will remove all mods, restore baseline server settings, and return the server to its original post-creation state.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setResetDialogOpen(false)} className="border-zinc-700 text-[#8a9aa8]">
              Cancel
            </Button>
            <Button size="sm" onClick={handleReset} disabled={resetting} className="bg-red-600 text-white hover:bg-red-500">
              {resetting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
              Confirm Reset
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ label, value, mono }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-xs font-medium text-[#4a6070]">{label}</span>
      <span className={`text-right text-sm text-[#d0d8e0] ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}

export default OverviewModule;

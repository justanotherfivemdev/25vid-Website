import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  ArrowLeft,
  Play,
  Square,
  RotateCcw,
  Trash2,
  Server,
  Settings,
  Puzzle,
  ScrollText,
  BarChart3,
  HardDrive,
  StickyNote,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Clock,
  Plus,
  FileText,
  ExternalLink,
  Terminal,
  Calendar,
  Timer,
  Pause,
  Search,
  Send,
  Cpu,
  MemoryStick,
  Users,
} from 'lucide-react';
import { API } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';
import { hasPermission, PERMISSIONS } from '@/utils/permissions';
import ServerStatusBanner from '@/components/servers/ServerStatusBanner';

const AUTO_REFRESH_MS = 10_000;

function ServerDetail() {
  const { id: server_id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [server, setServer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  // Backups & notes
  const [backups, setBackups] = useState([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [backupCreating, setBackupCreating] = useState(false);

  // Logs
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsPaused, setLogsPaused] = useState(false);
  const [logFilter, setLogFilter] = useState('');
  const logContainerRef = useRef(null);

  // RCON
  const [rconCommand, setRconCommand] = useState('');
  const [rconResponse, setRconResponse] = useState('');
  const [rconLoading, setRconLoading] = useState(false);

  // Metrics
  const [metrics, setMetrics] = useState([]);
  const [metricsSummary, setMetricsSummary] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsPeriod, setMetricsPeriod] = useState('1h');

  // Schedules
  const [schedules, setSchedules] = useState([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleCreating, setScheduleCreating] = useState(false);
  const [newSchedule, setNewSchedule] = useState({
    action_type: 'restart',
    schedule: '',
    enabled: true,
  });

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isAdmin =
    user && (user.role === 'admin' || user.role === 's1_personnel');
  const canManage =
    user && hasPermission(user.role, PERMISSIONS.MANAGE_SERVERS);

  // ── Fetch server detail ──────────────────────────────────────────────────
  const fetchServer = useCallback(
    async (opts = {}) => {
      const { silent = false } = opts;
      if (!silent) setLoading(true);

      try {
        const res = await axios.get(`${API}/servers/${server_id}`);
        setServer(res.data);
        setError(null);
      } catch (err) {
        if (!silent) {
          const status = err.response?.status;
          if (status === 404) {
            setError('Server not found.');
          } else {
            setError(
              err.response?.data?.detail || 'Failed to load server details.',
            );
          }
        }
      } finally {
        setLoading(false);
      }
    },
    [server_id],
  );

  useEffect(() => {
    fetchServer();
  }, [fetchServer]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const id = setInterval(() => fetchServer({ silent: true }), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchServer]);

  // ── Fetch backups ────────────────────────────────────────────────────────
  const fetchBackups = useCallback(async () => {
    setBackupsLoading(true);
    try {
      const res = await axios.get(`${API}/servers/${server_id}/backups`);
      setBackups(Array.isArray(res.data) ? res.data : []);
    } catch {
      setBackups([]);
    } finally {
      setBackupsLoading(false);
    }
  }, [server_id]);

  // ── Fetch notes ──────────────────────────────────────────────────────────
  const fetchNotes = useCallback(async () => {
    setNotesLoading(true);
    try {
      const res = await axios.get(`${API}/servers/${server_id}/notes`);
      setNotes(Array.isArray(res.data) ? res.data : []);
    } catch {
      setNotes([]);
    } finally {
      setNotesLoading(false);
    }
  }, [server_id]);

  // Load tab-specific data when tab changes
  useEffect(() => {
    if (activeTab === 'backups') fetchBackups();
    if (activeTab === 'notes') fetchNotes();
    if (activeTab === 'logs') fetchLogs();
    if (activeTab === 'metrics') fetchMetrics();
    if (activeTab === 'schedules') fetchSchedules();
  }, [activeTab, fetchBackups, fetchNotes, fetchLogs, fetchMetrics, fetchSchedules]);

  // Auto-refresh logs every 5 seconds
  useEffect(() => {
    if (activeTab !== 'logs' || logsPaused) return;
    const id = setInterval(() => fetchLogs(), 5000);
    return () => clearInterval(id);
  }, [activeTab, logsPaused, fetchLogs]);

  // Auto-refresh metrics every 15 seconds
  useEffect(() => {
    if (activeTab !== 'metrics') return;
    const id = setInterval(() => fetchMetrics(), 15000);
    return () => clearInterval(id);
  }, [activeTab, fetchMetrics]);

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (logContainerRef.current && !logsPaused) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, logsPaused]);

  // ── Server actions ───────────────────────────────────────────────────────
  const handleAction = useCallback(
    async (action) => {
      setActionLoading(action);
      setActionError(null);
      try {
        await axios.post(`${API}/servers/${server_id}/${action}`);
        await fetchServer({ silent: true });
      } catch (err) {
        setActionError(
          err.response?.data?.detail || `Failed to ${action} server.`,
        );
      } finally {
        setActionLoading(null);
      }
    },
    [server_id, fetchServer],
  );

  // ── Delete server ────────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await axios.delete(`${API}/servers/${server_id}`);
      navigate('/admin/servers');
    } catch (err) {
      setActionError(
        err.response?.data?.detail || 'Failed to delete server.',
      );
      setDeleteDialogOpen(false);
    } finally {
      setDeleting(false);
    }
  }, [server_id, navigate]);

  // ── Create backup ────────────────────────────────────────────────────────
  const handleCreateBackup = useCallback(async () => {
    setBackupCreating(true);
    try {
      await axios.post(`${API}/servers/${server_id}/backups`);
      await fetchBackups();
    } catch (err) {
      setActionError(
        err.response?.data?.detail || 'Failed to create backup.',
      );
    } finally {
      setBackupCreating(false);
    }
  }, [server_id, fetchBackups]);

  // ── Add note ─────────────────────────────────────────────────────────────
  const handleAddNote = useCallback(
    async (e) => {
      e.preventDefault();
      if (!newNote.trim()) return;
      setNoteSubmitting(true);
      try {
        await axios.post(`${API}/servers/${server_id}/notes`, {
          content: newNote.trim(),
        });
        setNewNote('');
        await fetchNotes();
      } catch (err) {
        setActionError(err.response?.data?.detail || 'Failed to add note.');
      } finally {
        setNoteSubmitting(false);
      }
    },
    [server_id, newNote, fetchNotes],
  );

  // ── Fetch logs ──────────────────────────────────────────────────────────
  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await axios.get(
        `${API}/servers/${server_id}/logs/recent?tail=200`,
      );
      const data = res.data;
      const logsData = data && typeof data === 'object' && 'logs' in data ? data.logs : data;
      setLogs(
        Array.isArray(logsData)
          ? logsData
          : typeof logsData === 'string'
            ? logsData.split('\n').filter(Boolean)
            : [],
      );
    } catch {
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, [server_id]);

  // ── Fetch metrics ───────────────────────────────────────────────────────
  const fetchMetrics = useCallback(async () => {
    setMetricsLoading(true);
    try {
      const [summaryRes, timeseriesRes] = await Promise.all([
        axios.get(`${API}/servers/${server_id}/metrics/summary`),
        axios.get(
          `${API}/servers/${server_id}/metrics?period=${metricsPeriod}&resolution=5m`,
        ),
      ]);
      setMetricsSummary(summaryRes.data);
      const timeseriesData = timeseriesRes.data;
      const metricsArray = Array.isArray(timeseriesData?.metrics)
        ? timeseriesData.metrics
        : Array.isArray(timeseriesData)
          ? timeseriesData
          : [];
      setMetrics(metricsArray);
    } catch {
      setMetricsSummary(null);
      setMetrics([]);
    } finally {
      setMetricsLoading(false);
    }
  }, [server_id, metricsPeriod]);

  // ── Fetch schedules ─────────────────────────────────────────────────────
  const fetchSchedules = useCallback(async () => {
    setSchedulesLoading(true);
    try {
      const res = await axios.get(`${API}/servers/${server_id}/schedules`);
      setSchedules(Array.isArray(res.data) ? res.data : []);
    } catch {
      setSchedules([]);
    } finally {
      setSchedulesLoading(false);
    }
  }, [server_id]);

  // ── Send RCON command ───────────────────────────────────────────────────
  const handleRconSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      if (!rconCommand.trim()) return;
      setRconLoading(true);
      setRconResponse('');
      try {
        const res = await axios.post(`${API}/servers/${server_id}/rcon`, {
          command: rconCommand.trim(),
        });
        setRconResponse(
          typeof res.data === 'string'
            ? res.data
            : res.data?.response || res.data?.output || JSON.stringify(res.data, null, 2),
        );
      } catch (err) {
        setRconResponse(
          `Error: ${err.response?.data?.detail || 'Failed to execute command.'}`,
        );
      } finally {
        setRconLoading(false);
      }
    },
    [server_id, rconCommand],
  );

  // ── Create schedule ─────────────────────────────────────────────────────
  const handleCreateSchedule = useCallback(async () => {
    if (!newSchedule.schedule.trim()) return;
    setScheduleCreating(true);
    try {
      await axios.post(`${API}/servers/${server_id}/schedules`, newSchedule);
      setScheduleDialogOpen(false);
      setNewSchedule({ action_type: 'restart', schedule: '', enabled: true });
      await fetchSchedules();
    } catch (err) {
      setActionError(
        err.response?.data?.detail || 'Failed to create schedule.',
      );
    } finally {
      setScheduleCreating(false);
    }
  }, [server_id, newSchedule, fetchSchedules]);

  // ── Status helpers ───────────────────────────────────────────────────────
  const statusBadge = (status) => {
    const map = {
      running: 'bg-green-600/20 text-green-400 border-green-600/30',
      starting: 'bg-amber-600/20 text-amber-400 border-amber-600/30',
      stopping: 'bg-amber-600/20 text-amber-400 border-amber-600/30',
      stopped: 'bg-zinc-600/20 text-zinc-400 border-zinc-600/30',
      created: 'bg-zinc-600/20 text-zinc-400 border-zinc-600/30',
      error: 'bg-red-600/20 text-red-400 border-red-600/30',
      crash_loop: 'bg-red-600/20 text-red-400 border-red-600/30',
    };
    return map[status] || 'bg-zinc-600/20 text-zinc-400 border-zinc-600/30';
  };

  const canStart =
    server &&
    ['stopped', 'created', 'error', 'crash_loop'].includes(server.status);
  const canStop = server && ['running', 'starting'].includes(server.status);
  const canRestart = server && server.status === 'running';

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link
            to="/admin/servers"
            className="text-[#8a9aa8] hover:text-tropic-gold transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="h-8 w-64 animate-pulse rounded bg-zinc-800" />
        </div>
        <div className="h-16 w-full animate-pulse rounded-lg bg-zinc-800/50" />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="animate-pulse border-tropic-gold-dark/10 bg-[#050a0e]/60">
              <CardContent className="space-y-3 p-6">
                <div className="h-5 w-3/4 rounded bg-zinc-800" />
                <div className="h-4 w-1/2 rounded bg-zinc-800" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ── Error / 404 state ────────────────────────────────────────────────────
  if (error || !server) {
    return (
      <div className="space-y-6">
        <Link
          to="/admin/servers"
          className="inline-flex items-center gap-2 text-sm text-[#8a9aa8] hover:text-tropic-gold transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Servers
        </Link>
        <Card className="border-red-600/30 bg-[#050a0e]/60">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <AlertTriangle className="mb-4 h-12 w-12 text-red-400" />
            <p className="text-lg font-semibold text-[#8a9aa8]">
              {error || 'Server not found'}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchServer()}
              className="mt-4 border-[rgba(201,162,39,0.15)] text-[#8a9aa8] hover:text-white"
            >
              <RefreshCw className="mr-1.5 h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/admin/servers"
            className="text-[#8a9aa8] hover:text-tropic-gold transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1
              className="text-3xl font-bold tracking-widest text-tropic-gold"
              style={{ fontFamily: "'Share Tech', sans-serif" }}
            >
              {server.name}
            </h1>
          </div>
          <Badge
            variant="outline"
            className={`ml-2 text-[10px] font-bold tracking-wider uppercase ${statusBadge(server.status)}`}
          >
            {server.status?.replace('_', ' ')}
          </Badge>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {canStart && (
            <Button
              size="sm"
              disabled={!!actionLoading}
              onClick={() => handleAction('start')}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {actionLoading === 'start' ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-1.5 h-4 w-4" />
              )}
              Start
            </Button>
          )}
          {canStop && (
            <Button
              size="sm"
              disabled={!!actionLoading}
              onClick={() => handleAction('stop')}
              variant="outline"
              className="border-red-600/50 text-red-400 hover:bg-red-600/10"
            >
              {actionLoading === 'stop' ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Square className="mr-1.5 h-4 w-4" />
              )}
              Stop
            </Button>
          )}
          {canRestart && (
            <Button
              size="sm"
              disabled={!!actionLoading}
              onClick={() => handleAction('restart')}
              variant="outline"
              className="border-amber-600/50 text-amber-400 hover:bg-amber-600/10"
            >
              {actionLoading === 'restart' ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="mr-1.5 h-4 w-4" />
              )}
              Restart
            </Button>
          )}
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDeleteDialogOpen(true)}
              className="border-red-600/30 text-red-400 hover:bg-red-600/10"
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Action error banner */}
      {actionError && (
        <div className="flex items-center gap-3 rounded-lg border border-red-600/30 bg-red-600/10 px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>{actionError}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActionError(null)}
            className="ml-auto text-red-400 hover:text-red-300"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Status banner */}
      <ServerStatusBanner server={server} />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-[#0c1117] border border-[rgba(201,162,39,0.12)] flex-wrap h-auto gap-1 p-1">
          <TabsTrigger
            value="overview"
            className="data-[state=active]:bg-tropic-gold data-[state=active]:text-black"
          >
            <Server className="w-4 h-4 mr-1.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="configuration"
            className="data-[state=active]:bg-tropic-gold data-[state=active]:text-black"
          >
            <Settings className="w-4 h-4 mr-1.5" />
            Configuration
          </TabsTrigger>
          <TabsTrigger
            value="mods"
            className="data-[state=active]:bg-tropic-gold data-[state=active]:text-black"
          >
            <Puzzle className="w-4 h-4 mr-1.5" />
            Mods
          </TabsTrigger>
          <TabsTrigger
            value="logs"
            className="data-[state=active]:bg-tropic-gold data-[state=active]:text-black"
          >
            <ScrollText className="w-4 h-4 mr-1.5" />
            Logs
          </TabsTrigger>
          <TabsTrigger
            value="metrics"
            className="data-[state=active]:bg-tropic-gold data-[state=active]:text-black"
          >
            <BarChart3 className="w-4 h-4 mr-1.5" />
            Metrics
          </TabsTrigger>
          <TabsTrigger
            value="backups"
            className="data-[state=active]:bg-tropic-gold data-[state=active]:text-black"
          >
            <HardDrive className="w-4 h-4 mr-1.5" />
            Backups
          </TabsTrigger>
          <TabsTrigger
            value="notes"
            className="data-[state=active]:bg-tropic-gold data-[state=active]:text-black"
          >
            <StickyNote className="w-4 h-4 mr-1.5" />
            Notes
          </TabsTrigger>
          <TabsTrigger
            value="schedules"
            className="data-[state=active]:bg-tropic-gold data-[state=active]:text-black"
          >
            <Calendar className="w-4 h-4 mr-1.5" />
            Schedules
          </TabsTrigger>
        </TabsList>

        {/* ── Overview Tab ──────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Server details card */}
            <Card className="border-tropic-gold-dark/20 bg-[#050a0e]/60 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-tropic-gold text-sm font-semibold tracking-wider uppercase">
                  Server Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <DetailRow label="Name" value={server.name} />
                <DetailRow
                  label="Description"
                  value={server.description || '—'}
                />
                <DetailRow
                  label="Docker Image"
                  value={server.docker_image || '—'}
                  mono
                />
                <DetailRow
                  label="Container Name"
                  value={server.container_name || '—'}
                  mono
                />
                <DetailRow
                  label="Ports"
                  value={
                    server.ports && Object.keys(server.ports).length > 0
                      ? Object.entries(server.ports)
                          .map(([k, v]) => `${k} → ${v}`)
                          .join(', ')
                      : '—'
                  }
                  mono
                />
                <DetailRow
                  label="Tags"
                  value={
                    server.tags?.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {server.tags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="bg-tropic-gold/10 text-tropic-gold border-tropic-gold/30 text-[10px]"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      '—'
                    )
                  }
                />
                <DetailRow
                  label="Created By"
                  value={server.created_by || '—'}
                />
                <DetailRow
                  label="Created"
                  value={
                    server.created_at
                      ? new Date(server.created_at).toLocaleString()
                      : '—'
                  }
                />
                <DetailRow
                  label="Updated"
                  value={
                    server.updated_at
                      ? new Date(server.updated_at).toLocaleString()
                      : '—'
                  }
                />
              </CardContent>
            </Card>

            {/* Quick stats card */}
            <Card className="border-tropic-gold-dark/20 bg-[#050a0e]/60 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-tropic-gold text-sm font-semibold tracking-wider uppercase">
                  Quick Stats
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-[rgba(201,162,39,0.12)] bg-[#0c1117]/50 px-4 py-3">
                  <span className="text-[#8a9aa8] text-sm">Status</span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-bold tracking-wider uppercase ${statusBadge(server.status)}`}
                  >
                    {server.status?.replace('_', ' ')}
                  </Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-[rgba(201,162,39,0.12)] bg-[#0c1117]/50 px-4 py-3">
                  <span className="text-[#8a9aa8] text-sm">Auto-Restart</span>
                  <span className="text-white text-sm font-medium">
                    {server.auto_restart ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-[rgba(201,162,39,0.12)] bg-[#0c1117]/50 px-4 py-3">
                  <span className="text-[#8a9aa8] text-sm">
                    Max Restart Attempts
                  </span>
                  <span className="text-white text-sm font-medium">
                    {server.max_restart_attempts ?? '—'}
                  </span>
                </div>
                {server.last_started && (
                  <div className="flex items-center justify-between rounded-lg border border-[rgba(201,162,39,0.12)] bg-[#0c1117]/50 px-4 py-3">
                    <span className="text-[#8a9aa8] text-sm">Last Started</span>
                    <span className="text-white text-sm">
                      {new Date(server.last_started).toLocaleString()}
                    </span>
                  </div>
                )}
                {server.last_stopped && (
                  <div className="flex items-center justify-between rounded-lg border border-[rgba(201,162,39,0.12)] bg-[#0c1117]/50 px-4 py-3">
                    <span className="text-[#8a9aa8] text-sm">Last Stopped</span>
                    <span className="text-white text-sm">
                      {new Date(server.last_stopped).toLocaleString()}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Auto-refresh indicator */}
          <div className="flex items-center justify-end gap-2 text-xs text-[#4a6070]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-tropic-gold/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-tropic-gold" />
            </span>
            Auto-refreshing every 10 s
          </div>
        </TabsContent>

        {/* ── Configuration Tab ─────────────────────────────────────────── */}
        <TabsContent value="configuration" className="space-y-4">
          <Card className="border-tropic-gold-dark/20 bg-[#050a0e]/60 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-tropic-gold text-sm font-semibold tracking-wider uppercase">
                Current Configuration
              </CardTitle>
              <div className="flex items-center gap-2">
                {server.config_history_count != null && (
                  <Badge
                    variant="outline"
                    className="bg-zinc-800 text-[#8a9aa8] border-[rgba(201,162,39,0.15)] text-[10px]"
                  >
                    <Clock className="w-3 h-3 mr-1" />
                    {server.config_history_count} revision
                    {server.config_history_count !== 1 ? 's' : ''}
                  </Badge>
                )}
                {canManage && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-tropic-gold-dark/30 text-tropic-gold hover:bg-tropic-gold/10"
                  >
                    <Settings className="mr-1.5 h-4 w-4" />
                    Edit Configuration
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <pre className="rounded-lg bg-[#0c1117] border border-[rgba(201,162,39,0.12)] p-4 overflow-x-auto">
                <code className="text-sm text-green-400 font-mono">
                  {server.config
                    ? JSON.stringify(server.config, null, 2)
                    : '// No configuration data available'}
                </code>
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Mods Tab ──────────────────────────────────────────────────── */}
        <TabsContent value="mods" className="space-y-4">
          <Card className="border-tropic-gold-dark/20 bg-[#050a0e]/60 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-tropic-gold text-sm font-semibold tracking-wider uppercase">
                Enabled Mods
              </CardTitle>
              <Badge
                variant="outline"
                className="bg-zinc-800 text-[#8a9aa8] border-[rgba(201,162,39,0.15)] text-[10px]"
              >
                <Puzzle className="w-3 h-3 mr-1" />
                {server.mods?.length || 0} mod
                {server.mods?.length !== 1 ? 's' : ''}
              </Badge>
            </CardHeader>
            <CardContent>
              {server.mods && server.mods.length > 0 ? (
                <div className="space-y-2">
                  {server.mods.map((mod, idx) => (
                    <div
                      key={mod.modId || idx}
                      className="flex items-center justify-between rounded-lg border border-[rgba(201,162,39,0.12)] bg-[#0c1117]/50 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <Puzzle className="h-4 w-4 text-tropic-gold/60" />
                        <div>
                          <span className="text-white text-sm font-medium">
                            {mod.name || mod.modId}
                          </span>
                          {mod.modId && mod.name && (
                            <span className="ml-2 text-xs text-[#4a6070] font-mono">
                              {mod.modId}
                            </span>
                          )}
                        </div>
                      </div>
                      {mod.version && (
                        <Badge
                          variant="outline"
                          className="bg-zinc-800 text-[#8a9aa8] border-[rgba(201,162,39,0.15)] text-[10px] font-mono"
                        >
                          v{mod.version}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[#4a6070] text-sm text-center py-8">
                  No mods are currently enabled on this server.
                </p>
              )}
              {canManage && (
                <p className="mt-4 text-xs text-[#4a6070] text-center">
                  Mod editing will be available in a future update.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Logs Tab ──────────────────────────────────────────────────── */}
        <TabsContent value="logs" className="space-y-4">
          <Card className="border-tropic-gold-dark/20 bg-[#050a0e]/60 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-tropic-gold text-sm font-semibold tracking-wider uppercase">
                Server Logs
              </CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#4a6070]" />
                  <Input
                    value={logFilter}
                    onChange={(e) => setLogFilter(e.target.value)}
                    placeholder="Filter logs…"
                    className="h-8 w-48 pl-8 bg-[#0c1117] border-[rgba(201,162,39,0.15)] text-white text-xs placeholder:text-[#4a6070] focus-visible:ring-tropic-gold/40"
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setLogsPaused((p) => !p)}
                  className={`border-[rgba(201,162,39,0.15)] text-xs ${logsPaused ? 'text-amber-400 border-amber-600/40' : 'text-[#8a9aa8]'}`}
                >
                  {logsPaused ? (
                    <>
                      <Play className="mr-1 h-3.5 w-3.5" />
                      Resume
                    </>
                  ) : (
                    <>
                      <Pause className="mr-1 h-3.5 w-3.5" />
                      Pause
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={fetchLogs}
                  disabled={logsLoading}
                  className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8] text-xs"
                >
                  {logsLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Log viewer */}
              <div
                ref={logContainerRef}
                className="h-96 overflow-y-auto rounded-lg border border-[rgba(201,162,39,0.12)] bg-[#050a0e] p-4 font-mono text-xs leading-relaxed"
              >
                {logsLoading && logs.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-6 w-6 animate-spin text-tropic-gold/40" />
                  </div>
                ) : logs.length === 0 ? (
                  <p className="text-[#4a6070] text-center mt-16">
                    No logs available.
                  </p>
                ) : (
                  (logFilter
                    ? logs.filter((line) =>
                        (typeof line === 'string' ? line : line.message || '')
                          .toLowerCase()
                          .includes(logFilter.toLowerCase()),
                      )
                    : logs
                  ).map((line, idx) => {
                    const text = typeof line === 'string' ? line : line.message || JSON.stringify(line);
                    return (
                      <div key={idx} className="text-green-400 hover:bg-[#0c1117]/60 px-1 -mx-1 rounded">
                        <span className="text-[#4a6070] select-none mr-3">{String(idx + 1).padStart(4, ' ')}</span>
                        {text}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Incidents link */}
              <Link
                to={`/admin/servers/${server_id}/incidents`}
                className="inline-flex items-center gap-1.5 text-sm text-tropic-gold hover:text-tropic-gold-light transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                View Incidents
              </Link>

              {/* RCON Console — only visible when server is running */}
              {server.status === 'running' && (
                <div className="space-y-3 pt-4 border-t border-[rgba(201,162,39,0.12)]">
                  <h3 className="text-tropic-gold text-sm font-semibold tracking-wider uppercase flex items-center gap-2">
                    <Terminal className="h-4 w-4" />
                    RCON Console
                  </h3>
                  <form onSubmit={handleRconSubmit} className="flex gap-2">
                    <Input
                      value={rconCommand}
                      onChange={(e) => setRconCommand(e.target.value)}
                      placeholder="Enter command…"
                      className="flex-1 bg-[#0c1117] border-[rgba(201,162,39,0.15)] text-white font-mono text-sm placeholder:text-[#4a6070] focus-visible:ring-tropic-gold/40"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={rconLoading || !rconCommand.trim()}
                      className="bg-tropic-gold text-black hover:bg-tropic-gold-light"
                    >
                      {rconLoading ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-1.5 h-4 w-4" />
                      )}
                      Send
                    </Button>
                  </form>
                  {rconResponse && (
                    <pre className="rounded-lg bg-[#050a0e] border border-[rgba(201,162,39,0.12)] p-3 overflow-x-auto">
                      <code className="text-sm text-green-400 font-mono whitespace-pre-wrap">
                        {rconResponse}
                      </code>
                    </pre>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Metrics Tab ───────────────────────────────────────────────── */}
        <TabsContent value="metrics" className="space-y-4">
          {/* Period selector */}
          <div className="flex items-center gap-2">
            {['1h', '6h', '24h', '7d'].map((p) => (
              <Button
                key={p}
                size="sm"
                variant={metricsPeriod === p ? 'default' : 'outline'}
                onClick={() => setMetricsPeriod(p)}
                className={
                  metricsPeriod === p
                    ? 'bg-tropic-gold text-black hover:bg-tropic-gold-light'
                    : 'border-[rgba(201,162,39,0.15)] text-[#8a9aa8] hover:text-white'
                }
              >
                {p}
              </Button>
            ))}
            <div className="ml-auto">
              <Button
                size="sm"
                variant="outline"
                onClick={fetchMetrics}
                disabled={metricsLoading}
                className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8] text-xs"
              >
                {metricsLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>

          {metricsLoading && !metricsSummary ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="animate-pulse border-tropic-gold-dark/10 bg-[#050a0e]/60">
                  <CardContent className="space-y-3 p-6">
                    <div className="h-4 w-1/2 rounded bg-zinc-800" />
                    <div className="h-8 w-3/4 rounded bg-zinc-800" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : metricsSummary ? (() => {
            const latest = metricsSummary.latest || {};
            const cpuVal = latest.cpu_percent;
            const memVal = latest.memory_mb;
            const playerVal = latest.player_count;
            const uptimeVal = latest.uptime_seconds;
            const uptimeStr = uptimeVal != null
              ? uptimeVal >= 3600
                ? `${Math.floor(uptimeVal / 3600)}h ${Math.floor((uptimeVal % 3600) / 60)}m`
                : `${Math.floor(uptimeVal / 60)}m`
              : null;
            return (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="border-tropic-gold-dark/20 bg-[#050a0e]/60 backdrop-blur-sm">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-blue-600/20 p-2.5">
                      <Cpu className="h-5 w-5 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-xs text-[#8a9aa8] uppercase tracking-wider">CPU</p>
                      <p className="text-2xl font-bold text-white">
                        {cpuVal != null
                          ? `${Number(cpuVal).toFixed(1)}%`
                          : '—'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-tropic-gold-dark/20 bg-[#050a0e]/60 backdrop-blur-sm">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-purple-600/20 p-2.5">
                      <MemoryStick className="h-5 w-5 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-xs text-[#8a9aa8] uppercase tracking-wider">Memory</p>
                      <p className="text-2xl font-bold text-white">
                        {memVal != null
                          ? `${Number(memVal).toFixed(0)} MB`
                          : '—'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-tropic-gold-dark/20 bg-[#050a0e]/60 backdrop-blur-sm">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-green-600/20 p-2.5">
                      <Users className="h-5 w-5 text-green-400" />
                    </div>
                    <div>
                      <p className="text-xs text-[#8a9aa8] uppercase tracking-wider">Players</p>
                      <p className="text-2xl font-bold text-white">
                        {playerVal != null ? playerVal : '—'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-tropic-gold-dark/20 bg-[#050a0e]/60 backdrop-blur-sm">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-tropic-gold/20 p-2.5">
                      <Timer className="h-5 w-5 text-tropic-gold" />
                    </div>
                    <div>
                      <p className="text-xs text-[#8a9aa8] uppercase tracking-wider">Uptime</p>
                      <p className="text-2xl font-bold text-white">
                        {uptimeStr || '—'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            );
          })() : (
            <Card className="border-tropic-gold-dark/20 bg-[#050a0e]/60 backdrop-blur-sm">
              <CardContent className="text-center py-12">
                <BarChart3 className="mx-auto mb-4 h-12 w-12 text-tropic-gold-dark/40" />
                <p className="text-[#8a9aa8] text-sm">
                  No metrics available. Metrics will appear once the server has been running.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Timeseries data table */}
          {metrics.length > 0 && (
            <Card className="border-tropic-gold-dark/20 bg-[#050a0e]/60 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-tropic-gold text-sm font-semibold tracking-wider uppercase">
                  Metrics History
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[rgba(201,162,39,0.12)] text-[#8a9aa8] text-xs uppercase tracking-wider">
                        <th className="text-left py-2 px-3">Time</th>
                        <th className="text-right py-2 px-3">CPU %</th>
                        <th className="text-right py-2 px-3">Memory MB</th>
                        <th className="text-right py-2 px-3">Players</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.slice(-20).map((m, idx) => (
                        <tr key={idx} className="border-b border-[rgba(201,162,39,0.12)]/50 hover:bg-[#0c1117]/30">
                          <td className="py-2 px-3 text-[#8a9aa8] font-mono text-xs">
                            {m.timestamp
                              ? new Date(m.timestamp).toLocaleTimeString()
                              : '—'}
                          </td>
                          <td className="py-2 px-3 text-right text-white">
                            {m.cpu_percent != null ? `${Number(m.cpu_percent).toFixed(1)}%` : '—'}
                          </td>
                          <td className="py-2 px-3 text-right text-white">
                            {m.memory_mb != null ? `${Number(m.memory_mb).toFixed(0)}` : '—'}
                          </td>
                          <td className="py-2 px-3 text-right text-white">
                            {m.players != null ? m.players : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Auto-refresh indicator */}
          <div className="flex items-center justify-end gap-2 text-xs text-[#4a6070]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-tropic-gold/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-tropic-gold" />
            </span>
            Auto-refreshing every 15 s
          </div>
        </TabsContent>

        {/* ── Backups Tab ───────────────────────────────────────────────── */}
        <TabsContent value="backups" className="space-y-4">
          <Card className="border-tropic-gold-dark/20 bg-[#050a0e]/60 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-tropic-gold text-sm font-semibold tracking-wider uppercase">
                Backups
              </CardTitle>
              {canManage && (
                <Button
                  size="sm"
                  disabled={backupCreating}
                  onClick={handleCreateBackup}
                  className="bg-tropic-gold text-black hover:bg-tropic-gold-light"
                >
                  {backupCreating ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-1.5 h-4 w-4" />
                  )}
                  Create Backup
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {backupsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-12 animate-pulse rounded-lg bg-zinc-800/50"
                    />
                  ))}
                </div>
              ) : backups.length > 0 ? (
                <div className="space-y-2">
                  {backups.map((backup, idx) => (
                    <div
                      key={backup.id || idx}
                      className="flex items-center justify-between rounded-lg border border-[rgba(201,162,39,0.12)] bg-[#0c1117]/50 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <HardDrive className="h-4 w-4 text-tropic-gold/60" />
                        <div>
                          <span className="text-white text-sm font-medium">
                            {backup.name || backup.filename || `Backup #${idx + 1}`}
                          </span>
                          {backup.created_at && (
                            <p className="text-xs text-[#4a6070]">
                              {new Date(backup.created_at).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                      {backup.size && (
                        <span className="text-xs text-[#4a6070] font-mono">
                          {backup.size}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[#4a6070] text-sm text-center py-8">
                  No backups found for this server.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Notes Tab ─────────────────────────────────────────────────── */}
        <TabsContent value="notes" className="space-y-4">
          <Card className="border-tropic-gold-dark/20 bg-[#050a0e]/60 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-tropic-gold text-sm font-semibold tracking-wider uppercase">
                Admin Notes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Add note form */}
              <form onSubmit={handleAddNote} className="space-y-3">
                <Textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add an admin note…"
                  rows={3}
                  className="bg-[#0c1117] border-[rgba(201,162,39,0.15)] text-white placeholder:text-[#4a6070] focus-visible:ring-tropic-gold/40"
                />
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={noteSubmitting || !newNote.trim()}
                    className="bg-tropic-gold text-black hover:bg-tropic-gold-light"
                  >
                    {noteSubmitting ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-1.5 h-4 w-4" />
                    )}
                    Add Note
                  </Button>
                </div>
              </form>

              {/* Notes list */}
              {notesLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-16 animate-pulse rounded-lg bg-zinc-800/50"
                    />
                  ))}
                </div>
              ) : notes.length > 0 ? (
                <div className="space-y-2">
                  {notes.map((note, idx) => (
                    <div
                      key={note.id || idx}
                      className="rounded-lg border border-[rgba(201,162,39,0.12)] bg-[#0c1117]/50 px-4 py-3"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-tropic-gold font-medium">
                          {note.author || note.created_by || 'Admin'}
                        </span>
                        {note.created_at && (
                          <span className="text-xs text-[#4a6070]">
                            {new Date(note.created_at).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-[#8a9aa8] whitespace-pre-wrap">
                        {note.content}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[#4a6070] text-sm text-center py-4">
                  No notes yet.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Schedules Tab ──────────────────────────────────────────────── */}
        <TabsContent value="schedules" className="space-y-4">
          <Card className="border-tropic-gold-dark/20 bg-[#050a0e]/60 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-tropic-gold text-sm font-semibold tracking-wider uppercase">
                Scheduled Actions
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={fetchSchedules}
                  disabled={schedulesLoading}
                  className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8] text-xs"
                >
                  {schedulesLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                </Button>
                {canManage && (
                  <Button
                    size="sm"
                    onClick={() => setScheduleDialogOpen(true)}
                    className="bg-tropic-gold text-black hover:bg-tropic-gold-light"
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    Add Schedule
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {schedulesLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-16 animate-pulse rounded-lg bg-zinc-800/50"
                    />
                  ))}
                </div>
              ) : schedules.length > 0 ? (
                <div className="space-y-2">
                  {schedules.map((sched, idx) => (
                    <div
                      key={sched.id || idx}
                      className="flex items-center justify-between rounded-lg border border-[rgba(201,162,39,0.12)] bg-[#0c1117]/50 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <Calendar className="h-4 w-4 text-tropic-gold/60" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-white text-sm font-medium capitalize">
                              {sched.action_type?.replace('_', ' ') || 'Unknown'}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${sched.enabled ? 'bg-green-600/20 text-green-400 border-green-600/30' : 'bg-zinc-600/20 text-zinc-400 border-zinc-600/30'}`}
                            >
                              {sched.enabled ? 'Enabled' : 'Disabled'}
                            </Badge>
                          </div>
                          <p className="text-xs text-[#4a6070] font-mono mt-0.5">
                            {sched.schedule || '—'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right text-xs space-y-1">
                        {sched.last_run && (
                          <p className="text-[#4a6070]">
                            Last: {new Date(sched.last_run).toLocaleString()}
                          </p>
                        )}
                        {sched.next_run && (
                          <p className="text-[#8a9aa8]">
                            Next: {new Date(sched.next_run).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[#4a6070] text-sm text-center py-8">
                  No scheduled actions configured for this server.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Schedule creation dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="bg-[#0c1117] border-[rgba(201,162,39,0.12)]">
          <DialogHeader>
            <DialogTitle className="text-tropic-gold">Add Scheduled Action</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm text-[#8a9aa8]">Action Type</label>
              <Select
                value={newSchedule.action_type}
                onValueChange={(val) =>
                  setNewSchedule((prev) => ({ ...prev, action_type: val }))
                }
              >
                <SelectTrigger className="bg-[#0c1117] border-[rgba(201,162,39,0.15)] text-white">
                  <SelectValue placeholder="Select action…" />
                </SelectTrigger>
                <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]">
                  <SelectItem value="restart">Restart</SelectItem>
                  <SelectItem value="backup">Backup</SelectItem>
                  <SelectItem value="mod_update">Mod Update</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-[#8a9aa8]">
                Cron Expression
              </label>
              <Input
                value={newSchedule.schedule}
                onChange={(e) =>
                  setNewSchedule((prev) => ({
                    ...prev,
                    schedule: e.target.value,
                  }))
                }
                placeholder="e.g. 0 4 * * * (daily at 4 AM)"
                className="bg-[#0c1117] border-[rgba(201,162,39,0.15)] text-white font-mono placeholder:text-[#4a6070] focus-visible:ring-tropic-gold/40"
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={newSchedule.enabled}
                onCheckedChange={(checked) =>
                  setNewSchedule((prev) => ({ ...prev, enabled: checked }))
                }
              />
              <label className="text-sm text-[#8a9aa8]">Enabled</label>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setScheduleDialogOpen(false)}
              className="border-[rgba(201,162,39,0.15)]"
            >
              Cancel
            </Button>
            <Button
              disabled={scheduleCreating || !newSchedule.schedule.trim()}
              onClick={handleCreateSchedule}
              className="bg-tropic-gold text-black hover:bg-tropic-gold-light"
            >
              {scheduleCreating ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-1.5 h-4 w-4" />
              )}
              Create Schedule
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-[#0c1117] border-[rgba(201,162,39,0.12)]">
          <DialogHeader>
            <DialogTitle className="text-red-400">Delete Server</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#8a9aa8]">
            Are you sure you want to delete{' '}
            <strong className="text-white">{server.name}</strong>? This action
            cannot be undone and will remove all associated data.
          </p>
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              className="border-[rgba(201,162,39,0.15)]"
            >
              Cancel
            </Button>
            <Button
              disabled={deleting}
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 h-4 w-4" />
              )}
              Delete Server
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Reusable row for the details card. */
function DetailRow({ label, value, mono = false }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-[#4a6070] shrink-0">{label}</span>
      <span
        className={`text-right text-white ${mono ? 'font-mono text-xs break-all' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}

export default ServerDetail;

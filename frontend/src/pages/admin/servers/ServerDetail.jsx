import React, { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import { API } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';
import { hasPermission, PERMISSIONS } from '@/utils/permissions';
import ServerStatusBanner from '@/components/servers/ServerStatusBanner';

const AUTO_REFRESH_MS = 10_000;

function ServerDetail() {
  const { server_id } = useParams();
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
  }, [activeTab, fetchBackups, fetchNotes]);

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
            className="text-gray-400 hover:text-tropic-gold transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="h-8 w-64 animate-pulse rounded bg-zinc-800" />
        </div>
        <div className="h-16 w-full animate-pulse rounded-lg bg-zinc-800/50" />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="animate-pulse border-tropic-gold-dark/10 bg-black/60">
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
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-tropic-gold transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Servers
        </Link>
        <Card className="border-red-600/30 bg-black/60">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <AlertTriangle className="mb-4 h-12 w-12 text-red-400" />
            <p className="text-lg font-semibold text-gray-300">
              {error || 'Server not found'}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchServer()}
              className="mt-4 border-gray-700 text-gray-300 hover:text-white"
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
            className="text-gray-400 hover:text-tropic-gold transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1
              className="text-3xl font-bold tracking-widest text-tropic-gold"
              style={{ fontFamily: 'Rajdhani, sans-serif' }}
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
        <TabsList className="bg-gray-900 border border-gray-800 flex-wrap h-auto gap-1 p-1">
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
        </TabsList>

        {/* ── Overview Tab ──────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Server details card */}
            <Card className="border-tropic-gold-dark/20 bg-black/60 backdrop-blur-sm">
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
            <Card className="border-tropic-gold-dark/20 bg-black/60 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-tropic-gold text-sm font-semibold tracking-wider uppercase">
                  Quick Stats
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3">
                  <span className="text-gray-400 text-sm">Status</span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-bold tracking-wider uppercase ${statusBadge(server.status)}`}
                  >
                    {server.status?.replace('_', ' ')}
                  </Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3">
                  <span className="text-gray-400 text-sm">Auto-Restart</span>
                  <span className="text-white text-sm font-medium">
                    {server.auto_restart ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3">
                  <span className="text-gray-400 text-sm">
                    Max Restart Attempts
                  </span>
                  <span className="text-white text-sm font-medium">
                    {server.max_restart_attempts ?? '—'}
                  </span>
                </div>
                {server.last_started && (
                  <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3">
                    <span className="text-gray-400 text-sm">Last Started</span>
                    <span className="text-white text-sm">
                      {new Date(server.last_started).toLocaleString()}
                    </span>
                  </div>
                )}
                {server.last_stopped && (
                  <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3">
                    <span className="text-gray-400 text-sm">Last Stopped</span>
                    <span className="text-white text-sm">
                      {new Date(server.last_stopped).toLocaleString()}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Auto-refresh indicator */}
          <div className="flex items-center justify-end gap-2 text-xs text-gray-600">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-tropic-gold/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-tropic-gold" />
            </span>
            Auto-refreshing every 10 s
          </div>
        </TabsContent>

        {/* ── Configuration Tab ─────────────────────────────────────────── */}
        <TabsContent value="configuration" className="space-y-4">
          <Card className="border-tropic-gold-dark/20 bg-black/60 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-tropic-gold text-sm font-semibold tracking-wider uppercase">
                Current Configuration
              </CardTitle>
              <div className="flex items-center gap-2">
                {server.config_history_count != null && (
                  <Badge
                    variant="outline"
                    className="bg-zinc-800 text-gray-400 border-gray-700 text-[10px]"
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
              <pre className="rounded-lg bg-gray-900 border border-gray-800 p-4 overflow-x-auto">
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
          <Card className="border-tropic-gold-dark/20 bg-black/60 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-tropic-gold text-sm font-semibold tracking-wider uppercase">
                Enabled Mods
              </CardTitle>
              <Badge
                variant="outline"
                className="bg-zinc-800 text-gray-400 border-gray-700 text-[10px]"
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
                      className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <Puzzle className="h-4 w-4 text-tropic-gold/60" />
                        <div>
                          <span className="text-white text-sm font-medium">
                            {mod.name || mod.modId}
                          </span>
                          {mod.modId && mod.name && (
                            <span className="ml-2 text-xs text-gray-500 font-mono">
                              {mod.modId}
                            </span>
                          )}
                        </div>
                      </div>
                      {mod.version && (
                        <Badge
                          variant="outline"
                          className="bg-zinc-800 text-gray-300 border-gray-700 text-[10px] font-mono"
                        >
                          v{mod.version}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm text-center py-8">
                  No mods are currently enabled on this server.
                </p>
              )}
              {canManage && (
                <p className="mt-4 text-xs text-gray-600 text-center">
                  Mod editing will be available in a future update.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Logs Tab ──────────────────────────────────────────────────── */}
        <TabsContent value="logs" className="space-y-4">
          <Card className="border-tropic-gold-dark/20 bg-black/60 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-tropic-gold text-sm font-semibold tracking-wider uppercase">
                Server Logs
              </CardTitle>
            </CardHeader>
            <CardContent className="text-center py-12">
              <ScrollText className="mx-auto mb-4 h-12 w-12 text-tropic-gold-dark/40" />
              <p className="text-gray-400 text-sm">
                Live log streaming will be available when the server agent is
                connected.
              </p>
              <Link
                to={`/admin/servers/${server_id}/incidents`}
                className="inline-flex items-center gap-1.5 mt-4 text-sm text-tropic-gold hover:text-tropic-gold-light transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                View Incidents
              </Link>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Metrics Tab ───────────────────────────────────────────────── */}
        <TabsContent value="metrics" className="space-y-4">
          <Card className="border-tropic-gold-dark/20 bg-black/60 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-tropic-gold text-sm font-semibold tracking-wider uppercase">
                Performance Metrics
              </CardTitle>
            </CardHeader>
            <CardContent className="text-center py-12">
              <BarChart3 className="mx-auto mb-4 h-12 w-12 text-tropic-gold-dark/40" />
              <p className="text-gray-400 text-sm">
                Metrics collection will be available when the server agent is
                connected.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Backups Tab ───────────────────────────────────────────────── */}
        <TabsContent value="backups" className="space-y-4">
          <Card className="border-tropic-gold-dark/20 bg-black/60 backdrop-blur-sm">
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
                      className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <HardDrive className="h-4 w-4 text-tropic-gold/60" />
                        <div>
                          <span className="text-white text-sm font-medium">
                            {backup.name || backup.filename || `Backup #${idx + 1}`}
                          </span>
                          {backup.created_at && (
                            <p className="text-xs text-gray-500">
                              {new Date(backup.created_at).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                      {backup.size && (
                        <span className="text-xs text-gray-500 font-mono">
                          {backup.size}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm text-center py-8">
                  No backups found for this server.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Notes Tab ─────────────────────────────────────────────────── */}
        <TabsContent value="notes" className="space-y-4">
          <Card className="border-tropic-gold-dark/20 bg-black/60 backdrop-blur-sm">
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
                  className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-500 focus-visible:ring-tropic-gold/40"
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
                      className="rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-tropic-gold font-medium">
                          {note.author || note.created_by || 'Admin'}
                        </span>
                        {note.created_at && (
                          <span className="text-xs text-gray-500">
                            {new Date(note.created_at).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-300 whitespace-pre-wrap">
                        {note.content}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm text-center py-4">
                  No notes yet.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-gray-900 border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-red-400">Delete Server</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-400">
            Are you sure you want to delete{' '}
            <strong className="text-white">{server.name}</strong>? This action
            cannot be undone and will remove all associated data.
          </p>
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              className="border-gray-700"
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
      <span className="text-gray-500 shrink-0">{label}</span>
      <span
        className={`text-right text-white ${mono ? 'font-mono text-xs break-all' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}

export default ServerDetail;

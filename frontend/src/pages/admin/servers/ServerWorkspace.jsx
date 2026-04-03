import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, NavLink, Outlet, Link } from 'react-router-dom';
import axios from 'axios';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle,
  Circle,
  Info,
  Loader2,
  Monitor,
  Puzzle,
  RefreshCw,
  RotateCcw,
  Server,
  Settings,
  ShieldAlert,
  Square,
  BarChart3,
  Play,
  Terminal,
  Trash2,
  Users,
  Wrench,
} from 'lucide-react';
import { API } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';
import { hasPermission, PERMISSIONS } from '@/utils/permissions';

const AUTO_REFRESH_MS = 10_000;

const STATUS_CONFIG = {
  running: { label: 'RUNNING', cls: 'bg-green-600/20 text-green-400 border-green-600/30', dot: 'bg-green-400', icon: CheckCircle },
  starting: { label: 'STARTING', cls: 'bg-amber-600/20 text-amber-400 border-amber-600/30', dot: 'bg-amber-400', icon: Loader2, spin: true },
  initializing: { label: 'INITIALIZING', cls: 'bg-amber-600/20 text-amber-400 border-amber-600/30', dot: 'bg-amber-400', icon: Loader2, spin: true },
  stopping: { label: 'STOPPING', cls: 'bg-amber-600/20 text-amber-400 border-amber-600/30', dot: 'bg-amber-400', icon: Loader2, spin: true },
  stopped: { label: 'STOPPED', cls: 'bg-zinc-600/20 text-zinc-400 border-zinc-600/30', dot: 'bg-zinc-500', icon: Circle },
  created: { label: 'CREATED', cls: 'bg-blue-600/20 text-blue-400 border-blue-600/30', dot: 'bg-blue-400', icon: Info },
  error: { label: 'ERROR', cls: 'bg-red-600/20 text-red-400 border-red-600/30', dot: 'bg-red-400', icon: AlertTriangle },
  provisioning_failed: { label: 'PROVISION FAILED', cls: 'bg-red-600/20 text-red-400 border-red-600/30', dot: 'bg-red-400', icon: AlertTriangle },
  provisioning_partial: { label: 'PARTIAL', cls: 'bg-amber-600/20 text-amber-400 border-amber-600/30', dot: 'bg-amber-400', icon: AlertTriangle },
  deletion_pending: { label: 'DELETING', cls: 'bg-amber-600/20 text-amber-400 border-amber-600/30', dot: 'bg-amber-400', icon: Loader2, spin: true },
  crash_loop: { label: 'CRASH LOOP', cls: 'bg-red-600/20 text-red-400 border-red-600/30', dot: 'bg-red-400', icon: AlertOctagon },
};

const NAV_SECTIONS = [
  {
    label: 'OPERATIONS',
    items: [
      { to: '', label: 'Overview', icon: Server, end: true },
      { to: 'console', label: 'Console', icon: Terminal },
      { to: 'rcon', label: 'RCON', icon: Monitor },
      { to: 'players', label: 'Players', icon: Users },
      { to: 'metrics', label: 'Metrics', icon: BarChart3 },
      { to: 'mods', label: 'Mods', icon: Puzzle },
    ],
  },
  {
    label: 'CONFIG',
    items: [
      { to: 'config/server', label: 'Server Settings', icon: Settings },
      { to: 'config/system', label: 'Infrastructure', icon: Settings },
      { to: 'config/admin-tools', label: 'Admin Tools', icon: ShieldAlert },
    ],
  },
  {
    label: 'TOOLS',
    items: [
      { to: 'tools/files', label: 'Troubleshooting', icon: Wrench },
      { to: 'schedules', label: 'Schedules', icon: CalendarClock },
      { to: 'tools/exec', label: 'Trigger / Exec', icon: Wrench },
      { to: 'tools/reports', label: 'Reports', icon: Wrench },
      { to: 'tools/todos', label: 'ToDo List', icon: Wrench },
      { to: 'tools/watchers', label: 'Watchers', icon: Wrench },
    ],
  },
  {
    label: 'ADMIN',
    items: [
      { to: 'admin/notes', label: 'Notes', icon: ShieldAlert },
      { to: 'admin/notifications', label: 'Notifications', icon: ShieldAlert },
      { to: 'admin/incidents', label: 'Incidents', icon: ShieldAlert },
    ],
  },
];

function ServerWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = user && hasPermission(user.role, PERMISSIONS.MANAGE_SERVERS);

  const [server, setServer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const fetchServer = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await axios.get(`${API}/servers/${id}`);
      setServer(res.data);
      setError(null);
    } catch (err) {
      if (!silent) {
        setError(err.response?.data?.detail || 'Failed to load server.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchServer();
  }, [fetchServer]);

  useEffect(() => {
    const intervalId = setInterval(() => fetchServer(true), AUTO_REFRESH_MS);
    return () => clearInterval(intervalId);
  }, [fetchServer]);

  const handleAction = useCallback(async (action) => {
    setActionLoading(action);
    setActionError(null);
    try {
      await axios.post(`${API}/servers/${id}/${action}`);
      await fetchServer(true);
    } catch (err) {
      setActionError(err.response?.data?.detail || `Failed to ${action} server.`);
      await fetchServer(true);
    } finally {
      setActionLoading(null);
    }
  }, [fetchServer, id]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await axios.delete(`${API}/servers/${id}`);
      navigate('/admin/servers', { replace: true });
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Failed to delete server.');
      setDeleting(false);
      setDeleteOpen(false);
    }
  }, [id, navigate]);

  const status = server?.status || 'created';
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.created;
  const StatusIcon = cfg.icon;
  const canStart = ['stopped', 'created', 'error', 'provisioning_failed'].includes(status);
  const canStop = ['running', 'starting', 'initializing', 'provisioning_partial'].includes(status);
  const canRestart = ['running', 'provisioning_partial'].includes(status);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-tropic-gold" />
      </div>
    );
  }

  if (error || !server) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <AlertTriangle className="h-12 w-12 text-red-400" />
        <p className="text-lg text-red-400">{error || 'Server not found'}</p>
        <Link to="/admin/servers">
          <Button variant="outline" size="sm" className="border-tropic-gold-dark/30 text-tropic-gold">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Servers
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      <div className="border-b border-zinc-800 bg-black/80 px-4 py-3 backdrop-blur-sm lg:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin/servers" className="text-gray-400 transition-colors hover:text-tropic-gold">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-tropic-gold-dark/30 bg-tropic-gold/10">
                <Server className="h-5 w-5 text-tropic-gold" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-wide text-white" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                  {server.name}
                </h1>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>{server.docker_image || 'Managed container'}</span>
                  {server.container_name && (
                    <>
                      <span>|</span>
                      <span>{server.container_name}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`${cfg.cls} gap-1.5 px-2.5 py-1 text-xs font-semibold tracking-wider`}>
              <span className={`h-2 w-2 rounded-full ${cfg.dot} ${cfg.spin ? 'animate-pulse' : ''}`} />
              <StatusIcon className={`h-3.5 w-3.5 ${cfg.spin ? 'animate-spin' : ''}`} />
              {cfg.label}
            </Badge>

            <div className="ml-2 flex items-center gap-1.5">
              {canStart && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!actionLoading}
                  onClick={() => handleAction('start')}
                  className="h-8 border-green-600/30 text-green-400 hover:bg-green-600/10 hover:text-green-300"
                >
                  {actionLoading === 'start' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                </Button>
              )}
              {canStop && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!actionLoading}
                  onClick={() => handleAction('stop')}
                  className="h-8 border-red-600/30 text-red-400 hover:bg-red-600/10 hover:text-red-300"
                >
                  {actionLoading === 'stop' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
                </Button>
              )}
              {canRestart && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!actionLoading}
                  onClick={() => handleAction('restart')}
                  className="h-8 border-amber-600/30 text-amber-400 hover:bg-amber-600/10 hover:text-amber-300"
                >
                  {actionLoading === 'restart' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => fetchServer(true)}
                className="h-8 text-gray-400 hover:text-tropic-gold"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              {canManage && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDeleteOpen(true)}
                  className="h-8 text-gray-500 hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {actionError && (
          <div className="mt-2 flex items-center gap-2 rounded border border-red-600/30 bg-red-600/10 px-3 py-2 text-xs text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{actionError}</span>
            <button type="button" onClick={() => setActionError(null)} className="ml-auto text-red-400 hover:text-red-300">
              x
            </button>
          </div>
        )}

        {/* Provisioning stages detail banner */}
        {(status === 'provisioning_partial' || status === 'provisioning_failed') && (
          <div className={`mt-2 rounded border px-3 py-2 text-xs ${
            status === 'provisioning_partial'
              ? 'border-amber-600/30 bg-amber-600/10 text-amber-400'
              : 'border-red-600/30 bg-red-600/10 text-red-400'
          }`}>
            <div className="flex items-center gap-2 font-semibold mb-1">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {status === 'provisioning_partial'
                ? 'Server started with partial provisioning — some stages failed'
                : 'Provisioning failed'}
            </div>
            {server.last_docker_error && (
              <p className="mb-1 text-gray-400">{server.last_docker_error}</p>
            )}
            {server.provisioning_stages && Object.keys(server.provisioning_stages).length > 0 && (
              <div className="mt-1 space-y-0.5">
                {Object.values(server.provisioning_stages).map((stage) => (
                  <div key={stage.name} className="flex items-center gap-2">
                    {stage.status === 'success' ? (
                      <CheckCircle className="h-3 w-3 text-green-400" />
                    ) : stage.status === 'failed' ? (
                      <AlertTriangle className="h-3 w-3 text-red-400" />
                    ) : (
                      <Circle className="h-3 w-3 text-gray-600" />
                    )}
                    <span className={
                      stage.status === 'success' ? 'text-green-400' :
                      stage.status === 'failed' ? 'text-red-400' :
                      'text-gray-500'
                    }>
                      {stage.name.replace(/_/g, ' ')}
                    </span>
                    {stage.error && (
                      <span className="text-gray-500 ml-1">— {stage.error}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <nav className={`hidden flex-col border-r border-zinc-800 bg-black/60 transition-all lg:flex ${sidebarCollapsed ? 'w-14' : 'w-52'}`}>
          <div className="flex-1 overflow-y-auto py-2">
            {NAV_SECTIONS.map((section) => (
              <div key={section.label} className="mb-1">
                {!sidebarCollapsed && (
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-600">
                    {section.label}
                  </div>
                )}
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) => (
                        `flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                          isActive
                            ? 'border-r-2 border-tropic-gold bg-tropic-gold/5 text-tropic-gold'
                            : 'text-gray-400 hover:bg-zinc-800/50 hover:text-gray-200'
                        } ${sidebarCollapsed ? 'justify-center px-0' : ''}`
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                    </NavLink>
                  );
                })}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            className="border-t border-zinc-800 px-3 py-2 text-xs text-gray-600 hover:text-gray-400"
          >
            {sidebarCollapsed ? '>' : '< Collapse'}
          </button>
        </nav>

        <div className="flex overflow-x-auto border-b border-zinc-800 bg-black/60 lg:hidden">
          {NAV_SECTIONS.flatMap((section) => section.items).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => (
                  `flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-xs transition-colors ${
                    isActive
                      ? 'border-tropic-gold text-tropic-gold'
                      : 'border-transparent text-gray-400 hover:text-gray-200'
                  }`
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </NavLink>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet context={{ server, serverId: id, fetchServer, canManage, handleServerAction: handleAction, actionLoading }} />
        </div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="border-red-600/30 bg-zinc-950 text-white">
          <DialogHeader>
            <DialogTitle className="text-red-400">Delete Server</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-400">
            Are you sure you want to delete <strong className="text-white">{server.name}</strong>? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteOpen(false)}
              className="border-zinc-700 text-gray-400"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deleting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}
              Delete Server
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ServerWorkspace;

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, NavLink, Outlet, Link } from 'react-router-dom';
import axios from 'axios';

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
import {
  canRestartServer,
  canStartServer,
  canStopServer,
  getOperationalSummary,
  isServerDegraded,
  normalizeServer,
} from '@/utils/serverStatus';

const SUMMARY_REFRESH_MS = 15_000;

const STATUS_CONFIG = {
  running: { label: 'ONLINE', cls: 'bg-[rgba(0,255,136,0.08)] text-[#00ff88] border-[rgba(0,255,136,0.3)]', dotCls: 'status-dot status-dot-online', icon: CheckCircle },
  degraded: { label: 'DEGRADED', cls: 'bg-[rgba(255,170,0,0.08)] text-[#ffaa00] border-[rgba(255,170,0,0.3)]', dotCls: 'status-dot status-dot-degraded', icon: AlertTriangle },
  starting: { label: 'STARTING', cls: 'bg-[rgba(255,170,0,0.08)] text-[#ffaa00] border-[rgba(255,170,0,0.3)]', dotCls: 'status-dot status-dot-degraded', icon: Loader2, spin: true },
  initializing: { label: 'INITIALIZING', cls: 'bg-[rgba(255,170,0,0.08)] text-[#ffaa00] border-[rgba(255,170,0,0.3)]', dotCls: 'status-dot status-dot-degraded', icon: Loader2, spin: true },
  stopping: { label: 'STOPPING', cls: 'bg-[rgba(255,170,0,0.08)] text-[#ffaa00] border-[rgba(255,170,0,0.3)]', dotCls: 'status-dot status-dot-degraded', icon: Loader2, spin: true },
  stopped: { label: 'OFFLINE', cls: 'bg-[rgba(74,96,112,0.15)] text-[#4a6070] border-[rgba(74,96,112,0.3)]', dotCls: 'status-dot status-dot-offline', icon: Circle },
  created: { label: 'CREATED', cls: 'bg-[rgba(0,170,255,0.08)] text-[#00aaff] border-[rgba(0,170,255,0.3)]', dotCls: 'status-dot status-dot-online', icon: Info },
  error: { label: 'ERROR', cls: 'bg-[rgba(255,51,51,0.08)] text-[#ff3333] border-[rgba(255,51,51,0.3)]', dotCls: 'status-dot status-dot-critical', icon: AlertTriangle },
  deletion_pending: { label: 'DELETING', cls: 'bg-[rgba(255,170,0,0.08)] text-[#ffaa00] border-[rgba(255,170,0,0.3)]', dotCls: 'status-dot status-dot-degraded', icon: Loader2, spin: true },
  crash_loop: { label: 'CRASH LOOP', cls: 'bg-[rgba(255,51,51,0.08)] text-[#ff3333] border-[rgba(255,51,51,0.3)]', dotCls: 'status-dot status-dot-critical', icon: AlertOctagon },
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

function mergeServerSummary(existing, summary) {
  return normalizeServer({
    ...(existing || {}),
    ...(summary || {}),
  });
}

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
      setServer(normalizeServer(res.data));
      setError(null);
    } catch (err) {
      if (!silent) {
        setError(err.response?.data?.detail || 'Failed to load server.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id]);

  const serverRef = useRef(null);
  useEffect(() => {
    serverRef.current = server;
  }, [server]);

  const fetchServerSummary = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/servers/${id}/summary`);
      setServer((current) => mergeServerSummary(current, res.data));
      setError(null);
    } catch (err) {
      if (!serverRef.current) {
        setError(err.response?.data?.detail || 'Failed to load server summary.');
      }
    }
  }, [id]);

  useEffect(() => {
    fetchServer();
  }, [fetchServer]);

  useEffect(() => {
    const intervalId = setInterval(fetchServerSummary, SUMMARY_REFRESH_MS);
    return () => clearInterval(intervalId);
  }, [fetchServerSummary]);

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
  const summary = getOperationalSummary(server);
  const effectiveStatus = status === 'running' && isServerDegraded(server) ? 'degraded' : status;
  const cfg = STATUS_CONFIG[effectiveStatus] || STATUS_CONFIG.created;
  const StatusIcon = cfg.icon;
  const canStart = canStartServer(server);
  const canStop = canStopServer(server);
  const canRestart = canRestartServer(server);
  const showProvisioningBanner = summary.state === 'created' || summary.state === 'degraded' || status === 'error';

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#00ff88]" />
      </div>
    );
  }

  if (error || !server) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <AlertTriangle className="h-12 w-12 text-[#ff3333]" />
        <p className="text-lg text-[#ff3333]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{error || 'Server not found'}</p>
        <Link to="/admin/servers" className="tactical-button inline-flex items-center px-4 py-2 text-xs font-bold uppercase tracking-wider bg-[#111a24] text-[#00ff88] border border-[rgba(0,255,136,0.3)] hover:bg-[rgba(0,255,136,0.08)] transition-colors" style={{ fontFamily: "'Oswald', sans-serif" }}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Servers
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-[#050a0e]">
      <div className="border-b border-[rgba(0,255,136,0.1)] bg-[#0c1117] px-4 py-3 backdrop-blur-sm lg:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin/servers" className="text-[#4a6070] transition-colors hover:text-[#00ff88]">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center border border-[rgba(0,255,136,0.2)] bg-[rgba(0,255,136,0.05)]">
                <Server className="h-5 w-5 text-[#00ff88]" />
              </div>
              <div>
                <h1 className="text-lg font-black uppercase tracking-[0.08em] text-[#e8c547]" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                  {server.name}
                </h1>
                <div className="flex items-center gap-2 text-xs text-[#4a6070]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
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
            <span className={`inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs font-semibold tracking-wider ${cfg.cls}`} style={{ fontFamily: "'Oswald', sans-serif" }}>
              <span className={cfg.dotCls} />
              <StatusIcon className={`h-3.5 w-3.5 ${cfg.spin ? 'animate-spin' : ''}`} />
              {cfg.label}
            </span>

            <div className="ml-2 flex items-center gap-1.5">
              {canStart && (
                <button
                  disabled={!!actionLoading}
                  onClick={() => handleAction('start')}
                  className="h-8 px-2 border border-[rgba(0,255,136,0.3)] text-[#00ff88] hover:bg-[rgba(0,255,136,0.08)] disabled:opacity-40 transition-colors"
                >
                  {actionLoading === 'start' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                </button>
              )}
              {canStop && (
                <button
                  disabled={!!actionLoading}
                  onClick={() => handleAction('stop')}
                  className="h-8 px-2 border border-[rgba(255,51,51,0.3)] text-[#ff3333] hover:bg-[rgba(255,51,51,0.08)] disabled:opacity-40 transition-colors"
                >
                  {actionLoading === 'stop' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
                </button>
              )}
              {canRestart && (
                <button
                  disabled={!!actionLoading}
                  onClick={() => handleAction('restart')}
                  className="h-8 px-2 border border-[rgba(255,170,0,0.3)] text-[#ffaa00] hover:bg-[rgba(255,170,0,0.08)] disabled:opacity-40 transition-colors"
                >
                  {actionLoading === 'restart' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                </button>
              )}
              <button
                onClick={() => fetchServer(true)}
                className="h-8 px-2 text-[#4a6070] hover:text-[#00ff88] transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              {canManage && (
                <button
                  onClick={() => setDeleteOpen(true)}
                  className="h-8 px-2 text-[#4a6070] hover:text-[#ff3333] transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {actionError && (
          <div className="mt-2 flex items-center gap-2 border border-[rgba(255,51,51,0.3)] bg-[rgba(255,51,51,0.06)] px-3 py-2 text-xs text-[#ff3333]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{actionError}</span>
            <button type="button" onClick={() => setActionError(null)} className="ml-auto text-[#ff3333] hover:text-red-300">
              close
            </button>
          </div>
        )}

        {showProvisioningBanner && (
          <div className={`mt-2 border px-3 py-2 text-xs ${
            summary.state === 'created'
              ? 'border-[rgba(0,170,255,0.3)] bg-[rgba(0,170,255,0.06)] text-[#00aaff]'
              : summary.state === 'degraded'
                ? 'border-[rgba(255,170,0,0.3)] bg-[rgba(255,170,0,0.06)] text-[#ffaa00]'
                : 'border-[rgba(255,51,51,0.3)] bg-[rgba(255,51,51,0.06)] text-[#ff3333]'
          }`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            <div className="mb-1 flex items-center gap-2 font-semibold">
              {summary.state === 'created'
                ? <Info className="h-3.5 w-3.5 shrink-0" />
                : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
              {server.needs_manual_intervention
                ? 'Auto-recovery exhausted - manual config correction required'
                : summary.state === 'created'
                  ? 'Server deployed successfully. Follow-up provisioning is continuing here.'
                  : summary.state === 'degraded'
                    ? 'Server created successfully, but follow-up stages need attention'
                    : 'Server creation failed before the container became operational'}
            </div>
            {server.needs_manual_intervention && server.auto_recovery_attempts > 0 && (
              <p className="mb-1 text-amber-300">
                The system attempted {server.auto_recovery_attempts} automatic fix(es) but could not resolve the config error.
                Please review the server settings and correct the configuration manually.
              </p>
            )}
            {(server.summary_message || server.last_docker_error) && (
              <p className="mb-1 text-[#8a9aa8]">{server.summary_message || server.last_docker_error}</p>
            )}
            {server.provisioning_stages && Object.keys(server.provisioning_stages).length > 0 && (
              <div className="mt-1 space-y-0.5">
                {Object.values(server.provisioning_stages).map((stage) => (
                  <div key={stage.name} className="flex items-center gap-2">
                    {stage.status === 'success' ? (
                      <CheckCircle className="h-3 w-3 text-[#00ff88]" />
                    ) : stage.status === 'failed' ? (
                      <AlertTriangle className="h-3 w-3 text-[#ff3333]" />
                    ) : (
                      <Circle className="h-3 w-3 text-[#4a6070]" />
                    )}
                    <span className={
                      stage.status === 'success' ? 'text-[#00ff88]' :
                      stage.status === 'failed' ? 'text-[#ff3333]' :
                      'text-[#4a6070]'
                    }>
                      {stage.name.replace(/_/g, ' ')}
                    </span>
                    {stage.error && (
                      <span className="ml-1 text-[#4a6070]">- {stage.error}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {status === 'running' && server.provisioning_warnings?.length > 0 && (
          <div className="mt-2 border border-[rgba(255,170,0,0.2)] bg-[rgba(255,170,0,0.04)] px-3 py-2 text-xs text-[#ffaa00]/80" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            <div className="mb-1 flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Server is running with non-critical provisioning warnings
            </div>
            <div className="space-y-0.5">
              {server.provisioning_warnings.map((warning, index) => (
                <p key={index} className="text-[#8a9aa8]">
                  <span className="text-[#ffaa00]/60">{warning.stage?.replace(/_/g, ' ')}:</span> {warning.message}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <nav className={`hidden flex-col border-r border-[rgba(0,255,136,0.1)] bg-[#050a0e] transition-all lg:flex ${sidebarCollapsed ? 'w-14' : 'w-52'}`}>
          <div className="flex-1 overflow-y-auto py-2">
            {NAV_SECTIONS.map((section) => (
              <div key={section.label} className="mb-1">
                {!sidebarCollapsed && (
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-[#4a6070]" style={{ fontFamily: "'Oswald', sans-serif" }}>
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
                            ? 'border-r-2 border-[#00ff88] bg-[rgba(0,255,136,0.05)] text-[#00ff88]'
                            : 'text-[#8a9aa8] hover:bg-[#111a24] hover:text-[#d0d8e0]'
                        } ${sidebarCollapsed ? 'justify-center px-0' : ''}`
                      )}
                      style={{ fontFamily: "'Inter', sans-serif" }}
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
            className="border-t border-[rgba(0,255,136,0.1)] px-3 py-2 text-xs text-[#4a6070] hover:text-[#00ff88] transition-colors"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {sidebarCollapsed ? '>' : '< Collapse'}
          </button>
        </nav>

        <div className="flex overflow-x-auto border-b border-[rgba(0,255,136,0.1)] bg-[#050a0e] lg:hidden">
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
                      ? 'border-[#00ff88] text-[#00ff88]'
                      : 'border-transparent text-[#8a9aa8] hover:text-[#d0d8e0]'
                  }`
                )}
                style={{ fontFamily: "'Inter', sans-serif" }}
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
        <DialogContent className="border-[rgba(255,51,51,0.3)] bg-[#0c1117] text-[#d0d8e0] rounded-none">
          <DialogHeader>
            <DialogTitle className="text-[#ff3333] uppercase tracking-wider" style={{ fontFamily: "'Orbitron', sans-serif" }}>Delete Server</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#8a9aa8]" style={{ fontFamily: "'Inter', sans-serif" }}>
            Are you sure you want to delete <strong className="text-[#d0d8e0]">{server.name}</strong>? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2 pt-4">
            <button
              onClick={() => setDeleteOpen(false)}
              className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#8a9aa8] border border-[rgba(0,255,136,0.15)] hover:text-[#d0d8e0] transition-colors"
              style={{ fontFamily: "'Oswald', sans-serif" }}
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="tactical-button px-4 py-2 text-xs font-bold uppercase tracking-wider bg-[rgba(255,51,51,0.1)] text-[#ff3333] border border-[rgba(255,51,51,0.3)] hover:bg-[rgba(255,51,51,0.15)] hover:border-[rgba(255,51,51,0.5)] disabled:opacity-40 transition-colors"
              style={{ fontFamily: "'Oswald', sans-serif" }}
            >
              {deleting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin inline-block" /> : <Trash2 className="mr-1.5 h-4 w-4 inline-block" />}
              Delete Server
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ServerWorkspace;

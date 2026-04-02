import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Server,
  Plus,
  Search,
  RefreshCw,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { API } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';
import ServerCard from '@/components/servers/ServerCard';

const AUTO_REFRESH_MS = 15_000;
const ADMIN_ROLES = new Set(['admin', 's1_personnel']);

function ServerDashboard() {
  const { user } = useAuth();

  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const canManage = user && ADMIN_ROLES.has(user.role);

  // ── Fetch servers ────────────────────────────────────────────────────────
  const fetchServers = useCallback(async (opts = {}) => {
    const { silent = false } = opts;
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const res = await axios.get(`${API}/servers`);
      setServers(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch servers:', err);
      if (!silent) setError(err.response?.data?.detail || 'Failed to load servers.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  // Auto-refresh
  useEffect(() => {
    const id = setInterval(() => fetchServers({ silent: true }), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchServers]);

  // ── Quick actions ────────────────────────────────────────────────────────
  const handleAction = useCallback(
    async (serverId, action) => {
      try {
        await axios.post(`${API}/servers/${serverId}/${action}`);
        await fetchServers({ silent: true });
      } catch (err) {
        console.error(`Server ${action} failed:`, err);
        alert(err.response?.data?.detail || `Failed to ${action} server.`);
      }
    },
    [fetchServers],
  );

  const onStart = useCallback((id) => handleAction(id, 'start'), [handleAction]);
  const onStop = useCallback((id) => handleAction(id, 'stop'), [handleAction]);
  const onRestart = useCallback((id) => handleAction(id, 'restart'), [handleAction]);

  // ── Derived data ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = servers.length;
    const running = servers.filter((s) => s.status === 'running').length;
    const stopped = servers.filter((s) => s.status === 'stopped' || s.status === 'created').length;
    const issues = servers.filter((s) => s.status === 'error' || s.status === 'crash_loop').length;
    return { total, running, stopped, issues };
  }, [servers]);

  const filteredServers = useMemo(() => {
    if (!searchQuery.trim()) return servers;
    const q = searchQuery.toLowerCase();
    return servers.filter((s) => s.name?.toLowerCase().includes(q));
  }, [servers, searchQuery]);

  // ── Stat cards config ────────────────────────────────────────────────────
  const statCards = [
    {
      label: 'Total Servers',
      value: stats.total,
      icon: Server,
      iconCls: 'text-tropic-gold',
      borderCls: 'border-tropic-gold-dark/20',
    },
    {
      label: 'Running',
      value: stats.running,
      icon: CheckCircle2,
      iconCls: 'text-green-400',
      borderCls: 'border-green-600/20',
    },
    {
      label: 'Stopped',
      value: stats.stopped,
      icon: XCircle,
      iconCls: 'text-zinc-400',
      borderCls: 'border-zinc-600/20',
    },
    {
      label: 'Issues',
      value: stats.issues,
      icon: AlertTriangle,
      iconCls: 'text-red-400',
      borderCls: 'border-red-600/20',
    },
  ];

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1
            className="text-4xl font-bold tracking-widest text-tropic-gold"
            style={{ fontFamily: 'Rajdhani, sans-serif' }}
          >
            SERVER MANAGEMENT
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Monitor and control all 25VID game servers from the Command Center.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => fetchServers({ silent: true })}
            className="border-tropic-gold-dark/30 text-tropic-gold hover:bg-tropic-gold/10"
          >
            <RefreshCw className={`mr-1.5 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          {canManage && (
            <Link to="/admin/servers/create">
              <Button
                size="sm"
                className="bg-tropic-gold text-black hover:bg-tropic-gold-light"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                New Server
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-600/30 bg-red-600/10 px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchServers()}
            className="ml-auto text-red-400 hover:text-red-300"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-6">
          {/* Stat placeholders */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="animate-pulse border-tropic-gold-dark/10 bg-black/60">
                <CardHeader className="pb-2">
                  <div className="h-4 w-24 rounded bg-zinc-800" />
                </CardHeader>
                <CardContent>
                  <div className="h-8 w-12 rounded bg-zinc-800" />
                </CardContent>
              </Card>
            ))}
          </div>
          {/* Card grid placeholders */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="animate-pulse border-tropic-gold-dark/10 bg-black/60">
                <CardContent className="space-y-3 p-6">
                  <div className="h-5 w-3/4 rounded bg-zinc-800" />
                  <div className="h-4 w-1/2 rounded bg-zinc-800" />
                  <div className="h-4 w-2/3 rounded bg-zinc-800" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Main content (after loading) */}
      {!loading && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {statCards.map((stat) => {
              const Icon = stat.icon;
              return (
                <Card
                  key={stat.label}
                  className={`${stat.borderCls} bg-black/60 backdrop-blur-sm`}
                >
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-gray-400">
                      {stat.label}
                    </CardTitle>
                    <Icon className={`h-5 w-5 ${stat.iconCls}`} />
                  </CardHeader>
                  <CardContent>
                    <div
                      className="text-3xl font-bold text-white"
                      style={{ fontFamily: 'Rajdhani, sans-serif' }}
                    >
                      {stat.value}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Search / filter bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search servers by name…"
              className="border-tropic-gold-dark/20 bg-black/60 pl-10 text-white placeholder:text-gray-500 focus-visible:ring-tropic-gold/40"
            />
          </div>

          {/* Server grid */}
          {filteredServers.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredServers.map((server) => (
                <ServerCard
                  key={server.id}
                  server={server}
                  onStart={onStart}
                  onStop={onStop}
                  onRestart={onRestart}
                />
              ))}
            </div>
          ) : (
            <Card className="border-tropic-gold-dark/10 bg-black/60">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Activity className="mb-4 h-12 w-12 text-tropic-gold-dark/40" />
                <p className="text-lg font-semibold text-gray-300">
                  {searchQuery ? 'No servers match your search' : 'No servers configured'}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  {searchQuery
                    ? 'Try a different search term.'
                    : 'Add a server to get started.'}
                </p>
                {!searchQuery && canManage && (
                  <Link to="/admin/servers/create" className="mt-4">
                    <Button
                      size="sm"
                      className="bg-tropic-gold text-black hover:bg-tropic-gold-light"
                    >
                      <Plus className="mr-1.5 h-4 w-4" />
                      New Server
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          )}

          {/* Live indicator */}
          <div className="flex items-center justify-end gap-2 text-xs text-gray-600">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-tropic-gold/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-tropic-gold" />
            </span>
            Auto-refreshing every 15 s
          </div>
        </>
      )}
    </div>
  );
}

export default ServerDashboard;

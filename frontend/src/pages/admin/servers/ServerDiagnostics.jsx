import React, { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Monitor,
  Package,
  RefreshCw,
  Search,
  Server,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { API } from '@/utils/api';

/* ── colour helpers ─────────────────────────────────────────────────── */

function severityBadge(severity) {
  const map = {
    critical: 'bg-red-900/50 text-red-300 border-red-700/50',
    high: 'bg-orange-900/50 text-orange-300 border-orange-700/50',
    medium: 'bg-yellow-900/50 text-yellow-300 border-yellow-700/50',
    low: 'bg-blue-900/50 text-blue-300 border-blue-700/50',
  };
  return map[severity] || 'bg-zinc-900/50 text-zinc-300 border-zinc-700';
}

function categoryBadge(category) {
  const map = {
    'backend-error': 'border-red-600/30 text-red-300',
    'addon-load': 'border-purple-600/30 text-purple-300',
    'fragmentizer': 'border-orange-600/30 text-orange-300',
    'script-error': 'border-indigo-600/30 text-indigo-300',
    'resource-error': 'border-cyan-600/30 text-cyan-300',
    'network-error': 'border-sky-600/30 text-sky-300',
    'world-error': 'border-green-600/30 text-green-300',
    'null-reference': 'border-amber-600/30 text-amber-300',
    'crash': 'border-red-600/30 text-red-300',
    'mod-mismatch': 'border-yellow-600/30 text-yellow-300',
    'config-error': 'border-teal-600/30 text-teal-300',
    'physics-error': 'border-blue-600/30 text-blue-300',
    'ai-error': 'border-violet-600/30 text-violet-300',
    'generic-error': 'border-zinc-600/30 text-zinc-300',
  };
  return map[category] || 'border-zinc-700 text-zinc-300';
}

function confidenceColor(score) {
  if (score >= 0.8) return 'bg-red-600 text-white';
  if (score >= 0.5) return 'bg-yellow-600 text-black';
  return 'bg-[#4a6070] text-white';
}

function modSeverityColor(severity) {
  const map = {
    critical: 'border-red-700/50 bg-red-900/40 text-red-200',
    high: 'border-orange-700/50 bg-orange-900/40 text-orange-200',
    medium: 'border-yellow-700/50 bg-yellow-900/40 text-yellow-200',
    low: 'border-blue-700/50 bg-blue-900/40 text-blue-200',
  };
  return map[severity] || 'border-zinc-700 bg-zinc-900/50 text-zinc-300';
}

function statusColor(status) {
  const map = {
    active: 'bg-red-900/40 text-red-300 border-red-700/50',
    monitoring: 'bg-yellow-900/40 text-yellow-300 border-yellow-700/50',
    resolved: 'bg-green-900/40 text-green-300 border-green-700/50',
    false_positive: 'bg-[#111a24] text-[#8a9aa8] border-[rgba(201,162,39,0.15)]',
  };
  return map[status] || 'bg-[#111a24] text-[#8a9aa8] border-[rgba(201,162,39,0.15)]';
}

function sourceTone(category) {
  const map = {
    engine: 'border-blue-600/30 text-blue-300',
    config: 'border-amber-600/30 text-amber-300',
    'workshop-download': 'border-cyan-600/30 text-cyan-300',
    'mod-load': 'border-purple-600/30 text-purple-300',
    'runtime-script': 'border-indigo-600/30 text-indigo-300',
    'battleye-rcon': 'border-orange-600/30 text-orange-300',
    network: 'border-sky-600/30 text-sky-300',
    performance: 'border-red-600/30 text-red-300',
  };
  return map[category] || 'border-zinc-700 text-zinc-300';
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

const VERDICT_OPTIONS = ['active', 'monitoring', 'resolved', 'false_positive'];

const TABS = [
  { id: 'live-errors', label: 'Live Errors', icon: AlertTriangle },
  { id: 'error-patterns', label: 'Error Patterns', icon: Monitor },
  { id: 'mod-analysis', label: 'Mod Analysis', icon: Package },
  { id: 'alerts', label: 'Alerts & Incidents', icon: Bell },
];

/* ── main component ─────────────────────────────────────────────────── */

function ServerDiagnostics() {
  /* ── state: log monitor data ───────────────────────────────────── */
  const [servers, setServers] = useState([]);
  const [occurrences, setOccurrences] = useState([]);
  const [errorTypes, setErrorTypes] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState([]);

  /* ── state: mod issues data ────────────────────────────────────── */
  const [modIssues, setModIssues] = useState([]);

  /* ── state: UI ─────────────────────────────────────────────────── */
  const [loading, setLoading] = useState(true);
  const [modLoading, setModLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('live-errors');

  /* ── state: occurrence filters ─────────────────────────────────── */
  const [serverFilter, setServerFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  /* ── state: mod analysis filters ───────────────────────────────── */
  const [modSearch, setModSearch] = useState('');
  const [modStatusFilter, setModStatusFilter] = useState('');

  /* ── state: error type detail dialog ───────────────────────────── */
  const [selectedErrorType, setSelectedErrorType] = useState(null);
  const [typeOccurrences, setTypeOccurrences] = useState([]);
  const [typeOccLoading, setTypeOccLoading] = useState(false);

  /* ── state: mod issue detail dialog ────────────────────────────── */
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [resolutionNotes, setResolutionNotes] = useState('');

  /* ── data fetching ─────────────────────────────────────────────── */

  const fetchServers = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/log-monitor/servers`);
      setServers(Array.isArray(res.data) ? res.data : []);
    } catch { /* ignore */ }
  }, []);

  const fetchOccurrences = useCallback(async () => {
    setLoading(true);
    try {
      setError('');
      const params = new URLSearchParams();
      if (serverFilter) params.set('server', serverFilter);
      if (searchQuery) params.set('q', searchQuery);
      if (severityFilter) params.set('severity', severityFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      params.set('page', page);
      params.set('per_page', 50);

      const res = await axios.get(`${API}/log-monitor/errors?${params}`);
      setOccurrences(res.data.items || []);
      setTotalPages(res.data.pages || 1);
      setTotalCount(res.data.total || 0);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load log errors.');
    } finally {
      setLoading(false);
    }
  }, [serverFilter, searchQuery, severityFilter, categoryFilter, dateFrom, dateTo, page]);

  const fetchErrorTypes = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/log-monitor/error-types`);
      setErrorTypes(Array.isArray(res.data) ? res.data : []);
    } catch { /* ignore */ }
  }, []);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/log-monitor/alerts?resolved=false`);
      setAlerts(Array.isArray(res.data) ? res.data : []);
    } catch { /* ignore */ }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const params = serverFilter ? `?server=${serverFilter}` : '';
      const res = await axios.get(`${API}/log-monitor/stats${params}`);
      setStats(Array.isArray(res.data) ? res.data : []);
    } catch { /* ignore */ }
  }, [serverFilter]);

  const fetchModIssues = useCallback(async () => {
    setModLoading(true);
    try {
      const params = modStatusFilter ? `?status=${modStatusFilter}` : '';
      const res = await axios.get(`${API}/servers/mod-issues${params}`);
      setModIssues(Array.isArray(res.data) ? res.data : []);
    } catch { /* ignore */ }
    finally { setModLoading(false); }
  }, [modStatusFilter]);

  const fetchAll = useCallback(() => {
    fetchServers();
    fetchOccurrences();
    fetchErrorTypes();
    fetchAlerts();
    fetchStats();
    fetchModIssues();
  }, [fetchServers, fetchOccurrences, fetchErrorTypes, fetchAlerts, fetchStats, fetchModIssues]);

  useEffect(() => { fetchServers(); fetchErrorTypes(); fetchAlerts(); }, [fetchServers, fetchErrorTypes, fetchAlerts]);
  useEffect(() => { fetchOccurrences(); }, [fetchOccurrences]);
  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchModIssues(); }, [fetchModIssues]);

  /* ── error type detail ─────────────────────────────────────────── */

  const openErrorTypeDetail = useCallback(async (et) => {
    setSelectedErrorType(et);
    setTypeOccLoading(true);
    try {
      const res = await axios.get(`${API}/log-monitor/errors?type=${et.id}&per_page=20`);
      setTypeOccurrences(res.data.items || []);
    } catch { setTypeOccurrences([]); }
    finally { setTypeOccLoading(false); }
  }, []);

  /* ── alert resolve ─────────────────────────────────────────────── */

  const resolveAlert = useCallback(async (alertId) => {
    try {
      await axios.patch(`${API}/log-monitor/alerts/${alertId}`);
      fetchAlerts();
    } catch { /* ignore */ }
  }, [fetchAlerts]);

  /* ── mod issue verdict ─────────────────────────────────────────── */

  const updateIssueStatus = useCallback(async (issueId, status, notes = '') => {
    try {
      await axios.post(`${API}/servers/mod-issues/${issueId}/resolve`, {
        status,
        resolution_notes: notes,
      });
      if (selectedIssue?.id === issueId) {
        setSelectedIssue((current) => current ? { ...current, status, resolution_notes: notes } : current);
      }
      await fetchModIssues();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update issue verdict.');
    }
  }, [fetchModIssues, selectedIssue?.id]);

  /* ── server name lookup ────────────────────────────────────────── */

  const serverMap = useMemo(() => {
    const m = {};
    for (const s of servers) m[s.id] = s.name || s.id;
    return m;
  }, [servers]);

  /* ── summary stats (computed from fetched data) ────────────────── */

  const summaryStats = useMemo(() => {
    const total = totalCount;
    const criticalCount = occurrences.reduce(
      (sum, occ) => sum + (occ.severity === 'critical' ? 1 : 0), 0,
    );
    const activeModIssues = modIssues.filter((i) => i.status === 'active').length;
    const activeAlerts = alerts.length;
    const modsWithIssues = new Set(modIssues.map((i) => i.mod_id).filter(Boolean)).size;
    return { total, criticalCount, activeModIssues, activeAlerts, modsWithIssues };
  }, [totalCount, occurrences, alerts, modIssues]);

  /* ── mod issues client-side search ─────────────────────────────── */

  const filteredModIssues = useMemo(() => modIssues.filter((issue) => {
    if (!modSearch) return true;
    const haystack = [
      issue.mod_name,
      issue.mod_id,
      issue.impact_summary,
      issue.error_pattern,
      issue.error_signature,
      issue.source_category,
      issue.issue_type,
      ...(issue.source_streams || []),
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(modSearch.toLowerCase());
  }), [modIssues, modSearch]);

  /* ── filter active check ───────────────────────────────────────── */

  const hasActiveFilters = serverFilter || searchQuery || severityFilter || categoryFilter || dateFrom || dateTo;

  const clearFilters = useCallback(() => {
    setServerFilter('');
    setSearchQuery('');
    setSeverityFilter('');
    setCategoryFilter('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  }, []);

  /* ── render ─────────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-[#c9a227]" style={{ fontFamily: "'Oswald', sans-serif" }}>
            SERVER MANAGEMENT
          </div>
          <h1 className="text-2xl font-bold tracking-[0.15em] text-[#e8c547]" style={{ fontFamily: "'Share Tech', sans-serif" }}>
            SERVER DIAGNOSTICS
          </h1>
          <p className="mt-1 text-sm text-[#8a9aa8]" style={{ fontFamily: "'Inter', sans-serif" }}>
            Unified error tracking, mod issue analysis, and alerting across all managed Arma Reforger servers.
          </p>
        </div>
        <Button onClick={fetchAll} variant="outline" size="sm" className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8] hover:text-white">
          <RefreshCw className="mr-1 h-4 w-4" /> Refresh
        </Button>
      </div>

      {/* ── Summary stat cards ────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: 'Total Errors', value: summaryStats.total, color: 'text-white' },
          { label: 'Critical', value: summaryStats.criticalCount, color: 'text-red-400' },
          { label: 'Active Mod Issues', value: summaryStats.activeModIssues, color: 'text-orange-400' },
          { label: 'Active Alerts', value: summaryStats.activeAlerts, color: 'text-yellow-400' },
          { label: 'Mods With Issues', value: summaryStats.modsWithIssues, color: 'text-blue-400' },
        ].map(({ label, value, color }) => (
          <Card key={label} className="border-[rgba(201,162,39,0.12)] bg-[#0c1117]/50">
            <CardContent className="px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-[#4a6070]">{label}</p>
              <p className={`text-xl font-bold ${color}`}>{value.toLocaleString()}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Errors per day chart ──────────────────────────────────── */}
      {stats.length > 0 && (
        <Card className="border-[rgba(201,162,39,0.12)] bg-[#0c1117]/50">
          <CardContent className="py-4">
            <p className="mb-3 text-xs uppercase tracking-wider text-[#4a6070]">Errors Per Day</p>
            <div style={{ width: '100%', height: 200 }}>
              <ResponsiveContainer>
                <BarChart data={stats}>
                  <XAxis dataKey="date" tick={{ fill: '#4a6070', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#4a6070', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0c1117', border: '1px solid rgba(201,162,39,0.15)', color: '#fff', fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#8a9aa8' }} />
                  <Bar dataKey="critical" stackId="a" fill="#ef4444" name="Critical" />
                  <Bar dataKey="high" stackId="a" fill="#f97316" name="High" />
                  <Bar dataKey="medium" stackId="a" fill="#eab308" name="Medium" />
                  <Bar dataKey="low" stackId="a" fill="#3b82f6" name="Low" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Tabs ──────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-[rgba(201,162,39,0.12)]">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === id
                ? 'border-b-2 border-[#e8c547] text-[#e8c547]'
                : 'text-[#4a6070] hover:text-white'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Error banner ──────────────────────────────────────────── */}
      {error && (
        <div className="rounded border border-red-700/50 bg-red-900/30 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Tab 1: Live Errors                                        */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'live-errors' && (
        <>
          {/* Filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <select
              value={serverFilter}
              onChange={(e) => { setServerFilter(e.target.value); setPage(1); }}
              className="rounded-md border border-[rgba(201,162,39,0.15)] bg-[#0c1117] px-3 py-2 text-sm text-white"
            >
              <option value="">All Servers</option>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>{s.name || s.id}</option>
              ))}
            </select>

            <select
              value={severityFilter}
              onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }}
              className="rounded-md border border-[rgba(201,162,39,0.15)] bg-[#0c1117] px-3 py-2 text-sm text-white"
            >
              <option value="">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
              className="rounded-md border border-[rgba(201,162,39,0.15)] bg-[#0c1117] px-3 py-2 text-sm text-white"
            >
              <option value="">All Categories</option>
              <option value="backend-error">Backend Error</option>
              <option value="addon-load">Addon Load</option>
              <option value="fragmentizer">Fragmentizer</option>
              <option value="script-error">Script Error</option>
              <option value="resource-error">Resource Error</option>
              <option value="network-error">Network Error</option>
              <option value="world-error">World/Terrain Error</option>
              <option value="crash">Crash / Fatal</option>
              <option value="null-reference">Null Reference</option>
              <option value="mod-mismatch">Mod Mismatch</option>
              <option value="config-error">Config Error</option>
              <option value="physics-error">Physics Error</option>
              <option value="ai-error">AI Error</option>
              <option value="generic-error">Generic Error</option>
            </select>

            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4a6070]" />
              <Input
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                placeholder="Search messages..."
                className="border-[rgba(201,162,39,0.15)] bg-[#0c1117] pl-10 text-white"
              />
            </div>

            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="w-36 border-[rgba(201,162,39,0.15)] bg-[#0c1117] text-white"
              placeholder="From"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="w-36 border-[rgba(201,162,39,0.15)] bg-[#0c1117] text-white"
              placeholder="To"
            />

            {hasActiveFilters && (
              <Button size="sm" variant="ghost" onClick={clearFilters} className="text-[#4a6070] hover:text-white">
                <X className="mr-1 h-3 w-3" /> Clear
              </Button>
            )}
          </div>

          {/* Occurrences table */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-[#0c1117]/50" />
              ))}
            </div>
          ) : occurrences.length === 0 ? (
            <Card className="border-[rgba(201,162,39,0.12)] bg-[#0c1117]/50">
              <CardContent className="flex flex-col items-center justify-center py-16 text-[#4a6070]">
                <CheckCircle2 className="mb-4 h-12 w-12 opacity-30" />
                <p className="text-lg font-medium">No errors detected</p>
                <p className="mt-1 text-sm">
                  The log monitor will populate this page as errors are detected in server console output.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-[rgba(201,162,39,0.12)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[rgba(201,162,39,0.12)] bg-[#0c1117]/70">
                      <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-[#4a6070]">Time</th>
                      <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-[#4a6070]">Server</th>
                      <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-[#4a6070]">Severity</th>
                      <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-[#4a6070]">Category</th>
                      <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-[#4a6070]">Mod</th>
                      <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-[#4a6070]">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {occurrences.map((occ) => (
                      <tr key={occ.id} className="border-b border-[rgba(201,162,39,0.06)] hover:bg-[#0c1117]/40">
                        <td className="whitespace-nowrap px-3 py-2 text-[#8a9aa8]">
                          {fmtDate(occ.timestamp)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-white">
                          {serverMap[occ.server_id] || occ.server_id}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={`text-xs ${severityBadge(occ.severity)}`}>
                            {occ.severity}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={`text-xs ${categoryBadge(occ.category)}`}>
                            {occ.category}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-[#4a6070]">
                          {occ.mod_guid ? occ.mod_guid.slice(0, 12) + '…' : '—'}
                        </td>
                        <td className="max-w-xs truncate px-3 py-2 text-[#8a9aa8]" title={occ.message}>
                          {occ.message?.slice(0, 120)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-[#4a6070]">
                  Page {page} of {totalPages} ({totalCount.toLocaleString()} total)
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8]"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8]"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Tab 2: Error Patterns                                     */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'error-patterns' && (
        <div className="space-y-3">
          {errorTypes.length === 0 ? (
            <Card className="border-[rgba(201,162,39,0.12)] bg-[#0c1117]/50">
              <CardContent className="flex flex-col items-center justify-center py-16 text-[#4a6070]">
                <Monitor className="mb-4 h-12 w-12 opacity-30" />
                <p className="text-lg font-medium">No error types catalogued</p>
              </CardContent>
            </Card>
          ) : (
            errorTypes.map((et) => (
              <Card
                key={et.id}
                className="cursor-pointer border-[rgba(201,162,39,0.12)] bg-[#0c1117]/50 transition hover:border-[rgba(201,162,39,0.3)]"
                onClick={() => openErrorTypeDetail(et)}
              >
                <CardContent className="py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-white">{et.label}</span>
                      <Badge variant="outline" className={`text-xs ${severityBadge(et.severity)}`}>
                        {et.severity}
                      </Badge>
                      <Badge variant="outline" className={`text-xs ${categoryBadge(et.category)}`}>
                        {et.category}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[#4a6070]">
                      <span>{(et.total_occurrences || 0).toLocaleString()} occurrences</span>
                      <span>First: {fmtDate(et.first_seen)}</span>
                      <span>Last: {fmtDate(et.last_seen)}</span>
                    </div>
                  </div>
                  <p className="mt-1 truncate font-mono text-xs text-[#4a6070]" title={et.normalised_message}>
                    {et.normalised_message?.slice(0, 150)}
                  </p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Tab 3: Mod Analysis                                       */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'mod-analysis' && (
        <>
          {/* Mod filters */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4a6070]" />
              <Input
                value={modSearch}
                onChange={(e) => setModSearch(e.target.value)}
                placeholder="Search by mod, category, stream, summary, or signature..."
                className="border-[rgba(201,162,39,0.15)] bg-[#0c1117] pl-10 text-white"
              />
            </div>
            <select
              value={modStatusFilter}
              onChange={(e) => setModStatusFilter(e.target.value)}
              className="rounded-md border border-[rgba(201,162,39,0.15)] bg-[#0c1117] px-3 py-2 text-sm text-white"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="monitoring">Monitoring</option>
              <option value="resolved">Resolved</option>
              <option value="false_positive">False Positive</option>
            </select>
          </div>

          {/* Mod issue cards */}
          {modLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-28 animate-pulse rounded-lg bg-[#0c1117]/50" />
              ))}
            </div>
          ) : filteredModIssues.length === 0 ? (
            <Card className="border-[rgba(201,162,39,0.12)] bg-[#0c1117]/50">
              <CardContent className="flex flex-col items-center justify-center py-16 text-[#4a6070]">
                <CheckCircle2 className="mb-4 h-12 w-12 opacity-30" />
                <p className="text-lg font-medium">No mod issues detected</p>
                <p className="mt-1 text-sm">
                  The analyzer will populate this page as merged console, profile, backend, and runtime evidence is classified.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredModIssues.map((issue) => (
                <Card key={issue.id} className={`border ${modSeverityColor(issue.severity)}`}>
                  <CardContent className="py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-white">
                            {issue.mod_name || 'Unattributed issue'}
                          </span>
                          <Badge className={`text-xs ${confidenceColor(issue.confidence_score || 0)}`}>
                            {Math.round((issue.confidence_score || 0) * 100)}% confidence
                          </Badge>
                          <Badge variant="outline" className="text-xs uppercase">
                            {issue.severity || 'unknown'}
                          </Badge>
                          <Badge variant="outline" className={`text-xs ${statusColor(issue.status)}`}>
                            {issue.status}
                          </Badge>
                          {issue.source_category && (
                            <Badge variant="outline" className={`text-xs ${sourceTone(issue.source_category)}`}>
                              {issue.source_category}
                            </Badge>
                          )}
                          {issue.issue_type && (
                            <Badge variant="outline" className="border-zinc-700 text-xs text-[#8a9aa8]">
                              {issue.issue_type}
                            </Badge>
                          )}
                        </div>

                        <p className="mt-2 text-sm text-[#d0d8e0]">
                          {issue.impact_summary || issue.error_pattern || issue.error_signature || 'No interpreted summary available.'}
                        </p>

                        <div className="mt-2 flex flex-wrap gap-4 text-xs text-[#8a9aa8]">
                          <span>{issue.occurrence_count || 0} occurrences</span>
                          <span>{(issue.affected_servers || []).length} servers affected</span>
                          {(issue.source_streams || []).length > 0 && <span>Streams: {(issue.source_streams || []).join(', ')}</span>}
                          {issue.last_seen && <span>Last seen: {new Date(issue.last_seen).toLocaleString()}</span>}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button onClick={() => setSelectedIssue(issue)} variant="outline" size="sm" className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8] hover:text-white">
                          <Eye className="mr-1 h-3 w-3" /> Details
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {VERDICT_OPTIONS.map((status) => (
                        <Button
                          key={status}
                          size="sm"
                          variant="outline"
                          onClick={() => updateIssueStatus(issue.id, status)}
                          className={`h-7 text-[11px] ${issue.status === status ? 'border-tropic-gold/40 text-tropic-gold' : 'border-zinc-700 text-[#8a9aa8]'}`}
                        >
                          {status.replace(/_/g, ' ')}
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Tab 4: Alerts & Incidents                                 */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'alerts' && (
        <div className="space-y-4">
          {/* Cross-link: related mod issues */}
          {summaryStats.activeModIssues > 0 && (
            <Card className="border-[rgba(201,162,39,0.12)] bg-[#0c1117]/50">
              <CardContent className="flex items-center gap-3 py-3">
                <Package className="h-4 w-4 text-[#c9a227]" />
                <span className="text-sm text-[#8a9aa8]">
                  {summaryStats.activeModIssues} active mod issue{summaryStats.activeModIssues !== 1 ? 's' : ''} may be related to current alerts.
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setActiveTab('mod-analysis')}
                  className="ml-auto text-[#c9a227] hover:text-[#e8c547]"
                >
                  View Mod Analysis →
                </Button>
              </CardContent>
            </Card>
          )}

          {alerts.length === 0 ? (
            <Card className="border-[rgba(201,162,39,0.12)] bg-[#0c1117]/50">
              <CardContent className="flex flex-col items-center justify-center py-16 text-[#4a6070]">
                <Bell className="mb-4 h-12 w-12 opacity-30" />
                <p className="text-lg font-medium">No active alerts</p>
                <p className="mt-1 text-sm">
                  Alerts will appear here when error thresholds are exceeded.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert) => (
                <Card key={alert.id} className="border-[rgba(201,162,39,0.12)] bg-[#0c1117]/50">
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-xs ${severityBadge(alert.severity)}`}>
                          {alert.severity}
                        </Badge>
                        <span className="text-sm text-[#8a9aa8]">{serverMap[alert.server_id] || alert.server_id}</span>
                        <span className="text-sm text-white">{alert.reason}</span>
                      </div>
                      <Button size="sm" variant="ghost" className="text-[#4a6070] hover:text-green-400" onClick={() => resolveAlert(alert.id)}>
                        <CheckCircle2 className="mr-1 h-3 w-3" /> Resolve
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Error Type detail dialog                                  */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <Dialog open={!!selectedErrorType} onOpenChange={() => setSelectedErrorType(null)}>
        <DialogContent className="max-w-2xl border-[rgba(201,162,39,0.15)] bg-[#050a0e] text-white">
          <DialogHeader>
            <DialogTitle className="text-[#e8c547]">
              {selectedErrorType?.label}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={`text-xs ${severityBadge(selectedErrorType?.severity)}`}>
                {selectedErrorType?.severity}
              </Badge>
              <Badge variant="outline" className={`text-xs ${categoryBadge(selectedErrorType?.category)}`}>
                {selectedErrorType?.category}
              </Badge>
              <span className="text-xs text-[#4a6070]">
                {(selectedErrorType?.total_occurrences || 0).toLocaleString()} occurrences
              </span>
            </div>

            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wider text-[#4a6070]">Example raw message</p>
              <pre className="max-h-32 overflow-auto rounded bg-[#0c1117] p-3 font-mono text-xs text-[#8a9aa8] whitespace-pre-wrap break-all">
                {selectedErrorType?.example_raw}
              </pre>
            </div>

            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wider text-[#4a6070]">Normalised pattern</p>
              <pre className="rounded bg-[#0c1117] p-3 font-mono text-xs text-[#4a6070] whitespace-pre-wrap break-all">
                {selectedErrorType?.normalised_message}
              </pre>
            </div>

            <div>
              <p className="mb-2 text-[10px] uppercase tracking-wider text-[#4a6070]">
                Recent occurrences ({typeOccurrences.length})
              </p>
              {typeOccLoading ? (
                <div className="h-20 animate-pulse rounded bg-[#0c1117]/50" />
              ) : typeOccurrences.length === 0 ? (
                <p className="text-sm text-[#4a6070]">No occurrences found.</p>
              ) : (
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {typeOccurrences.map((occ) => (
                    <div key={occ.id} className="rounded bg-[#0c1117]/60 px-3 py-2 text-xs">
                      <div className="flex items-center gap-2 text-[#4a6070]">
                        <Server className="h-3 w-3" />
                        <span>{serverMap[occ.server_id] || occ.server_id}</span>
                        <span>•</span>
                        <span>{fmtDate(occ.timestamp)}</span>
                        {occ.mod_guid && (
                          <>
                            <span>•</span>
                            <span className="font-mono">{occ.mod_guid.slice(0, 12)}</span>
                          </>
                        )}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-all text-[#8a9aa8]">{occ.raw?.slice(0, 400)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Mod Issue detail dialog                                   */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <Dialog open={!!selectedIssue} onOpenChange={() => setSelectedIssue(null)}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto border-[rgba(201,162,39,0.12)] bg-[#050a0e] text-white">
          {selectedIssue && (
            <>
              <DialogHeader>
                <DialogTitle className="text-tropic-gold">
                  {(selectedIssue.mod_name || 'Unattributed issue')} - Details
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div><span className="text-[#4a6070]">Mod ID:</span> <span className="font-mono text-[#8a9aa8]">{selectedIssue.mod_id || 'unattributed'}</span></div>
                  <div><span className="text-[#4a6070]">Status:</span> <Badge variant="outline" className="ml-1 text-xs">{selectedIssue.status}</Badge></div>
                  <div><span className="text-[#4a6070]">Severity:</span> <span className="text-[#8a9aa8]">{selectedIssue.severity || 'unknown'}</span></div>
                  <div><span className="text-[#4a6070]">Method:</span> <span className="text-[#8a9aa8]">{selectedIssue.attribution_method || 'unknown'}</span></div>
                  <div><span className="text-[#4a6070]">Source category:</span> <span className="text-[#8a9aa8]">{selectedIssue.source_category || 'unknown'}</span></div>
                  <div><span className="text-[#4a6070]">Issue type:</span> <span className="text-[#8a9aa8]">{selectedIssue.issue_type || 'unknown'}</span></div>
                  <div><span className="text-[#4a6070]">Confidence:</span> <Badge className={`ml-1 text-xs ${confidenceColor(selectedIssue.confidence_score || 0)}`}>{Math.round((selectedIssue.confidence_score || 0) * 100)}%</Badge></div>
                  <div><span className="text-[#4a6070]">Occurrences:</span> <span className="text-[#8a9aa8]">{selectedIssue.occurrence_count || 0}</span></div>
                </div>

                {(selectedIssue.source_streams || []).length > 0 && (
                  <div className="rounded-lg border border-[rgba(201,162,39,0.12)] bg-[#0c1117]/50 p-3">
                    <p className="mb-2 text-xs text-[#4a6070]">Source Streams</p>
                    <div className="flex flex-wrap gap-2">
                      {(selectedIssue.source_streams || []).map((stream) => (
                        <Badge key={stream} variant="outline" className="border-zinc-700 text-[#8a9aa8]">
                          {stream}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-lg border border-[rgba(201,162,39,0.12)] bg-[#0c1117]/50 p-3">
                  <p className="mb-2 text-xs text-[#4a6070]">Impact Summary</p>
                  <p className="text-sm text-[#d0d8e0]">
                    {selectedIssue.impact_summary || 'No interpreted impact summary is available for this issue yet.'}
                  </p>
                </div>

                <div className="rounded-lg border border-[rgba(201,162,39,0.12)] bg-[#0c1117]/50 p-3">
                  <p className="mb-2 flex items-center gap-1 text-xs text-[#4a6070]">
                    <Clock className="h-3 w-3" /> Timeline
                  </p>
                  <div className="flex flex-wrap gap-4 text-xs text-[#8a9aa8]">
                    {selectedIssue.first_seen && (
                      <div>
                        <span className="text-[#4a6070]">First seen: </span>
                        <span>{new Date(selectedIssue.first_seen).toLocaleString()}</span>
                      </div>
                    )}
                    {selectedIssue.last_seen && (
                      <div>
                        <span className="text-[#4a6070]">Last seen: </span>
                        <span>{new Date(selectedIssue.last_seen).toLocaleString()}</span>
                      </div>
                    )}
                    {(selectedIssue.occurrence_count || 0) > 1 && (
                      <div className="flex items-center gap-1 text-amber-400">
                        <TrendingUp className="h-3 w-3" />
                        <span>{selectedIssue.occurrence_count} repeated detections</span>
                      </div>
                    )}
                  </div>
                </div>

                {(selectedIssue.affected_servers || []).length > 0 && (
                  <div className="rounded-lg border border-[rgba(201,162,39,0.12)] bg-[#0c1117]/50 p-3">
                    <p className="mb-2 flex items-center gap-1 text-xs text-[#4a6070]">
                      <Server className="h-3 w-3" /> Affected Servers
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedIssue.affected_servers.map((server, index) => (
                        <Badge key={index} variant="outline" className="border-red-600/30 text-xs text-red-400">
                          <Server className="mr-1 h-2.5 w-2.5" />
                          {server.server_name || server.server_id || `Server ${index + 1}`}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {selectedIssue.error_pattern && (
                  <div>
                    <p className="mb-1 text-sm text-[#4a6070]">Error Pattern</p>
                    <pre className="overflow-x-auto rounded bg-[#0c1117] p-3 text-xs text-[#8a9aa8]">{selectedIssue.error_pattern}</pre>
                  </div>
                )}

                {(selectedIssue.recommended_actions || []).length > 0 && (
                  <div>
                    <p className="mb-1 text-sm text-[#4a6070]">Recommended Actions</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedIssue.recommended_actions.map((action, index) => (
                        <Badge key={index} variant="outline" className="border-tropic-gold/30 text-xs text-tropic-gold">
                          {String(action).replace(/_/g, ' ')}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {(selectedIssue.evidence || []).length > 0 && (
                  <div>
                    <p className="mb-1 text-sm text-[#4a6070]">Evidence ({selectedIssue.evidence.length})</p>
                    <div className="max-h-48 space-y-2 overflow-y-auto">
                      {selectedIssue.evidence.slice(0, 8).map((evidence, index) => (
                        <pre key={index} className="rounded bg-[#0c1117] p-2 text-xs text-[#8a9aa8]">
                          {evidence.log_excerpt || JSON.stringify(evidence, null, 2)}
                        </pre>
                      ))}
                    </div>
                  </div>
                )}

                <div className="border-t border-[rgba(201,162,39,0.12)] pt-4">
                  <p className="mb-2 text-sm text-[#8a9aa8]">Operator verdict</p>
                  <div className="flex flex-wrap gap-2">
                    {VERDICT_OPTIONS.map((status) => (
                      <Button
                        key={status}
                        size="sm"
                        variant="outline"
                        onClick={() => updateIssueStatus(selectedIssue.id, status, resolutionNotes)}
                        className={`text-xs ${selectedIssue.status === status ? 'border-tropic-gold/40 text-tropic-gold' : 'border-zinc-700 text-[#8a9aa8]'}`}
                      >
                        {status.replace(/_/g, ' ')}
                      </Button>
                    ))}
                  </div>
                  <Textarea
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    className="mt-3 border-[rgba(201,162,39,0.15)] bg-[#0c1117] text-white"
                    rows={3}
                    placeholder="Resolution or operator notes..."
                  />
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ServerDiagnostics;

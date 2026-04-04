import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertTriangle, Bug, CheckCircle, ChevronDown, ChevronRight,
  ChevronLeft, Clock, Filter, RefreshCw, Search, Trash2, XCircle,
} from 'lucide-react';
import { API } from '@/utils/api';

const SEVERITY_CONFIG = {
  critical: { color: 'bg-red-600/20 text-red-300 border-red-600/40', icon: XCircle, label: 'CRITICAL' },
  error: { color: 'bg-orange-600/20 text-orange-300 border-orange-600/40', icon: AlertTriangle, label: 'ERROR' },
  warning: { color: 'bg-yellow-600/20 text-yellow-300 border-yellow-600/40', icon: AlertTriangle, label: 'WARNING' },
  info: { color: 'bg-blue-600/20 text-blue-300 border-blue-600/40', icon: Bug, label: 'INFO' },
  debug: { color: 'bg-[#4a6070]/20 text-[#8a9aa8] border-[rgba(201,162,39,0.2)]/40', icon: Bug, label: 'DEBUG' },
};

const SOURCE_COLORS = {
  deployment: 'bg-tropic-gold/20 text-tropic-gold border-tropic-gold/30',
  adsb: 'bg-cyan-600/20 text-cyan-300 border-cyan-600/30',
  frontend: 'bg-purple-600/20 text-purple-300 border-purple-600/30',
  unhandled: 'bg-red-600/20 text-red-300 border-red-600/30',
  auth: 'bg-green-600/20 text-green-300 border-green-600/30',
};

function timeAgo(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

const ErrorLogsManager = () => {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [autoRefresh, setAutoRefresh] = useState(false);

  const [filters, setFilters] = useState({
    source: '',
    severity: '',
    resolved: '',
    search: '',
  });

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 50 };
      if (filters.source) params.source = filters.source;
      if (filters.severity) params.severity = filters.severity;
      if (filters.resolved === 'true') params.resolved = true;
      if (filters.resolved === 'false') params.resolved = false;
      if (filters.search) params.search = filters.search;

      const res = await axios.get(`${API}/admin/error-logs`, { params, withCredentials: true });
      setLogs(res.data.logs || []);
      setTotalPages(res.data.pages || 1);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error('Failed to fetch error logs:', err);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/admin/error-logs/stats`, { withCredentials: true });
      setStats(res.data);
    } catch (err) {
      console.error('Failed to fetch error log stats:', err);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, [fetchLogs, fetchStats]);

  // Auto-refresh every 30s when enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      fetchLogs();
      fetchStats();
    }, 30_000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchLogs, fetchStats]);

  const toggleExpand = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleResolve = async (errorId) => {
    try {
      await axios.put(`${API}/admin/error-logs/${errorId}/resolve`, {}, { withCredentials: true });
      await fetchLogs();
      await fetchStats();
    } catch (err) {
      console.error('Failed to resolve error log:', err);
    }
  };

  const handleDelete = async (errorId) => {
    if (!window.confirm('Delete this error log entry?')) return;
    try {
      await axios.delete(`${API}/admin/error-logs/${errorId}`, { withCredentials: true });
      await fetchLogs();
      await fetchStats();
    } catch (err) {
      console.error('Failed to delete error log:', err);
    }
  };

  const handleClearResolved = async () => {
    if (!window.confirm('Delete ALL resolved error logs?')) return;
    try {
      await axios.delete(`${API}/admin/error-logs`, { withCredentials: true });
      await fetchLogs();
      await fetchStats();
    } catch (err) {
      console.error('Failed to clear resolved error logs:', err);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value === '__all__' ? '' : value }));
    setPage(1);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    // fetchLogs will be triggered by the useEffect that depends on [page, filters]
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-tropic-gold tracking-wider" style={{ fontFamily: "'Share Tech', sans-serif" }}>
              ERROR LOGS
            </h1>
            <p className="text-[#4a6070] text-sm mt-1">Application error monitoring for deployments, ADSB, and system events</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-[#8a9aa8] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-[rgba(201,162,39,0.15)]"
              />
              Auto-refresh
            </label>
            <Button
              variant="outline"
              size="sm"
              className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8] hover:text-white"
              onClick={() => { fetchLogs(); fetchStats(); }}
            >
              <RefreshCw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="bg-[#050a0e]/60 border-[rgba(201,162,39,0.12)]">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-white">{stats.total}</div>
                <div className="text-[10px] text-[#4a6070] tracking-wider font-bold">TOTAL ERRORS</div>
              </CardContent>
            </Card>
            <Card className="bg-[#050a0e]/60 border-red-900/40">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-red-400">{stats.unresolved}</div>
                <div className="text-[10px] text-[#4a6070] tracking-wider font-bold">UNRESOLVED</div>
              </CardContent>
            </Card>
            <Card className="bg-[#050a0e]/60 border-yellow-900/40">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-yellow-400">{stats.recent_1h}</div>
                <div className="text-[10px] text-[#4a6070] tracking-wider font-bold">LAST HOUR</div>
              </CardContent>
            </Card>
            <Card className="bg-[#050a0e]/60 border-blue-900/40">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-blue-400">{stats.recent_24h}</div>
                <div className="text-[10px] text-[#4a6070] tracking-wider font-bold">LAST 24H</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Severity & Source Breakdown */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {stats.by_severity && Object.keys(stats.by_severity).length > 0 && (
              <Card className="bg-[#050a0e]/60 border-[rgba(201,162,39,0.12)]">
                <CardContent className="p-4">
                  <div className="text-[10px] text-[#4a6070] tracking-wider font-bold mb-2">BY SEVERITY</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(stats.by_severity).map(([sev, count]) => {
                      const cfg = SEVERITY_CONFIG[sev] || SEVERITY_CONFIG.error;
                      return (
                        <Badge key={sev} className={`${cfg.color} border text-xs cursor-pointer`}
                          onClick={() => handleFilterChange('severity', sev)}>
                          {cfg.label}: {count}
                        </Badge>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
            {stats.by_source && Object.keys(stats.by_source).length > 0 && (
              <Card className="bg-[#050a0e]/60 border-[rgba(201,162,39,0.12)]">
                <CardContent className="p-4">
                  <div className="text-[10px] text-[#4a6070] tracking-wider font-bold mb-2">BY SOURCE</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(stats.by_source).map(([src, count]) => {
                      const color = SOURCE_COLORS[src] || 'bg-[#4a6070]/20 text-[#8a9aa8] border-[rgba(201,162,39,0.2)]/30';
                      return (
                        <Badge key={src} className={`${color} border text-xs cursor-pointer`}
                          onClick={() => handleFilterChange('source', src)}>
                          {src}: {count}
                        </Badge>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Filters */}
        <Card className="bg-[#050a0e]/60 border-[rgba(201,162,39,0.12)]">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex items-center gap-1 text-xs text-[#4a6070]">
                <Filter className="w-3 h-3" />
                FILTERS
              </div>
              <div className="w-36">
                <Select value={filters.source || '__all__'} onValueChange={(v) => handleFilterChange('source', v)}>
                  <SelectTrigger className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] h-8 text-xs">
                    <SelectValue placeholder="All Sources" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]">
                    <SelectItem value="__all__" className="text-xs">All Sources</SelectItem>
                    <SelectItem value="deployment" className="text-xs">Deployment</SelectItem>
                    <SelectItem value="adsb" className="text-xs">ADSB</SelectItem>
                    <SelectItem value="frontend" className="text-xs">Frontend</SelectItem>
                    <SelectItem value="unhandled" className="text-xs">Unhandled</SelectItem>
                    <SelectItem value="auth" className="text-xs">Auth</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-36">
                <Select value={filters.severity || '__all__'} onValueChange={(v) => handleFilterChange('severity', v)}>
                  <SelectTrigger className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] h-8 text-xs">
                    <SelectValue placeholder="All Severities" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]">
                    <SelectItem value="__all__" className="text-xs">All Severities</SelectItem>
                    <SelectItem value="critical" className="text-xs">Critical</SelectItem>
                    <SelectItem value="error" className="text-xs">Error</SelectItem>
                    <SelectItem value="warning" className="text-xs">Warning</SelectItem>
                    <SelectItem value="info" className="text-xs">Info</SelectItem>
                    <SelectItem value="debug" className="text-xs">Debug</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-36">
                <Select value={filters.resolved || '__all__'} onValueChange={(v) => handleFilterChange('resolved', v)}>
                  <SelectTrigger className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] h-8 text-xs">
                    <SelectValue placeholder="All States" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]">
                    <SelectItem value="__all__" className="text-xs">All States</SelectItem>
                    <SelectItem value="false" className="text-xs">Unresolved</SelectItem>
                    <SelectItem value="true" className="text-xs">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <form onSubmit={handleSearchSubmit} className="flex items-center gap-1 flex-1 min-w-[180px]">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#4a6070]" />
                  <Input
                    value={filters.search}
                    onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                    className="bg-[#050a0e] border-[rgba(201,162,39,0.15)] h-8 text-xs pl-7"
                    placeholder="Search messages, paths..."
                  />
                </div>
                <Button type="submit" size="sm" variant="outline" className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8] h-8 text-xs">
                  Go
                </Button>
              </form>
              {(stats?.total - stats?.unresolved > 0) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-red-800/50 text-red-400 hover:text-red-300 hover:bg-red-900/20 h-8 text-xs"
                  onClick={handleClearResolved}
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Clear Resolved
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Log count & pagination header */}
        <div className="flex items-center justify-between text-xs text-[#4a6070]">
          <span>{total} error log(s) found</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8] h-7 w-7 p-0"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="w-3 h-3" />
            </Button>
            <span>Page {page} / {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8] h-7 w-7 p-0"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="w-3 h-3" />
            </Button>
          </div>
        </div>

        {/* Log entries */}
        {loading ? (
          <div className="text-center text-[#4a6070] py-12">Loading error logs...</div>
        ) : logs.length === 0 ? (
          <div className="text-center text-[#4a6070] py-12">
            <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500/30" />
            <p className="text-lg font-bold text-[#4a6070]">No error logs found</p>
            <p className="text-sm text-[#4a6070] mt-1">All systems operational</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => {
              const sevCfg = SEVERITY_CONFIG[log.severity] || SEVERITY_CONFIG.error;
              const SevIcon = sevCfg.icon;
              const srcColor = SOURCE_COLORS[log.source] || 'bg-[#4a6070]/20 text-[#8a9aa8] border-[rgba(201,162,39,0.2)]/30';
              const isExpanded = expandedIds.has(log.id);

              return (
                <Card key={log.id} className={`bg-[#050a0e]/40 border-[rgba(201,162,39,0.12)] hover:border-[rgba(201,162,39,0.15)] transition-colors ${log.resolved ? 'opacity-50' : ''}`}>
                  <CardContent className="p-0">
                    {/* Collapsed header */}
                    <div
                      className="flex items-start gap-3 p-3 cursor-pointer select-none"
                      onClick={() => toggleExpand(log.id)}
                    >
                      <div className="mt-0.5 shrink-0">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-[#4a6070]" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-[#4a6070]" />
                        )}
                      </div>
                      <SevIcon className={`w-4 h-4 mt-0.5 shrink-0 ${
                        log.severity === 'critical' ? 'text-red-400' :
                        log.severity === 'error' ? 'text-orange-400' :
                        log.severity === 'warning' ? 'text-yellow-400' :
                        'text-[#8a9aa8]'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Badge className={`${sevCfg.color} border text-[10px]`}>{sevCfg.label}</Badge>
                          <Badge className={`${srcColor} border text-[10px]`}>{log.source}</Badge>
                          {log.error_type && (
                            <span className="text-[10px] text-[#4a6070] font-mono">{log.error_type}</span>
                          )}
                          {log.resolved && (
                            <Badge className="bg-green-600/20 text-green-300 border-green-600/30 border text-[10px]">
                              RESOLVED
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-[#d0d8e0] truncate">{log.message}</p>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-[#4a6070]">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {timeAgo(log.timestamp)}
                          </span>
                          {log.request_method && log.request_path && (
                            <span className="font-mono">{log.request_method} {log.request_path}</span>
                          )}
                          {log.user_id && <span>user: {log.user_id.slice(0, 8)}…</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {!log.resolved && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-green-800/50 text-green-400 hover:text-green-300 hover:bg-green-900/20 h-7 w-7 p-0"
                            onClick={() => handleResolve(log.id)}
                            title="Mark as resolved"
                          >
                            <CheckCircle className="w-3 h-3" />
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-red-800/50 text-red-400 hover:text-red-300 hover:bg-red-900/20 h-7 w-7 p-0"
                          onClick={() => handleDelete(log.id)}
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-0 ml-8 border-t border-[rgba(201,162,39,0.12)]/50 mt-0 space-y-3">
                        {/* Full message */}
                        <div className="mt-3">
                          <div className="text-[10px] text-[#4a6070] tracking-wider font-bold mb-1">MESSAGE</div>
                          <p className="text-sm text-[#8a9aa8] whitespace-pre-wrap break-words bg-[#0c1117]/50 rounded p-2 font-mono text-xs">
                            {log.message}
                          </p>
                        </div>

                        {/* Request info */}
                        {(log.request_method || log.request_path) && (
                          <div>
                            <div className="text-[10px] text-[#4a6070] tracking-wider font-bold mb-1">REQUEST</div>
                            <div className="text-xs text-[#8a9aa8] font-mono bg-[#0c1117]/50 rounded p-2">
                              <span className="text-cyan-400">{log.request_method}</span> {log.request_path}
                            </div>
                          </div>
                        )}

                        {/* Request body */}
                        {log.request_body && Object.keys(log.request_body).length > 0 && (
                          <div>
                            <div className="text-[10px] text-[#4a6070] tracking-wider font-bold mb-1">REQUEST BODY</div>
                            <pre className="text-xs text-[#8a9aa8] font-mono bg-[#0c1117]/50 rounded p-2 overflow-x-auto max-h-40 whitespace-pre-wrap">
                              {JSON.stringify(log.request_body, null, 2)}
                            </pre>
                          </div>
                        )}

                        {/* Stack trace */}
                        {log.stack_trace && (
                          <div>
                            <div className="text-[10px] text-[#4a6070] tracking-wider font-bold mb-1">STACK TRACE</div>
                            <pre className="text-xs text-red-300/80 font-mono bg-[#0c1117]/50 rounded p-2 overflow-x-auto max-h-60 whitespace-pre-wrap">
                              {log.stack_trace}
                            </pre>
                          </div>
                        )}

                        {/* Metadata */}
                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                          <div>
                            <div className="text-[10px] text-[#4a6070] tracking-wider font-bold mb-1">METADATA</div>
                            <pre className="text-xs text-[#8a9aa8] font-mono bg-[#0c1117]/50 rounded p-2 overflow-x-auto max-h-40 whitespace-pre-wrap">
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          </div>
                        )}

                        {/* Timestamps */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] text-[#4a6070]">
                          <div>
                            <span className="font-bold tracking-wider">LOGGED</span>
                            <div className="text-[#8a9aa8]">{new Date(log.timestamp).toLocaleString()}</div>
                          </div>
                          {log.user_id && (
                            <div>
                              <span className="font-bold tracking-wider">USER ID</span>
                              <div className="text-[#8a9aa8] font-mono">{log.user_id}</div>
                            </div>
                          )}
                          {log.resolved_at && (
                            <div>
                              <span className="font-bold tracking-wider">RESOLVED AT</span>
                              <div className="text-green-400">{new Date(log.resolved_at).toLocaleString()}</div>
                            </div>
                          )}
                          {log.resolved_by && (
                            <div>
                              <span className="font-bold tracking-wider">RESOLVED BY</span>
                              <div className="text-[#8a9aa8] font-mono">{log.resolved_by}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Bottom pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 text-xs text-[#4a6070]">
            <Button
              variant="outline"
              size="sm"
              className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8] h-7"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="w-3 h-3 mr-1" />
              Previous
            </Button>
            <span>Page {page} / {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8] h-7"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
              <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        )}
      </div>
    </>
  );
};

export default ErrorLogsManager;

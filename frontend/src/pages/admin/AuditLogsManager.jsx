import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollText, ChevronLeft, ChevronRight, Search, Filter, Clock, User, Activity, RefreshCw } from 'lucide-react';

import { API } from '@/utils/api';

const ACTION_LABELS = {
  update_user: 'User Updated',
  delete_user: 'User Deleted',
  delete_operation: 'Operation Deleted',
  delete_announcement: 'Announcement Deleted',
  import_users: 'Users Imported',
  update_site_content: 'Site Content Updated',
  create_operation: 'Operation Created',
  create_announcement: 'Announcement Created',
  delete_discussion: 'Discussion Deleted',
  delete_gallery: 'Gallery Item Deleted',
  delete_training: 'Training Deleted',
  create_intel: 'Intel Created',
  delete_intel: 'Intel Deleted',
  create_campaign: 'Campaign Created',
  delete_campaign: 'Campaign Deleted',
  partner_approved: 'Partner Approved',
  partner_rejected: 'Partner Rejected',
};

const ACTION_COLORS = {
  delete_user: 'bg-tropic-red/20 text-tropic-red-light border-tropic-red/30',
  delete_operation: 'bg-tropic-red/20 text-tropic-red-light border-tropic-red/30',
  delete_announcement: 'bg-tropic-red/20 text-tropic-red-light border-tropic-red/30',
  delete_discussion: 'bg-tropic-red/20 text-tropic-red-light border-tropic-red/30',
  delete_gallery: 'bg-tropic-red/20 text-tropic-red-light border-tropic-red/30',
  delete_training: 'bg-tropic-red/20 text-tropic-red-light border-tropic-red/30',
  delete_intel: 'bg-tropic-red/20 text-tropic-red-light border-tropic-red/30',
  delete_campaign: 'bg-tropic-red/20 text-tropic-red-light border-tropic-red/30',
  update_user: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  import_users: 'bg-tropic-gold/20 text-tropic-gold-light border-tropic-gold/30',
  partner_approved: 'bg-green-500/20 text-green-300 border-green-500/30',
  partner_rejected: 'bg-tropic-red/20 text-tropic-red-light border-tropic-red/30',
};

const AuditLogsManager = () => {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({
    action_type: '',
    resource_type: '',
    search: '',
  });

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 30 };
      if (filters.action_type) params.action_type = filters.action_type;
      if (filters.resource_type) params.resource_type = filters.resource_type;

      const res = await axios.get(`${API}/admin/audit-logs`, { params });
      setLogs(res.data.logs || []);
      setTotalPages(res.data.pages || 1);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  const fetchStats = async () => {
    try {
      const res = await axios.get(`${API}/admin/audit-logs/stats`);
      setStats(res.data);
    } catch (err) {
      console.error('Failed to fetch audit stats:', err);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    fetchStats();
  }, []);

  const formatTimestamp = (ts) => {
    if (!ts) return 'N/A';
    const date = new Date(ts);
    return date.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });
  };

  const getActionBadgeClass = (actionType) => {
    return ACTION_COLORS[actionType] || 'bg-[#111a24]/50 text-[#8a9aa8] border-[rgba(201,162,39,0.06)]';
  };

  const renderMetadata = (log) => {
    if (log.metadata) {
      return (
        <div className="mt-1 text-xs text-[#4a6070] font-mono">
          {Object.entries(log.metadata).map(([key, val]) => (
            <span key={key} className="mr-3">
              {key}: <span className="text-[#8a9aa8]">{typeof val === 'object' ? JSON.stringify(val) : String(val)}</span>
            </span>
          ))}
        </div>
      );
    }
    if (log.before || log.after) {
      const changes = log.after ? Object.keys(log.after) : [];
      if (changes.length > 0) {
        return (
          <div className="mt-1 text-xs text-[#4a6070]">
            Changed: {changes.join(', ')}
          </div>
        );
      }
    }
    return null;
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="relative corner-bracket border border-[rgba(201,162,39,0.15)] bg-[radial-gradient(circle_at_top,rgba(201,162,39,0.06),#050a0e_58%)] px-6 py-7 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#c9a227]" style={{ fontFamily: "'Oswald', sans-serif" }}>System Monitoring</p>
              <h1 className="mt-3 text-4xl font-black uppercase tracking-[0.12em] text-[#e8c547]" style={{ fontFamily: "'Share Tech', sans-serif" }}>AUDIT LOGS</h1>
              <p className="mt-2 text-sm text-[#8a9aa8]" style={{ fontFamily: "'Inter', sans-serif" }}>System activity trail and administrative action history</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { fetchLogs(); fetchStats(); }}
              className="border-tropic-gold/40 text-tropic-gold hover:bg-tropic-gold/10"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-[#050a0e]/60 border-tropic-gold/20">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-tropic-gold/10 rounded-lg">
                    <ScrollText className="w-5 h-5 text-tropic-gold" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-white">{stats.total}</p>
                    <p className="text-xs text-[#8a9aa8]">Total Events</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-[#050a0e]/60 border-tropic-gold/20">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-tropic-gold/10 rounded-lg">
                    <Clock className="w-5 h-5 text-tropic-gold" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-white">{stats.recent_24h}</p>
                    <p className="text-xs text-[#8a9aa8]">Last 24 Hours</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-[#050a0e]/60 border-tropic-gold/20">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-tropic-gold/10 rounded-lg">
                    <Activity className="w-5 h-5 text-tropic-gold" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-white">{Object.keys(stats.by_action || {}).length}</p>
                    <p className="text-xs text-[#8a9aa8]">Action Types</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-[#050a0e]/60 border-tropic-gold/20">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-tropic-gold/10 rounded-lg">
                    <User className="w-5 h-5 text-tropic-gold" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-white">{Object.keys(stats.by_resource || {}).length}</p>
                    <p className="text-xs text-[#8a9aa8]">Resource Types</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        <Card className="bg-[#050a0e]/60 border-[rgba(201,162,39,0.12)]">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-[#8a9aa8]" />
                <span className="text-sm text-[#8a9aa8]">Filter:</span>
              </div>
              <Select
                value={filters.action_type || 'all'}
                onValueChange={(val) => {
                  setFilters(f => ({ ...f, action_type: val === 'all' ? '' : val }));
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-48 bg-[#050a0e]/60 border-[rgba(201,162,39,0.15)] text-[#d0d8e0]">
                  <SelectValue placeholder="All Actions" />
                </SelectTrigger>
                <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]">
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="update_user">User Updated</SelectItem>
                  <SelectItem value="delete_user">User Deleted</SelectItem>
                  <SelectItem value="import_users">Users Imported</SelectItem>
                  <SelectItem value="delete_operation">Operation Deleted</SelectItem>
                  <SelectItem value="delete_announcement">Announcement Deleted</SelectItem>
                  <SelectItem value="create_intel">Intel Created</SelectItem>
                  <SelectItem value="delete_intel">Intel Deleted</SelectItem>
                  <SelectItem value="partner_approved">Partner Approved</SelectItem>
                  <SelectItem value="partner_rejected">Partner Rejected</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={filters.resource_type || 'all'}
                onValueChange={(val) => {
                  setFilters(f => ({ ...f, resource_type: val === 'all' ? '' : val }));
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-48 bg-[#050a0e]/60 border-[rgba(201,162,39,0.15)] text-[#d0d8e0]">
                  <SelectValue placeholder="All Resources" />
                </SelectTrigger>
                <SelectContent className="bg-[#0c1117] border-[rgba(201,162,39,0.15)]">
                  <SelectItem value="all">All Resources</SelectItem>
                  <SelectItem value="user">Users</SelectItem>
                  <SelectItem value="operation">Operations</SelectItem>
                  <SelectItem value="announcement">Announcements</SelectItem>
                  <SelectItem value="intel">Intel</SelectItem>
                  <SelectItem value="campaign">Campaigns</SelectItem>
                  <SelectItem value="discussion">Discussions</SelectItem>
                  <SelectItem value="gallery">Gallery</SelectItem>
                  <SelectItem value="training">Training</SelectItem>
                </SelectContent>
              </Select>
              {(filters.action_type || filters.resource_type) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setFilters({ action_type: '', resource_type: '', search: '' }); setPage(1); }}
                  className="text-[#8a9aa8] hover:text-white"
                >
                  Clear Filters
                </Button>
              )}
              <div className="ml-auto text-sm text-[#4a6070]">
                {total} total event{total !== 1 ? 's' : ''}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Logs Table */}
        <Card className="bg-[#050a0e]/60 border-[rgba(201,162,39,0.12)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-tropic-gold flex items-center gap-2">
              <ScrollText className="w-5 h-5" />
              Activity Log
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12 text-[#8a9aa8]">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                Loading audit logs...
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-12 text-[#4a6070]">
                <ScrollText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No audit logs found</p>
                <p className="text-xs mt-1">Admin actions will appear here as they occur</p>
              </div>
            ) : (
              <div className="space-y-1">
                {logs.map((log, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-4 px-4 py-3 rounded-lg hover:bg-white/[0.02] transition-colors border border-transparent hover:border-[rgba(201,162,39,0.06)]"
                  >
                    {/* Timestamp */}
                    <div className="flex-shrink-0 w-40 text-xs text-[#4a6070] font-mono pt-0.5">
                      {formatTimestamp(log.timestamp)}
                    </div>

                    {/* Action Badge */}
                    <div className="flex-shrink-0 w-44">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${getActionBadgeClass(log.action_type)}`}>
                        {ACTION_LABELS[log.action_type] || log.action_type}
                      </span>
                    </div>

                    {/* User */}
                    <div className="flex-shrink-0 w-32 text-sm text-[#8a9aa8] truncate" title={log.username}>
                      {log.username || 'System'}
                    </div>

                    {/* Resource */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-[#8a9aa8]">
                        <span className="text-[#4a6070]">{log.resource_type}</span>
                        {log.resource_id && (
                          <span className="text-[#4a6070] ml-1 font-mono text-xs">
                            {log.resource_id.length > 12 ? `${log.resource_id.slice(0, 12)}…` : log.resource_id}
                          </span>
                        )}
                      </div>
                      {renderMetadata(log)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-[rgba(201,162,39,0.12)]">
                <span className="text-sm text-[#4a6070]">
                  Page {page} of {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8] hover:bg-[#111a24] disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                    className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8] hover:bg-[#111a24] disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default AuditLogsManager;

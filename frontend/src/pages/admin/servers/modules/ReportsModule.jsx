import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  Download,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { API } from '@/utils/api';

function SummaryCard({ label, value, icon: Icon, color, border }) {
  return (
    <Card className={`${border} bg-black/60`}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">{label}</span>
          <Icon className={`h-3.5 w-3.5 ${color}`} />
        </div>
        <div className="mt-1.5 text-xl font-bold text-white" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function ReportsModule() {
  const { serverId } = useOutletContext();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/servers/${serverId}/reports/summary`);
      setReport(res.data);
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const exportReport = useCallback(() => {
    const payload = {
      generated_at: new Date().toISOString(),
      ...report,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `server-report-${serverId}-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [report, serverId]);

  const modIssueCount = useMemo(() => {
    const categories = report?.summary?.mod_issue_categories || {};
    return Object.values(categories).reduce((total, count) => total + count, 0);
  }, [report]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-tropic-gold" />
      </div>
    );
  }

  const detections = report?.detections || [];
  const incidents = report?.incidents || [];
  const backups = report?.backups || [];
  const modIssues = report?.mod_issues || [];
  const summary = report?.summary || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold tracking-wider text-gray-300" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
            REPORTS
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Summary reporting now includes watcher detections, recurring mod issues, incidents, and backup history.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={fetchData} className="h-7 border-zinc-800 text-xs text-gray-400">
            <RefreshCw className="mr-1 h-3 w-3" /> Refresh
          </Button>
          <Button size="sm" onClick={exportReport} className="h-7 bg-tropic-gold text-black hover:bg-tropic-gold-light text-xs">
            <Download className="mr-1 h-3 w-3" /> Export
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard
          label="Detections"
          value={summary.detections?.total || 0}
          icon={ShieldCheck}
          color="text-blue-400"
          border="border-blue-600/20"
        />
        <SummaryCard
          label="Active Alerts"
          value={(summary.detections?.active || 0) + (summary.incidents?.open || 0)}
          icon={AlertTriangle}
          color="text-red-400"
          border="border-red-600/20"
        />
        <SummaryCard
          label="Mod Findings"
          value={modIssueCount}
          icon={Wrench}
          color="text-amber-300"
          border="border-amber-600/20"
        />
        <SummaryCard
          label="Backups"
          value={summary.backups || 0}
          icon={Download}
          color="text-green-400"
          border="border-green-600/20"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-zinc-800 bg-black/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold tracking-wider text-gray-400">RECENT DETECTIONS</CardTitle>
          </CardHeader>
          <CardContent>
            {detections.length === 0 ? (
              <p className="py-4 text-center text-xs text-gray-600">No watcher detections recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {detections.slice(0, 8).map((detection) => (
                  <div key={detection.id} className="rounded-lg border border-zinc-800/70 bg-zinc-950/70 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-gray-200">{detection.title}</span>
                      <Badge variant="outline" className="border-zinc-700 text-[10px] text-gray-400">
                        {detection.source_category}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">{detection.summary}</p>
                    <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-gray-600">
                      <span>Status: {detection.status}</span>
                      <span>Occurrences: {detection.occurrence_count || 0}</span>
                      {detection.last_seen && <span>Last seen: {new Date(detection.last_seen).toLocaleString()}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-black/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold tracking-wider text-gray-400">MOD ISSUE ATTRIBUTION</CardTitle>
          </CardHeader>
          <CardContent>
            {modIssues.length === 0 ? (
              <p className="py-4 text-center text-xs text-gray-600">No mod issues have been attributed to this server yet.</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(summary.mod_issue_categories || {}).map(([category, count]) => (
                  <div key={category} className="flex items-center justify-between rounded border border-zinc-800/70 bg-zinc-950/70 px-3 py-2 text-xs">
                    <span className="text-gray-300">{category.replace(/_/g, ' ')}</span>
                    <Badge variant="outline" className="border-zinc-700 text-gray-400">{count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="border-zinc-800 bg-black/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold tracking-wider text-gray-400">RECENT MOD ISSUES</CardTitle>
          </CardHeader>
          <CardContent>
            {modIssues.length === 0 ? (
              <p className="py-4 text-center text-xs text-gray-600">No mod issues recorded.</p>
            ) : (
              <div className="space-y-2">
                {modIssues.slice(0, 6).map((issue) => (
                  <div key={issue.id} className="rounded border border-zinc-800/70 bg-zinc-950/70 p-3">
                    <div className="text-sm text-gray-200">{issue.mod_name || issue.error_signature || 'Unattributed issue'}</div>
                    <div className="mt-1 text-[11px] text-gray-500">{issue.source_category || issue.issue_type || 'unknown'}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-black/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold tracking-wider text-gray-400">INCIDENTS</CardTitle>
          </CardHeader>
          <CardContent>
            {incidents.length === 0 ? (
              <p className="py-4 text-center text-xs text-gray-600">No incidents recorded.</p>
            ) : (
              <div className="space-y-2">
                {incidents.slice(0, 6).map((incident, index) => (
                  <div key={incident.id || index} className="rounded border border-zinc-800/70 bg-zinc-950/70 p-3">
                    <div className="text-sm text-gray-200">{incident.title}</div>
                    <div className="mt-1 text-[11px] text-gray-500">{incident.status} - {incident.severity}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-black/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold tracking-wider text-gray-400">BACKUPS</CardTitle>
          </CardHeader>
          <CardContent>
            {backups.length === 0 ? (
              <p className="py-4 text-center text-xs text-gray-600">No backups created.</p>
            ) : (
              <div className="space-y-2">
                {backups.slice(0, 6).map((backup, index) => (
                  <div key={backup.id || index} className="rounded border border-zinc-800/70 bg-zinc-950/70 p-3">
                    <div className="text-sm text-gray-200">{backup.backup_type || 'Backup'}</div>
                    <div className="mt-1 text-[11px] text-gray-500">
                      {backup.created_at ? new Date(backup.created_at).toLocaleString() : 'Unknown time'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default ReportsModule;

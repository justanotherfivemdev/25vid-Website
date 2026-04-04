import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Activity,
  AlertTriangle,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  ShieldCheck,
  StickyNote,
  Wrench,
} from 'lucide-react';
import { API } from '@/utils/api';

function humanize(value) {
  if (!value) return 'Unclassified';
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
}

function severityTone(severity) {
  return {
    low: 'border-zinc-700 text-zinc-300',
    medium: 'border-blue-600/30 text-blue-300',
    high: 'border-amber-600/30 text-amber-300',
    critical: 'border-red-600/30 text-red-300',
  }[severity] || 'border-zinc-700 text-zinc-300';
}

function statusTone(status) {
  return {
    active: 'border-red-600/30 text-red-300',
    monitoring: 'border-amber-600/30 text-amber-300',
    resolved: 'border-green-600/30 text-green-300',
    false_positive: 'border-zinc-700 text-zinc-300',
    open: 'border-red-600/30 text-red-300',
    in_progress: 'border-blue-600/30 text-blue-300',
    blocked: 'border-amber-600/30 text-amber-300',
    archived: 'border-zinc-700 text-zinc-300',
  }[status] || 'border-zinc-700 text-zinc-300';
}

function SummaryCard({ label, value, detail, icon: Icon, color, border }) {
  return (
    <Card className={`${border} bg-[#050a0e]/60`}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-[#4a6070]">{label}</span>
          <Icon className={`h-3.5 w-3.5 ${color}`} />
        </div>
        <div className="mt-1.5 text-xl font-bold text-white" style={{ fontFamily: "'Share Tech', sans-serif" }}>
          {value}
        </div>
        {detail ? <div className="mt-1 text-[11px] text-[#4a6070]">{detail}</div> : null}
      </CardContent>
    </Card>
  );
}

function BreakdownCard({ title, items, emptyLabel, accent = 'text-[#8a9aa8]' }) {
  return (
    <Card className="border-zinc-800 bg-[#050a0e]/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold tracking-wider text-[#8a9aa8]">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-4 text-center text-xs text-[#4a6070]">{emptyLabel}</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded border border-zinc-800/70 bg-zinc-950/70 px-3 py-2 text-xs">
                <span className="text-[#8a9aa8]">{item.label}</span>
                <Badge variant="outline" className={`border-zinc-700 ${item.className || accent}`}>
                  {item.value}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReportsModule() {
  const { serverId } = useOutletContext();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  const fetchData = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    setFetchError(null);
    try {
      const res = await axios.get(`${API}/servers/${serverId}/reports/summary`);
      setReport(res.data);
    } catch (err) {
      setFetchError(err.response?.data?.detail || 'Failed to load report.');
      if (!silent) setReport({});
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [serverId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchData(true);
    }, 30_000);
    return () => clearInterval(intervalId);
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

  const summary = report?.summary || {};
  const detections = report?.detections || [];
  const incidents = report?.incidents || [];
  const backups = report?.backups || [];
  const modIssues = report?.mod_issues || [];
  const watchers = report?.watchers || [];
  const notes = report?.notes || [];

  const modIssueCount = useMemo(() => {
    const categories = summary.mod_issue_categories || {};
    return Object.values(categories).reduce((total, count) => total + Number(count || 0), 0);
  }, [summary]);

  const detectionCategoryItems = useMemo(
    () =>
      Object.entries(summary.detection_categories || {})
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .map(([category, count]) => ({ label: humanize(category), value: count })),
    [summary],
  );

  const detectionSeverityItems = useMemo(
    () =>
      Object.entries(summary.detection_severity || {})
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .map(([severity, count]) => ({
          label: humanize(severity),
          value: count,
          className: severityTone(severity),
        })),
    [summary],
  );

  const modIssueItems = useMemo(
    () =>
      Object.entries(summary.mod_issue_categories || {})
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .map(([category, count]) => ({ label: humanize(category), value: count, className: 'text-amber-300' })),
    [summary],
  );

  const noteCategoryItems = useMemo(
    () =>
      Object.entries(summary.notes?.by_category || {})
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .map(([category, count]) => ({ label: humanize(category), value: count })),
    [summary],
  );

  const activeAlerts = (summary.detections?.active || 0) + (summary.incidents?.open || 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-tropic-gold" />
      </div>
    );
  }

  if (fetchError && !report) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <AlertTriangle className="h-5 w-5 text-red-400" />
        <p className="text-xs text-red-400">{fetchError}</p>
        <Button size="sm" variant="outline" onClick={() => fetchData()} className="h-7 border-zinc-800 text-xs text-[#8a9aa8]">
          <RefreshCw className="mr-1 h-3 w-3" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-wider text-[#8a9aa8]" style={{ fontFamily: "'Share Tech', sans-serif" }}>
            REPORTS
          </h2>
          <p className="mt-1 text-xs text-[#4a6070]">
            Live reporting now rolls detections, watcher coverage, notes, incidents, and backups into one triage view.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="border-zinc-800 text-[10px] text-[#8a9aa8]">
            Refreshes every 30s
          </Badge>
          <Button size="sm" variant="outline" onClick={() => fetchData(true)} className="h-7 border-zinc-800 text-xs text-[#8a9aa8]">
            <RefreshCw className={`mr-1 h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button size="sm" onClick={exportReport} disabled={!report || Object.keys(report).length === 0} className="h-7 bg-tropic-gold text-black hover:bg-tropic-gold-light text-xs disabled:opacity-50">
            <Download className="mr-1 h-3 w-3" /> Export
          </Button>
        </div>
      </div>

      {fetchError ? (
        <div className="rounded border border-red-600/30 bg-red-600/10 px-3 py-2 text-xs text-red-400">
          {fetchError}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <SummaryCard
          label="Active Alerts"
          value={activeAlerts}
          detail={`${summary.detections?.active || 0} live detections, ${summary.incidents?.open || 0} open incidents`}
          icon={AlertTriangle}
          color="text-red-400"
          border="border-red-600/20"
        />
        <SummaryCard
          label="Watcher Coverage"
          value={`${summary.watchers?.enabled || 0}/${summary.watchers?.total || 0}`}
          detail={`${summary.watchers?.system_managed || 0} essential watchers installed`}
          icon={ShieldCheck}
          color="text-blue-400"
          border="border-blue-600/20"
        />
        <SummaryCard
          label="Ops Notes"
          value={summary.notes?.open || 0}
          detail={`${summary.notes?.follow_up_required || 0} require follow-up`}
          icon={StickyNote}
          color="text-amber-300"
          border="border-amber-600/20"
        />
        <SummaryCard
          label="Backups"
          value={summary.backups || 0}
          detail={`${backups.length} recent backups in report history`}
          icon={Download}
          color="text-green-400"
          border="border-green-600/20"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <BreakdownCard
          title="DETECTION CATEGORIES"
          items={detectionCategoryItems}
          emptyLabel="No detections have been categorized yet."
          accent="text-blue-300"
        />
        <BreakdownCard
          title="SEVERITY MIX"
          items={detectionSeverityItems}
          emptyLabel="No detection severity data yet."
        />
        <BreakdownCard
          title="MOD ISSUE ATTRIBUTION"
          items={modIssueItems}
          emptyLabel="No mod issues have been attributed to this server yet."
          accent="text-amber-300"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-zinc-800 bg-[#050a0e]/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold tracking-wider text-[#8a9aa8]">WATCHER COVERAGE</CardTitle>
          </CardHeader>
          <CardContent>
            {watchers.length === 0 ? (
              <p className="py-4 text-center text-xs text-[#4a6070]">No watcher coverage installed yet.</p>
            ) : (
              <div className="space-y-2">
                {watchers.slice(0, 8).map((watcher) => (
                  <div key={watcher.id} className="rounded-lg border border-zinc-800/70 bg-zinc-950/70 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-[#d0d8e0]">{watcher.name}</span>
                      <Badge variant="outline" className={`text-[10px] ${severityTone(watcher.severity)}`}>
                        {humanize(watcher.severity)}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] ${watcher.enabled === false ? 'border-zinc-700 text-zinc-400' : 'border-green-600/30 text-green-300'}`}>
                        {watcher.enabled === false ? 'Disabled' : 'Enabled'}
                      </Badge>
                      {watcher.system_managed ? (
                        <Badge variant="outline" className="border-tropic-gold/30 text-[10px] text-tropic-gold">
                          Essential
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-[#4a6070]">
                      {watcher.description || humanize(watcher.source_category)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-[#4a6070]">
                      <span>Type: {humanize(watcher.type)}</span>
                      <span>Triggers: {watcher.trigger_count || 0}</span>
                      {watcher.last_triggered_at ? <span>Last triggered: {formatDate(watcher.last_triggered_at)}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-[#050a0e]/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold tracking-wider text-[#8a9aa8]">OPS NOTE QUEUE</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded border border-zinc-800/70 bg-zinc-950/70 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#4a6070]">Total</div>
                <div className="mt-1 text-lg font-semibold text-white">{summary.notes?.total || 0}</div>
              </div>
              <div className="rounded border border-zinc-800/70 bg-zinc-950/70 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#4a6070]">Open</div>
                <div className="mt-1 text-lg font-semibold text-white">{summary.notes?.open || 0}</div>
              </div>
              <div className="rounded border border-zinc-800/70 bg-zinc-950/70 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#4a6070]">Follow-Up</div>
                <div className="mt-1 text-lg font-semibold text-white">{summary.notes?.follow_up_required || 0}</div>
              </div>
            </div>

            <BreakdownCard
              title="NOTE CATEGORIES"
              items={noteCategoryItems}
              emptyLabel="No categorized notes yet."
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="border-zinc-800 bg-[#050a0e]/60 xl:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold tracking-wider text-[#8a9aa8]">RECENT DETECTIONS</CardTitle>
          </CardHeader>
          <CardContent>
            {detections.length === 0 ? (
              <p className="py-4 text-center text-xs text-[#4a6070]">No watcher detections recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {detections.slice(0, 6).map((detection) => (
                  <div key={detection.id} className="rounded-lg border border-zinc-800/70 bg-zinc-950/70 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-[#d0d8e0]">{detection.title}</span>
                      <Badge variant="outline" className={`text-[10px] ${statusTone(detection.status)}`}>
                        {humanize(detection.status)}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] ${severityTone(detection.severity)}`}>
                        {humanize(detection.severity)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-[#4a6070]">{detection.summary || 'No summary provided.'}</p>
                    <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-[#4a6070]">
                      <span>Category: {humanize(detection.source_category)}</span>
                      <span>Occurrences: {detection.occurrence_count || 0}</span>
                      {detection.last_seen ? <span>Last seen: {formatDate(detection.last_seen)}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-[#050a0e]/60 xl:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold tracking-wider text-[#8a9aa8]">RECENT NOTES</CardTitle>
          </CardHeader>
          <CardContent>
            {notes.length === 0 ? (
              <p className="py-4 text-center text-xs text-[#4a6070]">No operational notes recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {notes.slice(0, 6).map((note) => (
                  <div key={note.id} className="rounded-lg border border-zinc-800/70 bg-zinc-950/70 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-[#d0d8e0]">{note.title || humanize(note.category)}</span>
                      <Badge variant="outline" className={`text-[10px] ${statusTone(note.status)}`}>
                        {humanize(note.status)}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] ${severityTone(note.priority)}`}>
                        {humanize(note.priority)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-[#4a6070] line-clamp-3">{note.content}</p>
                    <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-[#4a6070]">
                      <span>Category: {humanize(note.category)}</span>
                      <span>Author: {note.author_name || note.author_id || 'Unknown'}</span>
                      {note.created_at ? <span>Created: {formatDate(note.created_at)}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-[#050a0e]/60 xl:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold tracking-wider text-[#8a9aa8]">INCIDENTS AND BACKUPS</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#4a6070]">
                <Activity className="h-3.5 w-3.5 text-red-400" /> Incidents
              </div>
              {incidents.length === 0 ? (
                <p className="pb-2 text-xs text-[#4a6070]">No incidents recorded.</p>
              ) : (
                <div className="space-y-2">
                  {incidents.slice(0, 3).map((incident, index) => (
                    <div key={incident.id || index} className="rounded border border-zinc-800/70 bg-zinc-950/70 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-[#d0d8e0]">{incident.title || 'Incident'}</span>
                        <Badge variant="outline" className={`text-[10px] ${statusTone(incident.status)}`}>
                          {humanize(incident.status)}
                        </Badge>
                      </div>
                      <div className="mt-1 text-[11px] text-[#4a6070]">
                        Severity: {humanize(incident.severity)}{incident.detected_at ? ` | ${formatDate(incident.detected_at)}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#4a6070]">
                <FileText className="h-3.5 w-3.5 text-green-400" /> Backups
              </div>
              {backups.length === 0 ? (
                <p className="text-xs text-[#4a6070]">No backups created.</p>
              ) : (
                <div className="space-y-2">
                  {backups.slice(0, 3).map((backup, index) => (
                    <div key={backup.id || index} className="rounded border border-zinc-800/70 bg-zinc-950/70 p-3">
                      <div className="text-sm text-[#d0d8e0]">{backup.backup_type || 'Backup'}</div>
                      <div className="mt-1 text-[11px] text-[#4a6070]">
                        {backup.created_at ? formatDate(backup.created_at) : 'Unknown time'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {modIssues.length > 0 ? (
        <Card className="border-zinc-800 bg-[#050a0e]/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold tracking-wider text-[#8a9aa8]">RECENT MOD FINDINGS</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 xl:grid-cols-3">
              {modIssues.slice(0, 6).map((issue) => (
                <div key={issue.id} className="rounded border border-zinc-800/70 bg-zinc-950/70 p-3">
                  <div className="flex items-start gap-2">
                    <Wrench className="mt-0.5 h-4 w-4 text-amber-300" />
                    <div>
                      <div className="text-sm text-[#d0d8e0]">{issue.mod_name || issue.error_signature || 'Unattributed issue'}</div>
                      <div className="mt-1 text-[11px] text-[#4a6070]">
                        {humanize(issue.source_category || issue.issue_type || 'unknown')}
                      </div>
                      {issue.last_seen ? (
                        <div className="mt-2 text-[11px] text-[#4a6070]">Last seen: {formatDate(issue.last_seen)}</div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {modIssueCount > modIssues.length ? (
              <div className="mt-3 text-xs text-[#4a6070]">
                Showing {modIssues.length} of {modIssueCount} attributed findings in the current report window.
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export default ReportsModule;

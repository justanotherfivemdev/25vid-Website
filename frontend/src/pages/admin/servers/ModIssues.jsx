import React, { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  CheckCircle2,
  Clock,
  Eye,
  RefreshCw,
  Search,
  Server,
  TrendingUp,
} from 'lucide-react';
import { API } from '@/utils/api';

const VERDICT_OPTIONS = ['active', 'monitoring', 'resolved', 'false_positive'];

function confidenceColor(score) {
  if (score >= 0.8) return 'bg-red-600 text-white';
  if (score >= 0.5) return 'bg-yellow-600 text-black';
  return 'bg-gray-600 text-white';
}

function severityColor(severity) {
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
    false_positive: 'bg-gray-800 text-gray-400 border-gray-700',
  };
  return map[status] || 'bg-gray-800 text-gray-400 border-gray-700';
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

function ModIssues() {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [resolutionNotes, setResolutionNotes] = useState('');

  const fetchIssues = useCallback(async () => {
    setLoading(true);
    try {
      setError('');
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const res = await axios.get(`${API}/servers/mod-issues${params}`);
      setIssues(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load mod issues.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  const updateIssueStatus = useCallback(async (issueId, status, notes = '') => {
    try {
      await axios.post(`${API}/servers/mod-issues/${issueId}/resolve`, {
        status,
        resolution_notes: notes,
      });
      if (selectedIssue?.id === issueId) {
        setSelectedIssue((current) => current ? { ...current, status, resolution_notes: notes } : current);
      }
      await fetchIssues();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update issue verdict.');
    }
  }, [fetchIssues, selectedIssue?.id]);

  const filteredIssues = useMemo(() => issues.filter((issue) => {
    if (!search) return true;
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
    return haystack.includes(search.toLowerCase());
  }), [issues, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-[0.15em] text-tropic-gold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
            MOD ISSUES
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Structured issue analysis across engine, config, workshop, runtime, BattlEye/RCON, network, and performance sources.
          </p>
        </div>
        <Button onClick={fetchIssues} variant="outline" size="sm" className="border-gray-700 text-gray-400 hover:text-white">
          <RefreshCw className="mr-1 h-4 w-4" /> Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded border border-red-700/50 bg-red-900/30 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by mod, category, stream, summary, or signature..."
            className="border-gray-700 bg-gray-900 pl-10 text-white"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="monitoring">Monitoring</option>
          <option value="resolved">Resolved</option>
          <option value="false_positive">False Positive</option>
        </select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-28 animate-pulse rounded-lg bg-gray-900/50" />
          ))}
        </div>
      ) : filteredIssues.length === 0 ? (
        <Card className="border-gray-800 bg-gray-900/50">
          <CardContent className="flex flex-col items-center justify-center py-16 text-gray-500">
            <CheckCircle2 className="mb-4 h-12 w-12 opacity-30" />
            <p className="text-lg font-medium">No mod issues detected</p>
            <p className="mt-1 text-sm">
              The analyzer will populate this page as merged console, profile, backend, and runtime evidence is classified.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredIssues.map((issue) => (
            <Card key={issue.id} className={`border ${severityColor(issue.severity)}`}>
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
                        <Badge variant="outline" className="border-zinc-700 text-xs text-gray-300">
                          {issue.issue_type}
                        </Badge>
                      )}
                    </div>

                    <p className="mt-2 text-sm text-gray-200">
                      {issue.impact_summary || issue.error_pattern || issue.error_signature || 'No interpreted summary available.'}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-400">
                      <span>{issue.occurrence_count || 0} occurrences</span>
                      <span>{(issue.affected_servers || []).length} servers affected</span>
                      {(issue.source_streams || []).length > 0 && <span>Streams: {(issue.source_streams || []).join(', ')}</span>}
                      {issue.last_seen && <span>Last seen: {new Date(issue.last_seen).toLocaleString()}</span>}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={() => setSelectedIssue(issue)} variant="outline" size="sm" className="border-gray-700 text-gray-400 hover:text-white">
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
                      className={`h-7 text-[11px] ${issue.status === status ? 'border-tropic-gold/40 text-tropic-gold' : 'border-zinc-700 text-gray-400'}`}
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

      <Dialog open={!!selectedIssue} onOpenChange={() => setSelectedIssue(null)}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto border-gray-800 bg-gray-950 text-white">
          {selectedIssue && (
            <>
              <DialogHeader>
                <DialogTitle className="text-tropic-gold">
                  {(selectedIssue.mod_name || 'Unattributed issue')} - Details
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div><span className="text-gray-500">Mod ID:</span> <span className="font-mono text-gray-300">{selectedIssue.mod_id || 'unattributed'}</span></div>
                  <div><span className="text-gray-500">Status:</span> <Badge variant="outline" className="ml-1 text-xs">{selectedIssue.status}</Badge></div>
                  <div><span className="text-gray-500">Severity:</span> <span className="text-gray-300">{selectedIssue.severity || 'unknown'}</span></div>
                  <div><span className="text-gray-500">Method:</span> <span className="text-gray-300">{selectedIssue.attribution_method || 'unknown'}</span></div>
                  <div><span className="text-gray-500">Source category:</span> <span className="text-gray-300">{selectedIssue.source_category || 'unknown'}</span></div>
                  <div><span className="text-gray-500">Issue type:</span> <span className="text-gray-300">{selectedIssue.issue_type || 'unknown'}</span></div>
                  <div><span className="text-gray-500">Confidence:</span> <Badge className={`ml-1 text-xs ${confidenceColor(selectedIssue.confidence_score || 0)}`}>{Math.round((selectedIssue.confidence_score || 0) * 100)}%</Badge></div>
                  <div><span className="text-gray-500">Occurrences:</span> <span className="text-gray-300">{selectedIssue.occurrence_count || 0}</span></div>
                </div>

                {(selectedIssue.source_streams || []).length > 0 && (
                  <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
                    <p className="mb-2 text-xs text-gray-500">Source Streams</p>
                    <div className="flex flex-wrap gap-2">
                      {(selectedIssue.source_streams || []).map((stream) => (
                        <Badge key={stream} variant="outline" className="border-zinc-700 text-gray-300">
                          {stream}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
                  <p className="mb-2 text-xs text-gray-500">Impact Summary</p>
                  <p className="text-sm text-gray-200">
                    {selectedIssue.impact_summary || 'No interpreted impact summary is available for this issue yet.'}
                  </p>
                </div>

                <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
                  <p className="mb-2 flex items-center gap-1 text-xs text-gray-500">
                    <Clock className="h-3 w-3" /> Timeline
                  </p>
                  <div className="flex flex-wrap gap-4 text-xs text-gray-300">
                    {selectedIssue.first_seen && (
                      <div>
                        <span className="text-gray-500">First seen: </span>
                        <span>{new Date(selectedIssue.first_seen).toLocaleString()}</span>
                      </div>
                    )}
                    {selectedIssue.last_seen && (
                      <div>
                        <span className="text-gray-500">Last seen: </span>
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
                  <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
                    <p className="mb-2 flex items-center gap-1 text-xs text-gray-500">
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
                    <p className="mb-1 text-sm text-gray-500">Error Pattern</p>
                    <pre className="overflow-x-auto rounded bg-gray-900 p-3 text-xs text-gray-300">{selectedIssue.error_pattern}</pre>
                  </div>
                )}

                {(selectedIssue.recommended_actions || []).length > 0 && (
                  <div>
                    <p className="mb-1 text-sm text-gray-500">Recommended Actions</p>
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
                    <p className="mb-1 text-sm text-gray-500">Evidence ({selectedIssue.evidence.length})</p>
                    <div className="max-h-48 space-y-2 overflow-y-auto">
                      {selectedIssue.evidence.slice(0, 8).map((evidence, index) => (
                        <pre key={index} className="rounded bg-gray-900 p-2 text-xs text-gray-400">
                          {evidence.log_excerpt || JSON.stringify(evidence, null, 2)}
                        </pre>
                      ))}
                    </div>
                  </div>
                )}

                <div className="border-t border-gray-800 pt-4">
                  <p className="mb-2 text-sm text-gray-400">Operator verdict</p>
                  <div className="flex flex-wrap gap-2">
                    {VERDICT_OPTIONS.map((status) => (
                      <Button
                        key={status}
                        size="sm"
                        variant="outline"
                        onClick={() => updateIssueStatus(selectedIssue.id, status, resolutionNotes)}
                        className={`text-xs ${selectedIssue.status === status ? 'border-tropic-gold/40 text-tropic-gold' : 'border-zinc-700 text-gray-400'}`}
                      >
                        {status.replace(/_/g, ' ')}
                      </Button>
                    ))}
                  </div>
                  <Textarea
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    className="mt-3 border-gray-700 bg-gray-900 text-white"
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

export default ModIssues;

import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, Eye, RefreshCw, Search, Server, Clock, TrendingUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { API } from '@/utils/api';

const confidenceColor = (score) => {
  if (score >= 0.8) return 'bg-red-600 text-white';
  if (score >= 0.5) return 'bg-yellow-600 text-black';
  return 'bg-gray-600 text-white';
};

const statusColor = (status) => {
  const map = { active: 'bg-red-900/40 text-red-300 border-red-700/50', monitoring: 'bg-yellow-900/40 text-yellow-300 border-yellow-700/50', resolved: 'bg-green-900/40 text-green-300 border-green-700/50', false_positive: 'bg-gray-800 text-gray-400 border-gray-700' };
  return map[status] || 'bg-gray-800 text-gray-400 border-gray-700';
};

const ModIssues = () => {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [resolveNotes, setResolveNotes] = useState('');

  const fetchIssues = useCallback(async () => {
    try {
      setError('');
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const res = await axios.get(`${API}/servers/mod-issues${params}`);
      setIssues(res.data);
    } catch (err) {
      setError('Failed to load mod issues');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchIssues(); }, [fetchIssues]);

  const handleResolve = async (issueId) => {
    try {
      await axios.post(`${API}/servers/mod-issues/${issueId}/resolve`, { resolution_notes: resolveNotes });
      setSelectedIssue(null);
      setResolveNotes('');
      fetchIssues();
    } catch (err) {
      setError('Failed to resolve issue');
    }
  };

  const filtered = issues.filter(i =>
    !search || i.mod_name?.toLowerCase().includes(search.toLowerCase()) || i.error_pattern?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-[0.15em] text-tropic-gold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
            MOD ISSUES
          </h1>
          <p className="text-sm text-gray-500 mt-1">Detected mod errors and attribution across all servers</p>
        </div>
        <Button onClick={fetchIssues} variant="outline" size="sm" className="border-gray-700 text-gray-400 hover:text-white">
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      {error && <div className="bg-red-900/30 border border-red-700/50 text-red-300 px-4 py-2 rounded text-sm">{error}</div>}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by mod name or error pattern..." className="pl-10 bg-gray-900 border-gray-700 text-white" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-gray-900 border border-gray-700 text-white rounded-md px-3 py-2 text-sm">
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="monitoring">Monitoring</option>
          <option value="resolved">Resolved</option>
          <option value="false_positive">False Positive</option>
        </select>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-900/50 rounded-lg animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="bg-gray-900/50 border-gray-800">
          <CardContent className="flex flex-col items-center justify-center py-16 text-gray-500">
            <CheckCircle2 className="w-12 h-12 mb-4 opacity-30" />
            <p className="text-lg font-medium">No mod issues detected</p>
            <p className="text-sm mt-1">The mod issue engine will populate issues as they are detected in server logs</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(issue => (
            <Card key={issue.id} className={`border ${statusColor(issue.status)} transition-colors`}>
              <CardContent className="py-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <AlertTriangle className="w-5 h-5 shrink-0 text-current" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-white">{issue.mod_name}</span>
                        <Badge className={`text-xs ${confidenceColor(issue.confidence_score)}`}>
                          {Math.round(issue.confidence_score * 100)}% confidence
                        </Badge>
                        <Badge variant="outline" className="text-xs border-gray-600 text-gray-400">{issue.status}</Badge>
                      </div>
                      <p className="text-sm text-gray-400 mt-1 truncate">{issue.error_pattern || issue.error_signature || 'No error pattern recorded'}</p>
                      <div className="flex gap-4 mt-1 text-xs text-gray-500">
                        <span>{issue.occurrence_count} occurrences</span>
                        <span>{(issue.affected_servers || []).length} servers affected</span>
                        {issue.last_seen && <span>Last seen: {new Date(issue.last_seen).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button onClick={() => setSelectedIssue(issue)} variant="outline" size="sm" className="border-gray-700 text-gray-400 hover:text-white">
                      <Eye className="w-3 h-3 mr-1" /> Details
                    </Button>
                    {issue.status === 'active' && (
                      <Button onClick={() => { setSelectedIssue(issue); setResolveNotes(''); }} variant="outline" size="sm" className="border-green-800/50 text-green-400 hover:text-green-300">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Resolve
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selectedIssue} onOpenChange={() => setSelectedIssue(null)}>
        <DialogContent className="bg-gray-950 border-gray-800 text-white max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedIssue && (
            <>
              <DialogHeader>
                <DialogTitle className="text-tropic-gold">{selectedIssue.mod_name} — Issue Details</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-gray-500">Mod ID:</span> <span className="font-mono text-gray-300">{selectedIssue.mod_id}</span></div>
                  <div><span className="text-gray-500">Status:</span> <Badge variant="outline" className="text-xs ml-1">{selectedIssue.status}</Badge></div>
                  <div><span className="text-gray-500">Confidence:</span> <Badge className={`text-xs ml-1 ${confidenceColor(selectedIssue.confidence_score)}`}>{Math.round(selectedIssue.confidence_score * 100)}%</Badge></div>
                  <div><span className="text-gray-500">Method:</span> <span className="text-gray-300">{selectedIssue.attribution_method}</span></div>
                  <div><span className="text-gray-500">Occurrences:</span> <span className="text-gray-300">{selectedIssue.occurrence_count}</span></div>
                  <div><span className="text-gray-500">Servers:</span> <span className="text-gray-300">{(selectedIssue.affected_servers || []).length}</span></div>
                </div>

                {/* Timeline */}
                <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
                  <p className="text-xs text-gray-500 mb-2 flex items-center gap-1"><Clock className="h-3 w-3" /> Timeline</p>
                  <div className="flex items-center gap-4 text-xs">
                    {selectedIssue.first_seen && (
                      <div>
                        <span className="text-gray-500">First seen: </span>
                        <span className="text-gray-300">{new Date(selectedIssue.first_seen).toLocaleString()}</span>
                      </div>
                    )}
                    {selectedIssue.last_seen && (
                      <div>
                        <span className="text-gray-500">Last seen: </span>
                        <span className="text-gray-300">{new Date(selectedIssue.last_seen).toLocaleString()}</span>
                      </div>
                    )}
                    {selectedIssue.occurrence_count > 1 && selectedIssue.first_seen && selectedIssue.last_seen && (
                      <div className="flex items-center gap-1 text-amber-400">
                        <TrendingUp className="h-3 w-3" />
                        <span>{selectedIssue.occurrence_count} occurrences</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cross-server correlation */}
                {(selectedIssue.affected_servers || []).length > 0 && (
                  <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
                    <p className="text-xs text-gray-500 mb-2 flex items-center gap-1"><Server className="h-3 w-3" /> Affected Servers</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedIssue.affected_servers.map((srv, i) => (
                        <Badge key={i} variant="outline" className="text-xs border-red-600/30 text-red-400">
                          <Server className="h-2.5 w-2.5 mr-1" />
                          {srv.server_name || srv.server_id || `Server ${i + 1}`}
                        </Badge>
                      ))}
                    </div>
                    {selectedIssue.affected_servers.length > 1 && (
                      <p className="text-xs text-amber-400 mt-2">
                        ⚠ This mod caused issues on {selectedIssue.affected_servers.length} servers — consider disabling it globally
                      </p>
                    )}
                  </div>
                )}

                {selectedIssue.error_pattern && (
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Error Pattern</p>
                    <pre className="bg-gray-900 rounded p-3 text-xs text-gray-300 overflow-x-auto">{selectedIssue.error_pattern}</pre>
                  </div>
                )}
                {(selectedIssue.recommended_actions || []).length > 0 && (
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Recommended Actions</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedIssue.recommended_actions.map((action, i) => (
                        <Badge key={i} variant="outline" className="text-xs border-tropic-gold/30 text-tropic-gold">{action.replace(/_/g, ' ')}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {(selectedIssue.evidence || []).length > 0 && (
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Evidence ({selectedIssue.evidence.length} entries)</p>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {selectedIssue.evidence.slice(0, 5).map((ev, i) => (
                        <pre key={i} className="bg-gray-900 rounded p-2 text-xs text-gray-400">{ev.log_excerpt || JSON.stringify(ev)}</pre>
                      ))}
                    </div>
                  </div>
                )}
                {selectedIssue.status === 'active' && (
                  <div className="border-t border-gray-800 pt-4">
                    <p className="text-sm text-gray-400 mb-2">Resolve this issue</p>
                    <Textarea value={resolveNotes} onChange={e => setResolveNotes(e.target.value)} className="bg-gray-900 border-gray-700 text-white" rows={3} placeholder="Resolution notes..." />
                    <Button onClick={() => handleResolve(selectedIssue.id)} className="mt-2 bg-green-700 text-white hover:bg-green-600" size="sm">
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Mark Resolved
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ModIssues;

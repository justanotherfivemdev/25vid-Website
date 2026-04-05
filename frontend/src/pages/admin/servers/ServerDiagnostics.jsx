import React, { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertTriangle,
  Bell,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Eye,
  Monitor,
  Package,
  RefreshCw,
  Search,
  Server,
  Sparkles,
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

function attributionTone(type) {
  const map = {
    mod: 'border-purple-600/30 text-purple-300',
    backend: 'border-red-600/30 text-red-300',
    base_game: 'border-blue-600/30 text-blue-300',
    engine: 'border-sky-600/30 text-sky-300',
    rcon: 'border-orange-600/30 text-orange-300',
    battleye: 'border-orange-600/30 text-orange-300',
    config: 'border-amber-600/30 text-amber-300',
    network: 'border-cyan-600/30 text-cyan-300',
    performance: 'border-rose-600/30 text-rose-300',
    unknown: 'border-zinc-700 text-zinc-300',
  };
  return map[type] || 'border-zinc-700 text-zinc-300';
}

function actionabilityTone(actionability) {
  const map = {
    actionable: 'border-red-600/30 text-red-300',
    monitor: 'border-yellow-600/30 text-yellow-300',
    known_safe: 'border-zinc-700 text-zinc-300',
  };
  return map[actionability] || 'border-zinc-700 text-zinc-300';
}

function areaTone(area) {
  const map = {
    'live-errors': 'border-red-600/30 text-red-300',
    'error-patterns': 'border-blue-600/30 text-blue-300',
    'mod-analysis': 'border-purple-600/30 text-purple-300',
    alerts: 'border-orange-600/30 text-orange-300',
    'troublesome-mods': 'border-rose-600/30 text-rose-300',
  };
  return map[area] || 'border-zinc-700 text-zinc-300';
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

function humanizeToken(value) {
  if (!value) return 'Unknown';
  return String(value)
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const VERDICT_OPTIONS = ['active', 'monitoring', 'resolved', 'false_positive'];
const ACTIONABILITY_OPTIONS = ['actionable', 'monitor', 'known_safe'];
const ATTRIBUTION_OPTIONS = ['unknown', 'mod', 'backend', 'base_game', 'engine', 'rcon', 'battleye', 'config', 'network', 'performance'];
const AREA_OPTIONS = ['live-errors', 'error-patterns', 'mod-analysis', 'alerts', 'troublesome-mods'];

const TABS = [
  { id: 'live-errors', label: 'Live Errors', icon: AlertTriangle },
  { id: 'error-patterns', label: 'Error Patterns', icon: Monitor },
  { id: 'mod-analysis', label: 'Mod Analysis', icon: Package },
  { id: 'troublesome-mods', label: 'Troublesome Mods', icon: TrendingUp },
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
  const [knownMods, setKnownMods] = useState([]);
  const [troublesomeMods, setTroublesomeMods] = useState([]);

  /* ── state: mod issues data ────────────────────────────────────── */
  const [modIssues, setModIssues] = useState([]);

  /* ── state: UI ─────────────────────────────────────────────────── */
  const [loading, setLoading] = useState(true);
  const [modLoading, setModLoading] = useState(true);
  const [troublesomeLoading, setTroublesomeLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('live-errors');

  /* ── state: occurrence filters ─────────────────────────────────── */
  const [serverFilter, setServerFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [reviewStatusFilter, setReviewStatusFilter] = useState('');
  const [attributionFilter, setAttributionFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [actionabilityFilter, setActionabilityFilter] = useState('');
  const [troublesomeOnly, setTroublesomeOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  /* ── state: mod analysis filters ───────────────────────────────── */
  const [modSearch, setModSearch] = useState('');
  const [modStatusFilter, setModStatusFilter] = useState('');
  const [patternSearch, setPatternSearch] = useState('');

  /* ── state: error type detail dialog ───────────────────────────── */
  const [selectedErrorType, setSelectedErrorType] = useState(null);
  const [typeOccurrences, setTypeOccurrences] = useState([]);
  const [typeOccLoading, setTypeOccLoading] = useState(false);
  const [typeSaving, setTypeSaving] = useState(false);
  const [typeReviewStatus, setTypeReviewStatus] = useState('active');
  const [typeAttribution, setTypeAttribution] = useState('unknown');
  const [typeArea, setTypeArea] = useState('error-patterns');
  const [typeActionability, setTypeActionability] = useState('monitor');
  const [typeLinkedModGuid, setTypeLinkedModGuid] = useState('');
  const [typeLinkedModName, setTypeLinkedModName] = useState('');
  const [typeTroublesome, setTypeTroublesome] = useState(false);
  const [typeNotes, setTypeNotes] = useState('');

  /* ── state: AI analysis ────────────────────────────────────────── */
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [showRawMessage, setShowRawMessage] = useState(false);
  const [showOccurrences, setShowOccurrences] = useState(false);

  /* ── state: mod issue detail dialog ────────────────────────────── */
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [issueArea, setIssueArea] = useState('mod-analysis');
  const [issueAttribution, setIssueAttribution] = useState('mod');
  const [issueTroublesome, setIssueTroublesome] = useState(false);
  const [issueTroublesomeReason, setIssueTroublesomeReason] = useState('');

  /* ── data fetching ─────────────────────────────────────────────── */

  const fetchServers = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/log-monitor/servers`);
      setServers(Array.isArray(res.data) ? res.data : []);
    } catch { /* ignore */ }
  }, []);

  const fetchKnownMods = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/log-monitor/mods`);
      setKnownMods(Array.isArray(res.data) ? res.data : []);
    } catch { /* ignore */ }
  }, []);

  const fetchTroublesomeMods = useCallback(async () => {
    setTroublesomeLoading(true);
    try {
      const res = await axios.get(`${API}/diagnostics/troublesome-mods`);
      setTroublesomeMods(Array.isArray(res.data) ? res.data : []);
    } catch {
      setTroublesomeMods([]);
    } finally {
      setTroublesomeLoading(false);
    }
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
      if (reviewStatusFilter) params.set('review_status', reviewStatusFilter);
      if (attributionFilter) params.set('attribution_type', attributionFilter);
      if (areaFilter) params.set('designated_area', areaFilter);
      if (actionabilityFilter) params.set('actionability', actionabilityFilter);
      if (troublesomeOnly) params.set('troublesome', 'true');
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
  }, [serverFilter, searchQuery, severityFilter, categoryFilter, reviewStatusFilter, attributionFilter, areaFilter, actionabilityFilter, troublesomeOnly, dateFrom, dateTo, page]);

  const fetchErrorTypes = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (patternSearch) params.set('q', patternSearch);
      if (severityFilter) params.set('severity', severityFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      if (reviewStatusFilter) params.set('review_status', reviewStatusFilter);
      if (attributionFilter) params.set('attribution_type', attributionFilter);
      if (areaFilter) params.set('designated_area', areaFilter);
      if (actionabilityFilter) params.set('actionability', actionabilityFilter);
      if (troublesomeOnly) params.set('troublesome', 'true');
      const query = params.toString();
      const res = await axios.get(`${API}/log-monitor/error-types${query ? `?${query}` : ''}`);
      setErrorTypes(Array.isArray(res.data) ? res.data : []);
    } catch { /* ignore */ }
  }, [patternSearch, severityFilter, categoryFilter, reviewStatusFilter, attributionFilter, areaFilter, actionabilityFilter, troublesomeOnly]);

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
      const params = new URLSearchParams();
      if (modStatusFilter) params.set('status', modStatusFilter);
      if (troublesomeOnly) params.set('troublesome', 'true');
      if (areaFilter) params.set('area', areaFilter);
      const query = params.toString();
      const res = await axios.get(`${API}/servers/mod-issues${query ? `?${query}` : ''}`);
      setModIssues(Array.isArray(res.data) ? res.data : []);
    } catch { /* ignore */ }
    finally { setModLoading(false); }
  }, [modStatusFilter, troublesomeOnly, areaFilter]);

  const fetchAll = useCallback(() => {
    fetchServers();
    fetchKnownMods();
    fetchOccurrences();
    fetchErrorTypes();
    fetchAlerts();
    fetchStats();
    fetchModIssues();
    fetchTroublesomeMods();
  }, [fetchServers, fetchKnownMods, fetchOccurrences, fetchErrorTypes, fetchAlerts, fetchStats, fetchModIssues, fetchTroublesomeMods]);

  useEffect(() => { fetchServers(); fetchKnownMods(); fetchAlerts(); }, [fetchServers, fetchKnownMods, fetchAlerts]);
  useEffect(() => { fetchOccurrences(); }, [fetchOccurrences]);
  useEffect(() => { fetchErrorTypes(); }, [fetchErrorTypes]);
  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchModIssues(); }, [fetchModIssues]);
  useEffect(() => { fetchTroublesomeMods(); }, [fetchTroublesomeMods]);

  /* ── error type detail ─────────────────────────────────────────── */

  const openErrorTypeDetail = useCallback(async (et) => {
    setSelectedErrorType(et);
    setAiAnalysis(null);
    setAiError('');
    setShowRawMessage(false);
    setShowOccurrences(false);
    setTypeOccLoading(true);
    try {
      const res = await axios.get(`${API}/log-monitor/errors?type=${et.id}&per_page=20`);
      setTypeOccurrences(res.data.items || []);
    } catch { setTypeOccurrences([]); }
    finally { setTypeOccLoading(false); }
  }, []);

  const runAiAnalysis = useCallback(async () => {
    if (!selectedErrorType?.id) return;
    setAiLoading(true);
    setAiError('');
    try {
      const res = await axios.post(`${API}/diagnostics/ai-analyze`, {
        error_type_id: selectedErrorType.id,
      });
      setAiAnalysis(res.data.analysis || null);
    } catch (err) {
      setAiError(err.response?.data?.detail || 'AI analysis failed. Please try again.');
    } finally {
      setAiLoading(false);
    }
  }, [selectedErrorType?.id]);

  useEffect(() => {
    if (!selectedErrorType) return;
    setTypeReviewStatus(selectedErrorType.review_status || 'active');
    setTypeAttribution(selectedErrorType.attribution_type || 'unknown');
    setTypeArea(selectedErrorType.designated_area || 'error-patterns');
    setTypeActionability(selectedErrorType.actionability || 'monitor');
    setTypeLinkedModGuid(selectedErrorType.linked_mod_guid || '');
    setTypeLinkedModName(selectedErrorType.linked_mod_name || '');
    setTypeTroublesome(Boolean(selectedErrorType.troublesome));
    setTypeNotes(selectedErrorType.curation_notes || '');
  }, [selectedErrorType]);

  /* ── alert resolve ─────────────────────────────────────────────── */

  const resolveAlert = useCallback(async (alertId) => {
    try {
      await axios.patch(`${API}/log-monitor/alerts/${alertId}`);
      fetchAlerts();
    } catch { /* ignore */ }
  }, [fetchAlerts]);

  /* ── mod issue verdict ─────────────────────────────────────────── */

  const updateIssueStatus = useCallback(async (issueId, status, notes = '', extra = {}) => {
    try {
      await axios.post(`${API}/servers/mod-issues/${issueId}/resolve`, {
        status,
        resolution_notes: notes,
        ...extra,
      });
      if (selectedIssue?.id === issueId) {
        setSelectedIssue((current) => current ? { ...current, status, resolution_notes: notes, ...extra } : current);
      }
      await fetchModIssues();
      await fetchTroublesomeMods();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update issue verdict.');
    }
  }, [fetchModIssues, fetchTroublesomeMods, selectedIssue?.id]);

  const saveIssueCuration = useCallback(async () => {
    if (!selectedIssue?.id) return;
    await updateIssueStatus(selectedIssue.id, selectedIssue.status || 'active', resolutionNotes, {
      designated_area: issueArea,
      attribution_type: issueAttribution,
      troublesome: issueTroublesome,
      troublesome_reason: issueTroublesomeReason,
    });
  }, [selectedIssue, resolutionNotes, issueArea, issueAttribution, issueTroublesome, issueTroublesomeReason, updateIssueStatus]);

  const saveErrorTypeCuration = useCallback(async () => {
    if (!selectedErrorType?.id) return;
    setTypeSaving(true);
    try {
      const payload = {
        review_status: typeReviewStatus,
        attribution_type: typeAttribution,
        designated_area: typeArea,
        actionability: typeActionability,
        linked_mod_guid: typeLinkedModGuid,
        linked_mod_name: typeLinkedModName,
        troublesome: typeTroublesome,
        curation_notes: typeNotes,
      };
      const res = await axios.patch(`${API}/log-monitor/error-types/${selectedErrorType.id}`, payload);
      setSelectedErrorType(res.data);
      await fetchErrorTypes();
      await fetchOccurrences();
      await fetchTroublesomeMods();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save error pattern curation.');
    } finally {
      setTypeSaving(false);
    }
  }, [selectedErrorType?.id, typeReviewStatus, typeAttribution, typeArea, typeActionability, typeLinkedModGuid, typeLinkedModName, typeTroublesome, typeNotes, fetchErrorTypes, fetchOccurrences, fetchTroublesomeMods]);

  useEffect(() => {
    if (!selectedIssue) return;
    setResolutionNotes(selectedIssue.resolution_notes || '');
    setIssueArea(selectedIssue.designated_area || 'mod-analysis');
    setIssueAttribution(selectedIssue.attribution_type || 'mod');
    setIssueTroublesome(Boolean(selectedIssue.troublesome));
    setIssueTroublesomeReason(selectedIssue.troublesome_reason || '');
  }, [selectedIssue]);

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
    const curatedPatterns = errorTypes.filter((item) => Boolean(item.reviewed_by)).length;
    return { total, criticalCount, activeModIssues, activeAlerts, modsWithIssues, troublesomeMods: troublesomeMods.length, curatedPatterns };
  }, [totalCount, occurrences, alerts, modIssues, troublesomeMods, errorTypes]);

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

  const filteredTroublesomeMods = useMemo(() => troublesomeMods.filter((item) => {
    if (!modSearch) return true;
    const haystack = [
      item.mod_name,
      item.mod_id,
      item.reason,
      ...(item.source_categories || []),
      ...(item.designated_areas || []),
      ...(item.attribution_types || []),
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(modSearch.toLowerCase());
  }), [troublesomeMods, modSearch]);

  /* ── filter active check ───────────────────────────────────────── */

  const hasActiveFilters = serverFilter || searchQuery || severityFilter || categoryFilter || reviewStatusFilter || attributionFilter || areaFilter || actionabilityFilter || troublesomeOnly || dateFrom || dateTo || patternSearch;

  const clearFilters = useCallback(() => {
    setServerFilter('');
    setSearchQuery('');
    setSeverityFilter('');
    setCategoryFilter('');
    setReviewStatusFilter('');
    setAttributionFilter('');
    setAreaFilter('');
    setActionabilityFilter('');
    setTroublesomeOnly(false);
    setDateFrom('');
    setDateTo('');
    setPatternSearch('');
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'Total Errors', value: summaryStats.total, color: 'text-white' },
          { label: 'Critical', value: summaryStats.criticalCount, color: 'text-red-400' },
          { label: 'Active Mod Issues', value: summaryStats.activeModIssues, color: 'text-orange-400' },
          { label: 'Active Alerts', value: summaryStats.activeAlerts, color: 'text-yellow-400' },
          { label: 'Mods With Issues', value: summaryStats.modsWithIssues, color: 'text-blue-400' },
          { label: 'Troublesome Mods', value: summaryStats.troublesomeMods, color: 'text-rose-400' },
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

            <select
              value={reviewStatusFilter}
              onChange={(e) => { setReviewStatusFilter(e.target.value); setPage(1); }}
              className="rounded-md border border-[rgba(201,162,39,0.15)] bg-[#0c1117] px-3 py-2 text-sm text-white"
            >
              <option value="">All Reviews</option>
              {VERDICT_OPTIONS.map((status) => (
                <option key={status} value={status}>{humanizeToken(status)}</option>
              ))}
            </select>

            <select
              value={attributionFilter}
              onChange={(e) => { setAttributionFilter(e.target.value); setPage(1); }}
              className="rounded-md border border-[rgba(201,162,39,0.15)] bg-[#0c1117] px-3 py-2 text-sm text-white"
            >
              <option value="">All Attribution</option>
              {ATTRIBUTION_OPTIONS.map((item) => (
                <option key={item} value={item}>{humanizeToken(item)}</option>
              ))}
            </select>

            <select
              value={areaFilter}
              onChange={(e) => { setAreaFilter(e.target.value); setPage(1); }}
              className="rounded-md border border-[rgba(201,162,39,0.15)] bg-[#0c1117] px-3 py-2 text-sm text-white"
            >
              <option value="">All Areas</option>
              {AREA_OPTIONS.map((item) => (
                <option key={item} value={item}>{humanizeToken(item)}</option>
              ))}
            </select>

            <select
              value={actionabilityFilter}
              onChange={(e) => { setActionabilityFilter(e.target.value); setPage(1); }}
              className="rounded-md border border-[rgba(201,162,39,0.15)] bg-[#0c1117] px-3 py-2 text-sm text-white"
            >
              <option value="">All Actionability</option>
              {ACTIONABILITY_OPTIONS.map((item) => (
                <option key={item} value={item}>{humanizeToken(item)}</option>
              ))}
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

            <Button
              size="sm"
              variant="outline"
              onClick={() => { setTroublesomeOnly((current) => !current); setPage(1); }}
              className={`border-[rgba(201,162,39,0.15)] ${troublesomeOnly ? 'text-tropic-gold' : 'text-[#8a9aa8]'} hover:text-white`}
            >
              {troublesomeOnly ? 'Showing Troublesome Only' : 'Show Troublesome Only'}
            </Button>

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
                      <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-[#4a6070]">Attribution</th>
                      <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-[#4a6070]">Area</th>
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
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={`text-xs ${attributionTone(occ.attribution_type)}`}>
                            {humanizeToken(occ.attribution_type)}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={`text-xs ${areaTone(occ.designated_area)}`}>
                            {humanizeToken(occ.designated_area)}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-[#4a6070]">
                          {occ.linked_mod_name || (occ.mod_guid ? occ.mod_guid.slice(0, 12) + '…' : '—')}
                        </td>
                        <td className="max-w-xs px-3 py-2 text-[#8a9aa8]" title={occ.message}>
                          <div className="flex flex-wrap gap-1">
                            {occ.review_status && (
                              <Badge variant="outline" className={`text-[10px] ${statusColor(occ.review_status)}`}>
                                {humanizeToken(occ.review_status)}
                              </Badge>
                            )}
                            {occ.actionability && (
                              <Badge variant="outline" className={`text-[10px] ${actionabilityTone(occ.actionability)}`}>
                                {humanizeToken(occ.actionability)}
                              </Badge>
                            )}
                            {occ.troublesome ? (
                              <Badge variant="outline" className="border-rose-600/30 text-[10px] text-rose-300">
                                Troublesome
                              </Badge>
                            ) : null}
                          </div>
                          <div className="mt-1 truncate">{occ.message?.slice(0, 120)}</div>
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
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4a6070]" />
              <Input
                value={patternSearch}
                onChange={(e) => setPatternSearch(e.target.value)}
                placeholder="Search patterns, notes, or linked mod names..."
                className="border-[rgba(201,162,39,0.15)] bg-[#0c1117] pl-10 text-white"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {troublesomeOnly ? (
                <Badge variant="outline" className="border-rose-600/30 text-rose-300">
                  Troublesome Only
                </Badge>
              ) : null}
              {actionabilityFilter ? (
                <Badge variant="outline" className={`text-xs ${actionabilityTone(actionabilityFilter)}`}>
                  {humanizeToken(actionabilityFilter)}
                </Badge>
              ) : null}
            </div>
          </div>

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
                      <Badge variant="outline" className={`text-xs ${statusColor(et.review_status)}`}>
                        {humanizeToken(et.review_status)}
                      </Badge>
                      <Badge variant="outline" className={`text-xs ${attributionTone(et.attribution_type)}`}>
                        {humanizeToken(et.attribution_type)}
                      </Badge>
                      <Badge variant="outline" className={`text-xs ${actionabilityTone(et.actionability)}`}>
                        {humanizeToken(et.actionability)}
                      </Badge>
                      <Badge variant="outline" className={`text-xs ${areaTone(et.designated_area)}`}>
                        {humanizeToken(et.designated_area)}
                      </Badge>
                      {et.troublesome ? (
                        <Badge variant="outline" className="border-rose-600/30 text-xs text-rose-300">
                          Troublesome
                        </Badge>
                      ) : null}
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
                  {et.curation_notes ? (
                    <p className="mt-2 text-xs text-[#8a9aa8]">
                      {et.curation_notes}
                    </p>
                  ) : null}
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
                          {issue.attribution_type && (
                            <Badge variant="outline" className={`text-xs ${attributionTone(issue.attribution_type)}`}>
                              {humanizeToken(issue.attribution_type)}
                            </Badge>
                          )}
                          {issue.designated_area && (
                            <Badge variant="outline" className={`text-xs ${areaTone(issue.designated_area)}`}>
                              {humanizeToken(issue.designated_area)}
                            </Badge>
                          )}
                          {issue.issue_type && (
                            <Badge variant="outline" className="border-zinc-700 text-xs text-[#8a9aa8]">
                              {issue.issue_type}
                            </Badge>
                          )}
                          {issue.troublesome ? (
                            <Badge variant="outline" className="border-rose-600/30 text-xs text-rose-300">
                              Troublesome Mod
                            </Badge>
                          ) : null}
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
      {activeTab === 'troublesome-mods' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4a6070]" />
              <Input
                value={modSearch}
                onChange={(e) => setModSearch(e.target.value)}
                placeholder="Search troublesome mods, reasons, or attribution..."
                className="border-[rgba(201,162,39,0.15)] bg-[#0c1117] pl-10 text-white"
              />
            </div>
          </div>

          {troublesomeLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-24 animate-pulse rounded-lg bg-[#0c1117]/50" />
              ))}
            </div>
          ) : filteredTroublesomeMods.length === 0 ? (
            <Card className="border-[rgba(201,162,39,0.12)] bg-[#0c1117]/50">
              <CardContent className="flex flex-col items-center justify-center py-16 text-[#4a6070]">
                <TrendingUp className="mb-4 h-12 w-12 opacity-30" />
                <p className="text-lg font-medium">No troublesome mods curated yet</p>
                <p className="mt-1 text-sm">
                  Flag a mod issue or linked error pattern as troublesome to build this list.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredTroublesomeMods.map((item) => (
                <Card key={item.mod_id} className="border border-rose-900/30 bg-[#0c1117]/50">
                  <CardContent className="py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-white">{item.mod_name || item.mod_id}</span>
                          <Badge variant="outline" className="border-rose-600/30 text-xs text-rose-300">
                            Troublesome
                          </Badge>
                          {(item.attribution_types || []).map((entry) => (
                            <Badge key={`${item.mod_id}-${entry}`} variant="outline" className={`text-xs ${attributionTone(entry)}`}>
                              {humanizeToken(entry)}
                            </Badge>
                          ))}
                        </div>

                        <div className="mt-2 flex flex-wrap gap-4 text-xs text-[#8a9aa8]">
                          <span>{item.issue_count || 0} curated mod issues</span>
                          <span>{item.error_type_count || 0} linked error patterns</span>
                          <span>{(item.total_occurrences || 0) + (item.pattern_occurrences || 0)} combined signals</span>
                          {item.last_seen && <span>Last seen: {fmtDate(item.last_seen)}</span>}
                        </div>

                        {item.reason ? (
                          <p className="mt-3 text-sm text-[#d0d8e0]">{item.reason}</p>
                        ) : null}

                        <div className="mt-3 flex flex-wrap gap-2">
                          {(item.source_categories || []).map((entry) => (
                            <Badge key={`${item.mod_id}-${entry}`} variant="outline" className={`text-xs ${sourceTone(entry)}`}>
                              {entry}
                            </Badge>
                          ))}
                          {(item.designated_areas || []).map((entry) => (
                            <Badge key={`${item.mod_id}-area-${entry}`} variant="outline" className={`text-xs ${areaTone(entry)}`}>
                              {humanizeToken(entry)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

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
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto border-[rgba(201,162,39,0.15)] bg-[#050a0e] text-white">
          <DialogHeader>
            <DialogTitle className="text-[#e8c547] text-base leading-tight">
              {selectedErrorType?.label}
            </DialogTitle>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Badge variant="outline" className={`text-[10px] ${severityBadge(selectedErrorType?.severity)}`}>
                {selectedErrorType?.severity}
              </Badge>
              <Badge variant="outline" className={`text-[10px] ${categoryBadge(selectedErrorType?.category)}`}>
                {selectedErrorType?.category}
              </Badge>
              <span className="text-[10px] text-[#4a6070]">
                {(selectedErrorType?.total_occurrences || 0).toLocaleString()} occurrences
              </span>
              {selectedErrorType?.first_seen && (
                <span className="text-[10px] text-[#4a6070]">
                  First: {fmtDate(selectedErrorType.first_seen)}
                </span>
              )}
              {selectedErrorType?.last_seen && (
                <span className="text-[10px] text-[#4a6070]">
                  Last: {fmtDate(selectedErrorType.last_seen)}
                </span>
              )}
            </div>
          </DialogHeader>

          <Tabs defaultValue="analysis" className="mt-1">
            <TabsList className="h-8 w-full bg-[#0c1117] border border-[rgba(201,162,39,0.12)]">
              <TabsTrigger value="analysis" className="text-xs data-[state=active]:bg-[#111a24] data-[state=active]:text-[#e8c547]">
                <Sparkles className="mr-1 h-3 w-3" /> AI Analysis
              </TabsTrigger>
              <TabsTrigger value="curation" className="text-xs data-[state=active]:bg-[#111a24] data-[state=active]:text-[#e8c547]">
                <Eye className="mr-1 h-3 w-3" /> Curation
              </TabsTrigger>
              <TabsTrigger value="occurrences" className="text-xs data-[state=active]:bg-[#111a24] data-[state=active]:text-[#e8c547]">
                <Monitor className="mr-1 h-3 w-3" /> Occurrences ({typeOccurrences.length})
              </TabsTrigger>
            </TabsList>

            {/* ── AI Analysis tab ──────────────────────────────── */}
            <TabsContent value="analysis" className="space-y-3 mt-3">
              {!aiAnalysis && !aiLoading && !aiError && (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-[rgba(201,162,39,0.12)] bg-[#0c1117]/50 px-4 py-6">
                  <Bot className="h-8 w-8 text-[#4a6070]" />
                  <p className="text-center text-sm text-[#8a9aa8]">
                    Use AI to get a plain-English explanation of this error, its likely root cause, and recommended actions.
                  </p>
                  <Button
                    onClick={runAiAnalysis}
                    size="sm"
                    className="border-[rgba(201,162,39,0.3)] bg-[#111a24] text-[#e8c547] hover:bg-[#1a2430]"
                  >
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Run AI Analysis
                  </Button>
                </div>
              )}

              {aiLoading && (
                <div className="flex items-center gap-2 rounded-lg border border-[rgba(201,162,39,0.12)] bg-[#0c1117]/50 px-4 py-6">
                  <RefreshCw className="h-4 w-4 animate-spin text-[#e8c547]" />
                  <span className="text-sm text-[#8a9aa8]">Analysing error pattern…</span>
                </div>
              )}

              {aiError && (
                <div className="rounded-lg border border-red-800/30 bg-red-950/20 p-3">
                  <p className="text-sm text-red-300">{aiError}</p>
                  <Button onClick={runAiAnalysis} size="sm" variant="ghost" className="mt-2 text-xs text-red-300 hover:text-white">
                    Retry
                  </Button>
                </div>
              )}

              {aiAnalysis && (
                <div className="space-y-3">
                  <div className="rounded-lg border border-[rgba(201,162,39,0.12)] bg-[#0c1117]/50 p-3">
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-[#4a6070]">Summary</p>
                    <p className="text-sm text-[#d0d8e0]">{aiAnalysis.summary}</p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-[rgba(201,162,39,0.12)] bg-[#0c1117]/50 p-3">
                      <p className="mb-1 text-[10px] uppercase tracking-wider text-[#4a6070]">Root Cause</p>
                      <p className="text-sm text-[#d0d8e0]">{aiAnalysis.root_cause || '—'}</p>
                    </div>
                    <div className="rounded-lg border border-[rgba(201,162,39,0.12)] bg-[#0c1117]/50 p-3">
                      <p className="mb-1 text-[10px] uppercase tracking-wider text-[#4a6070]">Impact</p>
                      <p className="text-sm text-[#d0d8e0]">{aiAnalysis.impact || '—'}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {aiAnalysis.severity_assessment && (
                      <Badge variant="outline" className={`text-[10px] ${
                        aiAnalysis.severity_assessment === 'critical' || aiAnalysis.severity_assessment === 'high'
                          ? 'border-red-600/30 text-red-300'
                          : aiAnalysis.severity_assessment === 'moderate'
                            ? 'border-yellow-600/30 text-yellow-300'
                            : 'border-green-600/30 text-green-300'
                      }`}>
                        AI severity: {aiAnalysis.severity_assessment}
                      </Badge>
                    )}
                    {aiAnalysis.is_safe_to_ignore !== null && aiAnalysis.is_safe_to_ignore !== undefined && (
                      <Badge variant="outline" className={`text-[10px] ${
                        aiAnalysis.is_safe_to_ignore
                          ? 'border-green-600/30 text-green-300'
                          : 'border-orange-600/30 text-orange-300'
                      }`}>
                        {aiAnalysis.is_safe_to_ignore ? 'Safe to ignore' : 'Needs attention'}
                      </Badge>
                    )}
                  </div>

                  {(aiAnalysis.recommended_actions || []).length > 0 && (
                    <div className="rounded-lg border border-[rgba(201,162,39,0.12)] bg-[#0c1117]/50 p-3">
                      <p className="mb-2 text-[10px] uppercase tracking-wider text-[#4a6070]">Recommended Actions</p>
                      <ul className="space-y-1">
                        {aiAnalysis.recommended_actions.map((action, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-[#d0d8e0]">
                            <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-[#4a6070]" />
                            {action}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <Button onClick={runAiAnalysis} size="sm" variant="ghost" className="text-xs text-[#4a6070] hover:text-white">
                    <RefreshCw className="mr-1 h-3 w-3" /> Re-analyse
                  </Button>
                </div>
              )}

              {/* Collapsible raw message */}
              <button
                type="button"
                onClick={() => setShowRawMessage((v) => !v)}
                className="flex w-full items-center gap-1 text-[10px] uppercase tracking-wider text-[#4a6070] hover:text-[#8a9aa8]"
              >
                {showRawMessage ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Raw message &amp; pattern
              </button>
              {showRawMessage && (
                <div className="space-y-2">
                  <pre className="max-h-24 overflow-auto rounded bg-[#0c1117] p-2 font-mono text-[10px] text-[#8a9aa8] whitespace-pre-wrap break-all">
                    {selectedErrorType?.example_raw}
                  </pre>
                  <pre className="rounded bg-[#0c1117] p-2 font-mono text-[10px] text-[#4a6070] whitespace-pre-wrap break-all">
                    {selectedErrorType?.normalised_message}
                  </pre>
                </div>
              )}
            </TabsContent>

            {/* ── Pattern Curation tab ─────────────────────────── */}
            <TabsContent value="curation" className="mt-3">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-[#4a6070]">Review Status</p>
                    <select
                      value={typeReviewStatus}
                      onChange={(e) => setTypeReviewStatus(e.target.value)}
                      className="w-full rounded-md border border-[rgba(201,162,39,0.15)] bg-[#050a0e] px-2 py-1.5 text-xs text-white"
                    >
                      {VERDICT_OPTIONS.map((status) => (
                        <option key={status} value={status}>{humanizeToken(status)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-[#4a6070]">Attribution</p>
                    <select
                      value={typeAttribution}
                      onChange={(e) => setTypeAttribution(e.target.value)}
                      className="w-full rounded-md border border-[rgba(201,162,39,0.15)] bg-[#050a0e] px-2 py-1.5 text-xs text-white"
                    >
                      {ATTRIBUTION_OPTIONS.map((entry) => (
                        <option key={entry} value={entry}>{humanizeToken(entry)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-[#4a6070]">Diagnostics Area</p>
                    <select
                      value={typeArea}
                      onChange={(e) => setTypeArea(e.target.value)}
                      className="w-full rounded-md border border-[rgba(201,162,39,0.15)] bg-[#050a0e] px-2 py-1.5 text-xs text-white"
                    >
                      {AREA_OPTIONS.map((entry) => (
                        <option key={entry} value={entry}>{humanizeToken(entry)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-[#4a6070]">Actionability</p>
                    <select
                      value={typeActionability}
                      onChange={(e) => setTypeActionability(e.target.value)}
                      className="w-full rounded-md border border-[rgba(201,162,39,0.15)] bg-[#050a0e] px-2 py-1.5 text-xs text-white"
                    >
                      {ACTIONABILITY_OPTIONS.map((entry) => (
                        <option key={entry} value={entry}>{humanizeToken(entry)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-[#4a6070]">Known Mod GUID</p>
                    <Input
                      value={typeLinkedModGuid}
                      onChange={(e) => setTypeLinkedModGuid(e.target.value)}
                      className="h-8 border-[rgba(201,162,39,0.15)] bg-[#050a0e] text-xs text-white"
                      placeholder="Optional GUID"
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-[#4a6070]">Known Mod Name</p>
                    <Input
                      value={typeLinkedModName}
                      onChange={(e) => setTypeLinkedModName(e.target.value)}
                      className="h-8 border-[rgba(201,162,39,0.15)] bg-[#050a0e] text-xs text-white"
                      placeholder="Optional linked mod"
                    />
                  </div>
                </div>

                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-[#4a6070]">Quick Fill From Known Mods</p>
                  <select
                    value=""
                    onChange={(e) => {
                      const selectedGuid = e.target.value;
                      const selectedMod = knownMods.find((item) => item.guid === selectedGuid);
                      if (selectedMod) {
                        setTypeLinkedModGuid(selectedMod.guid || '');
                        setTypeLinkedModName(selectedMod.name || '');
                      }
                    }}
                    className="w-full rounded-md border border-[rgba(201,162,39,0.15)] bg-[#050a0e] px-2 py-1.5 text-xs text-white"
                  >
                    <option value="">Select a known mod...</option>
                    {knownMods.map((item) => (
                      <option key={item.guid || item.id} value={item.guid}>
                        {item.name || item.guid}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setTypeTroublesome((current) => !current)}
                    className={`text-xs border-[rgba(201,162,39,0.15)] ${typeTroublesome ? 'text-rose-300' : 'text-[#8a9aa8]'}`}
                  >
                    {typeTroublesome ? 'Troublesome Linked Mod' : 'Mark Linked Mod As Troublesome'}
                  </Button>
                  <Badge variant="outline" className={`text-[10px] ${statusColor(typeReviewStatus)}`}>
                    {humanizeToken(typeReviewStatus)}
                  </Badge>
                  <Badge variant="outline" className={`text-[10px] ${attributionTone(typeAttribution)}`}>
                    {humanizeToken(typeAttribution)}
                  </Badge>
                  <Badge variant="outline" className={`text-[10px] ${areaTone(typeArea)}`}>
                    {humanizeToken(typeArea)}
                  </Badge>
                </div>

                <Textarea
                  value={typeNotes}
                  onChange={(e) => setTypeNotes(e.target.value)}
                  className="border-[rgba(201,162,39,0.15)] bg-[#050a0e] text-xs text-white"
                  rows={2}
                  placeholder="Operator notes, false-positive rationale, or known-safe context..."
                />

                <div className="flex justify-end">
                  <Button
                    onClick={saveErrorTypeCuration}
                    size="sm"
                    variant="outline"
                    disabled={typeSaving}
                    className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8] hover:text-white"
                  >
                    {typeSaving ? 'Saving...' : 'Save Curation'}
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* ── Occurrences tab ──────────────────────────────── */}
            <TabsContent value="occurrences" className="mt-3">
              {typeOccLoading ? (
                <div className="h-20 animate-pulse rounded bg-[#0c1117]/50" />
              ) : typeOccurrences.length === 0 ? (
                <p className="py-4 text-center text-sm text-[#4a6070]">No occurrences found.</p>
              ) : (
                <div className="max-h-[50vh] space-y-2 overflow-y-auto">
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
            </TabsContent>
          </Tabs>
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
                  <div>
                    <span className="text-[#4a6070]">Diagnostics area:</span>
                    <Badge variant="outline" className={`ml-1 text-xs ${areaTone(issueArea)}`}>
                      {humanizeToken(issueArea)}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-[#4a6070]">Attribution:</span>
                    <Badge variant="outline" className={`ml-1 text-xs ${attributionTone(issueAttribution)}`}>
                      {humanizeToken(issueAttribution)}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-[#4a6070]">Troublesome:</span>
                    <Badge
                      variant="outline"
                      className={`ml-1 text-xs ${issueTroublesome ? 'border-rose-600/30 text-rose-300' : 'border-zinc-700 text-[#8a9aa8]'}`}
                    >
                      {issueTroublesome ? 'Yes' : 'No'}
                    </Badge>
                  </div>
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
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-[#8a9aa8]">Issue classification</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={saveIssueCuration}
                      className="border-[rgba(201,162,39,0.15)] text-[#8a9aa8] hover:text-white"
                    >
                      Save Classification
                    </Button>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <p className="mb-1 text-[10px] uppercase tracking-wider text-[#4a6070]">Diagnostics Area</p>
                      <select
                        value={issueArea}
                        onChange={(e) => setIssueArea(e.target.value)}
                        className="w-full rounded-md border border-[rgba(201,162,39,0.15)] bg-[#050a0e] px-3 py-2 text-sm text-white"
                      >
                        {AREA_OPTIONS.map((entry) => (
                          <option key={entry} value={entry}>{humanizeToken(entry)}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <p className="mb-1 text-[10px] uppercase tracking-wider text-[#4a6070]">Attribution</p>
                      <select
                        value={issueAttribution}
                        onChange={(e) => setIssueAttribution(e.target.value)}
                        className="w-full rounded-md border border-[rgba(201,162,39,0.15)] bg-[#050a0e] px-3 py-2 text-sm text-white"
                      >
                        {ATTRIBUTION_OPTIONS.map((entry) => (
                          <option key={entry} value={entry}>{humanizeToken(entry)}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setIssueTroublesome((current) => {
                          const next = !current;
                          if (next) {
                            setIssueArea('troublesome-mods');
                          }
                          return next;
                        });
                      }}
                      className={`border-[rgba(201,162,39,0.15)] ${issueTroublesome ? 'text-rose-300' : 'text-[#8a9aa8]'}`}
                    >
                      {issueTroublesome ? 'Troublesome Mod Flagged' : 'Mark As Troublesome Mod'}
                    </Button>
                    <Badge variant="outline" className={`text-xs ${areaTone(issueArea)}`}>
                      {humanizeToken(issueArea)}
                    </Badge>
                    <Badge variant="outline" className={`text-xs ${attributionTone(issueAttribution)}`}>
                      {humanizeToken(issueAttribution)}
                    </Badge>
                  </div>
                  <Textarea
                    value={issueTroublesomeReason}
                    onChange={(e) => setIssueTroublesomeReason(e.target.value)}
                    className="mt-3 border-[rgba(201,162,39,0.15)] bg-[#050a0e] text-white"
                    rows={3}
                    placeholder="Why is this mod considered troublesome, recurring, or worth tracking?"
                  />
                </div>

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
                        onClick={() => updateIssueStatus(selectedIssue.id, status, resolutionNotes, {
                          designated_area: issueArea,
                          attribution_type: issueAttribution,
                          troublesome: issueTroublesome,
                          troublesome_reason: issueTroublesomeReason,
                        })}
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

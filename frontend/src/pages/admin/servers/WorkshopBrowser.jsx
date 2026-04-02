import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import {
  Search,
  Package,
  RefreshCw,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Loader2,
  Download,
  Upload,
  Flame,
  Sparkles,
  ArrowUpDown,
  Type,
  Wifi,
  WifiOff,
  ImageOff,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Trash2,
  Save,
  Hash,
  Copy,
  Check,
  List,
  LayoutGrid,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

import { API } from '@/utils/api';

// ── Category definitions ───────────────────────────────────────────────────
const CATEGORIES = [
  { key: 'popular', label: 'Popular', icon: Flame },
  { key: 'newest', label: 'Newest', icon: Sparkles },
  { key: 'updated', label: 'Recently Updated', icon: ArrowUpDown },
  { key: 'name', label: 'Alphabetical', icon: Type },
];

// ── Debounce hook ──────────────────────────────────────────────────────────
function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

// ── Thumbnail with fallback ────────────────────────────────────────────────
function ModThumbnail({ src, alt }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-900/80">
        <ImageOff className="h-8 w-8 text-zinc-700" />
      </div>
    );
  }
  return (
    <img src={src} alt={alt} className="h-full w-full object-cover" loading="lazy" onError={() => setFailed(true)} />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN WORKSHOP COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function WorkshopBrowser() {
  const [activeMainTab, setActiveMainTab] = useState('workshop');

  // ── Server context (for Reorder / Batch / Download) ──────────────────
  const [servers, setServers] = useState([]);
  const [selectedServerId, setSelectedServerId] = useState('');
  const [serverMods, setServerMods] = useState([]);
  const [originalServerMods, setOriginalServerMods] = useState([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [savingMods, setSavingMods] = useState(false);

  // ── Mod issues (for error icons) ─────────────────────────────────────
  const [modIssues, setModIssues] = useState([]);

  // ── Download history ─────────────────────────────────────────────────
  const [downloadHistory, setDownloadHistory] = useState({});

  // ── Import / Export dialogs ──────────────────────────────────────────
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);
  const [exportJson, setExportJson] = useState('');
  const [copied, setCopied] = useState(false);

  // ── Download-to-server dialog ────────────────────────────────────────
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [downloadMod, setDownloadMod] = useState(null);
  const [includeVersion, setIncludeVersion] = useState(false);
  const [downloadTargetServer, setDownloadTargetServer] = useState('');
  const [downloading, setDownloading] = useState(false);

  // Load servers list
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/servers`);
        const list = Array.isArray(res.data) ? res.data : [];
        setServers(list);
        if (list.length > 0 && !selectedServerId) setSelectedServerId(list[0].id);
      } catch { /* ignore */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load server mods when selectedServerId changes
  useEffect(() => {
    if (!selectedServerId) return;
    (async () => {
      try {
        const res = await axios.get(`${API}/servers/${selectedServerId}/mods`);
        const mods = Array.isArray(res.data) ? res.data : (res.data?.mods || []);
        setServerMods(mods);
        setOriginalServerMods(JSON.parse(JSON.stringify(mods)));
        setHasUnsavedChanges(false);
      } catch { /* ignore */ }
    })();
  }, [selectedServerId]);

  // Load active mod issues
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/servers/mod-issues`, { params: { status: 'active' } });
        setModIssues(Array.isArray(res.data) ? res.data : []);
      } catch { /* ignore */ }
    })();
  }, []);

  // Load download history
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/servers/mod-download-history`);
        const hist = {};
        for (const h of (Array.isArray(res.data) ? res.data : [])) {
          if (h.mod_id && (!hist[h.mod_id] || h.downloaded_at > hist[h.mod_id].downloaded_at)) {
            hist[h.mod_id] = h;
          }
        }
        setDownloadHistory(hist);
      } catch { /* ignore */ }
    })();
  }, []);

  // Track unsaved changes
  useEffect(() => {
    setHasUnsavedChanges(JSON.stringify(serverMods) !== JSON.stringify(originalServerMods));
  }, [serverMods, originalServerMods]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handler = (e) => {
      if (hasUnsavedChanges && (activeMainTab === 'reorder' || activeMainTab === 'batch')) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges, activeMainTab]);

  // Get issue count for a mod
  const getModIssueCount = useCallback(
    (modId) => modIssues.filter(i => i.mod_id === modId && i.confidence_score >= 0.6).length,
    [modIssues]
  );

  // Save mod list to server
  const handleSaveMods = async () => {
    if (!selectedServerId) return;
    setSavingMods(true);
    try {
      await axios.put(`${API}/servers/${selectedServerId}/mods`, { mods: serverMods });
      setOriginalServerMods(JSON.parse(JSON.stringify(serverMods)));
      setHasUnsavedChanges(false);
    } catch (err) {
      console.error('Failed to save mods:', err);
    } finally {
      setSavingMods(false);
    }
  };

  // Tab switch with unsaved changes warning
  const handleTabSwitch = (tab) => {
    if (hasUnsavedChanges && (activeMainTab === 'reorder' || activeMainTab === 'batch')) {
      if (!window.confirm('You have unsaved changes. Leave without saving?')) return;
      setServerMods(JSON.parse(JSON.stringify(originalServerMods)));
      setHasUnsavedChanges(false);
    }
    setActiveMainTab(tab);
  };

  // ── Import JSON ──────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!selectedServerId) { setImportError('Select a server first.'); return; }
    let parsed;
    try {
      parsed = JSON.parse(importJson);
      if (!Array.isArray(parsed)) {
        if (parsed.mods && Array.isArray(parsed.mods)) parsed = parsed.mods;
        else { setImportError('JSON must be an array of mods or an object with a "mods" array.'); return; }
      }
    } catch { setImportError('Invalid JSON format.'); return; }

    setImporting(true);
    setImportError('');
    try {
      await axios.post(`${API}/servers/${selectedServerId}/mods/import-json`, { mods: parsed });
      const res = await axios.get(`${API}/servers/${selectedServerId}/mods`);
      const mods = Array.isArray(res.data) ? res.data : (res.data?.mods || []);
      setServerMods(mods);
      setOriginalServerMods(JSON.parse(JSON.stringify(mods)));
      setHasUnsavedChanges(false);
      setImportDialogOpen(false);
      setImportJson('');
    } catch (err) {
      setImportError(err.response?.data?.detail || 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  // ── Export JSON ──────────────────────────────────────────────────────
  const handleExport = async () => {
    if (!selectedServerId) return;
    try {
      const res = await axios.get(`${API}/servers/${selectedServerId}/mods/export-json`);
      setExportJson(JSON.stringify(res.data?.mods || [], null, 2));
      setExportDialogOpen(true);
      setCopied(false);
    } catch { /* ignore */ }
  };

  // ── Download mod to server ─────────────────────────────────────────
  const openDownloadDialog = (mod) => {
    setDownloadMod(mod);
    setIncludeVersion(false);
    setDownloadTargetServer(selectedServerId || (servers[0]?.id || ''));
    setDownloadDialogOpen(true);
  };

  const handleDownloadToServer = async () => {
    if (!downloadMod || !downloadTargetServer) return;
    setDownloading(true);
    try {
      const res = await axios.get(`${API}/servers/${downloadTargetServer}/mods`);
      const currentMods = Array.isArray(res.data) ? res.data : (res.data?.mods || []);
      const modId = downloadMod.mod_id;

      if (currentMods.some(m => (m.mod_id || m.modId) === modId)) {
        setDownloading(false);
        setDownloadDialogOpen(false);
        return;
      }

      const newMod = {
        mod_id: modId,
        name: downloadMod.name || '',
        version: includeVersion ? (downloadMod.version || '') : '',
        enabled: true,
        author: downloadMod.author || '',
        tags: downloadMod.tags || [],
      };

      if (downloadMod.scenario_ids?.length) {
        newMod.scenario_ids = downloadMod.scenario_ids;
      }

      const updatedMods = [...currentMods, newMod];
      await axios.put(`${API}/servers/${downloadTargetServer}/mods`, { mods: updatedMods });

      if (downloadTargetServer === selectedServerId) {
        setServerMods(updatedMods);
        setOriginalServerMods(JSON.parse(JSON.stringify(updatedMods)));
      }

      setDownloadDialogOpen(false);
    } catch (err) {
      console.error('Download to server failed:', err);
    } finally {
      setDownloading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-4">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold tracking-widest text-tropic-gold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
          WORKSHOP
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedServerId}
            onChange={(e) => setSelectedServerId(e.target.value)}
            className="bg-black/60 border border-tropic-gold-dark/20 text-white text-sm rounded px-3 py-1.5 focus:ring-tropic-gold/40 focus:border-tropic-gold/40"
          >
            {servers.length === 0 && <option value="">No servers</option>}
            {servers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <Button size="sm" onClick={() => { setImportJson(''); setImportError(''); setImportDialogOpen(true); }}
            className="bg-tropic-gold text-black hover:bg-tropic-gold-light">
            <Upload className="mr-1.5 h-3.5 w-3.5" /> Import JSON
          </Button>
          <Button size="sm" variant="outline" onClick={handleExport}
            className="border-tropic-gold-dark/30 text-tropic-gold hover:bg-tropic-gold/10">
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export JSON
          </Button>
        </div>
      </div>

      {/* ── Main Tab Bar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-gray-800 pb-0">
        {[
          { key: 'workshop', label: 'Workshop', icon: LayoutGrid },
          { key: 'reorder', label: 'Reorder', icon: List },
          { key: 'batch', label: 'Batch', icon: Hash },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => handleTabSwitch(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeMainTab === key
                ? 'border-tropic-gold text-tropic-gold'
                : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
            {key !== 'workshop' && hasUnsavedChanges && activeMainTab === key && (
              <span className="ml-1 h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            )}
          </button>
        ))}
      </div>

      {/* ── Tab Content ──────────────────────────────────────────────── */}
      {activeMainTab === 'workshop' && (
        <WorkshopTab
          onDownload={openDownloadDialog}
          modIssues={modIssues}
          getModIssueCount={getModIssueCount}
          downloadHistory={downloadHistory}
        />
      )}
      {activeMainTab === 'reorder' && (
        <ReorderTab
          mods={serverMods}
          setMods={setServerMods}
          hasUnsavedChanges={hasUnsavedChanges}
          onSave={handleSaveMods}
          saving={savingMods}
          getModIssueCount={getModIssueCount}
        />
      )}
      {activeMainTab === 'batch' && (
        <BatchTab
          mods={serverMods}
          setMods={setServerMods}
          hasUnsavedChanges={hasUnsavedChanges}
          onSave={handleSaveMods}
          saving={savingMods}
          getModIssueCount={getModIssueCount}
        />
      )}

      {/* ── Import JSON Dialog ────────────────────────────────────── */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="bg-gray-950 border-gray-800 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-tropic-gold">Import JSON Mod List</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Paste a JSON mod list exported from another server. This will <strong className="text-white">replace</strong> the current mod list.
            </p>
            {importError && (
              <div className="bg-red-900/30 border border-red-700/50 text-red-300 px-3 py-2 rounded text-sm">{importError}</div>
            )}
            <Textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              rows={10}
              placeholder={'[\n  {"mod_id":"...","name":"...","version":"..."}\n]'}
              className="bg-black/60 border-gray-700 text-white font-mono text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setImportDialogOpen(false)} className="border-gray-700 text-gray-400">Cancel</Button>
              <Button onClick={handleImport} disabled={importing || !importJson.trim()} className="bg-tropic-gold text-black hover:bg-tropic-gold-light">
                {importing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
                Import
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Export JSON Dialog ─────────────────────────────────────── */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="bg-gray-950 border-gray-800 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-tropic-gold">Export JSON Mod List</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-400">Copy this JSON to import into another server.</p>
            <Textarea
              value={exportJson}
              readOnly
              rows={12}
              className="bg-black/60 border-gray-700 text-white font-mono text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setExportDialogOpen(false)} className="border-gray-700 text-gray-400">Close</Button>
              <Button onClick={() => { navigator.clipboard.writeText(exportJson); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                className="bg-tropic-gold text-black hover:bg-tropic-gold-light">
                {copied ? <><Check className="mr-1.5 h-4 w-4" /> Copied</> : <><Copy className="mr-1.5 h-4 w-4" /> Copy</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Download-to-Server Dialog ─────────────────────────────── */}
      <Dialog open={downloadDialogOpen} onOpenChange={setDownloadDialogOpen}>
        <DialogContent className="bg-gray-950 border-gray-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-tropic-gold">Add Mod to Server</DialogTitle>
          </DialogHeader>
          {downloadMod && (
            <div className="space-y-4">
              <div className="bg-black/40 border border-gray-800 rounded-lg p-3 space-y-1">
                <p className="font-semibold text-white">{downloadMod.name || 'Unnamed Mod'}</p>
                <p className="font-mono text-xs text-gray-500">{downloadMod.mod_id}</p>
                {downloadMod.author && <p className="text-xs text-gray-400">by {downloadMod.author}</p>}
              </div>

              <div>
                <Label className="text-gray-300 text-sm">Target Server</Label>
                <select value={downloadTargetServer} onChange={(e) => setDownloadTargetServer(e.target.value)}
                  className="w-full mt-1 bg-black/60 border border-gray-700 text-white text-sm rounded px-3 py-2">
                  {servers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="flex items-start gap-3 bg-amber-900/20 border border-amber-700/30 rounded-lg p-3">
                <Info className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-2 flex-1">
                  <p className="text-sm text-amber-200 font-medium">Include version?</p>
                  <p className="text-xs text-gray-400">
                    If version is included, the server locks to that specific version.
                    If left blank, the server will always use the latest version.
                  </p>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                      <input type="radio" name="version_choice" checked={!includeVersion} onChange={() => setIncludeVersion(false)}
                        className="accent-tropic-gold" />
                      Use latest (recommended)
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                      <input type="radio" name="version_choice" checked={includeVersion} onChange={() => setIncludeVersion(true)}
                        className="accent-tropic-gold" />
                      Lock to {downloadMod.version || 'current'}
                    </label>
                  </div>
                </div>
              </div>

              {downloadMod.scenario_ids?.length > 0 && (
                <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-3 text-sm">
                  <p className="text-blue-300 font-medium mb-1">Scenario IDs detected</p>
                  {downloadMod.scenario_ids.map((sid, i) => (
                    <p key={i} className="font-mono text-xs text-gray-400">{sid}</p>
                  ))}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setDownloadDialogOpen(false)} className="border-gray-700 text-gray-400">Cancel</Button>
                <Button onClick={handleDownloadToServer} disabled={downloading}
                  className="bg-tropic-gold text-black hover:bg-tropic-gold-light">
                  {downloading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
                  Add to Server
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// WORKSHOP TAB — Live browsing
// ═══════════════════════════════════════════════════════════════════════════
function WorkshopTab({ onDownload, modIssues, getModIssueCount, downloadHistory }) {
  const [activeCategory, setActiveCategory] = useState('popular');
  const [mods, setMods] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [source, setSource] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounce(searchInput, 400);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const abortRef = useRef(null);
  const [issuePopupMod, setIssuePopupMod] = useState(null);

  const fetchMods = useCallback(async () => {
    if (abortRef.current) abortRef.current.cancel('superseded');
    const cancelSource = axios.CancelToken.source();
    abortRef.current = cancelSource;
    setLoading(true);
    setError(null);
    try {
      let res;
      if (isSearchMode && debouncedSearch.trim()) {
        res = await axios.get(`${API}/workshop/search`, {
          params: { q: debouncedSearch.trim(), page, sort: 'popularity' },
          cancelToken: cancelSource.token,
        });
      } else {
        res = await axios.get(`${API}/workshop/browse`, {
          params: { category: activeCategory, page },
          cancelToken: cancelSource.token,
        });
      }
      const data = res.data || {};
      setMods(Array.isArray(data.mods) ? data.mods : []);
      setTotal(typeof data.total === 'number' ? data.total : 0);
      setTotalPages(data.total_pages > 0 ? data.total_pages : Math.max(1, Math.ceil((data.total || 0) / 16)));
      setSource(data.source || 'live');
      if (data.error) setError(data.error);
    } catch (err) {
      if (axios.isCancel(err)) return;
      setError(err.response?.data?.detail || 'Failed to fetch workshop data.');
      setMods([]);
      setSource('error');
    } finally {
      setLoading(false);
    }
  }, [activeCategory, page, isSearchMode, debouncedSearch]);

  useEffect(() => {
    fetchMods();
    return () => { if (abortRef.current) abortRef.current.cancel('cleanup'); };
  }, [fetchMods]);

  useEffect(() => {
    setIsSearchMode(debouncedSearch.trim().length > 0);
    setPage(1);
  }, [debouncedSearch]);

  const handleCategoryChange = (key) => {
    setActiveCategory(key);
    setPage(1);
    setSearchInput('');
    setIsSearchMode(false);
  };

  return (
    <div className="space-y-4">
      {/* Status + categories */}
      <div className="flex flex-wrap items-center gap-2">
        {source === 'live' && !loading && (
          <Badge className="bg-green-600/20 text-green-400 border-green-600/30 text-xs gap-1 mr-2">
            <Wifi className="h-3 w-3" /> Live
          </Badge>
        )}
        {source === 'error' && (
          <Badge className="bg-red-600/20 text-red-400 border-red-600/30 text-xs gap-1 mr-2">
            <WifiOff className="h-3 w-3" /> Offline
          </Badge>
        )}
        {CATEGORIES.map(({ key, label, icon: Icon }) => (
          <Button key={key} variant={activeCategory === key && !isSearchMode ? 'default' : 'outline'} size="sm"
            onClick={() => handleCategoryChange(key)}
            className={activeCategory === key && !isSearchMode
              ? 'bg-tropic-gold text-black hover:bg-tropic-gold-light'
              : 'border-tropic-gold-dark/20 text-gray-400 hover:text-tropic-gold hover:bg-tropic-gold/10'}>
            <Icon className="mr-1.5 h-3.5 w-3.5" />{label}
          </Button>
        ))}
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by mod name or mod ID…"
            className="border-tropic-gold-dark/20 bg-black/60 pl-10 text-white placeholder:text-gray-500 focus-visible:ring-tropic-gold/40" />
        </div>
        {searchInput && (
          <Button variant="outline" onClick={() => { setSearchInput(''); setIsSearchMode(false); setPage(1); }}
            className="border-gray-700 text-gray-300 hover:bg-gray-800">Clear</Button>
        )}
        <Button variant="outline" onClick={fetchMods} disabled={loading}
          className="border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-30">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-600/30 bg-red-600/10 px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="h-5 w-5 shrink-0" /><span>{error}</span>
          <Button variant="ghost" size="sm" onClick={fetchMods} className="ml-auto text-red-400 hover:text-red-300">Retry</Button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="animate-pulse border-tropic-gold-dark/10 bg-black/60 overflow-hidden">
              <div className="aspect-video bg-zinc-800" />
              <CardContent className="space-y-2 p-4">
                <div className="h-5 w-3/4 rounded bg-zinc-800" />
                <div className="h-4 w-1/2 rounded bg-zinc-800" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Results */}
      {!loading && mods.length > 0 && (
        <>
          <p className="text-sm text-gray-500">
            {isSearchMode
              ? `Found ${total.toLocaleString()} result${total !== 1 ? 's' : ''}`
              : `Page ${page} of ${totalPages.toLocaleString()} — ${total.toLocaleString()} mods`}
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {mods.map((mod, idx) => {
              const issueCount = getModIssueCount(mod.mod_id);
              const history = downloadHistory[mod.mod_id];
              return (
                <Card key={mod.mod_id || idx}
                  className="group border-tropic-gold-dark/20 bg-black/60 backdrop-blur-sm overflow-hidden transition-colors hover:border-tropic-gold-dark/40">
                  <div className="aspect-video overflow-hidden bg-zinc-900 relative">
                    <ModThumbnail src={mod.thumbnail_url} alt={mod.name} />
                    {issueCount > 0 && (
                      <button onClick={() => setIssuePopupMod(mod.mod_id)}
                        className="absolute top-2 right-2 bg-red-600/90 text-white rounded-full p-1 hover:bg-red-500 transition-colors"
                        title={`${issueCount} known issue(s)`}>
                        <AlertTriangle className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <CardContent className="space-y-2 p-3">
                    <h3 className="text-sm font-bold text-white leading-tight line-clamp-1">{mod.name || 'Unnamed Mod'}</h3>
                    {mod.author && <p className="text-xs text-gray-400"><span className="text-gray-500">by </span>{mod.author}</p>}
                    <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                      {mod.rating && <span className="text-tropic-gold">{mod.rating}</span>}
                      {mod.size && <span>{mod.size}</span>}
                      {mod.version && (
                        <Badge className="bg-tropic-gold/20 text-tropic-gold border-tropic-gold-dark/30 text-[10px] px-1.5 py-0">
                          v{mod.version}
                        </Badge>
                      )}
                    </div>
                    {mod.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {mod.tags.slice(0, 3).map((tag, ti) => (
                          <Badge key={ti} variant="outline" className="text-[10px] border-gray-700 text-gray-400 px-1.5 py-0">{tag}</Badge>
                        ))}
                      </div>
                    )}
                    <p className="font-mono text-[10px] text-gray-600 break-all">{mod.mod_id}</p>
                    {history && (
                      <p className="text-[10px] text-gray-600">
                        Last used by <span className="text-gray-400">{history.downloaded_by}</span>{' '}
                        {history.downloaded_at && <span>on {new Date(history.downloaded_at).toLocaleDateString()}</span>}
                      </p>
                    )}
                    <div className="flex items-center justify-between pt-1">
                      {mod.workshop_url && (
                        <a href={mod.workshop_url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-tropic-gold hover:text-tropic-gold-light transition-colors">
                          <ExternalLink className="h-3 w-3" />Workshop
                        </a>
                      )}
                      <Button size="sm" onClick={() => onDownload(mod)}
                        className="h-7 px-2 text-xs bg-tropic-gold/20 text-tropic-gold hover:bg-tropic-gold/30 border border-tropic-gold-dark/30">
                        <Download className="h-3 w-3 mr-1" />Add
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-gray-800">
              <span className="text-sm text-gray-500">Page {page} of {totalPages.toLocaleString()}</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-30">
                  <ChevronLeft className="mr-1 h-4 w-4" />Prev
                </Button>
                <div className="hidden sm:flex items-center gap-1">
                  {(() => {
                    const pages = [];
                    const maxV = 5;
                    let s = Math.max(1, page - Math.floor(maxV / 2));
                    let e = Math.min(totalPages, s + maxV - 1);
                    if (e - s < maxV - 1) s = Math.max(1, e - maxV + 1);
                    if (s > 1) {
                      pages.push(
                        <Button key={1} variant="outline" size="sm" onClick={() => setPage(1)}
                          className="border-gray-700 text-gray-300 hover:bg-gray-800 h-8 w-8 p-0">1</Button>
                      );
                      if (s > 2) pages.push(<span key="d1" className="text-gray-600 px-1">&hellip;</span>);
                    }
                    for (let i = s; i <= e; i++) {
                      pages.push(
                        <Button key={i} variant={i === page ? 'default' : 'outline'} size="sm" onClick={() => setPage(i)}
                          className={i === page
                            ? 'bg-tropic-gold text-black hover:bg-tropic-gold-light h-8 w-8 p-0'
                            : 'border-gray-700 text-gray-300 hover:bg-gray-800 h-8 w-8 p-0'}>
                          {i}
                        </Button>
                      );
                    }
                    if (e < totalPages) {
                      if (e < totalPages - 1) pages.push(<span key="d2" className="text-gray-600 px-1">&hellip;</span>);
                      pages.push(
                        <Button key={totalPages} variant="outline" size="sm" onClick={() => setPage(totalPages)}
                          className="border-gray-700 text-gray-300 hover:bg-gray-800 h-8 w-8 p-0">{totalPages}</Button>
                      );
                    }
                    return pages;
                  })()}
                </div>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                  className="border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-30">
                  Next<ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Empty */}
      {!loading && !error && mods.length === 0 && (
        <Card className="border-tropic-gold-dark/10 bg-black/60">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Package className="mb-4 h-12 w-12 text-tropic-gold-dark/40" />
            <p className="text-lg font-semibold text-gray-300">
              {isSearchMode ? 'No mods found' : 'No mods available'}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {isSearchMode ? 'Try a different search term.' : 'Workshop data is loading or temporarily unavailable.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Issue popup dialog */}
      {issuePopupMod && (
        <Dialog open={!!issuePopupMod} onOpenChange={() => setIssuePopupMod(null)}>
          <DialogContent className="bg-gray-950 border-gray-800 text-white max-w-md">
            <DialogHeader><DialogTitle className="text-red-400">Known Issues</DialogTitle></DialogHeader>
            <div className="space-y-3">
              {modIssues.filter(i => i.mod_id === issuePopupMod).map((issue, idx) => (
                <div key={idx} className="bg-red-900/20 border border-red-700/30 rounded-lg p-3 space-y-1">
                  <p className="text-sm font-medium text-red-300">{issue.error_pattern || 'Unknown error'}</p>
                  <p className="text-xs text-gray-400">
                    {issue.occurrence_count} occurrence(s) &bull; Confidence: {Math.round(issue.confidence_score * 100)}%
                  </p>
                  {issue.evidence?.[0]?.log_excerpt && (
                    <pre className="text-[10px] text-gray-500 bg-black/40 rounded p-2 mt-2 overflow-x-auto whitespace-pre-wrap">
                      {issue.evidence[0].log_excerpt}
                    </pre>
                  )}
                </div>
              ))}
              {modIssues.filter(i => i.mod_id === issuePopupMod).length === 0 && (
                <p className="text-sm text-gray-400">No detailed issue information available.</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// REORDER TAB — Drag-and-drop mod ordering
// ═══════════════════════════════════════════════════════════════════════════
function ReorderTab({ mods, setMods, hasUnsavedChanges, onSave, saving, getModIssueCount }) {
  const moveMod = (index, direction) => {
    const newMods = [...mods];
    const target = index + direction;
    if (target < 0 || target >= newMods.length) return;
    [newMods[index], newMods[target]] = [newMods[target], newMods[index]];
    setMods(newMods);
  };

  const removeMod = (index) => {
    setMods(mods.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      {/* Save bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">{mods.length} mod{mods.length !== 1 ? 's' : ''} in load order</p>
        <Button onClick={onSave} disabled={saving || !hasUnsavedChanges}
          className={`transition-all ${hasUnsavedChanges
            ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-600/30 animate-pulse'
            : 'bg-gray-800 text-gray-500'}`}>
          {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
          Save Order
        </Button>
      </div>

      {/* Mod list */}
      {mods.length === 0 ? (
        <Card className="border-gray-800 bg-black/40">
          <CardContent className="py-12 text-center text-gray-500">
            <List className="mx-auto h-10 w-10 mb-3 opacity-30" />
            <p>No mods configured. Browse the Workshop tab to add mods.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1">
          {mods.map((mod, index) => {
            const modId = mod.mod_id || mod.modId || '';
            const issueCount = getModIssueCount(modId);
            return (
              <div key={`${modId}-${index}`}
                className="flex items-center gap-3 bg-black/40 border border-gray-800 rounded-lg px-3 py-2.5 hover:border-gray-700 transition-colors group">
                <GripVertical className="h-4 w-4 text-gray-600 shrink-0" />
                <span className="text-xs font-mono text-gray-600 w-8 text-right shrink-0">#{index + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate font-medium">{mod.name || 'Unnamed'}</p>
                  <p className="font-mono text-[10px] text-gray-500 truncate">{modId}</p>
                </div>
                {issueCount > 0 && (
                  <Badge className="bg-red-600/20 text-red-400 border-red-600/30 text-[10px] gap-1">
                    <AlertTriangle className="h-3 w-3" />{issueCount}
                  </Badge>
                )}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="sm" onClick={() => moveMod(index, -1)} disabled={index === 0}
                    className="h-7 w-7 p-0 text-gray-500 hover:text-white disabled:opacity-20">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => moveMod(index, 1)} disabled={index === mods.length - 1}
                    className="h-7 w-7 p-0 text-gray-500 hover:text-white disabled:opacity-20">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => removeMod(index)}
                    className="h-7 w-7 p-0 text-gray-500 hover:text-red-400">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Hint */}
      <div className="bg-amber-900/15 border border-amber-700/25 rounded-lg px-4 py-3 text-sm text-amber-300/80 flex items-start gap-3">
        <Info className="h-5 w-5 shrink-0 mt-0.5 text-amber-400" />
        <div>
          <p className="font-medium text-amber-200">Mods are loaded in reverse order</p>
          <p className="text-xs text-gray-400 mt-1">
            The last mod in the list is loaded first by the server. Keep dependencies higher (earlier) in the list.
          </p>
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// BATCH TAB — Spreadsheet-like editing
// ═══════════════════════════════════════════════════════════════════════════
function BatchTab({ mods, setMods, hasUnsavedChanges, onSave, saving, getModIssueCount }) {
  const [selected, setSelected] = useState(new Set());

  const toggleSelect = (index) => {
    const next = new Set(selected);
    if (next.has(index)) next.delete(index); else next.add(index);
    setSelected(next);
  };

  const toggleSelectAll = () => {
    if (selected.size === mods.length) setSelected(new Set());
    else setSelected(new Set(mods.map((_, i) => i)));
  };

  const removeSelected = () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Remove ${selected.size} mod(s)?`)) return;
    setMods(mods.filter((_, i) => !selected.has(i)));
    setSelected(new Set());
  };

  const moveSelectedToTop = () => {
    if (selected.size === 0) return;
    const sel = mods.filter((_, i) => selected.has(i));
    const rest = mods.filter((_, i) => !selected.has(i));
    setMods([...sel, ...rest]);
    setSelected(new Set(sel.map((_, i) => i)));
  };

  const moveSelectedToBottom = () => {
    if (selected.size === 0) return;
    const sel = mods.filter((_, i) => selected.has(i));
    const rest = mods.filter((_, i) => !selected.has(i));
    setMods([...rest, ...sel]);
    setSelected(new Set(sel.map((_, i) => rest.length + i)));
  };

  const updateModField = (index, field, value) => {
    const next = [...mods];
    next[index] = { ...next[index], [field]: value };
    setMods(next);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">{selected.size} of {mods.length} selected</span>
          {selected.size > 0 && (
            <>
              <Button size="sm" variant="outline" onClick={moveSelectedToTop}
                className="border-gray-700 text-gray-300 hover:bg-gray-800 h-7 text-xs">
                <ChevronUp className="h-3 w-3 mr-1" />Move Top
              </Button>
              <Button size="sm" variant="outline" onClick={moveSelectedToBottom}
                className="border-gray-700 text-gray-300 hover:bg-gray-800 h-7 text-xs">
                <ChevronDown className="h-3 w-3 mr-1" />Move Bottom
              </Button>
              <Button size="sm" variant="outline" onClick={removeSelected}
                className="border-red-800/50 text-red-400 hover:bg-red-900/20 h-7 text-xs">
                <Trash2 className="h-3 w-3 mr-1" />Remove
              </Button>
            </>
          )}
        </div>
        <Button onClick={onSave} disabled={saving || !hasUnsavedChanges}
          className={`transition-all ${hasUnsavedChanges
            ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-600/30 animate-pulse'
            : 'bg-gray-800 text-gray-500'}`}>
          {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
          Save Changes
        </Button>
      </div>

      {/* Table */}
      {mods.length === 0 ? (
        <Card className="border-gray-800 bg-black/40">
          <CardContent className="py-12 text-center text-gray-500">
            <Hash className="mx-auto h-10 w-10 mb-3 opacity-30" />
            <p>No mods configured. Use the Workshop tab or Import JSON to add mods.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-black/60 border-b border-gray-800">
                <th className="w-10 px-3 py-2">
                  <input type="checkbox" checked={selected.size === mods.length && mods.length > 0}
                    onChange={toggleSelectAll} className="accent-tropic-gold" />
                </th>
                <th className="w-12 px-2 py-2 text-left text-xs text-gray-500 font-medium">#</th>
                <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">Mod ID</th>
                <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">Name</th>
                <th className="w-24 px-3 py-2 text-left text-xs text-gray-500 font-medium">Version</th>
                <th className="w-10 px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {mods.map((mod, index) => {
                const modId = mod.mod_id || mod.modId || '';
                const issueCount = getModIssueCount(modId);
                return (
                  <tr key={`${modId}-${index}`}
                    className={`border-b border-gray-800/50 hover:bg-gray-900/50 transition-colors ${
                      selected.has(index) ? 'bg-tropic-gold/5' : ''
                    }`}>
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={selected.has(index)}
                        onChange={() => toggleSelect(index)} className="accent-tropic-gold" />
                    </td>
                    <td className="px-2 py-2 font-mono text-xs text-gray-600">{index + 1}</td>
                    <td className="px-3 py-2">
                      <span className="text-gray-300 font-mono text-xs">{modId}</span>
                    </td>
                    <td className="px-3 py-2">
                      <input type="text" value={mod.name || ''} onChange={(e) => updateModField(index, 'name', e.target.value)}
                        className="bg-transparent border-0 text-white text-sm w-full focus:outline-none focus:bg-gray-900/50 rounded px-1 -mx-1" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="text" value={mod.version || ''} onChange={(e) => updateModField(index, 'version', e.target.value)}
                        className="bg-transparent border-0 text-gray-400 text-xs w-full focus:outline-none focus:bg-gray-900/50 rounded px-1 -mx-1 font-mono" />
                    </td>
                    <td className="px-2 py-2">
                      {issueCount > 0 && (
                        <AlertTriangle className="h-4 w-4 text-red-400" title={`${issueCount} known issue(s)`} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Hint */}
      <div className="bg-amber-900/15 border border-amber-700/25 rounded-lg px-4 py-3 text-sm text-amber-300/80 flex items-start gap-3">
        <Info className="h-5 w-5 shrink-0 mt-0.5 text-amber-400" />
        <div>
          <p className="font-medium text-amber-200">Batch editing</p>
          <p className="text-xs text-gray-400 mt-1">
            Select multiple mods to move or remove them in bulk. Click on name or version fields to edit inline.
            Remember: mods are loaded in reverse order.
          </p>
        </div>
      </div>
    </div>
  );
}

export default WorkshopBrowser;

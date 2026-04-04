import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle,
  Download,
  FileJson,
  History,
  Loader2,
  Package,
  Plus,
  Puzzle,
  RefreshCw,
  Save,
  Search,
  Shield,
  Trash2,
  Upload,
} from 'lucide-react';
import { API } from '@/utils/api';

const WORKSHOP_CATEGORY_MAP = {
  popularity: 'popular',
  newest: 'newest',
  subscribers: 'subscribers',
  versionSize: 'versionSize',
};

function normalizeModEntry(mod) {
  const modId = mod.mod_id || mod.modId || '';
  return {
    ...mod,
    mod_id: modId,
    modId: modId,
    name: mod.name || modId,
    enabled: mod.enabled !== false,
  };
}

function parseImportPayload(raw) {
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.mods)) return parsed.mods;
  return [];
}

function toModPayload(mod) {
  return {
    mod_id: mod.mod_id,
    modId: mod.mod_id,
    name: mod.name,
    enabled: mod.enabled,
    version: mod.version,
    author: mod.author,
    description: mod.description,
    tags: mod.tags,
    dependencies: mod.dependencies,
    scenario_ids: mod.scenario_ids,
    thumbnail_url: mod.thumbnail_url,
    metadata_source: mod.metadata_source,
    system_managed: mod.system_managed === true,
  };
}

function ModsModule() {
  const { server, serverId, fetchServer, canManage } = useOutletContext();
  const [activeTab, setActiveTab] = useState('workshop');
  const [enabledMods, setEnabledMods] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationIssues, setValidationIssues] = useState([]);

  const [workshopMods, setWorkshopMods] = useState([]);
  const [workshopSearch, setWorkshopSearch] = useState('');
  const [workshopSort, setWorkshopSort] = useState('popularity');
  const [workshopTags, setWorkshopTags] = useState('');
  const [workshopLoading, setWorkshopLoading] = useState(false);

  const [downloadHistory, setDownloadHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedMod, setSelectedMod] = useState(null);

  const [importPayload, setImportPayload] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [exportPayload, setExportPayload] = useState('');
  const [exporting, setExporting] = useState(false);
  const systemManagedMods = useMemo(
    () => (server?.mods || []).map(normalizeModEntry).filter((mod) => mod.system_managed),
    [server?.mods],
  );

  useEffect(() => {
    if (!dirty) {
      setEnabledMods((server?.mods || []).map(normalizeModEntry).filter((mod) => !mod.system_managed));
    }
  }, [server?.mods, dirty]);

  const fetchDownloadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await axios.get(`${API}/servers/mod-download-history`);
      setDownloadHistory(res.data || []);
    } catch {
      setDownloadHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const searchWorkshop = useCallback(async () => {
    setWorkshopLoading(true);
    try {
      const params = {
        page: 1,
        sort: workshopSort,
      };
      if (workshopTags.trim()) params.tags = workshopTags;

      const response = workshopSearch.trim()
        ? await axios.get(`${API}/workshop/search`, { params: { ...params, q: workshopSearch.trim() } })
        : await axios.get(`${API}/workshop/browse`, {
            params: {
              category: WORKSHOP_CATEGORY_MAP[workshopSort] || 'popular',
              page: 1,
              tags: workshopTags.trim() || undefined,
            },
          });
      setWorkshopMods(response.data?.mods || []);
    } catch {
      setWorkshopMods([]);
    } finally {
      setWorkshopLoading(false);
    }
  }, [workshopSearch, workshopSort, workshopTags]);

  useEffect(() => {
    searchWorkshop();
  }, [searchWorkshop]);

  useEffect(() => {
    fetchDownloadHistory();
  }, [fetchDownloadHistory]);

  const addMod = useCallback((mod) => {
    const normalized = normalizeModEntry(mod);
    if (!normalized.mod_id) return;
    setEnabledMods((prev) => (
      [...systemManagedMods, ...prev].some((entry) => entry.mod_id === normalized.mod_id)
        ? prev
        : [...prev, normalized]
    ));
    setDirty(true);
  }, [systemManagedMods]);

  const moveMod = useCallback((index, delta) => {
    setEnabledMods((prev) => {
      const nextIndex = index + delta;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const clone = [...prev];
      [clone[index], clone[nextIndex]] = [clone[nextIndex], clone[index]];
      return clone;
    });
    setDirty(true);
  }, []);

  const toggleMod = useCallback((index) => {
    setEnabledMods((prev) => prev.map((mod, current) => (
      current === index ? { ...mod, enabled: !mod.enabled } : mod
    )));
    setDirty(true);
  }, []);

  const removeMod = useCallback((index) => {
    setEnabledMods((prev) => prev.filter((_, current) => current !== index));
    setDirty(true);
  }, []);

  const saveMods = useCallback(async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/servers/${serverId}/mods`, {
        mods: [...systemManagedMods, ...enabledMods].map(toModPayload),
      });
      setDirty(false);
      await fetchServer(true);
      await fetchDownloadHistory();
    } finally {
      setSaving(false);
    }
  }, [enabledMods, fetchDownloadHistory, fetchServer, serverId, systemManagedMods]);

  const validateMods = useCallback(async () => {
    setValidating(true);
    try {
      const res = await axios.post(`${API}/servers/${serverId}/mods/validate`, {
        mods: enabledMods.map((mod) => ({ mod_id: mod.mod_id, name: mod.name })),
      });
      setValidationIssues(res.data?.issues || []);
    } catch {
      setValidationIssues([{ message: 'Validation endpoint is unavailable.' }]);
    } finally {
      setValidating(false);
    }
  }, [enabledMods, serverId]);

  const openModDetail = useCallback(async (mod) => {
    setSelectedMod(normalizeModEntry(mod));
    setDetailOpen(true);
    try {
      const res = await axios.get(`${API}/servers/workshop/mod/${mod.mod_id || mod.modId}`);
      setSelectedMod((current) => ({ ...current, ...normalizeModEntry(res.data) }));
    } catch {
      // Keep current metadata when enrichment is unavailable.
    }
  }, []);

  const exportMods = useCallback(async () => {
    setExporting(true);
    try {
      const res = await axios.get(`${API}/servers/${serverId}/mods/export-json`);
      setExportPayload(JSON.stringify(res.data, null, 2));
    } finally {
      setExporting(false);
    }
  }, [serverId]);

  const importMods = useCallback(async () => {
    setImportError('');
    setImporting(true);
    try {
      const mods = parseImportPayload(importPayload);
      await axios.post(`${API}/servers/${serverId}/mods/import-json`, { mods });
      setDirty(false);
      await fetchServer(true);
      await fetchDownloadHistory();
    } catch (error) {
      setImportError(error?.response?.data?.detail || 'Import failed. Use a JSON array or an object with a "mods" array.');
    } finally {
      setImporting(false);
    }
  }, [fetchDownloadHistory, fetchServer, importPayload, serverId]);

  const enabledCount = useMemo(
    () => enabledMods.filter((mod) => mod.enabled).length,
    [enabledMods],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-[0.24em] text-[#d0d8e0]" style={{ fontFamily: "'Share Tech', sans-serif" }}>
            MODS WORKSPACE
          </h2>
          <p className="mt-1 text-xs text-[#4a6070]">
            Browse the live workshop, curate load order, and batch import or export server assignments without leaving the dashboard.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {systemManagedMods.length > 0 && (
            <Badge variant="outline" className="border-blue-600/30 text-blue-300">
              {systemManagedMods.length} system-managed admin tool mod{systemManagedMods.length > 1 ? 's' : ''}
            </Badge>
          )}
          {dirty && (
            <Badge variant="outline" className="border-amber-500/30 text-amber-300">
              Unsaved load order changes
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={validateMods} disabled={validating} className="h-8 border-zinc-800 text-xs text-[#8a9aa8]">
            {validating ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Shield className="mr-1 h-3.5 w-3.5" />}
            Validate
          </Button>
          <Button
            size="sm"
            onClick={saveMods}
            disabled={!dirty || saving || !canManage}
            className="h-8 bg-tropic-gold text-black transition-all hover:bg-tropic-gold-light hover:shadow-[0_0_18px_rgba(201,162,39,0.24)]"
          >
            {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
            Deploy load order
          </Button>
        </div>
      </div>

      {validationIssues.length > 0 && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
          {validationIssues.map((issue, index) => (
            <div key={`${issue.message || issue.type}-${index}`} className="text-xs text-amber-200">
              {issue.message || issue.type}
            </div>
          ))}
        </div>
      )}

      {systemManagedMods.length > 0 && (
        <div className="rounded-lg border border-blue-600/20 bg-blue-600/5 p-3 text-xs text-blue-200">
          Admin tool dependencies such as Server Admin Tools are system-managed. They stay in the deployed config, but they are hidden from the editable load order here so users do not accidentally break dashboard features.
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid h-auto grid-cols-3 rounded-xl border border-zinc-800 bg-[#050a0e]/60 p-1">
          <TabsTrigger value="workshop" className="data-[state=active]:bg-tropic-gold data-[state=active]:text-black">Workshop</TabsTrigger>
          <TabsTrigger value="load-order" className="data-[state=active]:bg-tropic-gold data-[state=active]:text-black">Load Order</TabsTrigger>
          <TabsTrigger value="batch" className="data-[state=active]:bg-tropic-gold data-[state=active]:text-black">Batch</TabsTrigger>
        </TabsList>

        <TabsContent value="workshop" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <Card className="border-zinc-800 bg-[#050a0e]/60">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm tracking-[0.16em] text-[#d0d8e0]">
                  <Package className="h-4 w-4 text-tropic-gold" /> LIVE WORKSHOP BROWSER
                </CardTitle>
                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_160px_160px_auto]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#4a6070]" />
                    <Input
                      value={workshopSearch}
                      onChange={(event) => setWorkshopSearch(event.target.value)}
                      onKeyDown={(event) => event.key === 'Enter' && searchWorkshop()}
                      placeholder="Search mods or paste a mod ID"
                      className="h-9 border-zinc-800 bg-[#050a0e]/50 pl-9 text-sm text-white placeholder:text-[#4a6070]"
                    />
                  </div>
                  <select
                    value={workshopSort}
                    onChange={(event) => setWorkshopSort(event.target.value)}
                    className="h-9 rounded-md border border-zinc-800 bg-[#050a0e]/50 px-3 text-sm text-white"
                  >
                    <option value="popularity">Popularity</option>
                    <option value="newest">Newest</option>
                    <option value="subscribers">Subscribers</option>
                    <option value="versionSize">Version size</option>
                  </select>
                  <Input
                    value={workshopTags}
                    onChange={(event) => setWorkshopTags(event.target.value)}
                    placeholder="Tags (comma separated)"
                    className="h-9 border-zinc-800 bg-[#050a0e]/50 text-sm text-white placeholder:text-[#4a6070]"
                  />
                  <Button size="sm" onClick={searchWorkshop} className="h-9 bg-tropic-gold text-black hover:bg-tropic-gold-light">
                    {workshopLoading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {workshopLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-tropic-gold" />
                  </div>
                ) : workshopMods.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-[#4a6070]">
                    <Package className="mb-3 h-8 w-8 text-[#4a6070]" />
                    <p className="text-sm">No workshop results yet.</p>
                    <p className="mt-1 text-xs">Search by mod name, tag, or ID to pull live Workshop results into the dashboard.</p>
                  </div>
                ) : (
                  workshopMods.map((mod) => {
                    const isAdded = [...systemManagedMods, ...enabledMods].some((entry) => entry.mod_id === mod.mod_id);
                    return (
                      <div key={mod.mod_id} className="flex items-center gap-3 rounded-xl border border-zinc-800/70 bg-zinc-950/70 p-3">
                        {mod.thumbnail_url ? (
                          <img src={mod.thumbnail_url} alt="" className="h-14 w-14 rounded-lg object-cover" />
                        ) : (
                          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-zinc-900">
                            <Puzzle className="h-5 w-5 text-[#4a6070]" />
                          </div>
                        )}
                        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openModDetail(mod)}>
                          <div className="truncate text-sm font-medium text-[#d0d8e0]">{mod.name || mod.mod_id}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[#4a6070]">
                            <span className="font-mono text-[#4a6070]">{mod.mod_id}</span>
                            {mod.author && <span>by {mod.author}</span>}
                            {mod.tags?.slice(0, 2).map((tag) => (
                              <Badge key={tag} variant="outline" className="border-zinc-700 text-[10px] text-[#8a9aa8]">{tag}</Badge>
                            ))}
                          </div>
                        </button>
                        <Button
                          size="sm"
                          onClick={() => addMod(mod)}
                          disabled={isAdded}
                          className={isAdded ? 'h-8 border border-green-500/30 bg-transparent text-green-300' : 'h-8 bg-tropic-gold text-black hover:bg-tropic-gold-light'}
                        >
                          {isAdded ? <CheckCircle className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-[#050a0e]/60">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm tracking-[0.16em] text-[#d0d8e0]">
                  <History className="h-4 w-4 text-tropic-gold" /> DOWNLOAD HISTORY
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {historyLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-tropic-gold" />
                  </div>
                ) : downloadHistory.length === 0 ? (
                  <p className="text-xs text-[#4a6070]">No mod download history has been recorded yet.</p>
                ) : (
                  downloadHistory.slice(0, 12).map((entry) => (
                    <div key={`${entry.mod_id}-${entry.server_id}-${entry.downloaded_at}`} className="rounded-xl border border-zinc-800/70 bg-zinc-950/70 p-3">
                      <div className="text-sm text-[#d0d8e0]">{entry.mod_name || entry.mod_id}</div>
                      <div className="mt-1 text-[11px] text-[#4a6070]">
                        {entry.server_id} • {entry.downloaded_by || 'Unknown operator'}
                      </div>
                      <div className="mt-1 text-[11px] text-[#4a6070]">
                        {entry.downloaded_at ? new Date(entry.downloaded_at).toLocaleString() : 'Unknown time'}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="load-order" className="space-y-4">
          <Card className="border-zinc-800 bg-[#050a0e]/60">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm tracking-[0.16em] text-[#d0d8e0]">
                <Puzzle className="h-4 w-4 text-tropic-gold" /> LOAD ORDER
                <Badge variant="outline" className="ml-auto border-zinc-700 text-[#8a9aa8]">{enabledCount}/{enabledMods.length} enabled</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {enabledMods.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-[#4a6070]">
                  <Puzzle className="mb-3 h-8 w-8 text-[#4a6070]" />
                  <p className="text-sm">No mods are assigned to this server yet.</p>
                  <p className="mt-1 text-xs">Use the Workshop tab to browse live results and add them to the deployment list.</p>
                </div>
              ) : (
                enabledMods.map((mod, index) => (
                  <div key={mod.mod_id || index} className="flex items-center gap-3 rounded-xl border border-zinc-800/70 bg-zinc-950/70 p-3">
                    <div className="flex flex-col gap-1">
                      <button type="button" onClick={() => moveMod(index, -1)} disabled={index === 0} className="text-[#4a6070] hover:text-white disabled:opacity-30">
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => moveMod(index, 1)} disabled={index === enabledMods.length - 1} className="text-[#4a6070] hover:text-white disabled:opacity-30">
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="w-8 text-center text-xs text-[#4a6070]">{index + 1}</div>
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openModDetail(mod)}>
                      <div className="truncate text-sm font-medium text-[#d0d8e0]">{mod.name}</div>
                      <div className="mt-1 text-[11px] font-mono text-[#4a6070]">{mod.mod_id}</div>
                    </button>
                    <Switch checked={mod.enabled} onCheckedChange={() => toggleMod(index)} className="h-5 w-9" />
                    <Button size="icon" variant="ghost" onClick={() => removeMod(index)} className="h-8 w-8 text-[#4a6070] hover:text-red-400">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="batch" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="border-zinc-800 bg-[#050a0e]/60">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm tracking-[0.16em] text-[#d0d8e0]">
                  <Upload className="h-4 w-4 text-tropic-gold" /> IMPORT JSON
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={importPayload}
                  onChange={(event) => setImportPayload(event.target.value)}
                  placeholder='Paste a JSON array of mods or an object with a "mods" array'
                  rows={12}
                  className="border-zinc-800 bg-[#050a0e]/50 font-mono text-xs text-white"
                />
                {importError && <p className="text-xs text-red-400">{importError}</p>}
                <Button size="sm" onClick={importMods} disabled={!importPayload.trim() || importing} className="bg-tropic-gold text-black hover:bg-tropic-gold-light">
                  {importing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1 h-3.5 w-3.5" />}
                  Replace server mod list
                </Button>
              </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-[#050a0e]/60">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm tracking-[0.16em] text-[#d0d8e0]">
                  <FileJson className="h-4 w-4 text-tropic-gold" /> EXPORT + REUSE
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Button size="sm" onClick={exportMods} disabled={exporting} className="bg-tropic-gold text-black hover:bg-tropic-gold-light">
                    {exporting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
                    Refresh export
                  </Button>
                </div>
                <Textarea
                  value={exportPayload}
                  onChange={(event) => setExportPayload(event.target.value)}
                  placeholder="Exported mod payload will appear here"
                  rows={12}
                  className="border-zinc-800 bg-[#050a0e]/50 font-mono text-xs text-white"
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg border-zinc-800 bg-zinc-950 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-tropic-gold">
              <Puzzle className="h-5 w-5" />
              {selectedMod?.name || selectedMod?.mod_id || 'Mod details'}
            </DialogTitle>
          </DialogHeader>
          {selectedMod && (
            <div className="space-y-4">
              {selectedMod.thumbnail_url && (
                <img src={selectedMod.thumbnail_url} alt="" className="h-36 w-full rounded-xl object-cover" />
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailItem label="Mod ID" value={selectedMod.mod_id} mono />
                <DetailItem label="Author" value={selectedMod.author || 'Unknown'} />
                <DetailItem label="Version" value={selectedMod.version || 'Latest'} />
                <DetailItem label="Source" value={selectedMod.metadata_source || 'Unknown'} />
              </div>
              {selectedMod.description && (
                <div>
                  <div className="text-xs font-medium text-[#4a6070]">Description</div>
                  <p className="mt-1 text-sm text-[#8a9aa8]">{selectedMod.description}</p>
                </div>
              )}
              {!!selectedMod.dependencies?.length && (
                <div>
                  <div className="text-xs font-medium text-[#4a6070]">Dependencies</div>
                  <div className="mt-1 space-y-1">
                    {selectedMod.dependencies.map((dependency, index) => (
                      <div key={`${selectedMod.mod_id}-dep-${index}`} className="text-xs text-[#8a9aa8]">
                        {dependency.mod_id || dependency.modId || dependency.name || JSON.stringify(dependency)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <Button size="sm" onClick={() => addMod(selectedMod)} className="bg-tropic-gold text-black hover:bg-tropic-gold-light">
                <Plus className="mr-1 h-3.5 w-3.5" /> Add to load order
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailItem({ label, value, mono }) {
  return (
    <div>
      <div className="text-[11px] font-medium text-[#4a6070]">{label}</div>
      <div className={`text-sm text-[#d0d8e0] ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

export default ModsModule;

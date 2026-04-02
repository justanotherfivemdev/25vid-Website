import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  Puzzle,
  Search,
  Plus,
  Trash2,
  GripVertical,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  ExternalLink,
  Shield,
  ChevronRight,
  Loader2,
  Save,
  Eye,
  XCircle,
  ArrowUp,
  ArrowDown,
  Package,
  Info,
  Star,
  Clock,
  BarChart3,
} from 'lucide-react';
import { API } from '@/utils/api';

const STABILITY_COLORS = {
  A: 'bg-green-600/20 text-green-400 border-green-600/30',
  B: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
  C: 'bg-amber-600/20 text-amber-400 border-amber-600/30',
  D: 'bg-orange-600/20 text-orange-400 border-orange-600/30',
  F: 'bg-red-600/20 text-red-400 border-red-600/30',
};

const RISK_COLORS = {
  low: 'text-green-400',
  medium: 'text-amber-400',
  high: 'text-orange-400',
  critical: 'text-red-400',
};

function ModsModule() {
  const { server, serverId, fetchServer, canManage } = useOutletContext();
  const [enabledMods, setEnabledMods] = useState([]);
  const [workshopMods, setWorkshopMods] = useState([]);
  const [workshopSearch, setWorkshopSearch] = useState('');
  const [workshopLoading, setWorkshopLoading] = useState(false);
  const [modIntel, setModIntel] = useState({});
  const [selectedMod, setSelectedMod] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [addByIdOpen, setAddByIdOpen] = useState(false);
  const [newModId, setNewModId] = useState('');
  const [validating, setValidating] = useState(false);
  const [validationIssues, setValidationIssues] = useState([]);
  const [manualEditOpen, setManualEditOpen] = useState(false);
  const [manualMod, setManualMod] = useState({ mod_id: '', name: '', author: '', description: '' });

  // Init enabled mods from server
  useEffect(() => {
    setEnabledMods((server?.mods || []).map((m, i) => ({
      ...m,
      _idx: i,
      enabled: m.enabled !== false,
    })));
  }, [server?.mods]);

  // Fetch workshop mods
  const searchWorkshop = useCallback(async (query) => {
    setWorkshopLoading(true);
    try {
      const res = await axios.get(`${API}/servers/workshop/search`, { params: { q: query || '', page: 1, per_page: 20 } });
      setWorkshopMods(res.data?.mods || []);
    } catch {
      setWorkshopMods([]);
    } finally {
      setWorkshopLoading(false);
    }
  }, []);

  useEffect(() => { searchWorkshop(''); }, [searchWorkshop]);

  // Fetch mod intelligence data
  useEffect(() => {
    axios.get(`${API}/servers/mod-issues?status=active`)
      .then(res => {
        const issues = res.data?.issues || res.data || [];
        const intel = {};
        issues.forEach(issue => {
          if (issue.mod_id) {
            if (!intel[issue.mod_id]) intel[issue.mod_id] = { issues: [], errorCount: 0, confidence: 0 };
            intel[issue.mod_id].issues.push(issue);
            intel[issue.mod_id].errorCount += issue.occurrence_count || 1;
            intel[issue.mod_id].confidence = Math.max(intel[issue.mod_id].confidence, issue.confidence_score || 0);
          }
        });
        setModIntel(intel);
      })
      .catch(() => {});
  }, []);

  const getStabilityRating = (modId) => {
    const intel = modIntel[modId];
    if (!intel) return 'A';
    if (intel.errorCount > 20 || intel.confidence > 0.8) return 'F';
    if (intel.errorCount > 10 || intel.confidence > 0.6) return 'D';
    if (intel.errorCount > 5 || intel.confidence > 0.4) return 'C';
    if (intel.errorCount > 2) return 'B';
    return 'A';
  };

  const getRiskLevel = (modId) => {
    const intel = modIntel[modId];
    if (!intel) return 'low';
    if (intel.errorCount > 20 || intel.confidence > 0.8) return 'critical';
    if (intel.errorCount > 10 || intel.confidence > 0.6) return 'high';
    if (intel.errorCount > 5) return 'medium';
    return 'low';
  };

  // Move mod up/down
  const moveMod = useCallback((idx, dir) => {
    setEnabledMods(prev => {
      const arr = [...prev];
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= arr.length) return prev;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr;
    });
    setDirty(true);
  }, []);

  // Toggle mod enabled
  const toggleMod = useCallback((idx) => {
    setEnabledMods(prev => prev.map((m, i) => i === idx ? { ...m, enabled: !m.enabled } : m));
    setDirty(true);
  }, []);

  // Remove mod
  const removeMod = useCallback((idx) => {
    setEnabledMods(prev => prev.filter((_, i) => i !== idx));
    setDirty(true);
  }, []);

  // Add mod from workshop
  const addMod = useCallback((mod) => {
    setEnabledMods(prev => {
      if (prev.some(m => (m.mod_id || m.modId) === mod.mod_id)) return prev;
      return [...prev, { mod_id: mod.mod_id, modId: mod.mod_id, name: mod.name || mod.mod_id, version: mod.version || '', enabled: true }];
    });
    setDirty(true);
  }, []);

  // Add mod by ID
  const addModById = useCallback(async () => {
    const id = newModId.trim();
    if (!id) return;

    // Try to fetch metadata
    try {
      await axios.post(`${API}/servers/workshop/mod/fetch`, { mod_id: id });
    } catch {
      // Proceed even if metadata fetch fails
    }

    setEnabledMods(prev => {
      if (prev.some(m => (m.mod_id || m.modId) === id)) return prev;
      return [...prev, { mod_id: id, modId: id, name: id, version: '', enabled: true }];
    });
    setDirty(true);
    setNewModId('');
    setAddByIdOpen(false);
  }, [newModId]);

  // Save mods
  const saveMods = useCallback(async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/servers/${serverId}/mods`, {
        mods: enabledMods.map(m => ({
          mod_id: m.mod_id || m.modId,
          modId: m.mod_id || m.modId,
          name: m.name,
          version: m.version || '',
          enabled: m.enabled,
        })),
      });
      setDirty(false);
      await fetchServer(true);
    } catch {
      // Error handling
    } finally {
      setSaving(false);
    }
  }, [enabledMods, serverId, fetchServer]);

  // Validate mods
  const validateMods = useCallback(async () => {
    setValidating(true);
    try {
      const res = await axios.post(`${API}/servers/${serverId}/mods/validate`, {
        mods: enabledMods.map(m => ({ mod_id: m.mod_id || m.modId, name: m.name })),
      });
      setValidationIssues(res.data?.issues || []);
    } catch {
      setValidationIssues([{ type: 'error', message: 'Validation endpoint not available' }]);
    } finally {
      setValidating(false);
    }
  }, [enabledMods, serverId]);

  // View mod detail
  const openModDetail = useCallback(async (mod) => {
    setSelectedMod(mod);
    setDetailOpen(true);
    // Try to enrich with workshop data
    try {
      const modId = mod.mod_id || mod.modId;
      const res = await axios.get(`${API}/servers/workshop/mod/${modId}`);
      setSelectedMod(prev => ({ ...prev, ...res.data }));
    } catch {
      // Use existing data
    }
  }, []);

  const enabledCount = enabledMods.filter(m => m.enabled).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-wider text-gray-300" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
          MODS MANAGER
        </h2>
        <div className="flex items-center gap-2">
          {dirty && (
            <Badge variant="outline" className="border-amber-600/30 text-amber-400 text-xs">Unsaved changes</Badge>
          )}
          <Button size="sm" variant="outline" onClick={validateMods} disabled={validating}
            className="h-7 border-zinc-800 text-xs text-gray-400">
            {validating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Shield className="mr-1 h-3 w-3" />}
            Validate
          </Button>
          <Button size="sm" onClick={saveMods} disabled={!dirty || saving}
            className="h-7 bg-tropic-gold text-black hover:bg-tropic-gold-light text-xs">
            {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
            Deploy
          </Button>
        </div>
      </div>

      {/* Validation issues */}
      {validationIssues.length > 0 && (
        <div className="rounded border border-amber-600/30 bg-amber-600/5 p-3 space-y-1">
          {validationIssues.map((issue, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>{issue.message || issue}</span>
            </div>
          ))}
        </div>
      )}

      {/* Split view */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* LEFT: Enabled Mods */}
        <Card className="border-zinc-800 bg-black/60">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wider text-gray-400">
                <Puzzle className="h-3.5 w-3.5 text-tropic-gold" />
                ENABLED MODS
                <Badge variant="outline" className="border-zinc-700 text-[10px] text-gray-500">{enabledCount}/{enabledMods.length}</Badge>
              </CardTitle>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => setAddByIdOpen(true)}
                  className="h-6 border-zinc-800 text-[10px] text-gray-400">
                  <Plus className="mr-1 h-3 w-3" /> Add by ID
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-1 max-h-[60vh] overflow-y-auto">
            {enabledMods.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-600">
                <Puzzle className="mb-2 h-8 w-8 text-gray-700" />
                <p className="text-xs">No mods enabled</p>
                <p className="mt-1 text-[10px]">Add mods from the workshop browser</p>
              </div>
            ) : (
              enabledMods.map((mod, idx) => {
                const modId = mod.mod_id || mod.modId;
                const stability = getStabilityRating(modId);
                const risk = getRiskLevel(modId);
                const intel = modIntel[modId];
                return (
                  <div key={modId || idx}
                    className={`group flex items-center gap-2 rounded border px-2 py-2 transition-colors ${
                      mod.enabled ? 'border-zinc-800/50 bg-zinc-900/30' : 'border-zinc-800/30 bg-zinc-900/10 opacity-60'
                    } hover:border-tropic-gold-dark/30`}
                  >
                    {/* Order */}
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => moveMod(idx, -1)} disabled={idx === 0}
                        className="text-gray-600 hover:text-gray-300 disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button>
                      <button onClick={() => moveMod(idx, 1)} disabled={idx === enabledMods.length - 1}
                        className="text-gray-600 hover:text-gray-300 disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button>
                    </div>

                    {/* Order number */}
                    <span className="w-5 text-center text-[10px] text-gray-600">{idx + 1}</span>

                    {/* Mod info */}
                    <button className="flex-1 text-left" onClick={() => openModDetail(mod)}>
                      <div className="text-xs font-medium text-gray-200">{mod.name || modId}</div>
                      {modId && mod.name && mod.name !== modId && (
                        <div className="text-[10px] font-mono text-gray-600">{modId}</div>
                      )}
                    </button>

                    {/* Badges */}
                    <div className="flex items-center gap-1">
                      {stability !== 'A' && (
                        <Badge variant="outline" className={`${STABILITY_COLORS[stability]} text-[9px] px-1 py-0`}>{stability}</Badge>
                      )}
                      {intel && (
                        <Badge variant="outline" className="border-red-600/30 text-red-400 text-[9px] px-1 py-0">
                          {intel.errorCount} err
                        </Badge>
                      )}
                    </div>

                    {/* Enable/disable */}
                    <Switch checked={mod.enabled} onCheckedChange={() => toggleMod(idx)}
                      className="h-4 w-7" />

                    {/* Remove */}
                    <button onClick={() => removeMod(idx)}
                      className="text-gray-600 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* RIGHT: Workshop Browser */}
        <Card className="border-zinc-800 bg-black/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wider text-gray-400">
              <Package className="h-3.5 w-3.5 text-tropic-gold" /> WORKSHOP BROWSER
            </CardTitle>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
              <Input
                value={workshopSearch}
                onChange={(e) => setWorkshopSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchWorkshop(workshopSearch)}
                placeholder="Search mods or paste mod ID…"
                className="h-8 border-zinc-800 bg-black/60 pl-9 text-xs text-white placeholder:text-gray-600"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-1 max-h-[60vh] overflow-y-auto">
            {workshopLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-tropic-gold" />
              </div>
            ) : workshopMods.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-600">
                <Search className="mb-2 h-8 w-8 text-gray-700" />
                <p className="text-xs">Search the workshop</p>
                <p className="mt-1 text-[10px]">Or paste a mod ID directly</p>
                <Button size="sm" variant="outline" onClick={() => setManualEditOpen(true)}
                  className="mt-3 h-7 border-zinc-800 text-[10px] text-gray-400">
                  <Plus className="mr-1 h-3 w-3" /> Add Manually
                </Button>
              </div>
            ) : (
              workshopMods.map((mod) => {
                const isAdded = enabledMods.some(m => (m.mod_id || m.modId) === mod.mod_id);
                const stability = getStabilityRating(mod.mod_id);
                return (
                  <div key={mod.mod_id}
                    className="flex items-center gap-3 rounded border border-zinc-800/50 bg-zinc-900/20 p-2 hover:border-tropic-gold-dark/30 transition-colors">
                    {/* Thumbnail */}
                    {mod.thumbnail_url ? (
                      <img src={mod.thumbnail_url} alt="" className="h-10 w-10 rounded object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded bg-zinc-800">
                        <Puzzle className="h-4 w-4 text-gray-600" />
                      </div>
                    )}

                    {/* Info */}
                    <button className="flex-1 text-left" onClick={() => openModDetail(mod)}>
                      <div className="text-xs font-medium text-gray-200">{mod.name || mod.mod_id}</div>
                      <div className="flex items-center gap-2 text-[10px] text-gray-500">
                        {mod.author && <span>by {mod.author}</span>}
                        <Badge variant="outline" className={`${
                          mod.metadata_source === 'workshop' ? 'border-green-600/30 text-green-400' :
                          mod.metadata_source === 'manual' ? 'border-blue-600/30 text-blue-400' :
                          'border-zinc-600/30 text-gray-500'
                        } text-[8px] px-1 py-0`}>
                          {mod.metadata_source || 'cached'}
                        </Badge>
                        {stability !== 'A' && (
                          <Badge variant="outline" className={`${STABILITY_COLORS[stability]} text-[8px] px-1 py-0`}>{stability}</Badge>
                        )}
                      </div>
                    </button>

                    {/* Add button */}
                    <Button size="sm" variant={isAdded ? 'outline' : 'default'} disabled={isAdded}
                      onClick={() => addMod(mod)}
                      className={`h-7 text-[10px] ${isAdded
                        ? 'border-green-600/30 text-green-400'
                        : 'bg-tropic-gold text-black hover:bg-tropic-gold-light'
                      }`}>
                      {isAdded ? <CheckCircle className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    </Button>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Mod Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg border-zinc-800 bg-zinc-950 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-tropic-gold">
              <Puzzle className="h-5 w-5" />
              {selectedMod?.name || selectedMod?.mod_id || 'Mod Details'}
            </DialogTitle>
          </DialogHeader>
          {selectedMod && (
            <div className="space-y-4 text-sm">
              {selectedMod.thumbnail_url && (
                <img src={selectedMod.thumbnail_url} alt="" className="h-32 w-full rounded object-cover" />
              )}
              <div className="grid grid-cols-2 gap-3">
                <DetailItem label="Mod ID" value={selectedMod.mod_id || selectedMod.modId} mono />
                <DetailItem label="Author" value={selectedMod.author || '—'} />
                <DetailItem label="Version" value={selectedMod.version || '—'} />
                <DetailItem label="Source" value={selectedMod.metadata_source || '—'} />
              </div>
              {selectedMod.description && (
                <div>
                  <span className="text-xs font-medium text-gray-500">Description</span>
                  <p className="mt-1 text-xs text-gray-400">{selectedMod.description}</p>
                </div>
              )}

              {/* Intelligence Data */}
              {modIntel[selectedMod.mod_id || selectedMod.modId] && (
                <div className="rounded border border-red-600/20 bg-red-600/5 p-3 space-y-2">
                  <div className="text-xs font-semibold text-red-400 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> Intelligence Data
                  </div>
                  {modIntel[selectedMod.mod_id || selectedMod.modId].issues.map((issue, i) => (
                    <div key={i} className="text-[10px] text-gray-400">
                      <span className="text-gray-300">{issue.error_pattern}</span>
                      <span className="ml-2 text-gray-600">×{issue.occurrence_count}</span>
                      <span className="ml-2 text-gray-600">confidence: {(issue.confidence_score * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Dependencies */}
              {selectedMod.dependencies?.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-gray-500">Dependencies</span>
                  <div className="mt-1 space-y-1">
                    {selectedMod.dependencies.map((dep, i) => (
                      <div key={i} className="text-xs text-gray-400 font-mono">{dep.mod_id || dep.name || JSON.stringify(dep)}</div>
                    ))}
                  </div>
                </div>
              )}

              {/* Scenario IDs */}
              {selectedMod.scenario_ids?.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-gray-500">Scenario IDs</span>
                  <div className="mt-1 space-y-1">
                    {selectedMod.scenario_ids.map((sid, i) => (
                      <div key={i} className="text-xs text-gray-400 font-mono">{sid}</div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button size="sm" onClick={() => addMod(selectedMod)}
                  className="bg-tropic-gold text-black hover:bg-tropic-gold-light text-xs">
                  <Plus className="mr-1 h-3 w-3" /> Add to Server
                </Button>
                <Button size="sm" variant="outline"
                  onClick={async () => {
                    try { await axios.post(`${API}/servers/workshop/mod/${selectedMod.mod_id}/refresh`); }
                    catch { /* ignore */ }
                  }}
                  className="border-zinc-800 text-xs text-gray-400">
                  <RefreshCw className="mr-1 h-3 w-3" /> Refresh Metadata
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add by ID Dialog */}
      <Dialog open={addByIdOpen} onOpenChange={setAddByIdOpen}>
        <DialogContent className="max-w-sm border-zinc-800 bg-zinc-950 text-white">
          <DialogHeader>
            <DialogTitle className="text-tropic-gold">Add Mod by ID</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-gray-400">Paste a 16-hex mod ID to add it to the server.</p>
          <Input value={newModId} onChange={(e) => setNewModId(e.target.value)}
            placeholder="e.g. 5965550B0AA3F466"
            className="border-zinc-800 bg-black/60 font-mono text-sm text-white placeholder:text-gray-600" />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setAddByIdOpen(false)}
              className="border-zinc-700 text-gray-400">Cancel</Button>
            <Button size="sm" onClick={addModById} disabled={!newModId.trim()}
              className="bg-tropic-gold text-black hover:bg-tropic-gold-light">Add Mod</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manual Edit Dialog */}
      <Dialog open={manualEditOpen} onOpenChange={setManualEditOpen}>
        <DialogContent className="max-w-md border-zinc-800 bg-zinc-950 text-white">
          <DialogHeader>
            <DialogTitle className="text-tropic-gold">Add Mod Manually</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400">Mod ID *</label>
              <Input value={manualMod.mod_id} onChange={(e) => setManualMod(p => ({ ...p, mod_id: e.target.value }))}
                placeholder="16-hex mod ID" className="mt-1 border-zinc-800 bg-black/60 font-mono text-sm text-white" />
            </div>
            <div>
              <label className="text-xs text-gray-400">Name</label>
              <Input value={manualMod.name} onChange={(e) => setManualMod(p => ({ ...p, name: e.target.value }))}
                className="mt-1 border-zinc-800 bg-black/60 text-sm text-white" />
            </div>
            <div>
              <label className="text-xs text-gray-400">Author</label>
              <Input value={manualMod.author} onChange={(e) => setManualMod(p => ({ ...p, author: e.target.value }))}
                className="mt-1 border-zinc-800 bg-black/60 text-sm text-white" />
            </div>
            <div>
              <label className="text-xs text-gray-400">Description</label>
              <Textarea value={manualMod.description} onChange={(e) => setManualMod(p => ({ ...p, description: e.target.value }))}
                className="mt-1 border-zinc-800 bg-black/60 text-sm text-white" rows={3} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setManualEditOpen(false)}
              className="border-zinc-700 text-gray-400">Cancel</Button>
            <Button size="sm" disabled={!manualMod.mod_id.trim()}
              onClick={async () => {
                try {
                  await axios.post(`${API}/servers/workshop/mod`, manualMod);
                  addMod({ mod_id: manualMod.mod_id, name: manualMod.name || manualMod.mod_id });
                  setManualEditOpen(false);
                  setManualMod({ mod_id: '', name: '', author: '', description: '' });
                } catch { /* ignore */ }
              }}
              className="bg-tropic-gold text-black hover:bg-tropic-gold-light">Save & Add</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailItem({ label, value, mono }) {
  return (
    <div>
      <span className="text-[10px] font-medium text-gray-500">{label}</span>
      <div className={`text-xs text-gray-300 ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

export default ModsModule;

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  Clock,
  Download,
  ExternalLink,
  GitBranch,
  Globe,
  HardDrive,
  Info,
  Loader2,
  Map,
  Plus,
  Puzzle,
  Star,
  Tag,
  Users,
} from 'lucide-react';
import { API } from '@/utils/api';

function humanSize(bytes) {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  for (const unit of units) {
    if (n < 1024) return `${n.toFixed(unit === 'B' ? 0 : 1)} ${unit}`;
    n /= 1024;
  }
  return `${n.toFixed(1)} TB`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatRating(rating) {
  if (rating === null || rating === undefined || rating === 0) return '—';
  const num = Number(rating);
  if (Number.isNaN(num)) return '—';
  const pct = num <= 1 ? num * 100 : num;
  return `${Math.round(pct)}%`;
}

function StatBox({ icon: Icon, label, value }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-zinc-800 bg-[#050a0e]/40 px-3 py-2">
      <Icon className="mb-1 h-3.5 w-3.5 text-[#4a6070]" />
      <span className="text-sm font-medium text-[#d0d8e0]">{value || '—'}</span>
      <span className="text-[10px] text-[#4a6070]">{label}</span>
    </div>
  );
}

function InfoRow({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-800/50 py-1.5">
      <span className="text-[11px] font-medium text-[#4a6070]">{label}</span>
      <span className={`text-sm text-[#d0d8e0] ${mono ? 'font-mono text-xs' : ''}`}>{value || '—'}</span>
    </div>
  );
}

// ─── Overview Tab ────────────────────────────────────────────────────────────
function OverviewTab({ mod }) {
  return (
    <div className="space-y-4">
      {mod.thumbnail_url && (
        <img src={mod.thumbnail_url} alt="" className="h-36 w-full rounded-lg object-cover" />
      )}

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2">
        <StatBox icon={Star} label="Rating" value={formatRating(mod.rating)} />
        <StatBox icon={Users} label="Subscribers" value={mod.subscribers?.toLocaleString()} />
        <StatBox icon={Download} label="Downloads" value={mod.downloads?.toLocaleString()} />
        <StatBox icon={HardDrive} label="Size" value={humanSize(mod.current_version_size)} />
      </div>

      {/* Summary */}
      {mod.summary && mod.summary !== mod.description && (
        <p className="text-sm italic text-[#8a9aa8]">{mod.summary}</p>
      )}

      {/* Description */}
      {mod.description && (
        <div>
          <div className="text-xs font-medium text-[#4a6070]">Description</div>
          <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-line text-sm text-[#8a9aa8]">{mod.description}</p>
        </div>
      )}

      {/* Info grid */}
      <div className="rounded-lg border border-zinc-800 bg-[#050a0e]/40 p-3">
        <InfoRow label="Mod ID" value={mod.mod_id} mono />
        <InfoRow label="Author" value={mod.author} />
        <InfoRow label="Version" value={mod.version} />
        <InfoRow label="Game Version" value={mod.game_version} />
        <InfoRow label="License" value={mod.license} />
        <InfoRow label="Created" value={formatDate(mod.created_at)} />
        <InfoRow label="Last Modified" value={formatDate(mod.updated_at)} />
      </div>

      {/* Tags */}
      {!!mod.tags?.length && (
        <div className="flex flex-wrap gap-1.5">
          {mod.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="border-zinc-700 text-[10px] text-[#8a9aa8]">
              <Tag className="mr-1 h-2.5 w-2.5" /> {tag}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Dependencies Tab ────────────────────────────────────────────────────────
function DependenciesTab({ mod, enabledModIds, onAddDependency, onResolveAll }) {
  const deps = mod.dependencies || [];
  if (!deps.length) {
    return <p className="py-6 text-center text-sm text-[#4a6070]">This mod has no dependencies.</p>;
  }

  const missingDeps = deps.filter((d) => !enabledModIds.has(d.mod_id));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#8a9aa8]">
          {deps.length} dependenc{deps.length === 1 ? 'y' : 'ies'}
          {missingDeps.length > 0 && (
            <span className="ml-1 text-amber-300">({missingDeps.length} not in config)</span>
          )}
        </p>
        {missingDeps.length > 0 && onResolveAll && (
          <Button size="sm" variant="outline" onClick={onResolveAll} className="border-zinc-700 text-[#8a9aa8] hover:bg-zinc-900 hover:text-white">
            <GitBranch className="mr-1 h-3 w-3" /> Add All Missing
          </Button>
        )}
      </div>

      <div className="space-y-1.5 rounded-lg border border-zinc-800 bg-[#050a0e]/40 p-3">
        {deps.map((dep, idx) => {
          const isPresent = enabledModIds.has(dep.mod_id);
          return (
            <div key={dep.mod_id || idx} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
              <span className="min-w-0 flex-1">
                {dep.name && dep.name !== dep.mod_id ? (
                  <>
                    <span className="text-sm text-[#d0d8e0]">{dep.name}</span>
                    <span className="ml-2 font-mono text-[10px] text-[#4a6070]">{dep.mod_id}</span>
                  </>
                ) : (
                  <span className="font-mono text-xs text-[#d0d8e0]">{dep.mod_id}</span>
                )}
                {dep.version && <span className="ml-2 text-[10px] text-[#4a6070]">v{dep.version}</span>}
              </span>
              {isPresent ? (
                <Badge variant="outline" className="border-emerald-600/30 text-[9px] text-emerald-300">
                  <CheckCircle className="mr-0.5 h-2.5 w-2.5" /> In config
                </Badge>
              ) : (
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className="border-amber-500/30 text-[9px] text-amber-300">
                    <AlertTriangle className="mr-0.5 h-2.5 w-2.5" /> Missing
                  </Badge>
                  {onAddDependency && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onAddDependency(dep)}
                      className="h-6 px-1.5 text-[10px] text-blue-300 hover:text-white"
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Versions Tab ────────────────────────────────────────────────────────────
function VersionsTab({ mod }) {
  const versions = mod.versions || [];
  if (!versions.length) {
    return <p className="py-6 text-center text-sm text-[#4a6070]">No version history available.</p>;
  }

  return (
    <div className="space-y-3">
      {mod.changelog && (
        <div className="rounded-lg border border-zinc-800 bg-[#050a0e]/40 p-3">
          <div className="mb-1 text-xs font-medium text-[#4a6070]">Latest Changelog</div>
          <p className="max-h-24 overflow-y-auto whitespace-pre-line text-sm text-[#8a9aa8]">
            {mod.changelog || 'No changelog provided for this version.'}
          </p>
        </div>
      )}

      <div className="max-h-72 space-y-1.5 overflow-y-auto rounded-lg border border-zinc-800 bg-[#050a0e]/40 p-3">
        {versions.map((v, idx) => {
          const isCurrent = v.version === mod.version;
          return (
            <div
              key={v.version || idx}
              className={`flex items-center gap-3 rounded-lg px-2 py-1.5 ${
                isCurrent ? 'border border-tropic-gold/20 bg-tropic-gold/5' : ''
              }`}
            >
              <div className="min-w-0 flex-1">
                <span className={`text-sm font-medium ${isCurrent ? 'text-tropic-gold' : 'text-[#d0d8e0]'}`}>
                  v{v.version}
                </span>
                {isCurrent && (
                  <Badge variant="outline" className="ml-2 border-tropic-gold/30 text-[8px] text-tropic-gold">Current</Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-[10px] text-[#4a6070]">
                {v.game_version && (
                  <span className="flex items-center gap-0.5">
                    <Globe className="h-2.5 w-2.5" /> {v.game_version}
                  </span>
                )}
                {v.file_size > 0 && (
                  <span className="flex items-center gap-0.5">
                    <HardDrive className="h-2.5 w-2.5" /> {humanSize(v.file_size)}
                  </span>
                )}
                {v.created_at && (
                  <span className="flex items-center gap-0.5">
                    <Calendar className="h-2.5 w-2.5" /> {formatDate(v.created_at)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Scenarios Tab ───────────────────────────────────────────────────────────
function ScenariosTab({ mod, activeScenarioId, onUseScenario }) {
  const scenarios = mod.scenarios || [];
  if (!scenarios.length) {
    return <p className="py-6 text-center text-sm text-[#4a6070]">This mod has no scenarios.</p>;
  }

  return (
    <div className="space-y-3">
      {scenarios.map((sc, idx) => {
        const isActive = activeScenarioId === sc.scenario_id;
        return (
          <div key={sc.scenario_id || idx} className="overflow-hidden rounded-lg border border-zinc-800 bg-[#050a0e]/40">
            {sc.thumbnail_url && (
              <img src={sc.thumbnail_url} alt="" className="h-28 w-full object-cover" />
            )}
            <div className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-[#d0d8e0]">{sc.name || 'Unnamed Scenario'}</h4>
                {isActive && (
                  <Badge variant="outline" className="border-emerald-600/30 text-[8px] text-emerald-300">Active</Badge>
                )}
              </div>

              <div className="flex flex-wrap gap-2 text-[10px] text-[#4a6070]">
                {sc.game_mode && (
                  <span className="flex items-center gap-0.5">
                    <Puzzle className="h-2.5 w-2.5" /> {sc.game_mode}
                  </span>
                )}
                {sc.player_count > 0 && (
                  <span className="flex items-center gap-0.5">
                    <Users className="h-2.5 w-2.5" /> {sc.player_count} players
                  </span>
                )}
              </div>

              {sc.description && (
                <p className="max-h-16 overflow-y-auto text-xs text-[#8a9aa8]">{sc.description}</p>
              )}

              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded bg-zinc-900 px-2 py-0.5 font-mono text-[10px] text-[#4a6070]">
                  {sc.scenario_id}
                </code>
                {onUseScenario && (
                  <Button
                    size="sm"
                    variant={isActive ? 'outline' : 'default'}
                    disabled={isActive}
                    onClick={() => onUseScenario(sc.scenario_id)}
                    className={isActive
                      ? 'border-emerald-600/30 text-emerald-300'
                      : 'bg-tropic-gold text-black hover:bg-tropic-gold-light'
                    }
                  >
                    <Map className="mr-1 h-3 w-3" />
                    {isActive ? 'Active' : 'Use Scenario'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function ModDetailPanel({
  open,
  onOpenChange,
  mod,
  serverId,
  enabledModIds = new Set(),
  activeScenarioId = '',
  onAddMod,
  onAddDependency,
  onResolveAll,
  onUseScenario,
}) {
  const [enrichedMod, setEnrichedMod] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !mod) {
      setEnrichedMod(null);
      return;
    }
    setEnrichedMod(mod);

    const modId = mod.mod_id || mod.modId;
    if (!modId) return;

    let cancelled = false;
    setLoading(true);
    axios.get(`${API}/servers/workshop/mod/${modId}/details`)
      .then((res) => {
        if (!cancelled) {
          setEnrichedMod((prev) => ({ ...prev, ...res.data }));
        }
      })
      .catch((err) => {
        console.warn('ModDetailPanel: failed to fetch enriched details', err?.response?.status, err?.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [open, mod]);

  const displayMod = enrichedMod || mod;
  if (!displayMod) return null;

  const hasScenarios = !!(displayMod.scenarios?.length);
  const hasVersions = !!(displayMod.versions?.length);
  const hasDeps = !!(displayMod.dependencies?.length);
  const depCount = displayMod.dependencies?.length || 0;
  const scenarioCount = displayMod.scenarios?.length || 0;
  const versionCount = displayMod.versions?.length || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl border-zinc-800 bg-zinc-950 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-tropic-gold">
            <Puzzle className="h-5 w-5" />
            <span className="truncate">{displayMod.name || displayMod.mod_id || 'Mod Details'}</span>
            {displayMod.author && (
              <span className="ml-1 text-sm font-normal text-[#4a6070]">by {displayMod.author}</span>
            )}
            {loading && <Loader2 className="ml-auto h-4 w-4 animate-spin text-[#4a6070]" />}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="overview" className="mt-1">
          <TabsList className="grid w-full grid-cols-4 bg-zinc-900">
            <TabsTrigger value="overview" className="text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-tropic-gold">
              <Info className="mr-1 h-3 w-3" /> Overview
            </TabsTrigger>
            <TabsTrigger value="dependencies" className="text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-tropic-gold">
              <GitBranch className="mr-1 h-3 w-3" /> Deps{depCount > 0 ? ` (${depCount})` : ''}
            </TabsTrigger>
            <TabsTrigger value="versions" className="text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-tropic-gold">
              <Clock className="mr-1 h-3 w-3" /> Versions{versionCount > 0 ? ` (${versionCount})` : ''}
            </TabsTrigger>
            <TabsTrigger value="scenarios" className="text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-tropic-gold">
              <Map className="mr-1 h-3 w-3" /> Scenarios{scenarioCount > 0 ? ` (${scenarioCount})` : ''}
            </TabsTrigger>
          </TabsList>

          <div className="mt-3 max-h-[60vh] overflow-y-auto pr-1">
            <TabsContent value="overview" className="mt-0">
              <OverviewTab mod={displayMod} />
            </TabsContent>

            <TabsContent value="dependencies" className="mt-0">
              <DependenciesTab
                mod={displayMod}
                enabledModIds={enabledModIds}
                onAddDependency={onAddDependency}
                onResolveAll={onResolveAll}
              />
            </TabsContent>

            <TabsContent value="versions" className="mt-0">
              <VersionsTab mod={displayMod} />
            </TabsContent>

            <TabsContent value="scenarios" className="mt-0">
              <ScenariosTab
                mod={displayMod}
                activeScenarioId={activeScenarioId}
                onUseScenario={onUseScenario}
              />
            </TabsContent>
          </div>
        </Tabs>

        {/* Action buttons */}
        <div className="mt-2 flex gap-2 border-t border-zinc-800 pt-3">
          {onAddMod && (
            <Button size="sm" onClick={() => onAddMod(displayMod)} className="bg-tropic-gold text-black hover:bg-tropic-gold-light">
              <Plus className="mr-1 h-3.5 w-3.5" /> Add to load order
            </Button>
          )}
          {hasDeps && onResolveAll && (
            <Button size="sm" variant="outline" onClick={onResolveAll} className="border-zinc-700 text-[#8a9aa8] hover:bg-zinc-900 hover:text-white">
              <GitBranch className="mr-1 h-3.5 w-3.5" /> Resolve Dependencies
            </Button>
          )}
          {displayMod.workshop_url && (
            <a href={displayMod.workshop_url} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="ghost" className="text-[#4a6070] hover:text-white">
                <ExternalLink className="mr-1 h-3.5 w-3.5" /> Workshop
              </Button>
            </a>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

import React, { useCallback, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  ArrowRight,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  Lock,
  Package,
  Search,
  Server,
  Shield,
  Users,
} from 'lucide-react';
import { API } from '@/utils/api';

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function statusBadge(status) {
  if (status === 'online') return 'border-green-600/40 text-green-400 bg-green-900/20';
  if (status === 'offline') return 'border-zinc-600/40 text-zinc-400 bg-zinc-900/20';
  return 'border-amber-600/40 text-amber-300 bg-amber-900/20';
}

const DEFAULT_PAGE_SIZE = 25;

/* ── Main component ───────────────────────────────────────────────────────── */

function CompareServersModule() {
  const { server, serverId, canManage } = useOutletContext();

  /* search state */
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [nextPageKey, setNextPageKey] = useState(null);
  const [pageHistory, setPageHistory] = useState([]);

  /* selected server state */
  const [selected, setSelected] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState(null);

  /* copy state */
  const [copying, setCopying] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  /* comparison visibility */
  const [showComparison, setShowComparison] = useState(true);

  /* ── search ────────────────────────────────────────────────────────────── */

  const doSearch = useCallback(async (searchQuery, cursorKey) => {
    setSearching(true);
    setSearchError(null);
    try {
      const params = { per_page: DEFAULT_PAGE_SIZE };
      if (cursorKey) {
        params.pageKey = cursorKey;
      }
      // Include the original query when present so the request context is preserved.
      if (searchQuery) {
        params.q = searchQuery;
      }
      const res = await axios.get(`${API}/servers/battlemetrics/search`, { params });
      setResults(res.data.servers || []);
      setNextPageKey(res.data.next_page_key || null);
    } catch (err) {
      setSearchError(err.response?.data?.detail || 'Search failed');
      setResults([]);
      setNextPageKey(null);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSearch = useCallback((e) => {
    e?.preventDefault?.();
    setSelected(null);
    setPageHistory([]);
    setNextPageKey(null);
    doSearch(query, null);
  }, [query, doSearch]);

  const handleNextPage = useCallback(() => {
    if (!nextPageKey) return;
    setPageHistory((prev) => [...prev, { results, nextPageKey }]);
    doSearch(query, nextPageKey);
  }, [query, nextPageKey, results, doSearch]);

  const handlePrevPage = useCallback(() => {
    if (pageHistory.length === 0) return;
    const prev = [...pageHistory];
    const lastEntry = prev.pop();
    setPageHistory(prev);
    setResults(lastEntry.results);
    setNextPageKey(lastEntry.nextPageKey);
  }, [pageHistory]);

  /* ── select a server ───────────────────────────────────────────────────── */

  const handleSelect = useCallback(async (bmServer) => {
    setLoadingDetail(true);
    setDetailError(null);
    setSelected(null);
    setCopySuccess(false);
    try {
      const res = await axios.get(`${API}/servers/battlemetrics/${bmServer.bm_id}`);
      setSelected(res.data);
    } catch (err) {
      setDetailError(err.response?.data?.detail || 'Failed to load server details');
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  /* ── copy mods ─────────────────────────────────────────────────────────── */

  const handleCopyMods = useCallback(async () => {
    if (!selected || !canManage) return;

    const remoteMods = selected.mods || [];
    if (remoteMods.length === 0) return;

    const modsPayload = remoteMods.map((mod) => ({
      mod_id: mod.mod_id,
      modId: mod.mod_id,
      name: mod.name || mod.mod_id,
      version: mod.version || '',
      enabled: true,
    }));

    setCopying(true);
    setCopySuccess(false);
    try {
      await axios.post(`${API}/servers/${serverId}/mods/import-json`, {
        mods: modsPayload,
      });
      setCopySuccess(true);
    } catch (err) {
      setDetailError(err.response?.data?.detail || 'Failed to import mods');
    } finally {
      setCopying(false);
    }
  }, [selected, serverId, canManage]);

  /* ── local mods for comparison ─────────────────────────────────────────── */

  const localMods = useMemo(() => {
    if (!server?.mods) return [];
    return server.mods.filter((m) => m.enabled !== false);
  }, [server?.mods]);

  const localModIds = useMemo(() => new Set(localMods.map((m) => m.mod_id || m.modId || '')), [localMods]);

  /* ── render ────────────────────────────────────────────────────────────── */

  return (
    <div className="flex flex-col gap-6">
      {/* ── Hero banner ─────────────────────────────────────────────────── */}
      <div className="relative rounded-lg border border-[rgba(201,162,39,0.15)] bg-[radial-gradient(circle_at_top,rgba(201,162,39,0.06),#050a0e_58%)] p-6">
        <div className="corner-bracket" />
        <p className="mb-1 font-['Oswald'] text-[10px] uppercase tracking-[0.2em] text-[#c9a227]">
          INTELLIGENCE
        </p>
        <h1 className="font-['Share_Tech'] text-2xl font-bold text-[#e8c547]">
          Compare Servers
        </h1>
        <p className="mt-1 font-['Inter'] text-sm text-[#8a9aa8]">
          Search BattleMetrics for Arma Reforger servers. Compare their mods and configuration, then import their entire mod list with one click.
        </p>
      </div>

      {/* ── Search bar ──────────────────────────────────────────────────── */}
      <form onSubmit={handleSearch} className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4a6070]" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Arma Reforger servers on BattleMetrics..."
            className="h-10 border-zinc-800 bg-[#050a0e]/60 pl-10 text-sm text-white placeholder:text-[#4a6070]"
          />
        </div>
        <Button
          type="submit"
          disabled={searching}
          className="h-10 bg-[rgba(201,162,39,0.15)] text-[#e8c547] hover:bg-[rgba(201,162,39,0.25)]"
        >
          {searching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
          Search
        </Button>
      </form>

      {searchError && (
        <p className="text-sm text-red-400">{searchError}</p>
      )}

      {/* ── Layout: results + detail ────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Left — search results */}
        <div className="flex flex-col gap-3">
          {results.length > 0 && (
            <h2 className="font-['Share_Tech'] text-sm font-semibold text-[#8a9aa8]">
              Search Results {query && <span className="font-normal text-[#4a6070]">for &ldquo;{query}&rdquo;</span>}
            </h2>
          )}
          {results.map((srv) => (
            <Card
              key={srv.bm_id}
              className={`cursor-pointer border-zinc-800 bg-[#0c1117] transition-colors hover:border-[rgba(201,162,39,0.3)] ${
                selected?.bm_id === srv.bm_id ? 'border-[rgba(201,162,39,0.5)] bg-[rgba(201,162,39,0.04)]' : ''
              }`}
              role="button"
              tabIndex={0}
              aria-pressed={selected?.bm_id === srv.bm_id}
              onClick={() => handleSelect(srv)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelect(srv);
                }
              }}
            >
              <CardContent className="flex items-center gap-4 p-4">
                <Server className="h-5 w-5 shrink-0 text-[#4a6070]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-['Share_Tech'] text-sm font-semibold text-white">{srv.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#8a9aa8]">
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />{srv.players}/{srv.max_players}</span>
                    {srv.scenario && <span>• {srv.scenario}</span>}
                    {srv.mods?.length > 0 && <span>• {srv.mods.length} mods</span>}
                    {srv.country && <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{srv.country}</span>}
                  </div>
                </div>
                <Badge variant="outline" className={`shrink-0 text-[10px] uppercase ${statusBadge(srv.status)}`}>
                  {srv.status}
                </Badge>
              </CardContent>
            </Card>
          ))}

          {/* Pagination */}
          {results.length > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-[#0c1117] px-4 py-2 text-xs text-[#4a6070]">
              <Button
                variant="outline"
                size="sm"
                disabled={pageHistory.length === 0 || searching}
                onClick={handlePrevPage}
                className="h-7 border-zinc-700 text-xs text-[#8a9aa8] hover:border-[rgba(201,162,39,0.3)] hover:text-[#e8c547] disabled:opacity-40"
              >
                ← Previous
              </Button>
              <span className="text-[#8a9aa8]">
                Page {pageHistory.length + 1} · {results.length} result{results.length !== 1 ? 's' : ''}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!nextPageKey || searching}
                onClick={handleNextPage}
                className="h-7 border-zinc-700 text-xs text-[#8a9aa8] hover:border-[rgba(201,162,39,0.3)] hover:text-[#e8c547] disabled:opacity-40"
              >
                Next →
              </Button>
            </div>
          )}

          {results.length === 0 && !searching && !searchError && (
            <div className="flex flex-col items-center justify-center rounded-lg border border-zinc-800 bg-[#050a0e]/40 py-12 text-[#4a6070]">
              <Globe className="mb-3 h-10 w-10" />
              <p className="text-sm">Search for a server to compare</p>
              <p className="mt-1 text-xs">Results are sourced from BattleMetrics</p>
            </div>
          )}
        </div>

        {/* Right — selected server detail */}
        <div className="flex flex-col gap-4">
          {loadingDetail && (
            <div className="flex items-center justify-center rounded-lg border border-zinc-800 bg-[#050a0e]/40 py-12 text-[#4a6070]">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading server details...
            </div>
          )}

          {detailError && <p className="text-sm text-red-400">{detailError}</p>}

          {selected && !loadingDetail && (
            <>
              {/* Server info */}
              <Card className="border-zinc-800 bg-[#0c1117]">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 font-['Share_Tech'] text-base text-[#e8c547]">
                    <Server className="h-4 w-4" /> {selected.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                  <div>
                    <span className="block text-[#4a6070]">Status</span>
                    <Badge variant="outline" className={`mt-1 text-[10px] uppercase ${statusBadge(selected.status)}`}>
                      {selected.status}
                    </Badge>
                  </div>
                  <div>
                    <span className="block text-[#4a6070]">Players</span>
                    <span className="text-white">{selected.players} / {selected.max_players}</span>
                  </div>
                  <div>
                    <span className="block text-[#4a6070]">Scenario</span>
                    <span className="text-white">{selected.scenario || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-[#4a6070]">Country</span>
                    <span className="text-white">{selected.country || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-[#4a6070]">Address</span>
                    <span className="text-white">{selected.ip}:{selected.port}</span>
                  </div>
                  {selected.version && (
                    <div>
                      <span className="block text-[#4a6070]">Version</span>
                      <span className="text-white">{selected.version}</span>
                    </div>
                  )}
                  <div>
                    <span className="block text-[#4a6070]">Protection</span>
                    <div className="mt-1 flex items-center gap-2">
                      {selected.battleye && (
                        <Badge variant="outline" className="border-green-600/30 text-[10px] text-green-400">
                          <Shield className="mr-1 h-2.5 w-2.5" /> BattlEye
                        </Badge>
                      )}
                      {selected.password && (
                        <Badge variant="outline" className="border-amber-600/30 text-[10px] text-amber-300">
                          <Lock className="mr-1 h-2.5 w-2.5" /> Password
                        </Badge>
                      )}
                      {!selected.battleye && !selected.password && (
                        <span className="text-[#4a6070]">None</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="block text-[#4a6070]">BattleMetrics</span>
                    <a
                      href={`https://www.battlemetrics.com/servers/reforger/${selected.bm_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[#c9a227] hover:underline"
                    >
                      View <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </CardContent>
              </Card>

              {/* Mod comparison */}
              <Card className="border-zinc-800 bg-[#0c1117]">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 font-['Share_Tech'] text-sm text-[#8a9aa8]">
                      <Package className="h-4 w-4" /> Mods ({selected.mods?.length || 0})
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowComparison((v) => !v)}
                      className="h-7 text-xs text-[#4a6070]"
                    >
                      {showComparison ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      {showComparison ? 'Hide' : 'Show'} comparison
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {(!selected.mods || selected.mods.length === 0) ? (
                    <p className="text-xs text-[#4a6070]">No mod data available for this server.</p>
                  ) : (
                    <div className="space-y-2">
                      {/* Copy all mods button */}
                      {canManage && (
                        <div className="mb-3 flex items-center gap-2">
                          <Button
                            size="sm"
                            disabled={copying}
                            onClick={handleCopyMods}
                            className="h-8 bg-[rgba(201,162,39,0.15)] text-xs text-[#e8c547] hover:bg-[rgba(201,162,39,0.25)]"
                          >
                            {copying ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : copySuccess ? (
                              <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                            ) : (
                              <Copy className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            {copySuccess ? 'Mods imported!' : 'Copy all mods to this server'}
                          </Button>
                          {copySuccess && (
                            <span className="text-xs text-green-400">
                              Successfully imported {selected.mods.length} mods. Check the Mods tab.
                            </span>
                          )}
                        </div>
                      )}

                      {/* Mod list */}
                      <div className="max-h-72 overflow-y-auto">
                        {selected.mods.map((mod, index) => {
                          const isLocal = mod.mod_id && localModIds.has(mod.mod_id);
                          return (
                            <div
                              key={`${mod.mod_id}-${index}`}
                              className="flex items-center justify-between border-b border-zinc-800/50 py-2 last:border-b-0"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs text-white">{mod.name}</p>
                                <div className="flex items-center gap-2">
                                  {mod.mod_id && (
                                    <span className="truncate font-mono text-[10px] text-[#4a6070]">{mod.mod_id}</span>
                                  )}
                                  {mod.version && (
                                    <Badge variant="outline" className="border-zinc-700 text-[9px] text-[#4a6070]">
                                      v{mod.version}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              {showComparison && (
                                <Badge
                                  variant="outline"
                                  className={`ml-2 shrink-0 text-[10px] ${
                                    isLocal
                                      ? 'border-green-600/30 text-green-400'
                                      : 'border-amber-600/30 text-amber-300'
                                  }`}
                                >
                                  {isLocal ? 'Already installed' : 'Not installed'}
                                </Badge>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {!selected && !loadingDetail && (
            <div className="flex flex-col items-center justify-center rounded-lg border border-zinc-800 bg-[#050a0e]/40 py-12 text-[#4a6070]">
              <ArrowRight className="mb-3 h-10 w-10 rotate-180 xl:rotate-0" />
              <p className="text-sm">Select a server from the search results</p>
              <p className="mt-1 text-xs">View mods, configuration, and compare with your server</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CompareServersModule;

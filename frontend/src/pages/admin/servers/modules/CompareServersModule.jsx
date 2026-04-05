import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  Package,
  Search,
  Server,
  Users,
} from 'lucide-react';
import { API } from '@/utils/api';

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function statusBadge(status) {
  if (status === 'online') return 'border-green-600/40 text-green-400 bg-green-900/20';
  if (status === 'offline') return 'border-zinc-600/40 text-zinc-400 bg-zinc-900/20';
  return 'border-amber-600/40 text-amber-300 bg-amber-900/20';
}

/* ── Main component ───────────────────────────────────────────────────────── */

function CompareServersModule() {
  const { server, serverId, canManage } = useOutletContext();

  /* search state */
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);

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

  const doSearch = useCallback(async (searchQuery, pageNum) => {
    setSearching(true);
    setSearchError(null);
    try {
      const res = await axios.get(`${API}/servers/battlemetrics/search`, {
        params: { q: searchQuery, page: pageNum, per_page: 25 },
      });
      setResults(res.data.servers || []);
      setHasNext(res.data.has_next || false);
    } catch (err) {
      setSearchError(err.response?.data?.detail || 'Search failed');
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSearch = useCallback((e) => {
    e?.preventDefault?.();
    setPage(1);
    setSelected(null);
    doSearch(query, 1);
  }, [query, doSearch]);

  const handlePage = useCallback((newPage) => {
    setPage(newPage);
    doSearch(query, newPage);
  }, [query, doSearch]);

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

    const modNames = selected.mods || [];
    const modIds = selected.mod_ids || [];
    if (modIds.length === 0 && modNames.length === 0) return;

    const modsPayload = modIds.map((modId, index) => ({
      mod_id: modId,
      modId: modId,
      name: modNames[index] || modId,
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
          Search BattleMetrics for Arma Reforger servers. Compare their mods and player activity, then import their mod list with one click.
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
              Search Results
            </h2>
          )}
          {results.map((srv) => (
            <Card
              key={srv.bm_id}
              className={`cursor-pointer border-zinc-800 bg-[#0c1117] transition-colors hover:border-[rgba(201,162,39,0.3)] ${
                selected?.bm_id === srv.bm_id ? 'border-[rgba(201,162,39,0.5)] bg-[rgba(201,162,39,0.04)]' : ''
              }`}
              onClick={() => handleSelect(srv)}
            >
              <CardContent className="flex items-center gap-4 p-4">
                <Server className="h-5 w-5 shrink-0 text-[#4a6070]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-['Share_Tech'] text-sm font-semibold text-white">{srv.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#8a9aa8]">
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />{srv.players}/{srv.max_players}</span>
                    {srv.map && <span>• {srv.map}</span>}
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
            <div className="flex items-center justify-between text-xs text-[#4a6070]">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => handlePage(page - 1)}
                className="h-7 border-zinc-800 text-xs text-[#8a9aa8]"
              >
                Previous
              </Button>
              <span>Page {page}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasNext}
                onClick={() => handlePage(page + 1)}
                className="h-7 border-zinc-800 text-xs text-[#8a9aa8]"
              >
                Next
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
                    <span className="block text-[#4a6070]">Map</span>
                    <span className="text-white">{selected.map || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-[#4a6070]">Game Mode</span>
                    <span className="text-white">{selected.game_mode || '—'}</span>
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
                    <span className="block text-[#4a6070]">BattleMetrics</span>
                    <a
                      href={`https://www.battlemetrics.com/servers/arma-reforger/${selected.bm_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[#c9a227] hover:underline"
                    >
                      View <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </CardContent>
              </Card>

              {/* Players online */}
              {(() => {
                const playersList = selected.players;
                if (!Array.isArray(playersList) || playersList.length === 0 || typeof playersList[0] !== 'object') return null;
                return (
                  <Card className="border-zinc-800 bg-[#0c1117]">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 font-['Share_Tech'] text-sm text-[#8a9aa8]">
                        <Users className="h-4 w-4" /> Online Players ({playersList.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="max-h-48 overflow-y-auto">
                      <div className="flex flex-wrap gap-2">
                        {playersList.map((p) => (
                          <Badge key={p.bm_id || p.name} variant="outline" className="border-zinc-700 text-[10px] text-[#8a9aa8]">
                            {p.name}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}

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
                  {selected.mods?.length === 0 && selected.mod_ids?.length === 0 ? (
                    <p className="text-xs text-[#4a6070]">No mod data available for this server.</p>
                  ) : (
                    <div className="space-y-2">
                      {/* Copy all mods button */}
                      {canManage && selected.mod_ids?.length > 0 && (
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
                              Successfully imported {selected.mod_ids.length} mods. Check the Mods tab.
                            </span>
                          )}
                        </div>
                      )}

                      {/* Mod list */}
                      <div className="max-h-72 overflow-y-auto">
                        {(selected.mods || []).map((modName, index) => {
                          const modId = selected.mod_ids?.[index] || '';
                          const isLocal = modId && localModIds.has(modId);
                          return (
                            <div
                              key={`${modId}-${index}`}
                              className="flex items-center justify-between border-b border-zinc-800/50 py-2 last:border-b-0"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs text-white">{modName}</p>
                                {modId && (
                                  <p className="truncate font-mono text-[10px] text-[#4a6070]">{modId}</p>
                                )}
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
              <p className="mt-1 text-xs">View mods, players, and compare with your server</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CompareServersModule;

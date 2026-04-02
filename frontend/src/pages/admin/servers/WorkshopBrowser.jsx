import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Plus,
  RefreshCw,
  ExternalLink,
  Info,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Loader2,
  Download,
  Clock,
  Flame,
  Sparkles,
  ArrowUpDown,
  Type,
  Wifi,
  WifiOff,
  ImageOff,
} from 'lucide-react';

import { API } from '@/utils/api';

// ── Tab / category definitions ─────────────────────────────────────────────
const CATEGORIES = [
  { key: 'popular', label: 'Popular', icon: Flame },
  { key: 'newest', label: 'Newest', icon: Sparkles },
  { key: 'updated', label: 'Recently Updated', icon: ArrowUpDown },
  { key: 'name', label: 'Alphabetical', icon: Type },
];

// ── Initial form state for the "Add Mod" dialog ───────────────────────────
const EMPTY_MOD_FORM = {
  mod_id: '',
  name: '',
  author: '',
  version: '',
  description: '',
  license: '',
};

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
    <img
      src={src}
      alt={alt}
      className="h-full w-full object-cover"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

// ── WorkshopBrowser ────────────────────────────────────────────────────────
function WorkshopBrowser() {
  // ── Browse state ─────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('popular');
  const [mods, setMods] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [source, setSource] = useState(''); // 'live' or 'error'

  // ── Search state ─────────────────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounce(searchInput, 400);
  const [isSearchMode, setIsSearchMode] = useState(false);

  // ── Add-mod dialog ───────────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [modForm, setModForm] = useState(EMPTY_MOD_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  // ── Auto-fetch dialog ────────────────────────────────────────────────────
  const [fetchDialogOpen, setFetchDialogOpen] = useState(false);
  const [fetchModId, setFetchModId] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [fetchResult, setFetchResult] = useState(null);

  // ── Ref for abort controller ─────────────────────────────────────────────
  const abortRef = useRef(null);

  // ── Fetch mods (browse or search) ────────────────────────────────────────
  const fetchMods = useCallback(async () => {
    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.cancel('superseded');
    const cancelSource = axios.CancelToken.source();
    abortRef.current = cancelSource;

    setLoading(true);
    setError(null);

    try {
      let res;
      if (isSearchMode && debouncedSearch.trim()) {
        // Live search via proxy
        res = await axios.get(`${API}/workshop/search`, {
          params: { q: debouncedSearch.trim(), page, sort: 'popularity' },
          cancelToken: cancelSource.token,
        });
      } else {
        // Browse by category via proxy
        res = await axios.get(`${API}/workshop/browse`, {
          params: { category: activeTab, page },
          cancelToken: cancelSource.token,
        });
      }

      const data = res.data || {};
      setMods(Array.isArray(data.mods) ? data.mods : []);
      setTotal(typeof data.total === 'number' ? data.total : 0);
      setTotalPages(
        typeof data.total_pages === 'number' && data.total_pages > 0
          ? data.total_pages
          : Math.max(1, Math.ceil((data.total || 0) / (data.per_page || 16)))
      );
      setSource(data.source || 'live');
      if (data.error) setError(data.error);
    } catch (err) {
      if (axios.isCancel(err)) return; // superseded, ignore
      console.error('Workshop fetch failed:', err);
      setError(err.response?.data?.detail || 'Failed to fetch workshop data.');
      setMods([]);
      setSource('error');
    } finally {
      setLoading(false);
    }
  }, [activeTab, page, isSearchMode, debouncedSearch]);

  // Trigger fetch on deps change
  useEffect(() => {
    fetchMods();
    return () => {
      if (abortRef.current) abortRef.current.cancel('cleanup');
    };
  }, [fetchMods]);

  // Toggle search mode based on input
  useEffect(() => {
    setIsSearchMode(debouncedSearch.trim().length > 0);
    setPage(1);
  }, [debouncedSearch]);

  // ── Tab change handler ───────────────────────────────────────────────────
  const handleTabChange = (key) => {
    setActiveTab(key);
    setPage(1);
    setSearchInput('');
    setIsSearchMode(false);
  };

  // ── Form helpers ─────────────────────────────────────────────────────────
  const updateField = (field, value) => {
    setModForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddMod = async (e) => {
    e.preventDefault();
    if (!modForm.mod_id.trim() || !modForm.name.trim()) {
      setFormError('Mod ID and Name are required.');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const payload = {
        mod_id: modForm.mod_id.trim(),
        name: modForm.name.trim(),
        author: modForm.author.trim() || undefined,
        version: modForm.version.trim() || undefined,
        description: modForm.description.trim() || undefined,
        license: modForm.license.trim() || undefined,
      };

      await axios.post(`${API}/servers/workshop/mod`, payload);
      setDialogOpen(false);
      setModForm(EMPTY_MOD_FORM);
    } catch (err) {
      console.error('Failed to add mod:', err);
      const detail = err.response?.data?.detail;
      setFormError(typeof detail === 'string' ? detail : 'Failed to add mod.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Auto-fetch mod from workshop ────────────────────────────────────────
  const handleAutoFetch = async (e) => {
    e.preventDefault();
    if (!fetchModId.trim()) {
      setFetchError('Mod ID is required.');
      return;
    }
    setFetching(true);
    setFetchError(null);
    setFetchResult(null);
    try {
      const res = await axios.post(`${API}/servers/workshop/mod/fetch`, {
        mod_id: fetchModId.trim(),
      });
      setFetchResult(res.data);
    } catch (err) {
      console.error('Auto-fetch failed:', err);
      setFetchError(err.response?.data?.detail || 'Failed to fetch mod metadata from workshop.');
    } finally {
      setFetching(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1
            className="text-3xl font-bold tracking-widest text-tropic-gold"
            style={{ fontFamily: 'Rajdhani, sans-serif' }}
          >
            WORKSHOP
          </h1>
          {source === 'live' && !loading && (
            <Badge className="bg-green-600/20 text-green-400 border-green-600/30 text-xs gap-1">
              <Wifi className="h-3 w-3" /> Live
            </Badge>
          )}
          {source === 'error' && (
            <Badge className="bg-red-600/20 text-red-400 border-red-600/30 text-xs gap-1">
              <WifiOff className="h-3 w-3" /> Offline
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              setFetchModId('');
              setFetchError(null);
              setFetchResult(null);
              setFetchDialogOpen(true);
            }}
            className="bg-tropic-gold text-black hover:bg-tropic-gold-light"
          >
            <Download className="mr-1.5 h-4 w-4" />
            Fetch by ID
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setFormError(null);
              setModForm(EMPTY_MOD_FORM);
              setDialogOpen(true);
            }}
            className="border-tropic-gold-dark/30 text-tropic-gold hover:bg-tropic-gold/10"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add Manually
          </Button>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {CATEGORIES.map(({ key, label, icon: Icon }) => (
          <Button
            key={key}
            variant={activeTab === key && !isSearchMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleTabChange(key)}
            className={
              activeTab === key && !isSearchMode
                ? 'bg-tropic-gold text-black hover:bg-tropic-gold-light'
                : 'border-tropic-gold-dark/20 text-gray-400 hover:text-tropic-gold hover:bg-tropic-gold/10'
            }
          >
            <Icon className="mr-1.5 h-3.5 w-3.5" />
            {label}
          </Button>
        ))}
      </div>

      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search workshop mods…"
            className="border-tropic-gold-dark/20 bg-black/60 pl-10 text-white placeholder:text-gray-500 focus-visible:ring-tropic-gold/40"
          />
        </div>
        {(isSearchMode || searchInput) && (
          <Button
            variant="outline"
            onClick={() => {
              setSearchInput('');
              setIsSearchMode(false);
              setPage(1);
            }}
            className="border-gray-700 text-gray-300 hover:bg-gray-800"
          >
            Clear
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => fetchMods()}
          disabled={loading}
          className="border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-30"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-600/30 bg-red-600/10 px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchMods()}
            className="ml-auto text-red-400 hover:text-red-300"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Loading skeleton */}
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

      {/* Results grid */}
      {!loading && mods.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {isSearchMode
                ? `Found ${total.toLocaleString()} result${total !== 1 ? 's' : ''}`
                : `Showing page ${page} of ${totalPages.toLocaleString()} — ${total.toLocaleString()} mod${total !== 1 ? 's' : ''} total`}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {mods.map((mod, idx) => (
              <Card
                key={mod.mod_id || idx}
                className="group border-tropic-gold-dark/20 bg-black/60 backdrop-blur-sm overflow-hidden transition-colors hover:border-tropic-gold-dark/40"
              >
                {/* Thumbnail */}
                <div className="aspect-video overflow-hidden bg-zinc-900">
                  <ModThumbnail src={mod.thumbnail_url} alt={mod.name} />
                </div>

                <CardContent className="space-y-2 p-4">
                  {/* Name */}
                  <h3 className="text-sm font-bold text-white leading-tight line-clamp-1">
                    {mod.name || 'Unnamed Mod'}
                  </h3>

                  {/* Author */}
                  {mod.author && (
                    <p className="text-xs text-gray-400">
                      <span className="text-gray-500">by </span>
                      {mod.author}
                    </p>
                  )}

                  {/* Meta row */}
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    {mod.rating && (
                      <span className="text-tropic-gold">{mod.rating}</span>
                    )}
                    {mod.size && <span>{mod.size}</span>}
                    {mod.version && (
                      <Badge className="bg-tropic-gold/20 text-tropic-gold border-tropic-gold-dark/30 text-[10px] px-1.5 py-0">
                        v{mod.version}
                      </Badge>
                    )}
                  </div>

                  {/* Mod ID */}
                  <p className="font-mono text-[10px] text-gray-600 break-all">
                    {mod.mod_id}
                  </p>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-1">
                    {mod.workshop_url && (
                      <a
                        href={mod.workshop_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-tropic-gold hover:text-tropic-gold-light transition-colors"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Workshop
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-gray-800">
              <span className="text-sm text-gray-500">
                Page {page} of {totalPages.toLocaleString()}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-30"
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Previous
                </Button>

                {/* Page number buttons */}
                <div className="hidden sm:flex items-center gap-1">
                  {(() => {
                    const pages = [];
                    const maxVisible = 5;
                    let start = Math.max(1, page - Math.floor(maxVisible / 2));
                    let end = Math.min(totalPages, start + maxVisible - 1);
                    if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);

                    if (start > 1) {
                      pages.push(
                        <Button key={1} variant="outline" size="sm"
                          onClick={() => setPage(1)}
                          className="border-gray-700 text-gray-300 hover:bg-gray-800 h-8 w-8 p-0">
                          1
                        </Button>
                      );
                      if (start > 2) pages.push(<span key="dots1" className="text-gray-600 px-1">…</span>);
                    }
                    for (let i = start; i <= end; i++) {
                      pages.push(
                        <Button key={i} variant={i === page ? 'default' : 'outline'} size="sm"
                          onClick={() => setPage(i)}
                          className={
                            i === page
                              ? 'bg-tropic-gold text-black hover:bg-tropic-gold-light h-8 w-8 p-0'
                              : 'border-gray-700 text-gray-300 hover:bg-gray-800 h-8 w-8 p-0'
                          }>
                          {i}
                        </Button>
                      );
                    }
                    if (end < totalPages) {
                      if (end < totalPages - 1) pages.push(<span key="dots2" className="text-gray-600 px-1">…</span>);
                      pages.push(
                        <Button key={totalPages} variant="outline" size="sm"
                          onClick={() => setPage(totalPages)}
                          className="border-gray-700 text-gray-300 hover:bg-gray-800 h-8 w-8 p-0">
                          {totalPages}
                        </Button>
                      );
                    }
                    return pages;
                  })()}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-30"
                >
                  Next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!loading && !error && mods.length === 0 && (
        <Card className="border-tropic-gold-dark/10 bg-black/60">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Package className="mb-4 h-12 w-12 text-tropic-gold-dark/40" />
            <p className="text-lg font-semibold text-gray-300">
              {isSearchMode ? 'No mods found' : 'No mods available'}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {isSearchMode
                ? 'Try a different search term or add a mod manually.'
                : 'Workshop data is loading or temporarily unavailable.'}
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                onClick={() => {
                  setFetchModId('');
                  setFetchError(null);
                  setFetchResult(null);
                  setFetchDialogOpen(true);
                }}
                className="bg-tropic-gold text-black hover:bg-tropic-gold-light"
              >
                <Download className="mr-1.5 h-4 w-4" />
                Fetch by Mod ID
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setFormError(null);
                  setModForm(EMPTY_MOD_FORM);
                  setDialogOpen(true);
                }}
                className="border-tropic-gold-dark/30 text-tropic-gold hover:bg-tropic-gold/10"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Add Manually
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Add Mod Dialog ──────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-gray-900 border-gray-800 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-tropic-gold">Add Mod Manually</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAddMod} className="space-y-4">
            {formError && (
              <p className="text-sm text-red-400 bg-red-600/10 border border-red-600/30 rounded px-3 py-2">
                {formError}
              </p>
            )}

            {/* Mod ID */}
            <div className="space-y-1.5">
              <Label htmlFor="mod_id" className="text-gray-300">
                Mod ID <span className="text-red-400">*</span>
              </Label>
              <Input
                id="mod_id"
                value={modForm.mod_id}
                onChange={(e) => updateField('mod_id', e.target.value)}
                placeholder="e.g. 5965550F0AA2C145"
                className="border-gray-700 bg-black/60 text-white placeholder:text-gray-500 font-mono"
              />
            </div>

            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="mod_name" className="text-gray-300">
                Name <span className="text-red-400">*</span>
              </Label>
              <Input
                id="mod_name"
                value={modForm.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="Mod display name"
                className="border-gray-700 bg-black/60 text-white placeholder:text-gray-500"
              />
            </div>

            {/* Author */}
            <div className="space-y-1.5">
              <Label htmlFor="mod_author" className="text-gray-300">
                Author
              </Label>
              <Input
                id="mod_author"
                value={modForm.author}
                onChange={(e) => updateField('author', e.target.value)}
                placeholder="Author name"
                className="border-gray-700 bg-black/60 text-white placeholder:text-gray-500"
              />
            </div>

            {/* Version */}
            <div className="space-y-1.5">
              <Label htmlFor="mod_version" className="text-gray-300">
                Version
              </Label>
              <Input
                id="mod_version"
                value={modForm.version}
                onChange={(e) => updateField('version', e.target.value)}
                placeholder="e.g. 1.0.0"
                className="border-gray-700 bg-black/60 text-white placeholder:text-gray-500"
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="mod_description" className="text-gray-300">
                Description
              </Label>
              <Textarea
                id="mod_description"
                value={modForm.description}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="Brief description of the mod"
                rows={3}
                className="border-gray-700 bg-black/60 text-white placeholder:text-gray-500 resize-none"
              />
            </div>

            {/* License */}
            <div className="space-y-1.5">
              <Label htmlFor="mod_license" className="text-gray-300">
                License
              </Label>
              <Input
                id="mod_license"
                value={modForm.license}
                onChange={(e) => updateField('license', e.target.value)}
                placeholder="e.g. MIT, APL-ND"
                className="border-gray-700 bg-black/60 text-white placeholder:text-gray-500"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                className="border-gray-700"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-tropic-gold text-black hover:bg-tropic-gold-light"
              >
                {submitting ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-1.5 h-4 w-4" />
                )}
                Add Mod
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Auto-Fetch Dialog ───────────────────────────────────────────── */}
      <Dialog open={fetchDialogOpen} onOpenChange={setFetchDialogOpen}>
        <DialogContent className="bg-gray-900 border-gray-800 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-tropic-gold">Fetch Mod from Workshop</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAutoFetch} className="space-y-4">
            {fetchError && (
              <p className="text-sm text-red-400 bg-red-600/10 border border-red-600/30 rounded px-3 py-2">
                {fetchError}
              </p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="fetch_mod_id" className="text-gray-300">
                Mod ID <span className="text-red-400">*</span>
              </Label>
              <Input
                id="fetch_mod_id"
                value={fetchModId}
                onChange={(e) => setFetchModId(e.target.value)}
                placeholder="e.g. 5965550F0AA2C145"
                className="border-gray-700 bg-black/60 text-white placeholder:text-gray-500 font-mono"
              />
              <p className="text-xs text-gray-500">
                Enter the Arma Reforger Workshop mod ID. Metadata will be fetched automatically.
              </p>
            </div>

            {fetchResult && (
              <div className="rounded-lg border border-green-600/30 bg-green-600/10 p-4 space-y-2">
                <p className="text-sm font-semibold text-green-400">✓ Mod fetched successfully</p>
                <p className="text-sm text-white">{fetchResult.name || fetchResult.mod_id}</p>
                {fetchResult.author && (
                  <p className="text-xs text-gray-400">by {fetchResult.author}</p>
                )}
                {fetchResult.version && (
                  <p className="text-xs text-gray-400">Version: {fetchResult.version}</p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setFetchDialogOpen(false)}
                className="border-gray-700"
              >
                {fetchResult ? 'Done' : 'Cancel'}
              </Button>
              {!fetchResult && (
                <Button
                  type="submit"
                  disabled={fetching}
                  className="bg-tropic-gold text-black hover:bg-tropic-gold-light"
                >
                  {fetching ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-1.5 h-4 w-4" />
                  )}
                  Fetch Metadata
                </Button>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default WorkshopBrowser;

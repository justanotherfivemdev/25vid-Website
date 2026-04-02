import React, { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';

import { API } from '@/utils/api';

// ── Initial form state for the "Add Mod" dialog ───────────────────────────
const EMPTY_MOD_FORM = {
  mod_id: '',
  name: '',
  author: '',
  version: '',
  description: '',
  license: '',
};

// ── WorkshopBrowser ────────────────────────────────────────────────────────
function WorkshopBrowser() {
  const [mods, setMods] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Add-mod dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [modForm, setModForm] = useState(EMPTY_MOD_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  // Auto-fetch dialog
  const [fetchDialogOpen, setFetchDialogOpen] = useState(false);
  const [fetchModId, setFetchModId] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [fetchResult, setFetchResult] = useState(null);

  // ── Fetch mods ───────────────────────────────────────────────────────────
  const fetchMods = useCallback(async () => {
    if (!submittedQuery.trim()) {
      setMods([]);
      setTotalPages(1);
      setTotal(0);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await axios.get(`${API}/servers/workshop/search`, {
        params: { q: submittedQuery.trim(), page },
      });

      setMods(Array.isArray(res.data?.results) ? res.data.results : []);
      setTotalPages(res.data?.pages || 1);
      setTotal(res.data?.total || 0);
    } catch (err) {
      console.error('Workshop search failed:', err);
      setError(err.response?.data?.detail || 'Failed to search workshop.');
      setMods([]);
    } finally {
      setLoading(false);
    }
  }, [submittedQuery, page]);

  useEffect(() => {
    fetchMods();
  }, [fetchMods]);

  // ── Search handler ───────────────────────────────────────────────────────
  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    setSubmittedQuery(searchQuery);
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

      // Refresh current results
      if (submittedQuery.trim()) fetchMods();
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
      if (submittedQuery.trim()) fetchMods();
    } catch (err) {
      console.error('Auto-fetch failed:', err);
      setFetchError(err.response?.data?.detail || 'Failed to fetch mod metadata from workshop.');
    } finally {
      setFetching(false);
    }
  };

  // ── Refresh mod metadata ────────────────────────────────────────────────
  const handleRefreshMod = async (modId) => {
    try {
      await axios.post(`${API}/servers/workshop/mod/${modId}/refresh`);
      if (submittedQuery.trim()) fetchMods();
    } catch (err) {
      console.error('Refresh failed:', err);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1
          className="text-3xl font-bold tracking-widest text-tropic-gold"
          style={{ fontFamily: 'Rajdhani, sans-serif' }}
        >
          WORKSHOP BROWSER
        </h1>

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
            Auto-Fetch by ID
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

      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search mods by name, ID, or author…"
            className="border-tropic-gold-dark/20 bg-black/60 pl-10 text-white placeholder:text-gray-500 focus-visible:ring-tropic-gold/40"
          />
        </div>
        <Button
          type="submit"
          disabled={loading}
          className="bg-tropic-gold text-black hover:bg-tropic-gold-light disabled:opacity-30"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
        </Button>
        {submittedQuery && (
          <Button
            type="button"
            variant="outline"
            onClick={() => fetchMods()}
            disabled={loading}
            className="border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-30"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </form>

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
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse border-tropic-gold-dark/10 bg-black/60">
              <CardContent className="space-y-3 p-6">
                <div className="h-5 w-3/4 rounded bg-zinc-800" />
                <div className="h-4 w-1/2 rounded bg-zinc-800" />
                <div className="h-4 w-2/3 rounded bg-zinc-800" />
                <div className="h-4 w-full rounded bg-zinc-800" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Results grid */}
      {!loading && mods.length > 0 && (
        <>
          <p className="text-sm text-gray-500">
            Showing {mods.length} of {total} result{total !== 1 ? 's' : ''}
          </p>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {mods.map((mod) => (
              <Card
                key={mod.mod_id || mod._id}
                className="border-tropic-gold-dark/20 bg-black/60 backdrop-blur-sm"
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base font-bold text-white leading-tight">
                      {mod.name}
                    </CardTitle>
                    <div className="flex shrink-0 gap-1">
                      {mod.version && (
                        <Badge className="bg-tropic-gold/20 text-tropic-gold border-tropic-gold-dark/30 text-xs">
                          v{mod.version}
                        </Badge>
                      )}
                      {mod.metadata_source === 'workshop' && (
                        <Badge variant="outline" className="border-green-600/40 text-green-400 text-xs">
                          Workshop
                        </Badge>
                      )}
                      {(mod.manually_entered || mod.metadata_source === 'manual') && (
                        <Badge variant="outline" className="border-amber-600/40 text-amber-400 text-xs">
                          Manual
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-2 text-sm">
                  {/* Mod ID */}
                  <p className="font-mono text-xs text-gray-500 break-all">{mod.mod_id}</p>

                  {/* Author */}
                  {mod.author && (
                    <p className="text-gray-400">
                      <span className="text-gray-500">by </span>
                      {mod.author}
                    </p>
                  )}

                  {/* Description */}
                  {mod.description && (
                    <p className="text-gray-400 line-clamp-2">{mod.description}</p>
                  )}

                  {/* License */}
                  {mod.license && (
                    <p className="text-xs text-gray-500">
                      <Info className="mr-1 inline h-3 w-3" />
                      {mod.license}
                    </p>
                  )}

                  {/* Dependencies */}
                  {mod.dependencies?.length > 0 && (
                    <p className="text-xs text-gray-500">
                      <Package className="mr-1 inline h-3 w-3" />
                      {mod.dependencies.length} dependenc{mod.dependencies.length === 1 ? 'y' : 'ies'}
                    </p>
                  )}

                  {/* Workshop link + refresh */}
                  <div className="flex items-center justify-between">
                    {mod.workshop_url && (
                      <a
                        href={mod.workshop_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-tropic-gold hover:text-tropic-gold-light transition-colors"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View on Workshop
                      </a>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRefreshMod(mod.mod_id)}
                      className="text-gray-500 hover:text-tropic-gold h-6 px-2"
                    >
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                  </div>

                  {/* Last fetched timestamp */}
                  {mod.last_fetched && (
                    <p className="text-[10px] text-gray-600 flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      Fetched {new Date(mod.last_fetched).toLocaleDateString()}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-gray-800">
              <span className="text-sm text-gray-500">
                Page {page} of {totalPages}
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
              {submittedQuery ? 'No mods found' : 'Search the Workshop'}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {submittedQuery
                ? 'Try a different search term or add a mod manually.'
                : 'Enter a mod name, ID, or author above to get started.'}
            </p>
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
            <DialogTitle className="text-tropic-gold">Auto-Fetch Mod from Workshop</DialogTitle>
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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Upload, RefreshCw, FileText, Radar, Download, Trash2, Wand2,
  EyeOff, CheckCircle2, ChevronDown, ChevronUp, FileSearch,
} from 'lucide-react';
import { API, BACKEND_URL } from '@/utils/api';

const EMPTY_FORM = {
  document_type: 'aar',
  campaign_id: '',
  operation_id: '',
  title: '',
  file: null,
};

const statusTone = {
  parsed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  pending: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  failed: 'border-red-500/30 bg-red-500/10 text-red-200',
  parser_unavailable: 'border-orange-500/30 bg-orange-500/10 text-orange-200',
  generated: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  pending_generation: 'border-blue-500/30 bg-blue-500/10 text-blue-200',
  cooldown: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
  skipped: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-200',
  hidden: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-200',
  published: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
};

function StatusBadge({ children, tone }) {
  return (
    <Badge variant="outline" className={`border ${statusTone[tone] || 'border-white/10 bg-white/5 text-white/70'}`}>
      {children}
    </Badge>
  );
}

export default function OperationalDocsManager() {
  const [documents, setDocuments] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [operations, setOperations] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [documentEvents, setDocumentEvents] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [filters, setFilters] = useState({ campaign_id: 'all', operation_id: 'all' });
  const [notice, setNotice] = useState({ type: '', text: '' });

  const filteredOperations = useMemo(() => {
    if (!filters.campaign_id || filters.campaign_id === 'all') return operations;
    return operations.filter((operation) => !operation.campaign_id || operation.campaign_id === filters.campaign_id);
  }, [operations, filters.campaign_id]);

  const uploadOperations = useMemo(() => {
    if (!form.campaign_id) return operations;
    return operations.filter((operation) => !operation.campaign_id || operation.campaign_id === form.campaign_id);
  }, [operations, form.campaign_id]);

  const fetchDocuments = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const params = {};
      if (filters.campaign_id !== 'all') params.campaign_id = filters.campaign_id;
      if (filters.operation_id !== 'all') params.operation_id = filters.operation_id;
      const res = await axios.get(`${API}/admin/operational-docs`, { params });
      setDocuments(res.data.documents || []);
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.detail || 'Failed to load operational documents.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filters.campaign_id, filters.operation_id]);

  const fetchReferenceData = useCallback(async () => {
    try {
      const [campaignRes, operationRes] = await Promise.all([
        axios.get(`${API}/campaigns`),
        axios.get(`${API}/operations`),
      ]);
      setCampaigns(campaignRes.data || []);
      setOperations(operationRes.data || []);
    } catch (error) {
      setNotice({ type: 'error', text: 'Failed to load campaign and operation references.' });
    }
  }, []);

  useEffect(() => {
    fetchReferenceData();
  }, [fetchReferenceData]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const fetchDocumentEvents = useCallback(async (documentId) => {
    const res = await axios.get(`${API}/community-events`, {
      params: { source_document_id: documentId, include_hidden: true },
    });
    setDocumentEvents((prev) => ({ ...prev, [documentId]: res.data.events || [] }));
  }, []);

  const handleExpand = async (documentId) => {
    const nextId = expandedId === documentId ? null : documentId;
    setExpandedId(nextId);
    if (nextId && !documentEvents[nextId]) {
      try {
        await fetchDocumentEvents(nextId);
      } catch (error) {
        setNotice({ type: 'error', text: 'Failed to load generated event drafts.' });
      }
    }
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!form.file || !form.campaign_id) {
      setNotice({ type: 'error', text: 'Select a campaign and attach an OPORD or AAR file first.' });
      return;
    }

    setUploading(true);
    setNotice({ type: '', text: '' });
    try {
      const payload = new FormData();
      payload.append('file', form.file);
      payload.append('document_type', form.document_type);
      payload.append('campaign_id', form.campaign_id);
      if (form.operation_id) payload.append('operation_id', form.operation_id);
      if (form.title.trim()) payload.append('title', form.title.trim());

      const res = await axios.post(`${API}/admin/operational-docs/upload`, payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const wasDuplicate = Boolean(res.data?.duplicate);
      setNotice({
        type: wasDuplicate ? 'info' : 'success',
        text: wasDuplicate
          ? 'Matching document already exists for this campaign/operation.'
          : 'Operational document uploaded successfully.',
      });
      setForm(EMPTY_FORM);
      await fetchDocuments({ silent: true });
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.detail || 'Upload failed.' });
    } finally {
      setUploading(false);
    }
  };

  const runDocumentAction = async (document, action) => {
    try {
      if (action === 'download') {
        window.open(`${BACKEND_URL}${document.download_url}`, '_blank', 'noopener,noreferrer');
        return;
      }

      if (action === 'delete') {
        const confirmed = window.confirm(`Delete ${document.title || document.original_filename}? This will hide any generated draft events.`);
        if (!confirmed) return;
        await axios.delete(`${API}/admin/operational-docs/${document.id}`);
        setNotice({ type: 'success', text: 'Operational document deleted.' });
      } else if (action === 'reprocess') {
        await axios.post(`${API}/admin/operational-docs/${document.id}/reprocess`);
        setNotice({ type: 'success', text: 'Document reprocessed and draft generation refreshed.' });
      } else if (action === 'publish') {
        await axios.post(`${API}/admin/operational-docs/${document.id}/publish-generated-events`);
        setNotice({ type: 'success', text: 'Generated campaign events published to the live feed.' });
      } else if (action === 'hide') {
        await axios.post(`${API}/admin/operational-docs/${document.id}/hide-generated-events`);
        setNotice({ type: 'success', text: 'Generated campaign events hidden from the live feed.' });
      }

      await fetchDocuments({ silent: true });
      if (expandedId === document.id) {
        await fetchDocumentEvents(document.id);
      }
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.detail || 'Action failed.' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="relative corner-bracket border border-tropic-gold/15 bg-[radial-gradient(circle_at_top,rgba(201,162,39,0.06),#050a0e_58%)] px-6 py-7 shadow-2xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#c9a227]" style={{ fontFamily: "'Oswald', sans-serif" }}>Operations Workspace</p>
            <h1 className="mt-3 text-4xl font-black uppercase tracking-[0.12em] text-[#e8c547]" style={{ fontFamily: "'Share Tech', sans-serif" }}>
              Operational Documents
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-[#8a9aa8]">
              Upload OPORDs for planning context and AARs for bounded AI draft generation. Drafts stay hidden until staff publish them, so we keep the feed current without burning API calls on every page load.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:w-[360px]">
            <Card className="border-tropic-gold/15 bg-[#050a0e]/45">
              <CardContent className="p-4">
                <p className="text-[11px] uppercase tracking-[0.25em] text-[#4a6070]">Documents</p>
                <p className="mt-2 text-3xl font-black text-white" style={{ fontFamily: "'Share Tech', sans-serif" }}>{documents.length}</p>
              </CardContent>
            </Card>
            <Card className="border-[#708b34]/20 bg-[#050a0e]/45">
              <CardContent className="p-4">
                <p className="text-[11px] uppercase tracking-[0.25em] text-[#4a6070]">Draft Events</p>
                <p className="mt-2 text-3xl font-black text-[#dce7c2]" style={{ fontFamily: "'Share Tech', sans-serif" }}>
                  {documents.reduce((sum, document) => sum + (document.generated_event_count || 0), 0)}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {notice.text && (
        <Alert className={notice.type === 'error' ? 'border-red-500/30 bg-red-500/10' : 'border-tropic-gold/25 bg-tropic-gold/10'}>
          <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-[420px,1fr]">
        <Card className="border-tropic-gold/15 bg-[#0b1016] shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Upload className="h-5 w-5 text-tropic-gold" />
              Upload OPORD / AAR
            </CardTitle>
            <CardDescription>
              AAR uploads create hidden simulated-intel drafts using campaign context and the latest OPORD.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleUpload}>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                <div>
                  <Label className="text-[#8a9aa8]">Document Type</Label>
                  <select
                    value={form.document_type}
                    onChange={(event) => setForm((prev) => ({ ...prev, document_type: event.target.value }))}
                    className="mt-2 w-full rounded-md border border-tropic-gold/20 bg-[#050a0e] px-3 py-2 text-sm text-[#d0d8e0] focus:border-tropic-gold/50 focus:outline-none"
                  >
                    <option value="aar">AAR</option>
                    <option value="opord">OPORD</option>
                  </select>
                </div>
                <div>
                  <Label className="text-[#8a9aa8]">Campaign</Label>
                  <select
                    value={form.campaign_id}
                    onChange={(event) => setForm((prev) => ({ ...prev, campaign_id: event.target.value, operation_id: '' }))}
                    className="mt-2 w-full rounded-md border border-tropic-gold/20 bg-[#050a0e] px-3 py-2 text-sm text-[#d0d8e0] focus:border-tropic-gold/50 focus:outline-none"
                  >
                    <option value="">Select campaign</option>
                    {campaigns.map((campaign) => (
                      <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <Label className="text-[#8a9aa8]">Linked Operation</Label>
                <select
                  value={form.operation_id}
                  onChange={(event) => setForm((prev) => ({ ...prev, operation_id: event.target.value }))}
                  className="mt-2 w-full rounded-md border border-tropic-gold/20 bg-[#050a0e] px-3 py-2 text-sm text-[#d0d8e0] focus:border-tropic-gold/50 focus:outline-none"
                >
                  <option value="">Campaign-wide / none</option>
                  {uploadOperations.map((operation) => (
                    <option key={operation.id} value={operation.id}>{operation.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-[#8a9aa8]">Title Override</Label>
                <Input
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Optional custom title"
                  className="mt-2 border-tropic-gold/20 bg-[#050a0e] text-[#d0d8e0]"
                />
              </div>

              <div>
                <Label className="text-[#8a9aa8]">Document File</Label>
                <Input
                  type="file"
                  accept=".pdf,.docx,.txt"
                  onChange={(event) => setForm((prev) => ({ ...prev, file: event.target.files?.[0] || null }))}
                  className="mt-2 border-tropic-gold/20 bg-[#050a0e] text-[#d0d8e0] file:mr-4 file:rounded-md file:border-0 file:bg-tropic-gold/15 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-tropic-gold"
                />
                <p className="mt-2 text-xs text-[#4a6070]">Supported in v1: PDF, DOCX, TXT. Files remain admin-only.</p>
              </div>

              <Button type="submit" disabled={uploading} className="w-full bg-tropic-gold text-black hover:bg-tropic-gold-light">
                <Upload className="mr-2 h-4 w-4" />
                {uploading ? 'Uploading...' : 'Upload Document'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-tropic-gold/15 bg-[#0b1016] shadow-xl">
          <CardHeader className="gap-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Radar className="h-5 w-5 text-tropic-gold" />
                  Document Queue
                </CardTitle>
                <CardDescription>
                  Review parse status, generation state, and publish or hide simulated-intel outputs.
                </CardDescription>
              </div>
              <Button variant="outline" onClick={() => fetchDocuments({ silent: true })} disabled={refreshing} className="border-tropic-gold/25 bg-[#050a0e]/40 text-tropic-gold hover:bg-tropic-gold/10">
                <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label className="text-[#8a9aa8]">Filter Campaign</Label>
                <select
                  value={filters.campaign_id}
                  onChange={(event) => setFilters((prev) => ({ ...prev, campaign_id: event.target.value, operation_id: 'all' }))}
                  className="mt-2 w-full rounded-md border border-tropic-gold/20 bg-[#050a0e] px-3 py-2 text-sm text-[#d0d8e0] focus:border-tropic-gold/50 focus:outline-none"
                >
                  <option value="all">All campaigns</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-[#8a9aa8]">Filter Operation</Label>
                <select
                  value={filters.operation_id}
                  onChange={(event) => setFilters((prev) => ({ ...prev, operation_id: event.target.value }))}
                  className="mt-2 w-full rounded-md border border-tropic-gold/20 bg-[#050a0e] px-3 py-2 text-sm text-[#d0d8e0] focus:border-tropic-gold/50 focus:outline-none"
                >
                  <option value="all">All operations</option>
                  {filteredOperations.map((operation) => (
                    <option key={operation.id} value={operation.id}>{operation.title}</option>
                  ))}
                </select>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {loading ? (
              <div className="py-14 text-center text-[#4a6070]">Loading operational documents...</div>
            ) : documents.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-tropic-gold/20 bg-[#050a0e]/30 p-10 text-center">
                <FileSearch className="mx-auto h-8 w-8 text-tropic-gold-dark" />
                <p className="mt-3 text-lg font-semibold text-white">No operational documents yet</p>
                <p className="mt-2 text-sm text-[#4a6070]">Upload an OPORD or AAR to start building AI-assisted campaign event drafts.</p>
              </div>
            ) : (
              documents.map((document) => {
                const docEvents = documentEvents[document.id] || [];
                const isExpanded = expandedId === document.id;
                return (
                  <div key={document.id} className="rounded-2xl border border-tropic-gold/10 bg-[#050a0e]/35 p-4 shadow-lg">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge tone={document.document_type === 'aar' ? 'pending_generation' : 'parsed'}>
                            {document.document_type.toUpperCase()}
                          </StatusBadge>
                          <StatusBadge tone={document.parse_status}>{document.parse_status}</StatusBadge>
                          <StatusBadge tone={document.generation_status}>{document.generation_status || 'not_applicable'}</StatusBadge>
                          {document.generation_provider && (
                            <StatusBadge tone={document.generation_provider === 'openai' ? 'published' : 'cooldown'}>
                              {document.generation_provider}
                            </StatusBadge>
                          )}
                        </div>

                        <div>
                          <h3 className="text-xl font-bold text-white" style={{ fontFamily: "'Share Tech', sans-serif" }}>
                            {document.title || document.original_filename}
                          </h3>
                          <p className="mt-1 text-sm text-[#8a9aa8]">
                            {document.campaign_name || 'Unknown campaign'}
                            {document.operation_title ? ` • ${document.operation_title}` : ' • Campaign-wide context'}
                          </p>
                        </div>

                        <div className="grid gap-2 text-xs text-[#4a6070] md:grid-cols-2 xl:grid-cols-3">
                          <div>File: {document.original_filename}</div>
                          <div>Size: {(document.file_size / 1024).toFixed(1)} KB</div>
                          <div>Drafts: {document.generated_event_count || 0}</div>
                          <div>Uploaded by: {document.uploaded_by_username || 'Unknown'}</div>
                          <div>Created: {new Date(document.created_at).toLocaleString()}</div>
                          <div>Last generated: {document.last_generated_at ? new Date(document.last_generated_at).toLocaleString() : 'Not yet'}</div>
                        </div>

                        {document.parse_error && (
                          <p className="rounded-lg border border-orange-500/20 bg-orange-500/10 px-3 py-2 text-xs text-orange-200">
                            Parser note: {document.parse_error}
                          </p>
                        )}
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2 xl:w-[280px]">
                        <Button variant="outline" onClick={() => runDocumentAction(document, 'download')} className="border-white/10 bg-[#050a0e]/40 text-[#d0d8e0] hover:bg-white/5">
                          <Download className="mr-2 h-4 w-4" />
                          Download
                        </Button>
                        <Button variant="outline" onClick={() => runDocumentAction(document, 'reprocess')} className="border-tropic-gold/20 bg-[#050a0e]/40 text-tropic-gold hover:bg-tropic-gold/10">
                          <Wand2 className="mr-2 h-4 w-4" />
                          Regenerate
                        </Button>
                        {document.document_type === 'aar' && (
                          <Button variant="outline" onClick={() => runDocumentAction(document, 'publish')} className="border-emerald-500/20 bg-[#050a0e]/40 text-emerald-200 hover:bg-emerald-500/10">
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Publish Drafts
                          </Button>
                        )}
                        {document.document_type === 'aar' && (
                          <Button variant="outline" onClick={() => runDocumentAction(document, 'hide')} className="border-zinc-500/20 bg-[#050a0e]/40 text-zinc-200 hover:bg-white/5">
                            <EyeOff className="mr-2 h-4 w-4" />
                            Hide Drafts
                          </Button>
                        )}
                        <Button variant="outline" onClick={() => handleExpand(document.id)} className="border-white/10 bg-[#050a0e]/40 text-[#d0d8e0] hover:bg-white/5 sm:col-span-1">
                          {isExpanded ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}
                          Review Drafts
                        </Button>
                        <Button variant="outline" onClick={() => runDocumentAction(document, 'delete')} className="border-red-500/20 bg-[#050a0e]/40 text-red-200 hover:bg-red-500/10 sm:col-span-1">
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-4 rounded-2xl border border-white/8 bg-[#0a0f14] p-4">
                        <div className="mb-3 flex items-center gap-2">
                          <FileText className="h-4 w-4 text-tropic-gold" />
                          <p className="text-sm font-semibold text-white">Generated Event Drafts</p>
                        </div>
                        {docEvents.length === 0 ? (
                          <p className="text-sm text-[#4a6070]">No generated drafts are attached to this document yet.</p>
                        ) : (
                          <div className="space-y-3">
                            {docEvents.map((event) => (
                              <div key={event.id} className="rounded-xl border border-white/8 bg-[#050a0e]/35 p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <StatusBadge tone={event.generation_status || 'pending_generation'}>
                                    {event.generation_status || 'draft'}
                                  </StatusBadge>
                                  <StatusBadge tone={event.is_simulated ? 'pending_generation' : 'published'}>
                                    {event.is_simulated ? 'simulated' : 'real'}
                                  </StatusBadge>
                                  <StatusBadge tone={event.threatLevel}>{event.threatLevel}</StatusBadge>
                                </div>
                                <p className="mt-3 text-base font-semibold text-white">{event.title}</p>
                                <p className="mt-2 text-sm text-[#8a9aa8]">{event.summary}</p>
                                <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#4a6070]">
                                  <span>{event.campaign_name || 'No campaign label'}</span>
                                  <span>{event.location?.placeName || event.location?.country || 'No location'}</span>
                                  <span>{event.generation_provider || 'heuristic'}</span>
                                  <span>{new Date(event.timestamp).toLocaleString()}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

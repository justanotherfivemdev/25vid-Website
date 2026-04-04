import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  Clock,
  Loader2,
  RefreshCw,
  Send,
  StickyNote,
  User,
} from 'lucide-react';
import { API } from '@/utils/api';

const NOTE_CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'mod_change', label: 'Mod Change' },
  { value: 'mod_request', label: 'Mod Request' },
  { value: 'moderation', label: 'Moderation' },
  { value: 'development', label: 'Development' },
  { value: 'community', label: 'Community' },
  { value: 'incident', label: 'Incident' },
  { value: 'test', label: 'Test' },
  { value: 'handoff', label: 'Handoff' },
];

const NOTE_STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'archived', label: 'Archived' },
];

const NOTE_PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

function emptyNoteForm() {
  return {
    title: '',
    category: 'general',
    status: 'open',
    priority: 'medium',
    tagsText: '',
    relatedModsText: '',
    requestedActionsText: '',
    followUpRequired: false,
    eventAt: '',
    content: '',
  };
}

function parseTokenList(value) {
  return String(value || '')
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseLineList(value) {
  return String(value || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function humanize(value) {
  if (!value) return 'Unspecified';
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
}

function statusTone(status) {
  return {
    open: 'border-red-600/30 text-red-300',
    in_progress: 'border-blue-600/30 text-blue-300',
    blocked: 'border-amber-600/30 text-amber-300',
    resolved: 'border-green-600/30 text-green-300',
    archived: 'border-zinc-700 text-zinc-400',
  }[status] || 'border-zinc-700 text-zinc-300';
}

function priorityTone(priority) {
  return {
    low: 'border-zinc-700 text-zinc-300',
    medium: 'border-blue-600/30 text-blue-300',
    high: 'border-amber-600/30 text-amber-300',
    critical: 'border-red-600/30 text-red-300',
  }[priority] || 'border-zinc-700 text-zinc-300';
}

function NotesModule() {
  const { serverId } = useOutletContext();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState(emptyNoteForm);

  const fetchNotes = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await axios.get(`${API}/servers/${serverId}/notes`);
      setNotes(Array.isArray(res.data?.notes) ? res.data.notes : Array.isArray(res.data) ? res.data : []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load notes.');
      if (!silent) setNotes([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [serverId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchNotes(true);
    }, 30_000);
    return () => clearInterval(intervalId);
  }, [fetchNotes]);

  const addNote = useCallback(async () => {
    if (!form.content.trim()) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      await axios.post(`${API}/servers/${serverId}/notes`, {
        title: form.title.trim(),
        category: form.category,
        status: form.status,
        priority: form.priority,
        tags: parseTokenList(form.tagsText),
        related_mods: parseTokenList(form.relatedModsText),
        requested_actions: parseLineList(form.requestedActionsText),
        follow_up_required: form.followUpRequired,
        event_at: form.eventAt ? new Date(form.eventAt).toISOString() : null,
        content: form.content.trim(),
      });
      setForm(emptyNoteForm());
      setMessage('Note logged.');
      await fetchNotes(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save note.');
    } finally {
      setSubmitting(false);
    }
  }, [fetchNotes, form, serverId]);

  const openNotes = useMemo(
    () => notes.filter((note) => !['resolved', 'archived'].includes(note.status || 'open')).length,
    [notes],
  );
  const followUps = useMemo(() => notes.filter((note) => note.follow_up_required).length, [notes]);
  const modRelated = useMemo(
    () => notes.filter((note) => ['mod_change', 'mod_request'].includes(note.category || 'general')).length,
    [notes],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-wider text-gray-300" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
            ADMIN NOTES
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Log moderation decisions, mod changes, testing requests, and community follow-up in a structured ops queue.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="border-zinc-800 text-[10px] text-gray-400">
            Refreshes every 30s
          </Badge>
          <Button size="sm" variant="outline" onClick={() => fetchNotes(true)} className="h-7 border-zinc-800 text-xs text-gray-400">
            <RefreshCw className={`mr-1 h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-zinc-800 bg-black/60">
          <CardContent className="p-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Total Notes</div>
            <div className="mt-2 text-2xl font-semibold text-white">{notes.length}</div>
            <div className="mt-1 text-xs text-gray-500">Shared operating history for this server.</div>
          </CardContent>
        </Card>
        <Card className="border-zinc-800 bg-black/60">
          <CardContent className="p-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Open Queue</div>
            <div className="mt-2 text-2xl font-semibold text-white">{openNotes}</div>
            <div className="mt-1 text-xs text-gray-500">{followUps} require explicit follow-up.</div>
          </CardContent>
        </Card>
        <Card className="border-zinc-800 bg-black/60">
          <CardContent className="p-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Mod Related</div>
            <div className="mt-2 text-2xl font-semibold text-white">{modRelated}</div>
            <div className="mt-1 text-xs text-gray-500">Requests and changes tied to mods or workshop content.</div>
          </CardContent>
        </Card>
      </div>

      {message ? (
        <div className="rounded border border-green-600/30 bg-green-600/10 px-3 py-2 text-xs text-green-300">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="rounded border border-red-600/30 bg-red-600/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      ) : null}

      <Card className="border-zinc-800 bg-black/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold tracking-wider text-gray-400">NEW OPS NOTE</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 xl:grid-cols-2">
            <div>
              <label className="text-xs text-gray-400">Title</label>
              <Input
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Short summary for the queue"
                className="mt-1 border-zinc-800 bg-black/60 text-sm text-white"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400">Event Time</label>
              <Input
                type="datetime-local"
                value={form.eventAt}
                onChange={(e) => setForm((prev) => ({ ...prev, eventAt: e.target.value }))}
                className="mt-1 border-zinc-800 bg-black/60 text-sm text-white"
              />
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-3">
            <div>
              <label className="text-xs text-gray-400">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                className="mt-1 h-9 w-full rounded border border-zinc-800 bg-black/60 px-3 text-sm text-white"
              >
                {NOTE_CATEGORIES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                className="mt-1 h-9 w-full rounded border border-zinc-800 bg-black/60 px-3 text-sm text-white"
              >
                {NOTE_STATUSES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value }))}
                className="mt-1 h-9 w-full rounded border border-zinc-800 bg-black/60 px-3 text-sm text-white"
              >
                {NOTE_PRIORITIES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-black/40 px-4 py-3">
            <div>
              <div className="text-sm text-gray-300">Follow-up required</div>
              <div className="text-[10px] text-gray-600">Use this for unresolved tasks, moderation review, or changes that still need testing.</div>
            </div>
            <Switch checked={form.followUpRequired} onCheckedChange={(value) => setForm((prev) => ({ ...prev, followUpRequired: value }))} className="h-4 w-7" />
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            <div>
              <label className="text-xs text-gray-400">Tags</label>
              <Input
                value={form.tagsText}
                onChange={(e) => setForm((prev) => ({ ...prev, tagsText: e.target.value }))}
                placeholder="Comma separated, e.g. battleye, restart-window, handoff"
                className="mt-1 border-zinc-800 bg-black/60 text-sm text-white"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400">Related Mods</label>
              <Input
                value={form.relatedModsText}
                onChange={(e) => setForm((prev) => ({ ...prev, relatedModsText: e.target.value }))}
                placeholder="Comma separated mod names"
                className="mt-1 border-zinc-800 bg-black/60 text-sm text-white"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400">Requested Actions</label>
            <Textarea
              value={form.requestedActionsText}
              onChange={(e) => setForm((prev) => ({ ...prev, requestedActionsText: e.target.value }))}
              placeholder="One action per line, e.g. test updated mod pack on staging"
              className="mt-1 min-h-[88px] border-zinc-800 bg-black/60 text-sm text-white placeholder:text-gray-600"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400">Details</label>
            <Textarea
              value={form.content}
              onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
              placeholder="Capture the decision, evidence, impact, and what the next admin should know."
              className="mt-1 min-h-[140px] border-zinc-800 bg-black/60 text-sm text-white placeholder:text-gray-600"
              rows={5}
            />
          </div>

          <div className="flex justify-end">
            <Button size="sm" onClick={addNote} disabled={!form.content.trim() || submitting}
              className="bg-tropic-gold text-black hover:bg-tropic-gold-light text-xs">
              {submitting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}
              Log Note
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-tropic-gold" />
        </div>
      ) : notes.length === 0 ? (
        <Card className="border-zinc-800 bg-black/60">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <StickyNote className="mb-2 h-8 w-8 text-gray-700" />
            <p className="text-sm text-gray-500">No notes yet</p>
            <p className="mt-1 text-xs text-gray-600">Start logging operational context for mod changes, moderation, testing, and handoffs.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notes.map((note, index) => (
            <Card key={note.id || index} className="border-zinc-800 bg-black/60">
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-gray-200">{note.title || humanize(note.category)}</span>
                      <Badge variant="outline" className="border-zinc-700 text-[10px] text-gray-400">
                        {humanize(note.category)}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] ${statusTone(note.status)}`}>
                        {humanize(note.status)}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] ${priorityTone(note.priority)}`}>
                        {humanize(note.priority)}
                      </Badge>
                      {note.follow_up_required ? (
                        <Badge variant="outline" className="border-tropic-gold/30 text-[10px] text-tropic-gold">
                          Follow-up
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm text-gray-200">{note.content}</p>
                  </div>
                </div>

                {(note.tags?.length || note.related_mods?.length) ? (
                  <div className="flex flex-wrap gap-2">
                    {(note.tags || []).map((tag) => (
                      <Badge key={`${note.id}-tag-${tag}`} variant="outline" className="border-zinc-700 text-[10px] text-gray-400">
                        #{tag}
                      </Badge>
                    ))}
                    {(note.related_mods || []).map((mod) => (
                      <Badge key={`${note.id}-mod-${mod}`} variant="outline" className="border-blue-600/30 text-[10px] text-blue-300">
                        {mod}
                      </Badge>
                    ))}
                  </div>
                ) : null}

                {note.requested_actions?.length > 0 ? (
                  <div className="rounded-lg border border-zinc-800/70 bg-zinc-950/60 p-3">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
                      Requested Actions
                    </div>
                    <div className="space-y-1">
                      {note.requested_actions.map((action, actionIndex) => (
                        <div key={`${note.id}-action-${actionIndex}`} className="text-xs text-gray-400">
                          {action}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-4 text-[11px] text-gray-600">
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" /> {note.author_name || note.author_id || 'Unknown'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Created {formatDate(note.created_at)}
                  </span>
                  {note.event_at ? (
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Event {formatDate(note.event_at)}
                    </span>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default NotesModule;

import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  StickyNote,
  Clock,
  User,
  Loader2,
  Send,
} from 'lucide-react';
import { API } from '@/utils/api';

function NotesModule() {
  const { server, serverId } = useOutletContext();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/servers/${serverId}/notes`);
      setNotes(res.data?.notes || res.data || []);
    } catch {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  const addNote = useCallback(async () => {
    if (!newNote.trim()) return;
    setSubmitting(true);
    try {
      await axios.post(`${API}/servers/${serverId}/notes`, { content: newNote.trim() });
      setNewNote('');
      await fetchNotes();
    } catch {
      // Error
    } finally {
      setSubmitting(false);
    }
  }, [newNote, serverId, fetchNotes]);

  return (
    <div className="space-y-6">
      <h2 className="text-sm font-semibold tracking-wider text-gray-300" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
        ADMIN NOTES
      </h2>

      {/* New note form */}
      <Card className="border-zinc-800 bg-black/60">
        <CardContent className="p-4">
          <Textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Add a note for the team… (handoff notes, observations, action items)"
            className="min-h-[80px] border-zinc-800 bg-black/80 text-sm text-white placeholder:text-gray-600"
            rows={3}
          />
          <div className="mt-3 flex justify-end">
            <Button size="sm" onClick={addNote} disabled={!newNote.trim() || submitting}
              className="bg-tropic-gold text-black hover:bg-tropic-gold-light text-xs">
              {submitting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}
              Add Note
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notes list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-tropic-gold" />
        </div>
      ) : notes.length === 0 ? (
        <Card className="border-zinc-800 bg-black/60">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <StickyNote className="mb-2 h-8 w-8 text-gray-700" />
            <p className="text-sm text-gray-500">No notes yet</p>
            <p className="mt-1 text-xs text-gray-600">Add notes for team handoffs and observations</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notes.map((note, i) => (
            <Card key={note.id || i} className="border-zinc-800 bg-black/60">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm text-gray-200 whitespace-pre-wrap">{note.content}</p>
                    <div className="mt-2 flex items-center gap-3 text-[10px] text-gray-600">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" /> {note.author_name || note.author_id || 'Unknown'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {note.created_at ? new Date(note.created_at).toLocaleString() : '—'}
                      </span>
                    </div>
                  </div>
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

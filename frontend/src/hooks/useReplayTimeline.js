/**
 * useReplayTimeline.js
 *
 * React hook for replaying operations plan events on a timeline.
 * Fetches all events for a plan and provides playback controls:
 * play, pause, seek, speed control.
 *
 * The hook reconstructs map state incrementally by applying events
 * up to the current playback position, avoiding full rebuilds on
 * every frame.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { API } from '@/utils/api';

/**
 * Replay events and return the resulting units array at that point.
 */
function replayEventsToUnits(events) {
  const unitsById = {};

  for (const ev of events) {
    const { event_type, payload } = ev;

    if (event_type === 'UNIT_CREATE') {
      const unit = payload?.unit;
      if (unit?.id) unitsById[unit.id] = { ...unit };
    } else if (event_type === 'UNIT_MOVE' || event_type === 'UNIT_UPDATE') {
      const uid = payload?.unit_id;
      const changes = payload?.changes || {};
      if (uid && unitsById[uid]) {
        Object.assign(unitsById[uid], changes);
      }
    } else if (event_type === 'UNIT_DELETE') {
      const uid = payload?.unit_id;
      if (uid) delete unitsById[uid];
    }
  }

  return Object.values(unitsById);
}

export default function useReplayTimeline({ planId, enabled = false }) {
  const [events, setEvents] = useState([]);
  const [voiceClips, setVoiceClips] = useState([]);
  const [loading, setLoading] = useState(false);

  // Playback state
  const [playing, setPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [speed, setSpeed] = useState(1); // 1x, 2x, 4x, 0.5x
  const [units, setUnits] = useState([]);

  const timerRef = useRef(null);
  const audioRef = useRef(null);

  // ── Load events + voice clips ───────────────────────────────────────

  useEffect(() => {
    if (!planId || !enabled) return;
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [evRes, voiceRes] = await Promise.all([
          axios.get(`${API}/operations-events/${planId}`),
          axios.get(`${API}/voice/${planId}`).catch(() => ({ data: [] })),
        ]);
        if (!cancelled) {
          setEvents(evRes.data || []);
          setVoiceClips(voiceRes.data || []);
          setCurrentIndex(0);
          setUnits([]);
        }
      } catch (err) {
        console.error('Failed to load replay events', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [planId, enabled]);

  // ── Compute timeline duration ─────────────────────────────────────

  const totalEvents = events.length;
  const firstTimestamp = events.length > 0 ? new Date(events[0].timestamp).getTime() : 0;
  const lastTimestamp = events.length > 0 ? new Date(events[events.length - 1].timestamp).getTime() : 0;
  const totalDurationMs = lastTimestamp - firstTimestamp || 1000;

  // ── Seek to a specific index → rebuild units ────────────────────────

  const seekTo = useCallback((index) => {
    const clamped = Math.max(0, Math.min(index, events.length));
    setCurrentIndex(clamped);

    // Rebuild units from events[0..clamped)
    const slice = events.slice(0, clamped);
    setUnits(replayEventsToUnits(slice));
  }, [events]);

  // ── Step forward one event ──────────────────────────────────────────

  const stepForward = useCallback(() => {
    if (currentIndex >= events.length) {
      setPlaying(false);
      return;
    }

    const ev = events[currentIndex];
    const { event_type, payload } = ev;

    // Apply the single event incrementally
    setUnits((prev) => {
      const copy = [...prev];

      if (event_type === 'UNIT_CREATE') {
        const unit = payload?.unit;
        if (unit?.id && !copy.some((u) => u.id === unit.id)) {
          copy.push({ ...unit });
        }
      } else if (event_type === 'UNIT_MOVE' || event_type === 'UNIT_UPDATE') {
        const uid = payload?.unit_id;
        const changes = payload?.changes || {};
        const idx = copy.findIndex((u) => u.id === uid);
        if (idx >= 0) copy[idx] = { ...copy[idx], ...changes };
      } else if (event_type === 'UNIT_DELETE') {
        const uid = payload?.unit_id;
        return copy.filter((u) => u.id !== uid);
      }

      return copy;
    });

    setCurrentIndex((prev) => prev + 1);
  }, [currentIndex, events]);

  // ── Playback timer ──────────────────────────────────────────────────

  useEffect(() => {
    if (!playing || events.length === 0) return;

    const advance = () => {
      if (currentIndex >= events.length) {
        setPlaying(false);
        return;
      }

      // Calculate delay until next event (real time gap / speed)
      const now_ts = new Date(events[currentIndex].timestamp).getTime();
      const next_ts = currentIndex + 1 < events.length
        ? new Date(events[currentIndex + 1].timestamp).getTime()
        : now_ts + 500;

      let delay = Math.max(50, (next_ts - now_ts) / speed);
      // Cap at 2 seconds to avoid long waits
      delay = Math.min(delay, 2000 / speed);

      stepForward();

      timerRef.current = setTimeout(advance, delay);
    };

    timerRef.current = setTimeout(advance, 50);

    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed]);

  // ── Voice playback sync ─────────────────────────────────────────────

  useEffect(() => {
    if (!playing || voiceClips.length === 0 || currentIndex >= events.length) return;

    const currentTimestamp = events[currentIndex]?.timestamp;
    if (!currentTimestamp) return;

    const currentMs = new Date(currentTimestamp).getTime();

    // Find any voice clip that should play at this timestamp (±1 second)
    const clip = voiceClips.find((c) => {
      const clipMs = new Date(c.timestamp).getTime();
      return Math.abs(clipMs - currentMs) < 1000;
    });

    if (clip && clip.audio_url && audioRef.current !== clip.id) {
      audioRef.current = clip.id;
      try {
        const audio = new Audio(clip.audio_url);
        audio.volume = 0.8;
        audio.play().catch(() => {});
      } catch {
        // ignore audio playback errors
      }
    }
  }, [playing, currentIndex, events, voiceClips]);

  // ── Controls ────────────────────────────────────────────────────────

  const play = useCallback(() => {
    if (currentIndex >= events.length && events.length > 0) {
      seekTo(0);
    }
    setPlaying(true);
  }, [currentIndex, events.length, seekTo]);

  const pause = useCallback(() => {
    setPlaying(false);
    clearTimeout(timerRef.current);
  }, []);

  const reset = useCallback(() => {
    setPlaying(false);
    clearTimeout(timerRef.current);
    seekTo(0);
  }, [seekTo]);

  // Progress as percentage 0-100
  const progress = totalEvents > 0 ? (currentIndex / totalEvents) * 100 : 0;

  // Current event for display
  const currentEvent = currentIndex > 0 && currentIndex <= events.length
    ? events[currentIndex - 1]
    : null;

  return {
    // Data
    events,
    voiceClips,
    units,
    loading,

    // Playback state
    playing,
    currentIndex,
    totalEvents,
    progress,
    speed,
    currentEvent,
    totalDurationMs,
    firstTimestamp,
    lastTimestamp,

    // Controls
    play,
    pause,
    reset,
    seekTo,
    setSpeed,
    stepForward,
  };
}

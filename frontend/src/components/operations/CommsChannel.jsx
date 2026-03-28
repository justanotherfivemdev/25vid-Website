/**
 * CommsChannel.jsx
 *
 * Voice communications panel for operations planning.
 * Provides push-to-talk recording with a user-customizable key (default:
 * CapsLock) and playback of voice clips.  Clips are uploaded to the
 * backend and timestamped so they can be synced with the timeline replay.
 *
 * Used in both the live planner (OperationsPlanner) and the read-only
 * viewer (OperationsPlanView) for replay.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { API, BACKEND_URL } from '@/utils/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Mic, MicOff, Volume2, VolumeX, Radio, User,
} from 'lucide-react';

import usePushToTalk from '@/hooks/usePushToTalk';
import PushToTalkSettings from '@/components/operations/PushToTalkSettings';

export default function CommsChannel({
  planId,
  sessionId = null,
  readOnly = false,
  username = '',
}) {
  const [clips, setClips] = useState([]);
  const [recording, setRecording] = useState(false);
  const [muted, setMuted] = useState(false);
  const [joined, setJoined] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  // ── Load existing clips ─────────────────────────────────────────────

  const fetchClips = useCallback(async () => {
    if (!planId) return;
    try {
      const res = await axios.get(`${API}/voice/${planId}`);
      setClips(res.data || []);
    } catch {
      // ignore
    }
  }, [planId]);

  useEffect(() => {
    if (joined) fetchClips();
  }, [joined, fetchClips]);

  // Poll for new clips every 10 seconds while joined
  useEffect(() => {
    if (!joined || readOnly) return;
    const interval = setInterval(fetchClips, 10000);
    return () => clearInterval(interval);
  }, [joined, readOnly, fetchClips]);

  // ── Join / Leave channel ──────────────────────────────────────────

  const joinChannel = async () => {
    setJoined(true);
    if (!readOnly) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
      } catch (err) {
        console.error('Microphone access denied', err);
      }
    }
  };

  const leaveChannel = () => {
    setJoined(false);
    stopRecording();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  // ── Recording logic ───────────────────────────────────────────────

  const startRecording = useCallback(() => {
    if (!streamRef.current || recording || readOnly) return;

    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    const mr = new MediaRecorder(streamRef.current, { mimeType });
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    mr.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      if (blob.size < 500) return; // ignore tiny clips

      // Upload
      const formData = new FormData();
      formData.append('file', blob, 'clip.webm');
      formData.append('plan_id', planId);
      if (sessionId) formData.append('session_id', sessionId);
      formData.append('duration', '0'); // duration unknown client-side

      try {
        const res = await axios.post(`${API}/voice/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setClips((prev) => [...prev, res.data]);
      } catch (err) {
        console.error('Voice upload failed', err);
      }
    };

    mr.start();
    mediaRecorderRef.current = mr;
    setRecording(true);
  }, [recording, readOnly, planId, sessionId]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    setRecording(false);
  }, []);

  // ── Push-to-talk hook (customisable key, input-guard built in) ────

  const {
    pttKey, pttKeyLabel, changeKey, resetKey,
  } = usePushToTalk({
    enabled: joined && !readOnly,
    onKeyDown: startRecording,
    onKeyUp: stopRecording,
  });

  // ── Play a clip ───────────────────────────────────────────────────

  const playClip = (clip) => {
    if (muted) return;
    const url = clip.audio_url?.startsWith('http')
      ? clip.audio_url
      : `${BACKEND_URL}${clip.audio_url}`;
    const audio = new Audio(url);
    audio.volume = 0.8;
    audio.play().catch(() => {});
  };

  // ── Render ────────────────────────────────────────────────────────

  if (!joined) {
    return (
      <div className="p-3 text-center">
        <Button
          size="sm"
          variant="outline"
          className="border-[#C9A227] text-[#C9A227] hover:bg-[#C9A227]/10"
          onClick={joinChannel}
        >
          <Radio className="w-4 h-4 mr-1" /> Join Comms
        </Button>
        <p className="text-[10px] text-gray-600 mt-1">Listen to or record voice transmissions</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Channel header */}
      <div className="flex items-center justify-between px-3 pt-2">
        <div className="flex items-center gap-1.5">
          <Radio className="w-3.5 h-3.5 text-green-400" />
          <span className="text-[10px] text-green-400 uppercase tracking-wider font-bold">
            Comms Active
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="text-gray-500 hover:text-gray-300 transition"
            onClick={() => setMuted(!muted)}
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-400 hover:text-red-300 h-6 px-2 text-[10px]"
            onClick={leaveChannel}
          >
            Leave
          </Button>
        </div>
      </div>

      {/* Push-to-talk button + recording indicator */}
      {!readOnly && (
        <div className="px-3">
          <button
            className={`w-full py-2 rounded text-xs font-bold uppercase tracking-wider transition ${
              recording
                ? 'bg-red-600 text-white animate-pulse'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            }`}
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={recording ? stopRecording : undefined}
            title={`Hold to talk (or press ${pttKeyLabel})`}
          >
            {recording ? (
              <><Mic className="w-4 h-4 inline mr-1" /> Recording (Push-to-Talk Active)</>
            ) : (
              <><MicOff className="w-4 h-4 inline mr-1" /> Push to Talk</>
            )}
          </button>
          <p className="text-[9px] text-gray-600 mt-1 text-center">
            Hold button or press <kbd className="px-1 py-0.5 bg-gray-800 rounded text-gray-400 font-mono border border-gray-700">{pttKeyLabel}</kbd> to transmit
          </p>
        </div>
      )}

      {/* Push-to-talk key settings */}
      {!readOnly && (
        <PushToTalkSettings
          pttKey={pttKey}
          pttKeyLabel={pttKeyLabel}
          onChangeKey={changeKey}
          onReset={resetKey}
        />
      )}

      {/* Voice log */}
      <div className="px-3 pb-2 space-y-1 max-h-48 overflow-y-auto">
        {clips.length === 0 ? (
          <p className="text-[10px] text-gray-600 text-center py-2">No transmissions yet</p>
        ) : (
          clips.slice(-20).map((c) => (
            <button
              key={c.id}
              className="flex items-center gap-2 w-full px-2 py-1 rounded hover:bg-gray-800/50 transition text-left text-[10px]"
              onClick={() => playClip(c)}
            >
              <User className="w-3 h-3 text-gray-600 shrink-0" />
              <span className="text-gray-400 truncate">{c.username || 'Unknown'}</span>
              <span className="text-gray-600 ml-auto shrink-0">
                {c.timestamp ? new Date(c.timestamp).toLocaleTimeString() : ''}
              </span>
              <Volume2 className="w-3 h-3 text-[#C9A227] shrink-0" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}

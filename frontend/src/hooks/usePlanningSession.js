/**
 * usePlanningSession.js
 *
 * React hook for managing a real-time collaborative planning session.
 * Handles WebSocket connection, event dispatch/receive, and provides
 * state + callbacks for the OperationsPlanner UI to consume.
 *
 * Conflict resolution: last-write-wins.  The server persists every
 * change atomically and broadcasts it to all participants.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';

import { API, BACKEND_URL } from '@/utils/api';

/**
 * Derive the WebSocket base URL from BACKEND_URL.
 * e.g. "http://localhost:8000" → "ws://localhost:8000"
 *      "https://example.com"   → "wss://example.com"
 */
function getWsBaseUrl() {
  const base = (BACKEND_URL || window.location.origin).replace(/\/$/, '');
  return base.replace(/^http/, 'ws');
}

/**
 * @param {Object} options
 * @param {string|null} options.sessionId   - active session ID (null = not connected)
 * @param {Function}    options.onUnitCreate - (unit) => void
 * @param {Function}    options.onUnitUpdate - (unitId, changes) => void
 * @param {Function}    options.onUnitDelete - (unitId) => void
 * @param {Function}    options.onPlanUpdate - (fields) => void
 * @param {Function}    options.onSyncState  - (state) => void
 * @param {Function}    options.onSessionClose - () => void
 * @param {Function}    options.onSessionLock  - () => void
 */
export default function usePlanningSession({
  sessionId,
  onUnitCreate,
  onUnitUpdate,
  onUnitDelete,
  onPlanUpdate,
  onSyncState,
  onSessionClose,
  onSessionLock,
} = {}) {
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [isLocked, setIsLocked] = useState(false);

  // Stable callback refs to avoid reconnecting on every render
  const cbRefs = useRef({});
  cbRefs.current = {
    onUnitCreate, onUnitUpdate, onUnitDelete,
    onPlanUpdate, onSyncState, onSessionClose, onSessionLock,
  };

  // ── Connect / disconnect ──────────────────────────────────────────────

  useEffect(() => {
    if (!sessionId) {
      // No session — cleanup
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
      setParticipants([]);
      return;
    }

    let cancelled = false;

    function connect() {
      if (cancelled) return;
      const wsUrl = `${getWsBaseUrl()}/api/ws/operations/${sessionId}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!cancelled) setConnected(true);
      };

      ws.onclose = () => {
        if (!cancelled) {
          setConnected(false);
          // Auto-reconnect after 3 seconds
          reconnectTimerRef.current = setTimeout(() => {
            if (!cancelled) connect();
          }, 3000);
        }
      };

      ws.onerror = () => {
        // onclose will fire after this
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          handleMessage(msg);
        } catch {
          // ignore malformed messages
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // ── Message handler ───────────────────────────────────────────────────

  function handleMessage(msg) {
    const { type, payload, sender_id, sender_name } = msg;

    switch (type) {
      case 'SYNC_STATE':
        setParticipants(payload.participants || []);
        setIsLocked(!!payload.is_locked);
        cbRefs.current.onSyncState?.(payload);
        break;

      case 'UNIT_CREATE':
        cbRefs.current.onUnitCreate?.(payload.unit);
        break;

      case 'UNIT_UPDATE':
        cbRefs.current.onUnitUpdate?.(payload.unit_id, payload.changes);
        break;

      case 'UNIT_DELETE':
        cbRefs.current.onUnitDelete?.(payload.unit_id);
        break;

      case 'PLAN_UPDATE':
        cbRefs.current.onPlanUpdate?.(payload);
        break;

      case 'SESSION_JOIN':
        setParticipants((prev) => {
          if (prev.some((p) => p.user_id === payload.user_id)) return prev;
          return [...prev, { user_id: payload.user_id, username: payload.username }];
        });
        break;

      case 'SESSION_LEAVE':
        setParticipants((prev) =>
          prev.filter((p) => p.user_id !== payload.user_id),
        );
        break;

      case 'SESSION_LOCK':
        setIsLocked(true);
        cbRefs.current.onSessionLock?.();
        break;

      case 'SESSION_CLOSE':
        setConnected(false);
        setParticipants([]);
        cbRefs.current.onSessionClose?.();
        break;

      default:
        break;
    }
  }

  // ── Send helpers ──────────────────────────────────────────────────────

  const send = useCallback((type, payload) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
    }
  }, []);

  const sendUnitCreate = useCallback((unit) => {
    send('UNIT_CREATE', { unit });
  }, [send]);

  const sendUnitUpdate = useCallback((unitId, changes) => {
    send('UNIT_UPDATE', { unit_id: unitId, changes });
  }, [send]);

  const sendUnitDelete = useCallback((unitId) => {
    send('UNIT_DELETE', { unit_id: unitId });
  }, [send]);

  const sendPlanUpdate = useCallback((fields) => {
    send('PLAN_UPDATE', fields);
  }, [send]);

  // ── Session REST helpers ──────────────────────────────────────────────

  const createSession = useCallback(async (planId) => {
    const res = await axios.post(`${API}/sessions`, { plan_id: planId });
    return res.data;
  }, []);

  const joinSession = useCallback(async (joinCode) => {
    const res = await axios.post(`${API}/sessions/join`, { join_code: joinCode });
    return res.data;
  }, []);

  const leaveSession = useCallback(async (sid) => {
    await axios.post(`${API}/sessions/${sid}/leave`);
  }, []);

  const closeSession = useCallback(async (sid) => {
    await axios.post(`${API}/sessions/${sid}/close`);
  }, []);

  const lockSession = useCallback(async (sid) => {
    await axios.post(`${API}/sessions/${sid}/lock`);
  }, []);

  return {
    connected,
    participants,
    isLocked,
    send,
    sendUnitCreate,
    sendUnitUpdate,
    sendUnitDelete,
    sendPlanUpdate,
    // REST helpers
    createSession,
    joinSession,
    leaveSession,
    closeSession,
    lockSession,
  };
}

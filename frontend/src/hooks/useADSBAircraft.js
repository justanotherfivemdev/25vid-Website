import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { API } from '@/utils/api';

const POLL_INTERVAL_MS = 15_000; // 15 seconds — matches backend cache TTL
const GRACE_PERIOD_MS = 60_000; // Keep stale aircraft visible for 60s after last update

/**
 * Custom hook that polls the backend ADS-B proxy for military aircraft.
 * Polling only runs when `enabled` is true.
 *
 * Returns { aircraft, isLoading, error }
 *   - aircraft: Map<id, aircraftObj> keyed by ICAO hex / callsign
 */
export default function useADSBAircraft(enabled) {
  const [aircraft, setAircraft] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const lastSeenRef = useRef({}); // id -> last-seen timestamp
  const intervalRef = useRef(null);

  const fetchAircraft = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await axios.get(`${API}/adsb/military-aircraft`, { withCredentials: true });
      const incoming = res.data?.aircraft || [];
      const now = Date.now();

      // Update last-seen timestamps
      const updatedLastSeen = { ...lastSeenRef.current };
      const incomingMap = {};
      for (const ac of incoming) {
        updatedLastSeen[ac.id] = now;
        incomingMap[ac.id] = ac;
      }

      // Merge with grace period: keep aircraft that were recently seen
      const merged = [];
      const seenIds = new Set();

      // First add all currently-seen aircraft
      for (const ac of incoming) {
        merged.push({ ...ac, _stale: false });
        seenIds.add(ac.id);
      }

      // Then add grace-period aircraft (recently lost signal)
      for (const [id, lastSeen] of Object.entries(updatedLastSeen)) {
        if (!seenIds.has(id) && now - lastSeen < GRACE_PERIOD_MS) {
          // Find from previous state
          const prev = aircraft.find((a) => a.id === id);
          if (prev) {
            merged.push({ ...prev, _stale: true });
          }
        } else if (now - lastSeen >= GRACE_PERIOD_MS) {
          delete updatedLastSeen[id];
        }
      }

      lastSeenRef.current = updatedLastSeen;
      setAircraft(merged);
      setError(null);
    } catch (err) {
      // Don't clear existing data on error — keep showing last known positions
      setError(err.message || 'Failed to fetch aircraft data');
    } finally {
      setIsLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled) {
      // Clear polling but keep data briefly so toggle-off is smooth
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // Clear aircraft data after a short delay for fade-out
      const timeout = setTimeout(() => {
        setAircraft([]);
        lastSeenRef.current = {};
      }, 500);
      return () => clearTimeout(timeout);
    }

    // Fetch immediately, then poll
    fetchAircraft();
    intervalRef.current = setInterval(fetchAircraft, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, fetchAircraft]);

  return { aircraft, isLoading, error };
}

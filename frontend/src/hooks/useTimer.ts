import { useState, useEffect, useRef, useCallback } from 'react';
import { useServerSyncedTimer } from './useServerSyncedTimer';

/**
 * Countdown timer hook.
 *
 * When `serverTime` is provided the timer corrects for client-clock drift
 * (see useServerSyncedTimer).  When it is omitted, behaviour is identical to
 * the original implementation (local Date.now() only).
 */
export function useTimer(
  deadlineISO: string,
  onExpire: () => void,
  serverTime?: string | null,
) {
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  // --- server-synced path ---------------------------------------------------
  const syncedMs = useServerSyncedTimer(
    serverTime != null ? deadlineISO : null,
    serverTime ?? null,
  );

  // --- legacy path (no serverTime) -----------------------------------------
  const getRemaining = useCallback(() => {
    const diff = new Date(deadlineISO).getTime() - Date.now();
    return Math.max(0, Math.floor(diff / 1000));
  }, [deadlineISO]);

  const [localSeconds, setLocalSeconds] = useState(getRemaining);

  useEffect(() => {
    if (serverTime != null) return; // skip local ticker when synced
    const interval = setInterval(() => {
      const remaining = getRemaining();
      setLocalSeconds(remaining);
      if (remaining === 0) {
        clearInterval(interval);
        onExpireRef.current();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [getRemaining, serverTime]);

  // --- fire onExpire via synced path ----------------------------------------
  const firedRef = useRef(false);
  useEffect(() => {
    if (serverTime == null) return;
    if (syncedMs === 0 && !firedRef.current) {
      firedRef.current = true;
      onExpireRef.current();
    }
    if (syncedMs > 0) firedRef.current = false;
  }, [syncedMs, serverTime]);

  // Pick whichever path is active
  const seconds =
    serverTime != null
      ? Math.floor(syncedMs / 1000)
      : localSeconds;

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const isWarning = seconds <= 60;
  const isCritical = seconds <= 30;

  return {
    seconds,
    display: `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
    isWarning,
    isCritical,
  };
}

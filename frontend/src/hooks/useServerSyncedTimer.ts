import { useEffect, useMemo, useState } from 'react';

/**
 * A timer hook that compensates for client clock drift by computing an offset
 * against the server's reported time at session start/advance.
 *
 * The remaining time is DERIVED on every render from (deadline, offset, now),
 * never stored as state. Storing it as state (initialised to 0) made the very
 * first render report "0 ms left", which fired onExpire the moment the timer
 * mounted — skipping sections / finishing the test early.
 *
 * @param deadline  - ISO timestamp of when the section expires (from server).
 * @param serverTime - ISO timestamp of the server's clock at the moment the
 *                    deadline was issued (from the same API response).
 * @returns timeLeft in milliseconds, corrected for clock skew.
 */
export function useServerSyncedTimer(
  deadline: string | null,
  serverTime: string | null,
): number {
  // How many ms the local clock is AHEAD of the server clock, captured when a
  // new serverTime arrives. Positive means the client clock is fast.
  const clientOffset = useMemo(
    () => (serverTime ? Date.now() - new Date(serverTime).getTime() : 0),
    [serverTime],
  );

  // Re-render once per second while a deadline is active.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!deadline) return;
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  if (!deadline) return 0;
  const deadlineMs = new Date(deadline).getTime();
  if (Number.isNaN(deadlineMs)) return 0;
  const serverNow = Date.now() - clientOffset;
  return Math.max(0, deadlineMs - serverNow);
}

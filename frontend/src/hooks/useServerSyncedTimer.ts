import { useEffect, useRef, useState } from 'react';

/**
 * A timer hook that compensates for client clock drift by computing an offset
 * against the server's reported time at session start/advance.
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
  // clientOffset: how many ms the local clock is AHEAD of the server clock.
  // Positive means the client clock is fast (would expire the timer early).
  const clientOffset = useRef<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  // Recalculate the offset whenever a new serverTime arrives.
  useEffect(() => {
    if (serverTime) {
      clientOffset.current = Date.now() - new Date(serverTime).getTime();
    }
  }, [serverTime]);

  useEffect(() => {
    if (!deadline) {
      setTimeLeft(0);
      return;
    }

    const tick = () => {
      const serverNow = Date.now() - clientOffset.current;
      const remaining = Math.max(0, new Date(deadline).getTime() - serverNow);
      setTimeLeft(remaining);
    };

    tick(); // immediate first tick
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline]);

  return timeLeft;
}

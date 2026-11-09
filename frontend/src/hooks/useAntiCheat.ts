import { useEffect, useRef, useState } from 'react';
import { studentApi } from '../services/api';
import { getSocket } from '../services/socketClient';

/**
 * Entering/leaving fullscreen (and the browser's own fullscreen permission
 * prompt) makes many browsers fire `blur` and/or a transient
 * `visibilitychange` — notably Safari and Chrome on macOS, which animate
 * fullscreen into a separate Space. Those events are NOT the student
 * switching apps, so we ignore focus/visibility events for a short grace
 * window around any fullscreen transition or right after anti-cheat starts.
 */
const GRACE_MS = 3000;
/** A blur/hidden state must persist this long before it counts as a violation. */
const CONFIRM_DELAY_MS = 1000;

let graceUntil = 0;

/** Call right before requesting/exiting fullscreen so the transition isn't flagged. */
export function beginAntiCheatGrace(ms: number = GRACE_MS) {
  graceUntil = Math.max(graceUntil, Date.now() + ms);
}

function inGrace() {
  return Date.now() < graceUntil;
}

export function getIsFullscreen(): boolean {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
    msFullscreenElement?: Element | null;
  };
  return !!(
    doc.fullscreenElement ||
    doc.webkitFullscreenElement ||
    doc.mozFullScreenElement ||
    doc.msFullscreenElement
  );
}

const FULLSCREEN_EVENTS = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];

export function useAntiCheat(testSessionId: string | null, enabled: boolean) {
  const lastViolation = useRef<number>(0);
  const [fatalStrike, setFatalStrike] = useState(0);
  const [isFullscreenExit, setIsFullscreenExit] = useState(false);

  useEffect(() => {
    if (!enabled || !testSessionId) return;

    // Anti-cheat just switched on (rules accepted / section started) — this is
    // exactly when fullscreen is being requested, so start with a grace window.
    beginAntiCheatGrace();

    let pendingCheck: ReturnType<typeof setTimeout> | null = null;

    const emitViolation = async (type: string, count: number, isFatal: boolean) => {
      try {
        await studentApi.reportTabSwitch(testSessionId);
      } catch { }

      const socket = getSocket();
      if (socket?.connected) {
        socket.emit('security_violation', {
          testSessionId,
          violationType: type,
          strikeCount: count,
          isFatal,
          timestamp: new Date()
        });
      } else {
        console.warn('[AntiCheat] Socket not connected, could not emit violation');
      }
    };

    const reportViolation = (type: 'tab-switch' | 'focus-loss' | 'fullscreen-exit') => {
      const now = Date.now();
      if (now - lastViolation.current < 1500) return;
      lastViolation.current = now;

      const isFatal = type !== 'fullscreen-exit';
      console.log(`[AntiCheat] Detected ${type}. Fatal: ${isFatal}`);

      if (isFatal) {
        setFatalStrike((prev: number) => {
          const next = prev + 1;
          emitViolation(type, next, true);
          return next;
        });
      } else {
        setIsFullscreenExit(true);
        emitViolation(type, 0, false);
      }
    };

    const cancelPending = () => {
      if (pendingCheck) {
        clearTimeout(pendingCheck);
        pendingCheck = null;
      }
    };

    // Only flag focus/visibility loss if it is still lost after a short delay
    // and no fullscreen transition happened in the meantime.
    const scheduleCheck = () => {
      if (inGrace()) return;
      cancelPending();
      pendingCheck = setTimeout(() => {
        pendingCheck = null;
        if (inGrace()) return;
        if (document.hidden) {
          reportViolation('tab-switch');
          return;
        }
        // Focus moved into an iframe inside our own page (e.g. embedded media) — not cheating.
        const active = document.activeElement;
        if (active && active.tagName === 'IFRAME') return;
        if (!document.hasFocus()) reportViolation('focus-loss');
      }, CONFIRM_DELAY_MS);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) scheduleCheck();
      else cancelPending();
    };

    const handleBlur = () => scheduleCheck();
    const handleFocus = () => cancelPending();

    const handleFullscreenChange = () => {
      // Any fullscreen transition may emit blur/visibility noise.
      beginAntiCheatGrace();
      cancelPending();
      if (!getIsFullscreen()) {
        reportViolation('fullscreen-exit');
      } else {
        setIsFullscreenExit(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    FULLSCREEN_EVENTS.forEach(e => document.addEventListener(e, handleFullscreenChange));

    return () => {
      cancelPending();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      FULLSCREEN_EVENTS.forEach(e => document.removeEventListener(e, handleFullscreenChange));
    };
  }, [testSessionId, enabled]);

  return { fatalStrike, isFullscreenExit };
}

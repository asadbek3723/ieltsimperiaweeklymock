import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../../services/api';
import { PaymentStatusData } from '../../types';

let cachedStatus: { data: PaymentStatusData; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60 * 1000; // 1 min

export function usePaymentStatus() {
  const [status, setStatus] = useState<PaymentStatusData | null>(
    cachedStatus && Date.now() - cachedStatus.fetchedAt < CACHE_TTL_MS
      ? cachedStatus.data
      : null
  );
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const load = async () => {
      try {
        const res = await adminApi.getPaymentStatus();
        if (mounted.current && res.data.success) {
          cachedStatus = { data: res.data.data, fetchedAt: Date.now() };
          setStatus(res.data.data);
        }
      } catch {
        // silent
      }
    };

    if (!cachedStatus || Date.now() - cachedStatus.fetchedAt >= CACHE_TTL_MS) {
      load();
    }
    const interval = setInterval(load, CACHE_TTL_MS);
    return () => {
      mounted.current = false;
      clearInterval(interval);
    };
  }, []);

  return { status };
}

/**
 * Professional, discrete floating alert for Admin:
 * - When expired (isOverdue): Larger, prominent red warning banner.
 *   If closed via 'x', reappears after exactly 5 seconds!
 * - When pre-expiry warning (daysLeft <= 2): Slim, low-height, compact warning pill.
 *   If closed via 'x', reappears after 10 seconds.
 */
export function PaymentFloatingAlert() {
  const { status } = usePaymentStatus();
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  if (!status) return null;
  // If payment is already pending verification, don't scream with warning
  if (status.pendingPayment) return null;

  const isOverdue = status.isOverdue || status.daysLeft <= 0;
  const isCritical = status.daysLeft <= 2 || isOverdue;
  if (!isCritical || !visible) return null;

  // When expired: reappears in 5 seconds; when warning: reappears in 10 seconds
  const handleDismiss = () => {
    setVisible(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    const delay = isOverdue ? 5000 : 10000;
    timerRef.current = setTimeout(() => {
      setVisible(true);
    }, delay);
  };

  // ── CASE 1: EXPIRED / OVERDUE (Kattaroq, to'xtamasdan ogohlantirib turuvchi) ──
  if (isOverdue) {
    return (
      <aside
        aria-label="Server to'lovi muddati tugadi"
        className="fixed bottom-5 right-5 z-50 max-w-md w-[calc(100vw-2.5rem)] animate-in fade-in slide-in-from-bottom-4 duration-300 pointer-events-auto"
      >
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 p-5 text-white shadow-[0_20px_50px_-8px_rgba(239,68,68,0.35)] ring-1 ring-red-500/30">
          {/* Intense red glow backdrop */}
          <div className="absolute -top-12 -right-12 w-36 h-36 rounded-full bg-red-600/30 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-28 h-28 rounded-full bg-rose-600/20 blur-2xl pointer-events-none" />

          <div className="flex items-start gap-3.5 relative z-10">
            {/* Animated pulse red icon */}
            <div className="mt-0.5 relative flex items-center justify-center shrink-0 w-8 h-8 rounded-xl bg-red-500/20 text-red-400">
              <span className="animate-ping absolute inline-flex h-4 w-4 rounded-full bg-red-400 opacity-60" />
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>

            <div className="flex-1 min-w-0 pr-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-white tracking-tight">
                  Server to'lovi muddati tugadi!
                </p>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500/30 text-red-300 ring-1 ring-red-500/40">
                  Muddati o'tgan
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                Platforma xizmati istalgan daqiqada to'xtab qolishi mumkin. O'quvchilar test topshira olmay qolmasligi uchun darhol to'lov qiling.
              </p>

              <div className="mt-3.5 flex items-center gap-3">
                <Link
                  to="/admin/payment"
                  className="text-xs font-bold px-4 py-2 rounded-xl bg-red-500 hover:bg-red-400 text-white shadow-[0_4px_16px_-4px_rgba(239,68,68,0.6)] active:scale-95 transition-all"
                >
                  To'lov sahifasiga o'tish
                </Link>
                <span className="text-[10px] text-slate-400">
                  X bossangiz, 5s dan so'ng yana chiqadi
                </span>
              </div>
            </div>

            {/* Close button (x) -> Reappears after 5 seconds */}
            <button
              onClick={handleDismiss}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
              title="Yopish (5 soniyadan so'ng yana eslatiladi)"
              aria-label="Yopish"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      </aside>
    );
  }

  // ── CASE 2: PRE-EXPIRY WARNING (Heighti pastroq va ixcham/kichikroq) ────────
  return (
    <aside
      aria-label="To'lov bildirishnomasi"
      className="fixed bottom-5 right-5 z-50 max-w-xs w-[calc(100vw-2.5rem)] animate-in fade-in slide-in-from-bottom-3 duration-200 pointer-events-auto"
    >
      <div className="relative overflow-hidden rounded-xl bg-slate-900/90 dark:bg-slate-950/90 backdrop-blur-md px-3.5 py-2.5 text-white shadow-[0_8px_24px_-4px_rgba(0,0,0,0.35)] ring-1 ring-amber-500/20">
        {/* Subtle amber glow */}
        <div className="absolute -top-8 -right-8 w-20 h-20 rounded-full bg-amber-500/20 blur-xl pointer-events-none" />

        <div className="flex items-center gap-2.5 relative z-10">
          {/* Small pulse amber dot */}
          <div className="relative flex items-center justify-center shrink-0">
            <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-white/95 truncate">
              To'lovga <span className="font-bold text-amber-400">{status.daysLeft} kun</span> qoldi
            </p>
          </div>

          <Link
            to="/admin/payment"
            className="text-[10px] font-bold px-2.5 py-1 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 shrink-0 transition-colors"
          >
            To'lash
          </Link>

          {/* Close button (x) -> Reappears after 10 seconds */}
          <button
            onClick={handleDismiss}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            title="Yopish (10 soniyadan so'ng yana eslatiladi)"
            aria-label="Yopish"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}

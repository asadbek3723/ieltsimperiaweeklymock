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
 * Professional, discrete, non-intrusive floating alert for Admin:
 * - Appears when remaining days <= 2 or overdue (<= 0)
 * - If closed via 'x', reappears after exactly 10 seconds!
 */
export function PaymentFloatingAlert() {
  const { status } = usePaymentStatus();
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // If dismissed, show again in exactly 10 seconds
  const handleDismiss = () => {
    setVisible(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setVisible(true);
    }, 10000); // 10 seconds exactly
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!status) return null;
  // If payment is already pending verification, don't scream with warning
  if (status.pendingPayment) return null;

  const isCritical = status.daysLeft <= 2 || status.isOverdue;
  if (!isCritical || !visible) return null;

  const isOverdue = status.isOverdue || status.daysLeft <= 0;

  return (
    <aside 
      aria-label="To'lov bildirishnomasi" 
      className="fixed bottom-5 right-5 z-50 max-w-sm w-[calc(100vw-2.5rem)] animate-in fade-in slide-in-from-bottom-3 duration-300 pointer-events-auto"
    >
      <div className="relative overflow-hidden rounded-2xl bg-slate-900/90 dark:bg-slate-950/90 backdrop-blur-md p-4 text-white shadow-[0_12px_36px_-6px_rgba(0,0,0,0.4)] ring-1 ring-white/10">
        
        {/* Glow indicator */}
        <div 
          className={`absolute -top-10 -right-10 w-24 h-24 rounded-full blur-2xl opacity-40 pointer-events-none ${
            isOverdue ? 'bg-red-500' : 'bg-amber-500'
          }`} 
        />

        <div className="flex items-start gap-3 relative z-10">
          {/* Animated pulse dot */}
          <div className="mt-0.5 relative flex items-center justify-center shrink-0">
            <span className={`animate-ping absolute inline-flex h-3 w-3 rounded-full opacity-75 ${
              isOverdue ? 'bg-red-400' : 'bg-amber-400'
            }`} />
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
              isOverdue ? 'bg-red-500' : 'bg-amber-500'
            }`} />
          </div>

          <div className="flex-1 min-w-0 pr-2">
            <p className="text-xs font-bold tracking-tight text-white/95">
              {isOverdue 
                ? 'Server to\'lovi muddati tugadi!' 
                : `To'lovga ${status.daysLeft} kun qoldi`}
            </p>
            <p className="text-[11px] text-slate-300/80 mt-0.5 leading-snug">
              {isOverdue
                ? 'Dastur xizmati istalgan daqiqada to\'xtab qolishi mumkin. Iltimos, server uchun to\'lov qiling.'
                : 'Server xizmati uzluksiz ishlashi uchun to\'lov chekini yuklang.'}
            </p>

            <div className="mt-2.5 flex items-center gap-3">
              <Link
                to="/admin/payment"
                className={`text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all ${
                  isOverdue
                    ? 'bg-red-500/90 hover:bg-red-500 text-white shadow-sm'
                    : 'bg-amber-500/90 hover:bg-amber-500 text-slate-950 shadow-sm'
                }`}
              >
                To'lov qilish
              </Link>
            </div>
          </div>

          {/* Close button (x) -> Reappears after 10 seconds */}
          <button
            onClick={handleDismiss}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            title="Yopish (10 soniyadan so'ng yana eslatiladi)"
            aria-label="Yopish"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}

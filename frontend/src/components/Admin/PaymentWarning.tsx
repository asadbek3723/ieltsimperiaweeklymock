import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../../services/api';
import { PaymentStatusData } from '../../types';

interface PaymentWarningProps {
  /** Show the persistent full-screen modal when overdue */
  showModal?: boolean;
}

let cachedStatus: { data: PaymentStatusData; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // re-fetch every 10 min

export function usePaymentStatus() {
  const [status, setStatus] = useState<PaymentStatusData | null>(
    cachedStatus && Date.now() - cachedStatus.fetchedAt < CACHE_TTL_MS
      ? cachedStatus.data
      : null
  );
  const [error, setError] = useState(false);
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
        setError(true);
      }
    };

    // Load immediately if cache stale
    if (!cachedStatus || Date.now() - cachedStatus.fetchedAt >= CACHE_TTL_MS) {
      load();
    }

    // Refresh every 10 minutes
    const interval = setInterval(load, CACHE_TTL_MS);
    return () => {
      mounted.current = false;
      clearInterval(interval);
    };
  }, []);

  return { status, error };
}

/** Banner shown in the Header when payment is due in ≤2 days */
export function PaymentWarningBanner() {
  const { status } = usePaymentStatus();
  const [dismissed, setDismissed] = useState(false);

  if (!status) return null;
  if (dismissed) return null;
  if (!status.isOverdue && status.daysLeft > 2) return null;

  const isOverdue = status.isOverdue;

  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-2.5 text-xs font-semibold ${
        isOverdue
          ? 'bg-red-600 text-white'
          : 'bg-amber-500 text-white'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span className="truncate">
          {isOverdue
            ? 'Server to\'lov muddati tugadi! Dastur har qanday vaqtda to\'xtashi mumkin.'
            : `Server to'loviga ${status.daysLeft} kun qoldi. Zudlik bilan to'lov qiling.`}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Link
          to="/admin/payment"
          className="underline underline-offset-2 hover:no-underline whitespace-nowrap"
        >
          To'lov bo'limi
        </Link>
        {!isOverdue && (
          <button
            onClick={() => setDismissed(true)}
            className="p-0.5 rounded hover:bg-black/10 transition-colors"
            aria-label="Yopish"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

/** Full-screen blocking modal shown when payment is overdue */
export function PaymentOverdueModal() {
  const { status } = usePaymentStatus();

  if (!status?.isOverdue) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl max-w-md w-full p-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="flex flex-col items-center text-center">
          {/* Icon */}
          <div className="w-16 h-16 rounded-3xl bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center mb-5 shadow-lg shadow-red-600/20">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>

          <h2 className="text-xl font-extrabold text-gray-900 dark:text-white tracking-tight">
            Server to'lovi kechikdi!
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-3 leading-relaxed max-w-xs">
            Railway serveriga to'lov muddati tugagan. Dastur har qanday vaqtda o'chib qolishi mumkin. Iltimos, zudlik bilan to'lov qilib, chekni yuklang.
          </p>

          <Link
            to="/admin/payment"
            className="mt-6 w-full inline-flex items-center justify-center gap-2.5 px-6 py-3.5 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold text-sm rounded-2xl shadow-lg shadow-red-600/30 transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            To'lov bo'limiga o'tish
          </Link>
        </div>
      </div>
    </div>
  );
}

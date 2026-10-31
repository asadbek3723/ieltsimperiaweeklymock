import React, { useState, useEffect, useRef, useCallback } from 'react';
import { adminApi } from '../../services/api';
import { PaymentRecord, PaymentStatusData } from '../../types';

// ─── Tiny animation helpers (no framer-motion dependency needed) ──────────────
const fadeUp = `
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(18px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes shimmer {
    0%   { background-position: -200% 0; }
    100% { background-position:  200% 0; }
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @keyframes pulse-ring {
    0%   { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
    70%  { transform: scale(1);    box-shadow: 0 0 0 10px rgba(239,68,68,0); }
    100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239,68,68,0); }
  }
  @keyframes countUp {
    from { opacity: 0; transform: translateY(8px) scale(0.95); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  .anim-fadeup { animation: fadeUp 0.5s cubic-bezier(.22,.68,0,1.2) both; }
  .anim-fadein { animation: fadeIn 0.4s ease both; }
  .anim-countup { animation: countUp 0.6s cubic-bezier(.22,.68,0,1.2) both; }
  .shimmer-loading {
    background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
  }
  .dark .shimmer-loading {
    background: linear-gradient(90deg, #1f2937 25%, #374151 50%, #1f2937 75%);
    background-size: 200% 100%;
  }
  .spin { animation: spin 0.8s linear infinite; }
  .pulse-ring { animation: pulse-ring 2s ease-in-out infinite; }
`;

// ─── Icons ────────────────────────────────────────────────────────────────────
const Icon = {
  CreditCard: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  ),
  Copy: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  ),
  Check: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Upload: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  File: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  RefreshCw: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </svg>
  ),
  Clock: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  AlertTriangle: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  Eye: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
  ),
  ChevronLeft: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  ChevronRight: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  X: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Send: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  ),
  Spinner: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 2a10 10 0 0110 10" />
    </svg>
  ),
};

// ─── Skeleton component ───────────────────────────────────────────────────────
function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`shimmer-loading rounded-xl ${className}`} />;
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: 'PENDING' | 'CONFIRMED' | 'REJECTED' }) {
  const map = {
    CONFIRMED: { label: 'Tasdiqlangan', dot: 'bg-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-400' },
    REJECTED:  { label: 'Rad etilgan',  dot: 'bg-red-500',     bg: 'bg-red-50 dark:bg-red-950/30',         text: 'text-red-700 dark:text-red-400' },
    PENDING:   { label: 'Kutilmoqda',   dot: 'bg-amber-500',   bg: 'bg-amber-50 dark:bg-amber-950/30',     text: 'text-amber-700 dark:text-amber-400' },
  };
  const s = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${status === 'PENDING' ? 'animate-pulse' : ''}`} />
      {s.label}
    </span>
  );
}

// ─── Animated number ──────────────────────────────────────────────────────────
function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const [display, setDisplay] = useState(0);
  const raf = useRef<number>(0);
  useEffect(() => {
    const start = Date.now();
    const duration = 900;
    const from = display;
    const animate = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (value - from) * eased);
      if (progress < 1) raf.current = requestAnimationFrame(animate);
    };
    raf.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf.current);
  }, [value]); // eslint-disable-line
  return <span>{format(display)}</span>;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Payment() {
  const [statusData, setStatusData]     = useState<PaymentStatusData | null>(null);
  const [history, setHistory]           = useState<PaymentRecord[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [page, setPage]                 = useState(1);
  const [loading, setLoading]           = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [refreshing, setRefreshing]     = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl]     = useState<string | null>(null);
  const [uploading, setUploading]       = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadError, setUploadError]   = useState<string | null>(null);
  const [copied, setCopied]             = useState(false);
  const [isDragging, setIsDragging]     = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Data fetching ────────────────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    const res = await adminApi.getPaymentStatus();
    if (res.data.success) setStatusData(res.data.data);
  }, []);

  const fetchHistory = useCallback(async (p = 1) => {
    setHistoryLoading(true);
    try {
      const res = await adminApi.getPaymentHistory(p, 10);
      if (res.data.success) {
        setHistory(res.data.data.records);
        setTotalRecords(res.data.data.total);
        setPage(p);
      }
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchStatus(), fetchHistory(1)]);
      setLoading(false);
    })();
  }, [fetchStatus, fetchHistory]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchStatus();
    setTimeout(() => setRefreshing(false), 600);
  };

  const handleCopy = () => {
    if (!statusData?.cardNumber) return;
    navigator.clipboard.writeText(statusData.cardNumber.replace(/\s+/g, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSelectFile = (file: File) => {
    setUploadError(null);
    setUploadSuccess(null);
    const valid = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!valid.includes(file.type)) { setUploadError("Faqat JPG, PNG, WebP yoki PDF formatlar qo'llaniladi"); return; }
    if (file.size > 10 * 1024 * 1024) { setUploadError('Fayl hajmi 10 MB dan oshmasligi kerak'); return; }
    setSelectedFile(file);
    setPreviewUrl(file.type.startsWith('image/') ? URL.createObjectURL(file) : null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) { setUploadError("Iltimos, to'lov chekini tanlang"); return; }
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const fd = new FormData();
      fd.append('receipt', selectedFile);
      const res = await adminApi.submitPaymentReceipt(fd);
      if (res.data.success) {
        setUploadSuccess("To'lov cheki muvaffaqiyatli yuborildi!");
        setSelectedFile(null);
        setPreviewUrl(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        await Promise.all([fetchStatus(), fetchHistory(1)]);
      } else {
        setUploadError(res.data.message || 'Yuklashda xatolik');
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setUploadError(e?.response?.data?.message || "Server bilan bog'lanishda xatolik");
    } finally {
      setUploading(false);
    }
  };

  // ── Derived values ───────────────────────────────────────────────────────
  const daysLeft   = statusData?.daysLeft ?? 0;
  const isOverdue  = statusData?.isOverdue ?? false;
  const urgency    = isOverdue ? 'overdue' : daysLeft <= 3 ? 'critical' : daysLeft <= 7 ? 'warning' : 'ok';
  const totalPages = Math.ceil(totalRecords / 10);

  const urgencyConfig = {
    overdue:  { ring: 'ring-red-500/30',   glow: '#ef4444', label: 'Muddati o\'tgan!',   labelColor: 'text-red-500',   bg: 'from-red-500/8 to-rose-500/4' },
    critical: { ring: 'ring-red-400/25',   glow: '#f97316', label: `${daysLeft} kun qoldi`, labelColor: 'text-orange-500', bg: 'from-orange-500/8 to-amber-500/4' },
    warning:  { ring: 'ring-amber-400/25', glow: '#f59e0b', label: `${daysLeft} kun qoldi`, labelColor: 'text-amber-500', bg: 'from-amber-500/8 to-yellow-500/4' },
    ok:       { ring: 'ring-slate-200/60 dark:ring-slate-700/40', glow: '#10b981', label: `${daysLeft} kun qoldi`, labelColor: 'text-emerald-500', bg: 'from-slate-50/80 to-white/40 dark:from-slate-800/60 dark:to-slate-900/40' },
  }[urgency];

  // ── Skeleton loader ───────────────────────────────────────────────────────
  if (loading && !statusData) {
    return (
      <div className="w-full space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1,2,3].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
        <Skeleton className="h-28" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <>
      {/* Global keyframes */}
      <style>{fadeUp}</style>

      <div className="w-full space-y-6 pb-8">

        {/* ── Status cards row ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Days left card */}
          <div
            className={`anim-fadeup relative overflow-hidden rounded-2xl p-5 ring-1 ${urgencyConfig.ring} bg-gradient-to-br ${urgencyConfig.bg} shadow-[0_2px_20px_-4px_rgba(0,0,0,0.08)] backdrop-blur-sm`}
            style={{ animationDelay: '60ms' }}
          >
            {/* Subtle glow orb */}
            <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-20 blur-2xl" style={{ background: urgencyConfig.glow }} />
            <div className="relative z-10">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Qolgan muddat</p>
              <div className={`text-4xl font-black ${urgencyConfig.labelColor} anim-countup leading-none`}>
                {isOverdue ? '—' : <AnimatedNumber value={daysLeft} format={n => Math.round(n).toString()} />}
              </div>
              <p className={`text-sm font-semibold mt-1 ${urgencyConfig.labelColor}`}>
                {urgencyConfig.label}
              </p>
              {statusData?.nextDueDate && (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  Muddati: {new Date(statusData.nextDueDate).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </p>
              )}
            </div>
            {urgency === 'overdue' && (
              <div className="absolute bottom-4 right-4 pulse-ring w-3 h-3 rounded-full bg-red-500" />
            )}
          </div>

          {/* Cost card */}
          <div
            className="anim-fadeup rounded-2xl p-5 ring-1 ring-slate-200/70 dark:ring-slate-700/50 bg-white/70 dark:bg-slate-800/50 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.07)] backdrop-blur-sm"
            style={{ animationDelay: '120ms' }}
          >
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Oylik narx</p>
            <div className="text-3xl font-black text-slate-900 dark:text-white leading-none anim-countup">
              {statusData ? (
                <AnimatedNumber value={statusData.costUSD} format={n => `$${n.toFixed(2)}`} />
              ) : '—'}
            </div>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1 tabular-nums">
              {statusData ? `≈ ${Math.round(statusData.costUZS).toLocaleString('uz-UZ')} so'm` : ''}
            </p>
          </div>

          {/* Exchange rate card */}
          <div
            className="anim-fadeup rounded-2xl p-5 ring-1 ring-slate-200/70 dark:ring-slate-700/50 bg-white/70 dark:bg-slate-800/50 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.07)] backdrop-blur-sm"
            style={{ animationDelay: '180ms' }}
          >
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Valyuta kursi (CBU)</p>
            <div className="text-3xl font-black text-slate-900 dark:text-white leading-none anim-countup">
              {statusData ? (
                <AnimatedNumber value={statusData.exchangeRate} format={n => `${Math.round(n).toLocaleString('uz-UZ')}`} />
              ) : '—'}
            </div>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">UZS / 1 USD</p>
          </div>
        </div>

        {/* ── Pending payment notice ───────────────────────────────────────── */}
        {statusData?.pendingPayment && (
          <div
            className="anim-fadeup flex items-start gap-3 px-5 py-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 ring-1 ring-amber-200/70 dark:ring-amber-800/30"
            style={{ animationDelay: '200ms' }}
          >
            <span className="mt-0.5 text-amber-500"><Icon.Clock /></span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">To'lov ko'rib chiqilmoqda</p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                {Math.round(statusData.pendingPayment.amountUZS).toLocaleString('uz-UZ')} so'm •{' '}
                {new Date(statusData.pendingPayment.submittedAt).toLocaleDateString('uz-UZ')}
              </p>
            </div>
            <a
              href={statusData.pendingPayment.receiptUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-semibold hover:bg-amber-200 dark:hover:bg-amber-800/40 transition-colors shrink-0"
            >
              <Icon.Eye /> Chekni ko'rish
            </a>
          </div>
        )}

        {/* ── Main two-column section ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Card number */}
          <div
            className="anim-fadeup rounded-2xl p-6 ring-1 ring-slate-200/70 dark:ring-slate-700/50 bg-white/70 dark:bg-slate-800/50 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.07)] backdrop-blur-sm space-y-4"
            style={{ animationDelay: '240ms' }}
          >
            <div className="flex items-center gap-2.5 mb-1">
              <span className="text-slate-400 dark:text-slate-500"><Icon.CreditCard /></span>
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Karta raqami</h2>
            </div>

            {/* Card visual */}
            <div className="relative rounded-2xl p-5 bg-gradient-to-br from-slate-800 to-slate-900 dark:from-slate-700 dark:to-slate-900 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.35)] overflow-hidden">
              {/* Glossy overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
              {/* Decorative circles */}
              <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/5" />
              <div className="absolute -bottom-12 -left-8 w-36 h-36 rounded-full bg-white/4" />

              <div className="relative z-10">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex gap-1.5">
                    <div className="w-7 h-7 rounded-full bg-red-500/80" />
                    <div className="w-7 h-7 rounded-full bg-orange-400/80 -ml-3.5" />
                  </div>
                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">UZCARD</span>
                </div>
                <p className="text-xl font-mono font-bold tracking-[0.22em] text-white">
                  {statusData?.cardNumber ?? '•••• •••• •••• ••••'}
                </p>
                <p className="text-[10px] text-white/40 mt-3 uppercase tracking-widest">To'lov uchun karta</p>
              </div>
            </div>

            <button
              onClick={handleCopy}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${
                copied
                  ? 'bg-emerald-500 text-white shadow-[0_4px_16px_-4px_rgba(16,185,129,0.5)]'
                  : 'bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:shadow-[0_2px_12px_-2px_rgba(0,0,0,0.12)]'
              }`}
            >
              {copied ? <><Icon.Check /> Nusxalandi!</> : <><Icon.Copy /> Karta raqamini nusxalash</>}
            </button>
          </div>

          {/* Upload receipt */}
          <div
            className="anim-fadeup rounded-2xl p-6 ring-1 ring-slate-200/70 dark:ring-slate-700/50 bg-white/70 dark:bg-slate-800/50 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.07)] backdrop-blur-sm"
            style={{ animationDelay: '300ms' }}
          >
            <div className="flex items-center gap-2.5 mb-4">
              <span className="text-slate-400 dark:text-slate-500"><Icon.Upload /></span>
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">To'lov chekini yuborish</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Dropzone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={e => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleSelectFile(f); }}
                className={`relative flex flex-col items-center justify-center rounded-2xl cursor-pointer transition-all duration-200 select-none overflow-hidden ${
                  isDragging
                    ? 'ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 scale-[1.01]'
                    : selectedFile
                    ? 'ring-1 ring-emerald-300 dark:ring-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/20'
                    : 'ring-1 ring-dashed ring-slate-300 dark:ring-slate-600 bg-slate-50/60 dark:bg-slate-900/30 hover:ring-slate-400 dark:hover:ring-slate-500 hover:bg-slate-100/60 dark:hover:bg-slate-800/40'
                } ${previewUrl ? 'h-40' : 'py-8 px-4'}`}
              >
                {previewUrl ? (
                  <>
                    <img src={previewUrl} alt="receipt preview" className="h-full w-full object-contain" />
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                      <p className="text-white text-xs font-semibold">O'zgartirish</p>
                    </div>
                  </>
                ) : selectedFile ? (
                  <div className="flex flex-col items-center gap-2 text-emerald-600 dark:text-emerald-400">
                    <Icon.File />
                    <p className="text-xs font-semibold text-center max-w-[180px] truncate">{selectedFile.name}</p>
                    <p className="text-[10px] text-slate-400">{(selectedFile.size / 1024).toFixed(0)} KB</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2.5 text-slate-400 dark:text-slate-500">
                    <Icon.Upload />
                    <div className="text-center">
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Chekni bu yerga tashlang</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">yoki bosib tanlang • JPG, PNG, PDF • max 10MB</p>
                    </div>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleSelectFile(f); }} />
              </div>

              {/* Clear file */}
              {selectedFile && (
                <button
                  type="button"
                  onClick={() => { setSelectedFile(null); setPreviewUrl(null); setUploadError(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-500 transition-colors"
                >
                  <Icon.X /> Faylni olib tashlash
                </button>
              )}

              {/* Error / success messages */}
              {uploadError && (
                <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/20 ring-1 ring-red-200/70 dark:ring-red-900/30 anim-fadein">
                  <span className="text-red-500 mt-0.5 shrink-0"><Icon.AlertTriangle /></span>
                  <p className="text-xs text-red-700 dark:text-red-400 font-medium">{uploadError}</p>
                </div>
              )}
              {uploadSuccess && (
                <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 ring-1 ring-emerald-200/70 dark:ring-emerald-900/30 anim-fadein">
                  <span className="text-emerald-500 shrink-0"><Icon.Check /></span>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">{uploadSuccess}</p>
                </div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={!selectedFile || uploading}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 active:scale-[0.98] text-white shadow-[0_4px_20px_-4px_rgba(99,102,241,0.5)] hover:shadow-[0_6px_24px_-4px_rgba(99,102,241,0.65)]"
              >
                {uploading ? (
                  <><span className="spin"><Icon.Spinner /></span> Yuklanmoqda...</>
                ) : (
                  <><Icon.Send /> Chekni yuborish</>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* ── Payment history ──────────────────────────────────────────────── */}
        <div
          className="anim-fadeup rounded-2xl ring-1 ring-slate-200/70 dark:ring-slate-700/50 bg-white/70 dark:bg-slate-800/50 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.07)] backdrop-blur-sm overflow-hidden"
          style={{ animationDelay: '360ms' }}
        >
          <div className="px-6 py-5 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">To'lovlar tarixi</h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{totalRecords} ta yozuv</p>
            </div>
          </div>

          {historyLoading ? (
            <div className="px-6 pb-6 space-y-3">
              {[1,2,3].map(i => <Skeleton key={i} className="h-14" />)}
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4 text-slate-400">
                <Icon.CreditCard />
              </div>
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Hali to'lovlar yo'q</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Birinchi to'lov chekini yuboring</p>
            </div>
          ) : (
            <>
              {/* Table header */}
              <div className="px-6 grid grid-cols-[1fr_1.2fr_1fr_auto_auto] gap-4 pb-2">
                {['Sana','Summa','Kurs','Holat','Chek'].map(h => (
                  <span key={h} className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{h}</span>
                ))}
              </div>

              <div className="divide-y divide-slate-100/80 dark:divide-slate-700/40">
                {history.map((record, idx) => (
                  <div
                    key={record.id}
                    className="px-6 py-4 grid grid-cols-[1fr_1.2fr_1fr_auto_auto] gap-4 items-center hover:bg-slate-50/60 dark:hover:bg-slate-700/20 transition-colors anim-fadein"
                    style={{ animationDelay: `${idx * 40}ms` }}
                  >
                    <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      {new Date(record.submittedAt).toLocaleDateString('uz-UZ', { day:'2-digit', month:'2-digit', year:'numeric' })}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                        {Math.round(record.amountUZS).toLocaleString('uz-UZ')} so'm
                      </p>
                      <p className="text-[11px] text-slate-400">${record.amountUSD.toFixed(2)}</p>
                    </div>
                    <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                      {Math.round(record.exchangeRate).toLocaleString()}
                    </span>
                    <StatusBadge status={record.status} />
                    <a
                      href={record.receiptUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700/60 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold transition-colors"
                    >
                      <Icon.Eye /> Ko'rish
                    </a>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-6 py-4 flex items-center justify-between border-t border-slate-100/80 dark:border-slate-700/40">
                  <button
                    onClick={() => fetchHistory(page - 1)}
                    disabled={page <= 1 || historyLoading}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Icon.ChevronLeft /> Oldingi
                  </button>
                  <div className="flex items-center gap-1.5">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                      <button
                        key={p}
                        onClick={() => fetchHistory(p)}
                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-all duration-150 ${
                          p === page
                            ? 'bg-indigo-600 text-white shadow-[0_2px_10px_-2px_rgba(99,102,241,0.5)]'
                            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => fetchHistory(page + 1)}
                    disabled={page >= totalPages || historyLoading}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Keyingi <Icon.ChevronRight />
                  </button>
                </div>
              )}
            </>
          )}
        </div>

      </div>
    </>
  );
}

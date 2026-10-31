import React, { useState, useEffect, useRef } from 'react';
import { adminApi } from '../../services/api';
import { PaymentRecord, PaymentStatusData } from '../../types';
import Loading from '../Common/Loading';

export default function Payment() {
  const [statusData, setStatusData] = useState<PaymentStatusData | null>(null);
  const [history, setHistory] = useState<PaymentRecord[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [refreshingRate, setRefreshingRate] = useState(false);

  // Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch status
  const fetchStatus = async () => {
    try {
      const res = await adminApi.getPaymentStatus();
      if (res.data.success) {
        setStatusData(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load payment status:', err);
    }
  };

  // Fetch history
  const fetchHistory = async (pageNum = 1) => {
    setHistoryLoading(true);
    try {
      const res = await adminApi.getPaymentHistory(pageNum, 10);
      if (res.data.success) {
        setHistory(res.data.data.records);
        setTotalRecords(res.data.data.total);
        setPage(pageNum);
      }
    } catch (err) {
      console.error('Failed to load payment history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchStatus(), fetchHistory(1)]);
      setLoading(false);
    };
    init();
  }, []);

  const handleRefreshRate = async () => {
    setRefreshingRate(true);
    try {
      await fetchStatus();
    } finally {
      setTimeout(() => setRefreshingRate(false), 500);
    }
  };

  const handleCopyCard = () => {
    if (!statusData?.cardNumber) return;
    navigator.clipboard.writeText(statusData.cardNumber.replace(/\s+/g, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleSelectFile(file);
    }
  };

  const handleSelectFile = (file: File) => {
    setUploadError(null);
    setUploadSuccess(null);

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      setUploadError('Faqat JPG, PNG, WebP yoki PDF formatidagi fayllarni yuklash mumkin');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setUploadError('Fayl hajmi 10 MB dan oshmasligi kerak');
      return;
    }

    setSelectedFile(file);
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleSelectFile(file);
    }
  };

  const handleSubmitReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setUploadError('Iltimos, to\'lov chekini tanlang');
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const formData = new FormData();
      formData.append('receipt', selectedFile);

      const res = await adminApi.submitPaymentReceipt(formData);
      if (res.data.success) {
        setUploadSuccess('To\'lov cheki muvaffaqiyatli yuklandi va tasdiqlash uchun yuborildi!');
        setSelectedFile(null);
        setPreviewUrl(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        await Promise.all([fetchStatus(), fetchHistory(1)]);
      } else {
        setUploadError(res.data.message || 'Yuklashda xatolik yuz berdi');
      }
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : 'Server bilan bog\'lanishda xatolik';
      setUploadError(msg || 'Xatolik yuz berdi');
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <Loading />;

  const daysLeft = statusData?.daysLeft ?? 30;
  const isOverdue = statusData?.isOverdue ?? false;
  const isWarning = daysLeft <= 2 && !isOverdue;

  // Circular progress calculation (30 days total)
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const clampedDays = Math.max(0, Math.min(30, daysLeft));
  const strokeDashoffset = circumference - (clampedDays / 30) * circumference;

  const nextDueFormatted = statusData?.nextDueDate
    ? new Intl.DateTimeFormat('uz-UZ', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }).format(new Date(statusData.nextDueDate))
    : '—';

  return (
    <div className="space-y-8 pb-12 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              Server To'lovi
            </h1>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                isOverdue
                  ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                  : isWarning
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                  isOverdue ? 'bg-red-500 animate-ping' : isWarning ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
              />
              {isOverdue ? 'Muddati tugagan' : isWarning ? 'Muddati yaqin' : 'Faol'}
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Railway hosting infratuzilmasi va xizmat muddati boshqaruvi
          </p>
        </div>

        <button
          onClick={handleRefreshRate}
          disabled={refreshingRate}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-semibold shadow-sm hover:shadow transition-all disabled:opacity-50"
        >
          <svg
            className={`w-4 h-4 text-gray-500 ${refreshingRate ? 'animate-spin' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Kursni yangilash
        </button>
      </div>

      {/* Overdue Warning Alert */}
      {isOverdue && (
        <div className="bg-red-50 dark:bg-red-950/40 rounded-2xl p-5 shadow-sm flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center flex-shrink-0 shadow-lg shadow-red-600/30">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-bold text-red-900 dark:text-red-200">
              Server to'lov muddati tugadi!
            </h3>
            <p className="text-sm text-red-700 dark:text-red-300/90 mt-1 leading-relaxed">
              To'lov kechikkanligi sababli dastur har qanday vaqtda to'xtashi mumkin. Iltimos, zudlik bilan pastdagi karta raqamiga to'lov qilib, chekni yuklang.
            </p>
          </div>
        </div>
      )}

      {/* Near Due Warning Alert */}
      {isWarning && (
        <div className="bg-amber-50 dark:bg-amber-950/40 rounded-2xl p-5 shadow-sm flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0 shadow-lg shadow-amber-500/30">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-bold text-amber-900 dark:text-amber-200">
              Server to'loviga {daysLeft} kun qoldi
            </h3>
            <p className="text-sm text-amber-700 dark:text-amber-300/90 mt-1 leading-relaxed">
              Keyingi to'lov sanasi: <span className="font-semibold">{nextDueFormatted}</span>. Server uzluksiz ishlashi uchun to'lovni oldindan amalga oshirish tavsiya etiladi.
            </p>
          </div>
        </div>
      )}

      {/* Top 3 KPI Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Countdown Ring */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              Xizmat muddati
            </span>
            <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center">
              <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>

          <div className="my-5 flex items-center justify-between">
            <div>
              <div className="text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight tabular-nums">
                {isOverdue ? '0' : daysLeft}
                <span className="text-base font-semibold text-gray-500 dark:text-gray-400 ml-1.5">kun</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Muddat: <span className="font-medium text-gray-700 dark:text-gray-300">{nextDueFormatted}</span>
              </p>
            </div>

            {/* Circular Progress SVG */}
            <div className="relative w-24 h-24 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r={radius}
                  className="stroke-gray-100 dark:stroke-gray-800"
                  strokeWidth="8"
                  fill="none"
                />
                <circle
                  cx="50"
                  cy="50"
                  r={radius}
                  className={`transition-all duration-1000 ease-out ${
                    isOverdue
                      ? 'stroke-red-500'
                      : isWarning
                      ? 'stroke-amber-500'
                      : 'stroke-blue-600 dark:stroke-blue-500'
                  }`}
                  strokeWidth="8"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
              <div className="absolute text-center">
                <span className="text-xs font-bold text-gray-700 dark:text-gray-200 tabular-nums">
                  {Math.round((clampedDays / 30) * 100)}%
                </span>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-gray-400 dark:text-gray-500 pt-3 border-t border-gray-50 dark:border-gray-800/60">
            Har 30 kunda bir marta yangilanadigan tsikl
          </div>
        </div>

        {/* Card 2: Amount & Real CBU Rate */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              Oylik to'lov summasi
            </span>
            <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>

          <div className="my-5">
            <div className="text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight tabular-nums">
              {(statusData?.costUZS ?? 65000).toLocaleString('uz-UZ')}
              <span className="text-base font-semibold text-gray-500 dark:text-gray-400 ml-1.5">so'm</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs font-bold text-gray-700 dark:text-gray-300">
                ${(statusData?.costUSD ?? 5.2).toFixed(2)} USD
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                (1 USD ≈ {Math.round(statusData?.exchangeRate ?? 12500).toLocaleString()} UZS)
              </span>
            </div>
          </div>

          <div className="text-[11px] text-gray-400 dark:text-gray-500 pt-3 border-t border-gray-50 dark:border-gray-800/60">
            O'zbekiston Respublikasi Markaziy Banki kursi bo'yicha
          </div>
        </div>

        {/* Card 3: Card Details with Quick Copy */}
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 text-white rounded-3xl p-6 shadow-lg shadow-gray-950/20 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-300 uppercase tracking-widest">
              To'lov Kartasi
            </span>
            <span className="text-xs font-bold text-blue-400">HUMO / UZCARD</span>
          </div>

          <div className="my-4">
            <p className="text-xs text-gray-400 mb-1">Karta raqami</p>
            <div className="font-mono text-xl sm:text-2xl font-bold tracking-wider text-white">
              {statusData?.cardNumber || '4916 9902 5000 4410'}
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <span className="text-xs text-gray-300">Asadbek Jumanazarov</span>
            <button
              onClick={handleCopyCard}
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 active:scale-95 text-white rounded-xl text-xs font-semibold backdrop-blur-sm transition-all"
            >
              {copied ? (
                <>
                  <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-emerald-400">Nusxalandi</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span>Nusxa olish</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Pending Payment Review Banner */}
      {statusData?.pendingPayment && (
        <div className="bg-blue-50 dark:bg-blue-950/40 rounded-3xl p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-600/30">
              <svg className="w-6 h-6 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-blue-900 dark:text-blue-100">
                To'lov tekshiruvda
              </h3>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
                Chekingiz Telegram botga yuborilgan. Admin tasdiqlashi bilan hisoblagich avtomatik 30 kunga yangilanadi.
              </p>
            </div>
          </div>
          <span className="px-3.5 py-1.5 rounded-xl bg-blue-600/10 text-blue-700 dark:text-blue-300 text-xs font-bold whitespace-nowrap">
            Kutilmoqda
          </span>
        </div>
      )}

      {/* Upload Receipt Section */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="mb-6">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">
            To'lov Chekini Yuklash
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Yuqoridagi kartaga to'lov qilgach, bank ilovasidagi kvitansiya (skrinshot yoki PDF) ni yuklang
          </p>
        </div>

        <form onSubmit={handleSubmitReceipt} className="space-y-6">
          {/* Dropzone */}
          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer rounded-2xl p-8 text-center transition-all duration-200 ${
              selectedFile
                ? 'bg-blue-50/50 dark:bg-blue-950/20 shadow-inner'
                : 'bg-gray-50 dark:bg-gray-800/40 hover:bg-gray-100 dark:hover:bg-gray-800/70 shadow-sm hover:shadow'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={handleFileChange}
              className="hidden"
            />

            {previewUrl ? (
              <div className="flex flex-col items-center">
                <img
                  src={previewUrl}
                  alt="Chek preview"
                  className="max-h-56 rounded-xl object-contain shadow-md mb-3"
                />
                <p className="text-xs font-medium text-gray-600 dark:text-gray-300">
                  {selectedFile?.name} ({(selectedFile?.size ? (selectedFile.size / 1024).toFixed(1) : 0)} KB)
                </p>
                <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-1">
                  Boshqa fayl tanlash uchun bosing
                </p>
              </div>
            ) : selectedFile ? (
              <div className="flex flex-col items-center py-4">
                <div className="w-14 h-14 rounded-2xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · PDF Hujjat
                </p>
                <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-2">
                  Boshqa fayl tanlash uchun bosing
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center py-4">
                <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 flex items-center justify-center mb-3 shadow-inner">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                </div>
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
                  Faylni shu yerga tashlang yoki bosing
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  PNG, JPG, WebP yoki PDF (maksimal 10 MB)
                </p>
              </div>
            )}
          </div>

          {/* Messages */}
          {uploadError && (
            <div className="text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 p-3 rounded-xl flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{uploadError}</span>
            </div>
          )}

          {uploadSuccess && (
            <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 p-3 rounded-xl flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>{uploadSuccess}</span>
            </div>
          )}

          {/* Submit Button */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!selectedFile || uploading}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:opacity-50 disabled:pointer-events-none text-white rounded-2xl font-bold text-sm shadow-lg shadow-blue-600/30 transition-all"
            >
              {uploading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Yuklanmoqda...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Chekni Yuborish</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Payment History Table */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">
              To'lovlar Tarixi
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Barcha o'tkazilgan to'lovlar va ularning tasdiqlanish holati
            </p>
          </div>
          <span className="text-xs font-semibold text-gray-400 dark:text-gray-500">
            Jami: {totalRecords} ta
          </span>
        </div>

        {historyLoading ? (
          <div className="py-12 flex justify-center">
            <Loading />
          </div>
        ) : history.length === 0 ? (
          <div className="py-14 text-center">
            <div className="w-12 h-12 rounded-2xl bg-gray-50 dark:bg-gray-800 text-gray-400 mx-auto flex items-center justify-center mb-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Hozircha to'lovlar mavjud emas
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Birinchi to'lovni amalga oshirib chekni yuklang
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider border-b border-gray-50 dark:border-gray-800/80">
                  <th className="pb-3 pl-2">Sana</th>
                  <th className="pb-3">Summa</th>
                  <th className="pb-3">Valyuta kursi</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3 text-right pr-2">Chek</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50 font-medium">
                {history.map((record) => {
                  const dateStr = new Intl.DateTimeFormat('uz-UZ', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(new Date(record.submittedAt));

                  return (
                    <tr
                      key={record.id}
                      className="hover:bg-gray-50/60 dark:hover:bg-gray-800/30 transition-colors"
                    >
                      <td className="py-4 pl-2 text-xs text-gray-600 dark:text-gray-300">
                        {dateStr}
                      </td>
                      <td className="py-4">
                        <div className="font-bold text-gray-900 dark:text-white tabular-nums">
                          {Math.round(record.amountUZS).toLocaleString('uz-UZ')} so'm
                        </div>
                        <div className="text-[11px] text-gray-400">
                          ${record.amountUSD.toFixed(2)} USD
                        </div>
                      </td>
                      <td className="py-4 text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                        1 USD = {Math.round(record.exchangeRate).toLocaleString()} UZS
                      </td>
                      <td className="py-4">
                        {record.status === 'CONFIRMED' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Tasdiqlangan
                          </span>
                        ) : record.status === 'REJECTED' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                            Rad etilgan
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            Kutilmoqda
                          </span>
                        )}
                      </td>
                      <td className="py-4 pr-2 text-right">
                        <a
                          href={record.receiptUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-300 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          Ko'rish
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalRecords > 10 && (
          <div className="flex items-center justify-between pt-6 border-t border-gray-50 dark:border-gray-800/80">
            <button
              onClick={() => fetchHistory(page - 1)}
              disabled={page <= 1 || historyLoading}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-40"
            >
              Oldingi
            </button>
            <span className="text-xs text-gray-500">
              Sahifa {page} / {Math.ceil(totalRecords / 10)}
            </span>
            <button
              onClick={() => fetchHistory(page + 1)}
              disabled={page * 10 >= totalRecords || historyLoading}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-40"
            >
              Keyingi
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

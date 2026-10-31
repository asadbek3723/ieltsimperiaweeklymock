import { useState } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { adminApi } from '../../services/api';
import { VARIANT_GROUPS, VARIANT_GROUP_LABELS, VariantGroup } from '../../types';

interface SectionForm {
  subject: 'GRAMMAR' | 'VOCABULARY';
  sectionType: 'EXERCISE' | 'PRACTICE_TEST';
  /** 'BY_EXERCISE' → admin sets number of exercises,
   *  'BY_QUESTION' → admin sets total question count */
  selectionMode: 'BY_EXERCISE' | 'BY_QUESTION';
  targetQuestionCount: number;  // used only when selectionMode === 'BY_QUESTION'
  variantGroups: string[];
  numberOfExercises: number;    // used only when selectionMode === 'BY_EXERCISE'
  timeAllocated: number;
  sectionOrder: number;
}

interface Props { onSuccess: () => void; }

// ─── Luxury PIN Success View ──────────────────────────────────────────────────
interface PinSuccessViewProps {
  pin: string;
  testTitle?: string;
  onSuccess: () => void;
}

function PinSuccessView({ pin, testTitle, onSuccess }: PinSuccessViewProps) {
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const handleCopyPin = async () => {
    try {
      await navigator.clipboard.writeText(pin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // fallback
    }
  };

  const handleCopyLink = async () => {
    try {
      const origin = window.location.origin;
      const url = `${origin}/login?pin=${pin}`;
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2200);
    } catch {
      // fallback
    }
  };

  const digits = (pin || '').split('');

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.12,
      },
    },
  };

  const digitVariants: Variants = {
    hidden: { opacity: 0, y: 18, scale: 0.75 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: 'spring' as const,
        stiffness: 380,
        damping: 24,
      },
    },
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="py-2 flex flex-col items-center gap-6"
    >
      {/* ── Top badge & Header ────────────────────────────────────────── */}
      <div className="flex flex-col items-center text-center gap-3 relative w-full">
        {/* Ambient background glow */}
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full bg-emerald-500/15 dark:bg-emerald-500/20 blur-3xl pointer-events-none" />

        {/* Celebratory Checkmark Icon */}
        <motion.div
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 20, delay: 0.05 }}
          className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 via-emerald-500 to-teal-400 text-white shadow-[0_14px_35px_-6px_rgba(16,185,129,0.5)] ring-4 ring-emerald-500/10"
        >
          <svg className="w-8 h-8 drop-shadow-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.8} d="M5 13l4 4L19 7" />
          </svg>
        </motion.div>

        <div className="space-y-1">
          <h3 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Test muvaffaqiyatli yaratildi
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-sm">
            Quyidagi maxsus PIN kodni o'quvchilarga ulashing
          </p>
        </div>
      </div>

      {/* ── The Centerpiece: Luxury Segmented PIN Display Card ─────────── */}
      <div className="relative w-full overflow-hidden rounded-3xl p-6 sm:p-7 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-white shadow-[0_24px_60px_-15px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.08)]">
        {/* Ambient colored depth glows inside the card */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-36 bg-gradient-to-r from-blue-600/20 via-indigo-600/20 to-purple-600/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 w-64 h-24 bg-emerald-500/15 blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center gap-4">
          {/* Header pill with test title */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 ring-1 ring-white/10 text-[11px] font-semibold text-slate-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="truncate max-w-[200px]">{testTitle || "Faol test"}</span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-400 font-mono tracking-wider">PIN KOD</span>
          </div>

          {/* Staggered animated large digits */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="flex items-center justify-center gap-2.5 sm:gap-4 my-2 w-full"
            onClick={handleCopyPin}
          >
            {digits.map((digit, i) => (
              <motion.div
                key={i}
                variants={digitVariants}
                whileHover={{ y: -5, scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 420, damping: 25 }}
                className="relative flex items-center justify-center w-16 h-22 sm:w-20 sm:h-26 rounded-2xl bg-gradient-to-b from-slate-800/90 to-slate-900 text-white shadow-[0_14px_30px_-6px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.2)] ring-1 ring-white/10 select-all cursor-pointer group"
                title="Nusxa olish uchun bosing"
              >
                {/* Subtle top gloss highlight */}
                <div className="absolute inset-x-3 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none" />

                <span className="font-mono text-5xl sm:text-6xl font-black tracking-tight text-white drop-shadow-[0_4px_16px_rgba(255,255,255,0.25)] group-hover:text-indigo-200 transition-colors">
                  {digit}
                </span>
              </motion.div>
            ))}
          </motion.div>

          {/* Micro-interaction hint */}
          <p className="text-[11px] text-slate-400 font-medium">
            Nusxa olish uchun kod ustiga bosing
          </p>
        </div>
      </div>

      {/* ── Action Buttons ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 w-full">
        {/* Copy actions row */}
        <div className="flex items-center gap-2.5 w-full">
          {/* Copy PIN button */}
          <button
            type="button"
            onClick={handleCopyPin}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-xs transition-all duration-200 active:scale-[0.98] ${
              copied
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/30 shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 ring-1 ring-slate-200/60 dark:ring-slate-700/60'
            }`}
          >
            {copied ? (
              <>
                <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                <span>PIN nusxalandi!</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="9" y="9" width="13" height="13" rx="2" strokeWidth={2} />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeWidth={2} />
                </svg>
                <span>PIN koddan nusxa olish</span>
              </>
            )}
          </button>

          {/* Copy link button */}
          <button
            type="button"
            onClick={handleCopyLink}
            className={`flex items-center justify-center gap-1.5 py-3 px-4 rounded-xl font-bold text-xs transition-all duration-200 active:scale-[0.98] ${
              linkCopied
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/30 shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 ring-1 ring-slate-200/60 dark:ring-slate-700/60'
            }`}
            title="O'quvchi kirish havolasini nusxalash"
          >
            {linkCopied ? (
              <>
                <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                <span>Havola olindi!</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <span>Havola</span>
              </>
            )}
          </button>
        </div>

        {/* Primary Tayyor button */}
        <button
          type="button"
          onClick={onSuccess}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-500 hover:via-indigo-500 hover:to-violet-500 active:scale-[0.98] text-white font-bold text-sm tracking-wide shadow-[0_8px_24px_-4px_rgba(79,70,229,0.45)] hover:shadow-[0_12px_28px_-4px_rgba(79,70,229,0.6)] transition-all duration-200 flex items-center justify-center gap-2"
        >
          <span>Tayyor</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </motion.div>
  );
}

export default function CreateTest({ onSuccess }: Props) {
  const [title, setTitle] = useState('');
  const [maxAttempts, setMaxAttempts] = useState(1);
  const [sections, setSections] = useState<SectionForm[]>([
    {
      subject: 'GRAMMAR',
      sectionType: 'EXERCISE',
      selectionMode: 'BY_QUESTION',
      targetQuestionCount: 20,
      variantGroups: ['1_5'],
      numberOfExercises: 50,
      timeAllocated: 20,
      sectionOrder: 1,
    },
  ]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [createdPin, setCreatedPin] = useState('');

  const addSection = () => {
    const order = sections.length + 1;
    setSections(prev => [...prev, {
      subject: 'GRAMMAR',
      sectionType: 'EXERCISE',
      selectionMode: 'BY_QUESTION',
      targetQuestionCount: 20,
      variantGroups: ['1_5'],
      numberOfExercises: 50,
      timeAllocated: 20,
      sectionOrder: order,
    }]);
  };

  const removeSection = (idx: number) =>
    setSections(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, sectionOrder: i + 1 })));

  const update = <K extends keyof SectionForm>(idx: number, field: K, value: SectionForm[K]) =>
    setSections(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));

  // When switching to BY_QUESTION, auto-set a large pool so user only needs to pick question count
  const setSelectionMode = (idx: number, mode: 'BY_EXERCISE' | 'BY_QUESTION') => {
    setSections(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      return {
        ...s,
        selectionMode: mode,
        numberOfExercises: mode === 'BY_QUESTION' ? 50 : s.numberOfExercises,
      };
    }));
  };

  const toggleVariant = (idx: number, group: string) =>
    setSections(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      const has = s.variantGroups.includes(group);
      if (has && s.variantGroups.length === 1) return s;
      return { ...s, variantGroups: has ? s.variantGroups.filter(g => g !== group) : [...s.variantGroups, group] };
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await adminApi.createTest({
        title,
        maxAttempts,
        sections: sections.map(s => ({
          subject: s.subject,
          sectionType: s.sectionType,
          selectionMode: s.selectionMode,
          targetQuestionCount:
            s.sectionType === 'EXERCISE' && s.selectionMode === 'BY_QUESTION'
              ? s.targetQuestionCount
              : undefined,
          variantGroups: s.variantGroups,
          numberOfExercises: s.numberOfExercises,
          timeAllocated: s.timeAllocated,
          sectionOrder: s.sectionOrder,
        })),
      });
      setCreatedPin(res.data.data.pinCode);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Test yaratishda xatolik yuz berdi.');
    } finally {
      setLoading(false);
    }
  };

  // ── PIN success screen ────────────────────────────────────────────────────
  if (createdPin) {
    return (
      <PinSuccessView
        pin={createdPin}
        testTitle={title}
        onSuccess={onSuccess}
      />
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 px-4 py-3 rounded-xl"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Test nomi + urinish */}
      <div className="flex gap-3">
        <div className="flex-1 space-y-1.5">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Test nomi</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Masalan: Grammar — Unit 1–5"
            required
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-gray-600 outline-none focus:border-blue-500 dark:focus:border-blue-400 transition"
          />
        </div>
        <div className="w-24 space-y-1.5">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Urinishlar</label>
          <input
            type="text"
            inputMode="numeric"
            value={maxAttempts === 0 ? '' : maxAttempts}
            onChange={e => {
              const v = e.target.value.replace(/\D/g, '');
              setMaxAttempts(v === '' ? 0 : Math.min(10, parseInt(v)));
            }}
            onBlur={() => { if (!maxAttempts) setMaxAttempts(1); }}
            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-semibold text-center text-gray-900 dark:text-white outline-none focus:border-blue-500 dark:focus:border-blue-400 transition"
          />
        </div>
      </div>

      {/* Bo'limlar */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Bo'limlar</span>
          <button
            type="button"
            onClick={addSection}
            className="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Bo'lim qo'shish
          </button>
        </div>

        <AnimatePresence initial={false}>
          {sections.map((sec, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-800/50"
            >
              {/* Card header */}
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                  {idx + 1}-bo'lim
                </span>
                {sections.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSection(idx)}
                    className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              <div className="p-4 space-y-4">
                {/* Row 1: Fan turi + Bo'lim turi */}
                <div className="flex flex-wrap gap-3">
                  {/* Fan */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Fan</label>
                    <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                      {(['GRAMMAR', 'VOCABULARY'] as const).map(s => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => update(idx, 'subject', s)}
                          className={`px-3 py-1.5 text-xs font-medium transition-all ${sec.subject === s
                            ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                            : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                        >
                          {s === 'GRAMMAR' ? 'Grammar' : 'Vocabulary'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Bo'lim turi */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Tur</label>
                    <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                      {(['EXERCISE', 'PRACTICE_TEST'] as const).map(t => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => update(idx, 'sectionType', t)}
                          className={`px-3 py-1.5 text-xs font-medium transition-all ${sec.sectionType === t
                            ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                            : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                        >
                          {t === 'EXERCISE' ? 'Mashq' : 'Practice'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Row 2: Savollar / Mashqlar sonini tanlash */}
                {sec.sectionType === 'EXERCISE' && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      Har o'quvchiga berilsin:
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {/* Option A: Mashqlar soni */}
                      <button
                        type="button"
                        onClick={() => setSelectionMode(idx, 'BY_EXERCISE')}
                        className={`rounded-lg p-3 text-left border transition-all ${sec.selectionMode === 'BY_EXERCISE'
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                          }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${sec.selectionMode === 'BY_EXERCISE' ? 'border-blue-500' : 'border-gray-300 dark:border-gray-600'}`}>
                            {sec.selectionMode === 'BY_EXERCISE' && <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                          </div>
                          <span className={`text-xs font-semibold ${sec.selectionMode === 'BY_EXERCISE' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}`}>
                            Mashqlar soni
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 pl-5">
                          Nechta mashq berilishini belgilaydi
                        </p>
                      </button>

                      {/* Option B: Savollar soni */}
                      <button
                        type="button"
                        onClick={() => setSelectionMode(idx, 'BY_QUESTION')}
                        className={`rounded-lg p-3 text-left border transition-all ${sec.selectionMode === 'BY_QUESTION'
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                          }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${sec.selectionMode === 'BY_QUESTION' ? 'border-blue-500' : 'border-gray-300 dark:border-gray-600'}`}>
                            {sec.selectionMode === 'BY_QUESTION' && <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                          </div>
                          <span className={`text-xs font-semibold ${sec.selectionMode === 'BY_QUESTION' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}`}>
                            Savollar soni
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 pl-5">
                          Nechta savol bo'lishini belgilaydi
                        </p>
                      </button>
                    </div>
                  </div>
                )}

                {/* Row 3: Raqamli inputlar */}
                <div className="flex flex-wrap gap-4 items-end">
                  {/* Asosiy son (mashq yoki savol) */}
                  {sec.sectionType === 'EXERCISE' ? (
                    sec.selectionMode === 'BY_EXERCISE' ? (
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Mashqlar soni</label>
                        <div className="flex items-center gap-2 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 w-32">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={sec.numberOfExercises === 0 ? '' : sec.numberOfExercises}
                            onChange={e => {
                              const v = e.target.value.replace(/\D/g, '');
                              update(idx, 'numberOfExercises', v === '' ? 0 : Math.min(200, parseInt(v)));
                            }}
                            onBlur={() => { if (!sec.numberOfExercises) update(idx, 'numberOfExercises', 1); }}
                            className="bg-transparent text-sm font-semibold text-gray-900 dark:text-white outline-none w-full text-center"
                          />
                          <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">ta</span>
                        </div>
                      </div>
                    ) : (
                      /* BY_QUESTION: admin only enters question count; numberOfExercises auto = 50 */
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Savollar soni</label>
                        <div className="flex items-center gap-2 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 w-32">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={sec.targetQuestionCount === 0 ? '' : sec.targetQuestionCount}
                            onChange={e => {
                              const v = e.target.value.replace(/\D/g, '');
                              update(idx, 'targetQuestionCount', v === '' ? 0 : Math.min(200, parseInt(v)));
                            }}
                            onBlur={() => { if (!sec.targetQuestionCount) update(idx, 'targetQuestionCount', 20); }}
                            className="bg-transparent text-sm font-semibold text-gray-900 dark:text-white outline-none w-full text-center"
                          />
                          <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">ta</span>
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Savollar soni</label>
                      <div className="flex items-center gap-2 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 w-32">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={sec.numberOfExercises === 0 ? '' : sec.numberOfExercises}
                          onChange={e => {
                            const v = e.target.value.replace(/\D/g, '');
                            update(idx, 'numberOfExercises', v === '' ? 0 : Math.min(200, parseInt(v)));
                          }}
                          onBlur={() => { if (!sec.numberOfExercises) update(idx, 'numberOfExercises', 1); }}
                          className="bg-transparent text-sm font-semibold text-gray-900 dark:text-white outline-none w-full text-center"
                        />
                        <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">ta</span>
                      </div>
                    </div>
                  )}

                  {/* Vaqt */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Vaqt</label>
                    <div className="flex items-center gap-2 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 w-28">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={sec.timeAllocated === 0 ? '' : sec.timeAllocated}
                        onChange={e => {
                          const v = e.target.value.replace(/\D/g, '');
                          update(idx, 'timeAllocated', v === '' ? 0 : Math.min(180, parseInt(v)));
                        }}
                        onBlur={() => { if (!sec.timeAllocated) update(idx, 'timeAllocated', 1); }}
                        className="bg-transparent text-sm font-semibold text-gray-900 dark:text-white outline-none w-full text-center"
                      />
                      <span className="text-xs text-gray-400 dark:text-gray-500">min</span>
                    </div>
                  </div>
                </div>

                {/* Row 4: Variantlar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Variantlar (Unit guruhlar)</label>
                    <button
                      type="button"
                      onClick={() => update(idx, 'variantGroups', [...VARIANT_GROUPS])}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
                    >
                      Barchasini tanlash
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {VARIANT_GROUPS.map(group => {
                      const active = sec.variantGroups.includes(group);
                      return (
                        <button
                          key={group}
                          type="button"
                          onClick={() => toggleVariant(idx, group)}
                          className={`px-3 py-1 rounded-md text-xs font-medium border transition-all ${active
                            ? 'border-blue-500 bg-blue-500 text-white'
                            : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
                            }`}
                        >
                          {VARIANT_GROUP_LABELS[group as VariantGroup]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Yaratilmoqda...
          </>
        ) : (
          'Test yaratish va PIN olish'
        )}
      </button>
    </form>
  );
}

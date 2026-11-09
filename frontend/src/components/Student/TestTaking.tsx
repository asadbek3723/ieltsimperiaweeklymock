import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTest } from '../../context/TestContext';
import { SS_PIN, SS_ANSWERS, SS_RULES_ACCEPTED } from '../../context/TestContext';
import { useAntiCheat, beginAntiCheatGrace } from '../../hooks/useAntiCheat';
import { studentApi } from '../../services/api';
import { connectSocket } from '../../services/socketClient';
import Timer from '../Common/Timer';
import Logo from '../Common/Logo';
import FullscreenGuard from './FullscreenGuard';
import SectionTransitionModal from './SectionTransitionModal';
import ExerciseRenderer from './ExerciseRenderer';
import PracticeTestRenderer from './PracticeTestRenderer';
import TestRulesModal from './TestRulesModal';
import ExpulsionOverlay from './ExpulsionOverlay';
import { ClientExercise, ClientPracticeQuestion, SubmitAnswer } from '../../types';

export default function TestTaking() {
  const { phase, testSessionId, currentSection, title, sections, setAnswer, answers, getAllAnswers, goToNextSection, completeTest, initTest, reset, serverTime } = useTest();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const expelledRef = useRef(false);
  const [isExpelled, setIsExpelled] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [currentExerciseIdx, setCurrentExerciseIdx] = useState(0);
  const [flaggedExercises, setFlaggedExercises] = useState<Set<number>>(new Set());
  const [pendingSection, setPendingSection] = useState<import('../../types').CurrentSection | null>(null);

  // Settings Modal State
  const [showSettings, setShowSettings] = useState(false);
  const [fontSize, setFontSize] = useState<'normal' | 'large'>('normal');
  const [showSkipModal, setShowSkipModal] = useState(false);

  const [rulesAccepted, setRulesAccepted] = useState(() => {
    try {
      return sessionStorage.getItem(SS_RULES_ACCEPTED) === 'true';
    } catch {
      return false;
    }
  });

  const { fatalStrike, isFullscreenExit } = useAntiCheat(testSessionId, phase === 'in-section' && rulesAccepted && !isExpelled && !pendingSection);

  const handleAcceptRules = () => {
    try {
      sessionStorage.setItem(SS_RULES_ACCEPTED, 'true');
    } catch {}
    setRulesAccepted(true);
    enterFullscreen();
  };

  const enterFullscreen = () => {
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
      mozRequestFullScreen?: () => Promise<void>;
      msRequestFullscreen?: () => Promise<void>;
    };
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
    if (req) {
      // Fullscreen transition fires blur/visibilitychange in some browsers — don't treat it as cheating
      beginAntiCheatGrace();
      req.call(el).catch(err => {
        // Silently ignore — FullscreenGuard handles the error UI
        console.warn('[TestTaking] Fullscreen request failed:', err?.message || err);
      });
    }
  };

  // ── Auto-rejoin on refresh ──────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'idle' || testSessionId) return;

    const savedPin = sessionStorage.getItem(SS_PIN);
    if (!savedPin) {
      const timer = setTimeout(() => navigate('/student'), 100);
      return () => clearTimeout(timer);
    }

    setRestoring(true);
    studentApi.joinTest(savedPin)
      .then(res => {
        initTest(res.data.data);
        // Stay on /student/test — no navigation needed
      })
      .catch(() => {
        // Session expired or test ended — clear and go to dashboard
        try {
          sessionStorage.removeItem(SS_PIN);
          sessionStorage.removeItem(SS_ANSWERS);
          sessionStorage.removeItem(SS_RULES_ACCEPTED);
        } catch { }
        navigate('/student');
      })
      .finally(() => setRestoring(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, testSessionId]);

  useEffect(() => {
    if (!testSessionId) return;
    const socket = connectSocket();
    socket.emit('join_test_room', testSessionId);
    const interval = setInterval(() => socket.emit('heartbeat', { testSessionId }), 15000);
    return () => clearInterval(interval);
  }, [testSessionId]);

  // Reset exercise index and flags when section changes
  useEffect(() => {
    setCurrentExerciseIdx(0);
    setFlaggedExercises(new Set());
  }, [currentSection?.sectionOrder]);

  const toggleFlag = (idx: number) => {
    setFlaggedExercises(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleAnswer = useCallback((answer: SubmitAnswer) => {
    setAnswer(answer.questionId, answer);
  }, [setAnswer]);

  const submitSection = useCallback(async () => {
    if (!testSessionId || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const ord = currentSection?.sectionOrder ?? 1;
      const hasNext = sections.some(s => s.sectionOrder > ord);
      if (hasNext) {
        const res = await studentApi.advanceSection(testSessionId, getAllAnswers());
        const nextData = res.data.data;
        // Attach timeAllocated from sections config for the modal
        const nextConfig = sections.find(s => s.sectionOrder === nextData?.sectionOrder);
        if (nextData && nextConfig) nextData.timeAllocated = nextConfig.timeAllocated;
        // Show break modal instead of jumping directly
        setPendingSection(nextData);
        return;
      } else {
        const res = await studentApi.submitTest(testSessionId, getAllAnswers());
        // Test fully complete — clear session restore data
        try {
          sessionStorage.removeItem(SS_PIN);
          sessionStorage.removeItem(SS_ANSWERS);
          sessionStorage.removeItem(SS_RULES_ACCEPTED);
        } catch { }
        // Mark test as completed so StudentPage exits full-screen mode before navigating
        completeTest();
        if (res?.data?.data?.id) {
          navigate(`/student/results/${res.data.data.id}`, { replace: true });
        } else {
          navigate('/student/results', { replace: true });
        }
      }
    } catch (err: unknown) {
      console.error('Submit/Advance error:', err);
      const serverMsg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      const statusCode = (err as { response?: { status?: number } })?.response?.status;
      const isTimeout = (err as { code?: string })?.code === 'ECONNABORTED';
      const isSessionGone = statusCode === 404 ||
        (serverMsg && (serverMsg.includes('sessiya topilmadi') || serverMsg.includes('session') || serverMsg.includes('topilmadi')));
      if (isSessionGone) {
        try {
          sessionStorage.removeItem(SS_PIN);
          sessionStorage.removeItem(SS_ANSWERS);
          sessionStorage.removeItem(SS_RULES_ACCEPTED);
        } catch { }
        navigate('/student/results', { replace: true });
        return;
      }
      const msg = isTimeout
        ? 'Server vaqt tugadi. Qaytadan urinib ko\'ring.'
        : serverMsg || 'Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.';
      setSubmitError(msg);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [testSessionId, currentSection, sections, getAllAnswers, goToNextSection, completeTest, navigate]);

  // Handle immediate expulsion (Zero-Tolerance)
  const handleExpulsion = useCallback(async () => {
    if (expelledRef.current || !testSessionId) return;
    expelledRef.current = true;
    setIsExpelled(true);

    try {
      // 1. Submit everything to backend as is (marking it as finished/expelled)
      await studentApi.submitTest(testSessionId, getAllAnswers());
    } catch (e) {
      console.warn('Expulsion submission failed:', e);
    } finally {
      // 2. Clear all local session data
      try {
        sessionStorage.removeItem(SS_RULES_ACCEPTED);
      } catch {}
      reset();
      // 3. Stay on this page — the ExpulsionOverlay will block everything
    }
  }, [testSessionId, getAllAnswers, reset]);

  // Handle immediate expulsion (Fatal violations only: Tab switch, App switch)
  useEffect(() => {
    if (rulesAccepted && fatalStrike >= 1 && !isExpelled) {
      handleExpulsion();
    }
  }, [fatalStrike, rulesAccepted, isExpelled, handleExpulsion]);

  // ── Autosave to server every 10 seconds ────────────────────────────────────
  useEffect(() => {
    if (!testSessionId || phase !== 'in-section') return;
    const interval = setInterval(() => {
      studentApi.saveAnswers(testSessionId, getAllAnswers()).catch(e => console.warn('Autosave failed:', e));
    }, 10000);
    return () => clearInterval(interval);
  }, [testSessionId, getAllAnswers, phase]);

  // ── Start the pending section (after break) ────────────────────────────────
  const handleStartPendingSection = useCallback(() => {
    if (!pendingSection) return;
    goToNextSection(pendingSection);
    setPendingSection(null);
    // Re-enter fullscreen after the section transition modal closes
    // Small delay to let the DOM settle before requesting fullscreen
    setTimeout(() => {
      if (!document.fullscreenElement) {
        enterFullscreen();
      }
    }, 300);
  }, [pendingSection, goToNextSection]);

  // ── Spinner while restoring ─────────────────────────────────────────────────
  if (restoring) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#FDFDFD] dark:bg-gray-950">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-8 h-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <p className="text-sm font-semibold text-gray-400 dark:text-gray-500">Qayta ulanmoqda...</p>
        </div>
      </div>
    );
  }

  if (!currentSection || !testSessionId) {
    return null;
  }

  const isPracticeTest = currentSection.sectionType === 'PRACTICE_TEST';
  const exercises = (!isPracticeTest ? (currentSection.exercises ?? []) : []) as ClientExercise[];
  const practiceQuestions = (isPracticeTest ? (currentSection.questions ?? []) : []) as ClientPracticeQuestion[];
  const currentExercise = !isPracticeTest ? exercises[currentExerciseIdx] : null;

  // Count answered questions
  const allQuestionIds = isPracticeTest
    ? practiceQuestions.map(q => q.id)
    : exercises.flatMap(ex => ex.questions.map(q => `${ex.id}_${q.id}`));
  const answeredCount = allQuestionIds.filter(id => answers[id]).length;
  const totalCount = allQuestionIds.length;

  const isLast = !sections.some(s => s.sectionOrder > currentSection.sectionOrder);

  const subjectBadge = currentSection.subject === 'GRAMMAR'
    ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
    : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300';

  // Count answered per exercise for the part buttons (only for EXERCISE sections)
  const exerciseAnsweredCounts = exercises.map(ex => {
    const ids = ex.questions.map(q => `${ex.id}_${q.id}`);
    return ids.filter(id => answers[id]).length;
  });

  return (
    <div className="h-screen flex flex-col bg-[#FDFDFD] dark:bg-gray-950 transition-colors font-sans overflow-hidden">
      {isExpelled && <ExpulsionOverlay />}

      {!rulesAccepted && (
        <TestRulesModal
          title={title}
          onAccept={handleAcceptRules}
        />
      )}

      <FullscreenGuard
        isEnabled={(phase === 'in-section' && rulesAccepted && !isExpelled && !pendingSection) || (isFullscreenExit && !pendingSection)}
        onEnterFullscreen={enterFullscreen}
      />

      {/* Header */}
      <div className="flex-shrink-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-6 py-4 z-50">
        <div className="max-w-full mx-auto grid grid-cols-3 items-center">

          {/* Logo */}
          <div className="flex items-center">
            <Logo className="h-10" wrapDark />
          </div>

          {/* Status badge */}
          <div className="flex justify-center">
            <div className={`flex items-center px-3 py-1 rounded-md border ${subjectBadge} border-current/20`}>
              <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                {answeredCount}/{totalCount} answered
              </span>
            </div>
          </div>

          {/* Timer + Skip */}
          <div className="flex items-center justify-end gap-4">
            {/* Settings icon */}
            <button
              onClick={() => setShowSettings(true)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>

            <button
              onClick={() => setShowSkipModal(true)}
              disabled={submitting}
              className="px-4 py-1.5 border border-orange-200 dark:border-orange-900 text-orange-600 dark:text-orange-400 bg-orange-50/50 dark:bg-orange-950/20 rounded-lg text-sm font-bold hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
              {isLast ? 'Tugatish' : 'Tashlab o\'tish'}
            </button>

            <Timer deadline={currentSection.deadline} onExpire={submitSection} serverTime={serverTime} />
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-hidden" style={fontSize === 'large' ? { zoom: 1.15 } as React.CSSProperties : {}}>
        <div className="h-full relative overflow-hidden">
          {isPracticeTest ? (
            <PracticeTestRenderer
              key={`practice-${currentSection.sectionOrder}`}
              questions={practiceQuestions}
              subject={currentSection.subject}
              answers={answers}
              onAnswer={handleAnswer}
              onSubmit={submitSection}
              submitting={submitting}
              isLast={isLast}
            />
          ) : currentExercise ? (
            <ExerciseRenderer
              key={`${currentSection.sectionOrder}-${currentExerciseIdx}`}
              exercise={currentExercise}
              answers={answers}
              onAnswer={handleAnswer}
              isFlagged={flaggedExercises.has(currentExerciseIdx)}
              onToggleFlag={() => toggleFlag(currentExerciseIdx)}
              questionStartIndex={exercises.slice(0, currentExerciseIdx).reduce((acc, ex) => acc + (ex.questions?.length || 0), 0) + 1}
            />
          ) : null}
        </div>
      </main>

      {/* Bottom navigation — only for EXERCISE sections */}
      {!isPracticeTest && (
        <div className="flex-shrink-0 z-40 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-t border-gray-200/80 dark:border-gray-800">
          {/* Part pills row */}
          <div className="px-3 pt-2.5 pb-1 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-1.5 min-w-max mx-auto w-fit">
              {exercises.map((ex, i) => {
                const answered = exerciseAnsweredCounts[i];
                const total = ex.questions.length;
                const isCurrent = i === currentExerciseIdx;
                const isComplete = answered === total && total > 0;
                const isFlaggedPart = flaggedExercises.has(i);

                return (
                  <button
                    key={ex.id}
                    onClick={() => setCurrentExerciseIdx(i)}
                    title={`${answered}/${total} answered${isFlaggedPart ? ' · Belgilangan' : ''}`}
                    className={`relative flex-shrink-0 h-8 min-w-[52px] px-2.5 rounded-xl text-[11px] font-bold transition-all duration-150 flex items-center justify-center gap-1 ${isCurrent
                      ? 'bg-[#E31E24] text-white shadow-[0_2px_8px_rgba(227,30,36,0.4)] scale-105'
                      : isFlaggedPart && isComplete
                        ? 'bg-amber-400 text-white shadow-sm'
                        : isFlaggedPart
                          ? 'bg-amber-50 dark:bg-amber-950/30 border border-amber-400 text-amber-600 dark:text-amber-400'
                          : isComplete
                            ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                  >
                    {isFlaggedPart && !isCurrent && (
                      <svg className="w-2.5 h-2.5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2z" />
                      </svg>
                    )}
                    <span>{i + 1}</span>
                    {isComplete && !isCurrent && (
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border border-white dark:border-gray-900" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Prev / progress / Next row */}
          <div className="px-3 pb-3 pt-1 flex items-center gap-2">
            <button
              onClick={() => setCurrentExerciseIdx(i => Math.max(0, i - 1))}
              disabled={currentExerciseIdx === 0}
              className="flex-shrink-0 h-10 w-10 rounded-xl flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 disabled:opacity-25 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all font-bold text-base"
              aria-label="Previous"
            >
              ‹
            </button>

            {/* Progress bar */}
            <div className="flex-1 flex flex-col gap-1">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500">
                  {currentExerciseIdx + 1} / {exercises.length} part
                </span>
                <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500">
                  {exerciseAnsweredCounts.reduce((a, b) => a + b, 0)} / {exercises.reduce((a, ex) => a + ex.questions.length, 0)} answered
                </span>
              </div>
              <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#E31E24] rounded-full transition-all duration-300"
                  style={{ width: `${((currentExerciseIdx + 1) / exercises.length) * 100}%` }}
                />
              </div>
            </div>

            {currentExerciseIdx < exercises.length - 1 ? (
              <button
                onClick={() => setCurrentExerciseIdx(i => Math.min(exercises.length - 1, i + 1))}
                className="flex-shrink-0 h-10 w-10 rounded-xl flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all font-bold text-base"
                aria-label="Next"
              >
                ›
              </button>
            ) : (
              <button
                onClick={() => setShowSkipModal(true)}
                disabled={submitting}
                className="flex-shrink-0 h-10 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black shadow-[0_2px_10px_rgba(5,150,105,0.4)] transition-all whitespace-nowrap"
              >
                {submitting ? '...' : isLast ? 'Tugatish ✓' : 'Keyingisi →'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Section Transition Modal */}
      {pendingSection && (
        <SectionTransitionModal
          section={pendingSection}
          sectionNumber={pendingSection.sectionOrder}
          totalSections={sections.length}
          onStart={handleStartPendingSection}
        />
      )}

      {/* Submit Error Toast */}
      {submitError && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-3 bg-red-600 text-white px-5 py-3 rounded-2xl shadow-2xl max-w-sm w-[90%]">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <p className="text-sm font-semibold flex-1">{submitError}</p>
          <button onClick={() => setSubmitError(null)} className="text-white/70 hover:text-white transition-colors flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 w-full max-w-sm rounded-2xl p-6 shadow-2xl relative">
            <button onClick={() => setShowSettings(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h3 className="text-lg font-black text-gray-900 dark:text-white mb-6">Test Sozlamalari</h3>

            <div className="space-y-5">
              {/* Theme Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-800 dark:text-gray-200">Tungi rejim</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Ko'zni toliqtirmaslik uchun</p>
                </div>
                <button
                  onClick={() => document.documentElement.classList.toggle('dark')}
                  className="w-12 h-6 bg-gray-200 dark:bg-emerald-600 rounded-full relative transition-colors"
                >
                  <div className="w-5 h-5 bg-white rounded-full absolute top-0.5 left-0.5 dark:translate-x-6 transition-transform shadow-sm" />
                </button>
              </div>

              {/* Font Size Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-800 dark:text-gray-200">Matn o'lchami</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">O'qishga oson bo'lishi uchun</p>
                </div>
                <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1 gap-1 w-24">
                  <button
                    onClick={() => setFontSize('normal')}
                    className={`px-2 py-1 flex-1 text-sm font-bold rounded-md transition-all ${fontSize === 'normal' ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    A
                  </button>
                  <button
                    onClick={() => setFontSize('large')}
                    className={`px-2 py-1 flex-1 text-base font-black rounded-md transition-all ${fontSize === 'large' ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    A+
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                {/* Fullscreen Toggle */}
                <button
                  onClick={() => {
                    beginAntiCheatGrace();
                    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
                    else document.exitFullscreen().catch(() => {});
                  }}
                  className="w-full py-2.5 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                  To'liq ekran rejimi
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Skip / Finish Confirmation Modal */}
      {showSkipModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 shadow-2xl backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md overflow-hidden transform transition-all border border-gray-100 dark:border-gray-700 shadow-2xl">
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-2">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                Diqqat!
              </h3>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed text-[15px]">
                Siz ushbu bo'limni to'liq <b>{isLast ? 'tugatyapsiz' : 'o\'tkazib yuboryapsiz'}</b>! Bu bo'limga (qismga) qaytib kira olmaysiz. Barcha kerakli javoblarni belgilaganingizga ishonchingiz komilmi?
              </p>
            </div>
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900/50 flex gap-3 flex-row-reverse border-t border-gray-100 dark:border-gray-700">
              <button
                onClick={() => {
                  setShowSkipModal(false);
                  submitSection();
                }}
                className="flex-1 py-2.5 rounded-xl font-bold text-white bg-red-600 hover:bg-red-500 transition-colors shadow-lg shadow-red-500/30"
              >
                Ha, {isLast ? 'Tugatish' : 'O\'tkazib yuborish'}
              </button>
              <button
                onClick={() => setShowSkipModal(false)}
                className="flex-1 py-2.5 rounded-xl font-bold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-all"
              >
                Bekor qilish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

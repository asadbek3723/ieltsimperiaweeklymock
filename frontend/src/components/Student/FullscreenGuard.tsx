import React, { useEffect, useState, useCallback, useRef } from 'react';
import { beginAntiCheatGrace } from '../../hooks/useAntiCheat';

interface FullscreenGuardProps {
    onEnterFullscreen: () => void;
    isEnabled: boolean;
}

/**
 * Returns true if the document is currently in any fullscreen mode,
 * handling all vendor-prefixed variants.
 */
function getIsFullscreen(): boolean {
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
    ) || isBrowserFullscreen();
}

/**
 * Browser-level fullscreen (F11, macOS green button / Ctrl+Cmd+F) does NOT set
 * document.fullscreenElement, so detect it by the window filling the screen
 * with no browser toolbar. The 60px height tolerance covers the MacBook notch.
 */
function isBrowserFullscreen(): boolean {
    const noToolbar = window.outerHeight - window.innerHeight <= 4;
    const fullWidth = window.innerWidth >= window.screen.width - 4;
    const fullHeight = window.innerHeight >= window.screen.height - 60;
    return noToolbar && fullWidth && fullHeight;
}

/**
 * Cross-browser fullscreen request with vendor prefix fallback.
 * Returns a Promise that resolves when fullscreen is entered,
 * or rejects with an error.
 */
async function requestFullscreenCrossBrowser(element: HTMLElement): Promise<void> {
    const el = element as HTMLElement & {
        webkitRequestFullscreen?: (options?: FullscreenOptions) => Promise<void>;
        mozRequestFullScreen?: (options?: FullscreenOptions) => Promise<void>;
        msRequestFullscreen?: (options?: FullscreenOptions) => Promise<void>;
    };

    if (el.requestFullscreen) {
        return el.requestFullscreen();
    } else if (el.webkitRequestFullscreen) {
        return el.webkitRequestFullscreen();
    } else if (el.mozRequestFullScreen) {
        return el.mozRequestFullScreen();
    } else if (el.msRequestFullscreen) {
        return el.msRequestFullscreen();
    } else {
        throw new Error('Brauzeringiz to\'liq ekran rejimini qo\'llab-quvvatlamaydi.');
    }
}

export default function FullscreenGuard({ onEnterFullscreen, isEnabled }: FullscreenGuardProps) {
    const [isFullscreen, setIsFullscreen] = useState(getIsFullscreen);
    const [loading, setLoading] = useState(false);
    const [denied, setDenied] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const retryCountRef = useRef(0);

    // Listen to all vendor-prefixed fullscreen events
    useEffect(() => {
        if (!isEnabled) return;

        const handleChange = () => {
            const fs = getIsFullscreen();
            setIsFullscreen(fs);
            if (fs) {
                setLoading(false);
                setDenied(false);
                setErrorMsg('');
                retryCountRef.current = 0;
            }
        };

        document.addEventListener('fullscreenchange', handleChange);
        document.addEventListener('webkitfullscreenchange', handleChange);
        document.addEventListener('mozfullscreenchange', handleChange);
        document.addEventListener('MSFullscreenChange', handleChange);
        // F11 / green-button fullscreen only fires resize
        window.addEventListener('resize', handleChange);
        handleChange();

        return () => {
            window.removeEventListener('resize', handleChange);
            document.removeEventListener('fullscreenchange', handleChange);
            document.removeEventListener('webkitfullscreenchange', handleChange);
            document.removeEventListener('mozfullscreenchange', handleChange);
            document.removeEventListener('MSFullscreenChange', handleChange);
        };
    }, [isEnabled]);

    const handleClick = useCallback(async () => {
        setLoading(true);
        setDenied(false);
        setErrorMsg('');
        retryCountRef.current += 1;

        // Also call parent callback (e.g. to update state in TestTaking)
        try { onEnterFullscreen(); } catch { /* ignore */ }

        try {
            beginAntiCheatGrace();
            await requestFullscreenCrossBrowser(document.documentElement);
            // Success: fullscreenchange event will update isFullscreen state
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Noma\'lum xatolik';

            // If browser denied due to security policy (user didn't interact or blocked)
            const isDenied =
                msg.toLowerCase().includes('denied') ||
                msg.toLowerCase().includes('disallowed') ||
                msg.toLowerCase().includes('failed') ||
                msg.toLowerCase().includes('not allowed') ||
                msg.toLowerCase().includes('permission') ||
                msg.toLowerCase().includes('security');

            setDenied(isDenied || retryCountRef.current >= 2);
            setErrorMsg(msg);
            setLoading(false);

            console.warn('[FullscreenGuard] Fullscreen denied:', msg);
        }
    }, [onEnterFullscreen]);

    if (!isEnabled || isFullscreen) return null;

    return (
        <div className="fixed inset-0 z-[9999] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-6 text-center">
            <div className="max-w-md w-full rounded-3xl p-8 shadow-[0_32px_80px_-12px_rgba(0,0,0,0.7)] border border-white/8 bg-slate-900 space-y-6">

                {/* Icon */}
                <div className="relative w-20 h-20 mx-auto">
                    <div className="absolute inset-0 rounded-full bg-red-500/20 animate-ping" />
                    <div className="relative w-20 h-20 bg-red-500/15 text-red-400 rounded-full flex items-center justify-center ring-1 ring-red-500/30">
                        <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                    </div>
                </div>

                {/* Title & description */}
                <div className="space-y-2">
                    <h2 className="text-xl font-black text-white uppercase tracking-tight">
                        To'liq ekran rejimi talab qilinadi
                    </h2>

                    {denied ? (
                        // Browser blocked fullscreen — show helpful instructions
                        <div className="space-y-3 text-left">
                            <p className="text-amber-400 text-sm font-semibold text-center">
                                Brauzer to'liq ekran ruxsatini rad qildi
                            </p>
                            <div className="bg-slate-800/80 rounded-2xl p-4 text-xs text-slate-300 space-y-2 ring-1 ring-white/10">
                                <p className="font-semibold text-white">Quyidagilardan birini bajaring:</p>
                                <ul className="space-y-1.5 list-none">
                                    <li className="flex items-start gap-2">
                                        <span className="text-emerald-400 shrink-0 mt-0.5">①</span>
                                        <span>Brauzer manzil satridagi <strong className="text-white">🔒</strong> yoki <strong className="text-white">ⓘ</strong> belgisini bosing → <strong className="text-white">"To'liq ekran"</strong> ruxsatini bering</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-emerald-400 shrink-0 mt-0.5">②</span>
                                        <span>Sahifani yangilang (F5), so'ng yana urinib ko'ring</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-emerald-400 shrink-0 mt-0.5">③</span>
                                        <span>Klaviaturadan <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-white text-[10px] font-mono">F11</kbd> tugmasini bosib to'liq ekranga o'ting</span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    ) : (
                        <p className="text-slate-400 text-sm leading-relaxed">
                            Test xavfsizligini ta'minlash maqsadida faqat to'liq ekran rejimida davom etish mumkin.
                        </p>
                    )}
                </div>

                {/* Main CTA button */}
                <button
                    onClick={handleClick}
                    disabled={loading}
                    className="w-full py-4 rounded-2xl font-black text-base transition-all active:scale-95 flex items-center justify-center gap-3
                        bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500
                        text-white shadow-[0_8px_28px_-4px_rgba(239,68,68,0.45)]
                        disabled:opacity-60 disabled:cursor-wait"
                >
                    {loading ? (
                        <>
                            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            <span>Yuklanmoqda...</span>
                        </>
                    ) : (
                        <>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                                    d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                            </svg>
                            <span>{denied ? 'Qaytadan urinib ko\'ring' : 'TO\'LIQ EKRANGA O\'TISH'}</span>
                        </>
                    )}
                </button>

                {/* F11 keyboard hint */}
                {!denied && (
                    <p className="text-[11px] text-slate-500">
                        Yoki klaviaturadan{' '}
                        <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-300 font-mono text-[10px]">F11</kbd>
                        {' '}tugmasini bosing
                    </p>
                )}

                <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">
                    IELTS Imperia · Secure Testing Environment
                </p>
            </div>
        </div>
    );
}

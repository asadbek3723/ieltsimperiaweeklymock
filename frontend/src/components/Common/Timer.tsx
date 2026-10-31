import { useTimer } from '../../hooks/useTimer';

interface TimerProps {
  deadline: string;
  onExpire: () => void;
  label?: string;
  /** ISO string returned by the server in the same response as `deadline`.
   *  When provided the timer corrects for client/server clock drift. */
  serverTime?: string | null;
}

export default function Timer({ deadline, onExpire, label = 'Time Remaining', serverTime }: TimerProps) {
  const { display, isWarning, isCritical } = useTimer(deadline, onExpire, serverTime);

  return (
    <div className={`flex items-center gap-2 font-bold transition-colors ${
      isCritical
        ? 'text-red-600 dark:text-red-400'
        : isWarning
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-gray-700 dark:text-gray-300'
    }`}>
      <div className={`w-2.5 h-2.5 rounded-full ${
        isCritical
          ? 'bg-red-500 animate-pulse'
          : isWarning
            ? 'bg-amber-500 animate-pulse'
            : 'bg-emerald-500'
      }`} />
      <span className="text-lg tabular-nums tracking-tight">{display}</span>
    </div>
  );
}

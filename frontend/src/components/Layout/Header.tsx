import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { PaymentWarningBanner, PaymentOverdueModal } from '../Admin/PaymentWarning';

interface HeaderProps { onMenuToggle: () => void; }

export default function Header({ onMenuToggle }: HeaderProps) {
  const { user } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const isAdmin = user?.role === 'ADMIN';

  return (
    <>
      {/* Admin-only: overdue blocking modal */}
      {isAdmin && <PaymentOverdueModal />}

      <header className="sticky top-0 z-30 w-full bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800/50">
        {/* Admin-only: payment warning banner (≤2 days) */}
        {isAdmin && <PaymentWarningBanner />}

        <div className="px-4 sm:px-6 h-16 flex items-center justify-end gap-3">

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          title={isDark ? 'Light Mode' : 'Dark Mode'}
          className="w-10 h-10 rounded-xl flex items-center justify-center bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
        >
          {isDark ? (
            <svg className="w-[18px] h-[18px] text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z" />
            </svg>
          ) : (
            <svg className="w-[18px] h-[18px] text-gray-500" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z" clipRule="evenodd" />
            </svg>
          )}
        </button>

        <div className="h-6 w-px bg-gray-200 dark:bg-gray-800" />

        {/* User info */}
        <div className="flex items-center gap-2.5">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-gray-900 dark:text-white leading-none">{user?.fullName}</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">@{user?.username}</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {user?.fullName?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) ?? 'U'}
          </div>
        </div>

        {/* Mobile: hamburger */}
        <button
          onClick={onMenuToggle}
          className="w-10 h-10 rounded-xl flex items-center justify-center bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800 lg:hidden transition-all"
        >
          <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

      </div>
    </header>
    </>
  );
}

import React from 'react';
import { Link } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../hooks/useTheme.js';

export const AuthLayout = ({ title, subtitle, children }) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 max-w-full overflow-x-hidden">
      <header className="flex items-center justify-between gap-2 px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <Link
          to="/login"
          className="text-sm sm:text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate"
        >
          AI Document Q&amp;A Assistant
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
          <Link
            to="/login"
            className="hover:text-slate-900 dark:hover:text-slate-100 hover:underline underline-offset-4 transition-colors"
          >
            Sign In
          </Link>
          <Link
            to="/register"
            className="hover:text-slate-900 dark:hover:text-slate-100 hover:underline underline-offset-4 transition-colors"
          >
            Create Account
          </Link>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle color theme"
            className="inline-flex items-center gap-1.5 sm:gap-2 min-h-[40px] px-3 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-4 h-4 text-[#0AAF29] shrink-0" />
                <span>Light</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-slate-600 shrink-0" />
                <span>Dark</span>
              </>
            )}
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-6 sm:p-6 pb-safe">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 sm:p-8 shadow-xs">
          <div className="mb-5 sm:mb-6">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 mb-1.5">
              {title}
            </h1>
            {subtitle ? (
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {subtitle}
              </p>
            ) : null}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
};

export default AuthLayout;

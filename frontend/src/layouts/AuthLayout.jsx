import React from 'react';
import { Link } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../hooks/useTheme.js';

export const AuthLayout = ({ title, subtitle, children }) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <Link
          to="/login"
          className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap"
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

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle color theme"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-4 h-4 text-[#0AAF29]" />
                <span>Light</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-slate-600" />
                <span>Dark</span>
              </>
            )}
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 mb-1.5">
              {title}
            </h1>
            {subtitle ? (
              <p className="text-sm text-slate-600 dark:text-slate-400">
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

import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Menu,
  X,
  Sun,
  Moon,
  LogOut,
  MessageSquare,
  Trash2,
  FolderOpen
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth.js';
import { useTheme } from '../hooks/useTheme.js';
import { chatApi } from '../services/api.js';
import { Button } from '../components/Button.jsx';

export const AppLayout = ({
  children,
  headerAction = null,
  breadcrumbs = []
}) => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState([]);

  const loadConversations = useCallback(async () => {
    try {
      const response = await chatApi.listConversations();
      if (Array.isArray(response?.conversations)) {
        setConversations(response.conversations);
      }
    } catch {
      setConversations([]);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations, location.pathname]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!sidebarOpen) {
      return undefined;
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSidebarOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  const handleLogout = () => {
    setSidebarOpen(false);
    logout();
    navigate('/login');
  };

  const handleDeleteConversation = async (event, convId) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await chatApi.deleteConversation(convId);
      setConversations((prev) => prev.filter((item) => item.id !== convId));
      if (location.pathname === `/chat/${convId}`) {
        navigate('/dashboard');
      }
    } catch {
      return;
    }
  };

  const isDashboardActive = location.pathname === '/dashboard';

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 w-[85vw] max-w-[280px] lg:w-[264px] shrink-0 select-none">
      <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-200 dark:border-slate-800">
        <Link
          to="/dashboard"
          onClick={() => setSidebarOpen(false)}
          className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate"
        >
          AI Document Q&amp;A
        </Link>
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close navigation menu"
          className="lg:hidden inline-flex items-center justify-center min-h-[40px] min-w-[40px] -mr-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-3.5 sm:p-4 border-b border-slate-200 dark:border-slate-800">
        <Link
          to="/dashboard"
          onClick={() => setSidebarOpen(false)}
          className={`flex items-center gap-2.5 px-3 py-2.5 min-h-[42px] rounded-lg text-sm font-medium transition-colors ${
            isDashboardActive
              ? 'bg-[#0AAF29] text-white'
              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <FolderOpen className="w-4 h-4 shrink-0" />
          <span className="truncate">Documents Dashboard</span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 sm:p-4">
        <div className="flex items-center justify-between mb-2.5 px-1">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Recent Conversations
          </span>
          <span className="text-xs font-mono tabular-nums text-slate-400">
            {conversations.length}
          </span>
        </div>

        {conversations.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 px-1 py-2 leading-relaxed">
            Select an uploaded document and start a chat to view conversation history here.
          </p>
        ) : (
          <div className="space-y-1">
            {conversations.slice(0, 15).map((conv) => {
              const isActive = location.pathname === `/chat/${conv.id}`;
              return (
                <div
                  key={conv.id}
                  className={`group flex items-center justify-between gap-1 rounded-lg px-2.5 py-2 min-h-[40px] text-xs transition-colors ${
                    isActive
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-medium'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Link
                    to={`/chat/${conv.id}`}
                    onClick={() => setSidebarOpen(false)}
                    className="flex items-center gap-2 min-w-0 flex-1 py-0.5"
                  >
                    <MessageSquare
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isActive ? 'text-[#0AAF29]' : 'text-slate-400'
                      }`}
                    />
                    <span className="truncate" title={conv.title}>
                      {conv.title}
                    </span>
                  </Link>

                  <button
                    type="button"
                    onClick={(e) => handleDeleteConversation(e, conv.id)}
                    aria-label={`Delete conversation ${conv.title}`}
                    className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100 p-1.5 rounded-md text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-opacity cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="p-3.5 sm:p-4 border-t border-slate-200 dark:border-slate-800 space-y-3 pb-safe">
        <div className="px-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
            {user?.name || 'Authenticated User'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
            {user?.email || ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={toggleTheme}
            className="flex-1 min-h-[38px]"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-[#0AAF29] shrink-0" />
                <span>Light</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 shrink-0" />
                <span>Dark</span>
              </>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="flex-1 min-h-[38px]"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            <span>Logout</span>
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen min-h-[100dvh] flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 max-w-full overflow-x-hidden">
      <aside className="hidden lg:flex lg:shrink-0">{sidebarContent}</aside>

      {sidebarOpen ? (
        <div
          className="fixed inset-0 z-50 flex lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative z-10 flex h-full max-w-full">
            {sidebarContent}
          </div>
        </div>
      ) : null}

      <div className="flex-1 flex flex-col min-w-0 max-w-full">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 sm:gap-3 px-3.5 sm:px-6 py-2.5 sm:py-3.5 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation sidebar"
              className="lg:hidden inline-flex items-center justify-center min-h-[40px] min-w-[40px] -ml-1 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>

            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400 min-w-0 overflow-hidden"
            >
              <Link
                to="/dashboard"
                className="hidden sm:inline font-medium text-slate-900 dark:text-slate-100 hover:text-[#0AAF29] dark:hover:text-[#0AAF29] transition-colors whitespace-nowrap shrink-0"
              >
                Workspace
              </Link>
              {breadcrumbs.map((crumb, idx) => {
                const isLast = idx === breadcrumbs.length - 1;
                return (
                  <React.Fragment key={`${crumb.label}-${idx}`}>
                    <span
                      aria-hidden="true"
                      className={`${idx === 0 ? 'hidden sm:inline' : 'inline'} text-slate-400 shrink-0`}
                    >
                      /
                    </span>
                    {crumb.to && !isLast ? (
                      <Link
                        to={crumb.to}
                        className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors truncate max-w-[90px] sm:max-w-[160px] md:max-w-[220px]"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className="font-medium text-slate-900 dark:text-slate-100 truncate max-w-[130px] xs:max-w-[170px] sm:max-w-[220px] md:max-w-[300px]">
                        {crumb.label}
                      </span>
                    )}
                  </React.Fragment>
                );
              })}
            </nav>
          </div>

          {headerAction ? (
            <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
              {headerAction}
            </div>
          ) : null}
        </header>

        <main className="flex-1 flex flex-col min-w-0 max-w-full">{children}</main>
      </div>
    </div>
  );
};

export default AppLayout;

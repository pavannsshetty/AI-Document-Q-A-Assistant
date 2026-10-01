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

  const handleLogout = () => {
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
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 w-[264px] shrink-0">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
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
          className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 border-b border-slate-200 dark:border-slate-800">
        <Link
          to="/dashboard"
          onClick={() => setSidebarOpen(false)}
          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            isDashboardActive
              ? 'bg-[#0AAF29] text-white'
              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <FolderOpen className="w-4 h-4 shrink-0" />
          <span>Documents Dashboard</span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
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
                  className={`group flex items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-colors ${
                    isActive
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-medium'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Link
                    to={`/chat/${conv.id}`}
                    onClick={() => setSidebarOpen(false)}
                    className="flex items-center gap-2 min-w-0 flex-1"
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
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-opacity cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
        <div className="px-1">
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
            className="flex-1"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-[#0AAF29]" />
                <span>Light</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5" />
                <span>Dark</span>
              </>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="flex-1"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <aside className="hidden lg:flex">{sidebarContent}</aside>

      {sidebarOpen ? (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative z-10 flex">{sidebarContent}</div>
        </div>
      ) : null}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation sidebar"
              className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>

            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 truncate"
            >
              <Link
                to="/dashboard"
                className="font-medium text-slate-900 dark:text-slate-100 hover:text-[#0AAF29] dark:hover:text-[#0AAF29] transition-colors whitespace-nowrap"
              >
                Workspace
              </Link>
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={`${crumb.label}-${idx}`}>
                  <span aria-hidden="true">/</span>
                  {crumb.to ? (
                    <Link
                      to={crumb.to}
                      className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors truncate max-w-[220px]"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="font-medium text-slate-900 dark:text-slate-100 truncate max-w-[260px]">
                      {crumb.label}
                    </span>
                  )}
                </React.Fragment>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3 shrink-0">{headerAction}</div>
        </header>

        <main className="flex-1 flex flex-col min-w-0">{children}</main>
      </div>
    </div>
  );
};

export default AppLayout;

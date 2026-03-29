import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  LogOut,
  Map as MapIcon,
  Navigation,
  Settings
} from 'lucide-react';
import { DashboardView } from './components/DashboardView';
import { IncidentsView } from './components/IncidentsView';
import { LiveMap } from './components/LiveMap';
import { LoginView } from './components/LoginView';
import { RoutingView } from './components/RoutingView';
import { SettingsView } from './components/SettingsView';
import { ToastContainer, type ToastItem, type ToastType } from './components/Toast';
import { apiFetch } from './lib/api';
import {
  type AuthUser,
  clearAuthSession,
  getStoredAuthSession,
  isAuthSessionExpired,
  saveAuthSession
} from './lib/auth';

type ActiveTab = 'dashboard' | 'map' | 'incidents' | 'routing' | 'settings';
type AuthState = 'checking' | 'unauthenticated' | 'authenticated';

const TAB_LABELS: Record<ActiveTab, string> = {
  dashboard: '控制台总览',
  map: '实时路网地图',
  incidents: '突发事件监控',
  routing: '智能路线推荐',
  settings: '系统设置'
};

function getHashTab(): ActiveTab {
  const hash = window.location.hash.replace('#', '') as ActiveTab;
  return ['dashboard', 'map', 'incidents', 'routing', 'settings'].includes(hash) ? hash : 'dashboard';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => getHashTab());
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const notify = (message: string, type: ToastType = 'info') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3200);
  };

  useEffect(() => {
    const syncTab = () => setActiveTab(getHashTab());
    window.addEventListener('hashchange', syncTab);
    if (!window.location.hash) {
      window.location.hash = '#dashboard';
    }
    return () => window.removeEventListener('hashchange', syncTab);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  useEffect(() => {
    const handleExpired = () => {
      clearAuthSession();
      setAuthUser(null);
      setAuthState('unauthenticated');
      setLoginError('登录已过期，请重新登录。');
      notify('登录已过期，请重新登录。', 'error');
    };

    window.addEventListener('auth:expired', handleExpired as EventListener);
    return () => window.removeEventListener('auth:expired', handleExpired as EventListener);
  }, []);

  useEffect(() => {
    const validateSession = async () => {
      const session = getStoredAuthSession();
      if (!session || isAuthSessionExpired(session.expiresAt)) {
        clearAuthSession();
        setAuthState('unauthenticated');
        return;
      }

      try {
        const response = await fetch('/api/auth/session', {
          headers: { 'x-session-token': session.token }
        });
        const result = await response.json();
        if (!response.ok || !result.authenticated) {
          clearAuthSession();
          setAuthState('unauthenticated');
          return;
        }

        const nextSession = {
          token: session.token,
          expiresAt: result.expiresAt ?? session.expiresAt,
          user: result.user as AuthUser
        };
        saveAuthSession(nextSession);
        setAuthUser(nextSession.user);
        setIsDarkMode(nextSession.user.preferred_theme === 'dark');
        setAuthState('authenticated');
      } catch {
        clearAuthSession();
        setAuthState('unauthenticated');
      }
    };

    validateSession();
  }, []);

  const switchTab = (tab: ActiveTab) => {
    window.location.hash = `#${tab}`;
  };

  const handleLogin = async ({ username, password }: { username: string; password: string }) => {
    setLoggingIn(true);
    setLoginError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const result = await response.json();
      if (!response.ok || result.status !== 'success') {
        throw new Error(result.message || '登录失败。');
      }

      const session = {
        token: result.token,
        expiresAt: result.expiresAt,
        user: result.user as AuthUser
      };
      saveAuthSession(session);
      setAuthUser(session.user);
      setIsDarkMode(session.user.preferred_theme === 'dark');
      setAuthState('authenticated');
      notify(result.message, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '登录失败。';
      setLoginError(message);
      notify(message, 'error');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore logout network errors and clear local session anyway.
    }

    clearAuthSession();
    setAuthUser(null);
    setAuthState('unauthenticated');
    setLoginError('');
    window.location.hash = '#dashboard';
    notify('已退出登录。', 'info');
  };

  const handleToggleTheme = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    notify(next ? '已切换为深色模式。' : '已切换为浅色模式。', 'info');
  };

  const handleExportReport = async () => {
    setExporting(true);
    try {
      const response = await apiFetch('/api/report/export');
      if (!response.ok) {
        throw new Error('报告导出失败。');
      }

      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `traffic-report-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      notify('运行报告已导出到本地。', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : '报告导出失败。', 'error');
    } finally {
      setExporting(false);
    }
  };

  if (authState === 'checking') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-50 flex items-center justify-center">
        <ToastContainer toasts={toasts} />
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <div className="text-sm text-gray-500 dark:text-zinc-400">正在验证登录状态...</div>
        </div>
      </div>
    );
  }

  if (authState !== 'authenticated' || !authUser) {
    return (
      <>
        <ToastContainer toasts={toasts} />
        <LoginView submitting={loggingIn} error={loginError} onSubmit={handleLogin} />
      </>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-50 font-sans transition-colors duration-300">
      <ToastContainer toasts={toasts} />

      <aside className="w-72 border-r border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 flex flex-col transition-colors duration-300">
        <div className="p-6">
          <h1 className="text-xl font-bold tracking-tight text-emerald-500 dark:text-emerald-400 flex items-center gap-2">
            <Activity className="w-6 h-6" />
            智能交通系统
          </h1>
          <p className="text-xs text-gray-500 dark:text-zinc-500 mt-2 font-mono">工程实现版 / 登录态已启用 / 默认保存 7 天</p>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          <NavItem icon={<BarChart3 />} label="控制台总览" active={activeTab === 'dashboard'} onClick={() => switchTab('dashboard')} />
          <NavItem icon={<MapIcon />} label="实时路网地图" active={activeTab === 'map'} onClick={() => switchTab('map')} />
          <NavItem icon={<AlertTriangle />} label="突发事件监控" active={activeTab === 'incidents'} onClick={() => switchTab('incidents')} />
          <NavItem icon={<Navigation />} label="智能路线推荐" active={activeTab === 'routing'} onClick={() => switchTab('routing')} />
          <NavItem icon={<Settings />} label="系统设置" active={activeTab === 'settings'} onClick={() => switchTab('settings')} />
        </nav>

        <div className="p-4 border-t border-gray-200 dark:border-zinc-800 space-y-3">
          <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950/70 px-4 py-3">
            <div className="text-xs text-gray-500 dark:text-zinc-500">当前账号</div>
            <div className="mt-1 text-sm font-medium">{authUser.full_name}</div>
            <div className="mt-1 text-xs text-gray-500 dark:text-zinc-500">{authUser.username}</div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-800 text-sm text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            退出登录
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <header className="h-16 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between px-8 bg-white/80 dark:bg-zinc-900/30 backdrop-blur-sm sticky top-0 z-10 transition-colors duration-300">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-medium">{TAB_LABELS[activeTab]}</h2>
            <span className="text-sm text-gray-500 dark:text-zinc-400">欢迎回来，{authUser.full_name}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 dark:text-zinc-400 font-mono">当前模型: LST-GCN v1.2</span>
            <button
              onClick={handleExportReport}
              disabled={exporting}
              className="px-3 py-1.5 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-md text-sm transition-colors disabled:opacity-50"
            >
              {exporting ? '导出中...' : '导出报告'}
            </button>
          </div>
        </header>

        <div className="p-8">
          {activeTab === 'dashboard' && <DashboardView onNotify={notify} />}
          {activeTab === 'map' && <LiveMap onNotify={notify} />}
          {activeTab === 'incidents' && <IncidentsView onNotify={notify} />}
          {activeTab === 'routing' && <RoutingView onNotify={notify} />}
          {activeTab === 'settings' && (
            <SettingsView
              isDarkMode={isDarkMode}
              toggleTheme={handleToggleTheme}
              onNotify={notify}
              onLogout={handleLogout}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function NavItem({
  icon,
  label,
  active,
  onClick
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
        active
          ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium'
          : 'text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-zinc-200'
      }`}
    >
      {React.cloneElement(icon as React.ReactElement, { className: 'w-4 h-4' })}
      {label}
    </button>
  );
}

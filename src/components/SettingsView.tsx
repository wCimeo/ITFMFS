import React, { useEffect, useState } from 'react';
import { Bell, Database, Moon, Save, ShieldCheck, Sun, User } from 'lucide-react';

interface PermissionItem {
  key: string;
  label: string;
  enabled: boolean;
}

interface AdminProfile {
  username: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string;
  status: string;
  preferred_theme: string;
  prediction_horizon_minutes: number;
  sliding_window_steps: number;
  retrain_cycle_days: number;
  congestion_threshold: number;
  auto_signal_control: number;
  last_login_at: string | null;
  last_active_at: string | null;
  created_at: string;
}

export function SettingsView({
  isDarkMode,
  toggleTheme
}: {
  isDarkMode: boolean;
  toggleTheme: () => void;
}) {
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [profileRes, permissionRes] = await Promise.all([
          fetch('/api/admin/profile'),
          fetch('/api/admin/permissions')
        ]);

        if (profileRes.ok) {
          setProfile(await profileRes.json());
        }
        if (permissionRes.ok) {
          setPermissions(await permissionRes.json());
        }
      } catch (error) {
        console.error('Failed to load admin settings:', error);
      }
    };

    loadSettings();
  }, []);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...profile,
          preferred_theme: isDarkMode ? 'dark' : 'light',
          auto_signal_control: Boolean(profile.auto_signal_control)
        })
      });
      const result = await response.json();
      if (!response.ok || result.status !== 'success') {
        throw new Error(result.message || '配置保存失败');
      }
      setProfile(result.profile);
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '配置保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl animate-in fade-in duration-500">
      <div>
        <h2 className="text-lg font-medium text-gray-900 dark:text-zinc-100">系统设置</h2>
        <p className="text-sm text-gray-500 dark:text-zinc-400">从工程实现角度展示超级管理员信息、在线状态、权限范围和系统参数。</p>
      </div>

      {message && <p className="text-sm text-emerald-600 dark:text-emerald-400">{message}</p>}

      <div className="grid grid-cols-1 gap-6">
        <section className="p-6 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50">
          <h3 className="text-md font-medium mb-4 flex items-center gap-2 text-gray-900 dark:text-zinc-100">
            <User className="w-5 h-5 text-emerald-500" />
            超级管理员信息
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="用户名">
              <input
                type="text"
                value={profile?.username ?? ''}
                disabled
                className="w-full bg-gray-100 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm text-gray-500 dark:text-zinc-500"
              />
            </FormField>
            <FormField label="角色权限">
              <input
                type="text"
                value={profile?.role ?? 'SUPER_ADMIN'}
                disabled
                className="w-full bg-gray-100 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm text-gray-500 dark:text-zinc-500"
              />
            </FormField>
            <FormField label="管理员姓名">
              <input
                type="text"
                value={profile?.full_name ?? ''}
                onChange={(event) => setProfile((prev) => (prev ? { ...prev, full_name: event.target.value } : prev))}
                className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-zinc-200"
              />
            </FormField>
            <FormField label="联系电话">
              <input
                type="text"
                value={profile?.phone ?? ''}
                onChange={(event) => setProfile((prev) => (prev ? { ...prev, phone: event.target.value } : prev))}
                className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-zinc-200"
              />
            </FormField>
            <FormField label="邮箱地址">
              <input
                type="email"
                value={profile?.email ?? ''}
                onChange={(event) => setProfile((prev) => (prev ? { ...prev, email: event.target.value } : prev))}
                className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-zinc-200"
              />
            </FormField>
            <FormField label="上线状态">
              <input
                type="text"
                value={profile?.status ?? 'ONLINE'}
                disabled
                className="w-full bg-gray-100 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm text-gray-500 dark:text-zinc-500"
              />
            </FormField>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-500 dark:text-zinc-400">
            <div>最近登录：{profile?.last_login_at ? new Date(profile.last_login_at).toLocaleString('zh-CN') : '暂无'}</div>
            <div>最近活跃：{profile?.last_active_at ? new Date(profile.last_active_at).toLocaleString('zh-CN') : '暂无'}</div>
            <div>账号创建：{profile?.created_at ? new Date(profile.created_at).toLocaleString('zh-CN') : '暂无'}</div>
          </div>
        </section>

        <section className="p-6 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50">
          <h3 className="text-md font-medium mb-4 flex items-center gap-2 text-gray-900 dark:text-zinc-100">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
            超级管理员权限说明
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {permissions.map((permission) => (
              <div key={permission.key} className="p-4 rounded-lg border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950/60">
                <div className="font-medium text-gray-900 dark:text-zinc-100">{permission.label}</div>
                <div className={`mt-2 text-sm ${permission.enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-zinc-500'}`}>
                  {permission.enabled ? '已授权' : '未授权'}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-gray-500 dark:text-zinc-400">
            从工程实现角度，超级管理员负责系统用户管理、数据源导入、模型参数配置、告警阈值维护和信号优化策略发布。
          </p>
        </section>

        <section className="p-6 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50">
          <h3 className="text-md font-medium mb-4 flex items-center gap-2 text-gray-900 dark:text-zinc-100">
            {isDarkMode ? <Moon className="w-5 h-5 text-emerald-500" /> : <Sun className="w-5 h-5 text-emerald-500" />}
            主题与外观
          </h3>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-zinc-200">深色模式</div>
              <div className="text-xs text-gray-500 dark:text-zinc-400 mt-1">适合监控大屏和夜间巡检场景。</div>
            </div>
            <button
              onClick={toggleTheme}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isDarkMode ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-zinc-700'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isDarkMode ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </section>

        <section className="p-6 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50">
          <h3 className="text-md font-medium mb-4 flex items-center gap-2 text-gray-900 dark:text-zinc-100">
            <Database className="w-5 h-5 text-emerald-500" />
            模型参数配置
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="预测时间窗口">
              <select
                value={profile?.prediction_horizon_minutes ?? 60}
                onChange={(event) =>
                  setProfile((prev) =>
                    prev ? { ...prev, prediction_horizon_minutes: Number(event.target.value) } : prev
                  )
                }
                className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm"
              >
                <option value={15}>未来 15 分钟</option>
                <option value={30}>未来 30 分钟</option>
                <option value={60}>未来 60 分钟</option>
              </select>
            </FormField>
            <FormField label="历史滑动窗口">
              <select
                value={profile?.sliding_window_steps ?? 12}
                onChange={(event) =>
                  setProfile((prev) => (prev ? { ...prev, sliding_window_steps: Number(event.target.value) } : prev))
                }
                className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm"
              >
                <option value={12}>过去 12 步（推荐）</option>
                <option value={24}>过去 24 步</option>
              </select>
            </FormField>
            <FormField label="自动重训练周期">
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="1"
                  max="30"
                  value={profile?.retrain_cycle_days ?? 7}
                  onChange={(event) =>
                    setProfile((prev) => (prev ? { ...prev, retrain_cycle_days: Number(event.target.value) } : prev))
                  }
                  className="flex-1 accent-emerald-500"
                />
                <span className="text-sm font-mono text-emerald-500 w-12">{profile?.retrain_cycle_days ?? 7} 天</span>
              </div>
            </FormField>
          </div>
        </section>

        <section className="p-6 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50">
          <h3 className="text-md font-medium mb-4 flex items-center gap-2 text-gray-900 dark:text-zinc-100">
            <Bell className="w-5 h-5 text-emerald-500" />
            告警阈值与接管策略
          </h3>
          <div className="space-y-4">
            <FormField label="严重拥堵判定阈值（辆/小时）">
              <input
                type="number"
                value={profile?.congestion_threshold ?? 130}
                onChange={(event) =>
                  setProfile((prev) => (prev ? { ...prev, congestion_threshold: Number(event.target.value) } : prev))
                }
                className="w-full md:w-1/2 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm"
              />
            </FormField>
            <div className="flex items-start gap-2">
              <input
                id="auto-signal"
                type="checkbox"
                checked={Boolean(profile?.auto_signal_control)}
                onChange={(event) =>
                  setProfile((prev) => (prev ? { ...prev, auto_signal_control: event.target.checked ? 1 : 0 } : prev))
                }
                className="accent-emerald-500 rounded mt-1"
              />
              <label htmlFor="auto-signal" className="text-sm text-gray-700 dark:text-zinc-300">
                触发拥堵告警时，允许系统自动接管并优化信号灯配时
              </label>
            </div>
          </div>
        </section>

        <div className="flex justify-end pt-4">
          <button
            onClick={handleSave}
            disabled={saving || !profile}
            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 text-white dark:text-zinc-950 hover:bg-emerald-600 dark:hover:bg-emerald-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? '保存中...' : '保存全部配置'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 dark:text-zinc-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

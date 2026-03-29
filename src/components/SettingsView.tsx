import React, { useEffect, useState } from 'react';
import { Bell, Database, LogOut, Moon, Save, ShieldCheck, Sun, User } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface PermissionItem {
  key: string;
  label: string;
  enabled: boolean;
}

interface AdminProfile {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  preferred_theme: string;
  prediction_horizon_minutes: number;
  sliding_window_steps: number;
  retrain_cycle_days: number;
  congestion_threshold: number;
  auto_signal_control: number;
  session_expires_at: string | null;
  last_login_at: string | null;
  last_active_at: string | null;
  created_at: string;
}

export function SettingsView({
  isDarkMode,
  toggleTheme,
  onNotify,
  onLogout
}: {
  isDarkMode: boolean;
  toggleTheme: () => void;
  onNotify: (message: string, type?: 'success' | 'error' | 'info') => void;
  onLogout: () => void;
}) {
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [profileRes, permissionRes] = await Promise.all([
          apiFetch('/api/admin/profile'),
          apiFetch('/api/admin/permissions')
        ]);

        if (!profileRes.ok || !permissionRes.ok) {
          throw new Error('设置页数据加载失败。');
        }

        setProfile(await profileRes.json());
        setPermissions(await permissionRes.json());
      } catch (error) {
        onNotify(error instanceof Error ? error.message : '设置页数据加载失败。', 'error');
      }
    };

    loadSettings();
  }, []);

  const handleSave = async () => {
    if (!profile) {
      return;
    }

    setSaving(true);
    try {
      const response = await apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({
          ...profile,
          preferred_theme: isDarkMode ? 'dark' : 'light',
          auto_signal_control: Boolean(profile.auto_signal_control)
        })
      });
      const result = await response.json();
      if (!response.ok || result.status !== 'success') {
        throw new Error(result.message || '配置保存失败。');
      }
      setProfile(result.profile);
      onNotify(result.message, 'success');
    } catch (error) {
      onNotify(error instanceof Error ? error.message : '配置保存失败。', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl animate-in fade-in duration-500">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-zinc-100">系统设置</h2>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">从工程实现角度展示超级管理员资料、会话状态、模型配置和告警接管策略。</p>
        </div>
        <button
          onClick={onLogout}
          className="px-4 py-2 rounded-lg border border-gray-200 dark:border-zinc-800 text-sm text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          退出登录
        </button>
      </div>

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
            <FormField label="账号类型">
              <input
                type="text"
                value="超级管理员"
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
            <FormField label="在线状态">
              <input
                type="text"
                value={profile?.status ?? 'ONLINE'}
                disabled
                className="w-full bg-gray-100 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm text-gray-500 dark:text-zinc-500"
              />
            </FormField>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4 text-sm text-gray-500 dark:text-zinc-400">
            <div>最近登录：{profile?.last_login_at ? new Date(profile.last_login_at).toLocaleString('zh-CN') : '暂无'}</div>
            <div>最近活跃：{profile?.last_active_at ? new Date(profile.last_active_at).toLocaleString('zh-CN') : '暂无'}</div>
            <div>会话过期：{profile?.session_expires_at ? new Date(profile.session_expires_at).toLocaleString('zh-CN') : '暂无'}</div>
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
                  {permission.enabled ? '已启用' : '未启用'}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-gray-500 dark:text-zinc-400 leading-7">
            系统只有超级管理员一种用户类型，因此 user 表不再区分 role 字段。但从工程实现视角，仍保留“数据、模型、信号、会话”四类能力开关，用于说明系统上线后的权限边界与可扩展方向。
          </p>
        </section>

        <section className="p-6 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50">
          <h3 className="text-md font-medium mb-4 flex items-center gap-2 text-gray-900 dark:text-zinc-100">
            {isDarkMode ? <Moon className="w-5 h-5 text-emerald-500" /> : <Sun className="w-5 h-5 text-emerald-500" />}
            主题与显示
          </h3>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-zinc-200">深色模式</div>
              <div className="text-xs text-gray-500 dark:text-zinc-400 mt-1">适合监控大屏和夜间巡检场景，切换后会立即弹出反馈。</div>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            <ExplainCard title="预测时间窗口" description="决定图表和调度模块重点关注未来 15、30 或 60 分钟的结果。时间越短，适合快速调度；时间越长，更适合趋势展示。" />
            <ExplainCard title="历史滑动窗口" description="决定送入 LST-GCN 的历史时间步数量。当前训练权重默认以 12 步为主，24 步更适合后续重新训练后的对比实验。" />
            <ExplainCard title="自动重训练周期" description="这是工程侧的模型维护参数，用于描述若系统持续上线，多久重新训练一次模型。当前原型主要作为运维与论文说明项。" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="预测时间窗口">
              <select
                value={profile?.prediction_horizon_minutes ?? 60}
                onChange={(event) =>
                  setProfile((prev) => (prev ? { ...prev, prediction_horizon_minutes: Number(event.target.value) } : prev))
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
                <option value={12}>过去 12 步（当前权重推荐）</option>
                <option value={24}>过去 24 步（需配合重新训练）</option>
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
                <span className="text-sm font-mono text-emerald-500 w-16">{profile?.retrain_cycle_days ?? 7} 天</span>
              </div>
            </FormField>
          </div>
        </section>

        <section className="p-6 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50">
          <h3 className="text-md font-medium mb-4 flex items-center gap-2 text-gray-900 dark:text-zinc-100">
            <Bell className="w-5 h-5 text-emerald-500" />
            告警阈值与接管策略
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <ExplainCard title="拥堵阈值" description="当某路口流量高于该阈值时，系统会把它视作重点拥堵节点，并优先用于告警展示与信号优化。" />
            <ExplainCard title="自动接管策略" description="开启后，当流量达到阈值，系统会自动调整推荐信号相位和时长；关闭时只给出建议，不直接接管。" />
          </div>
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
              <label htmlFor="auto-signal" className="text-sm text-gray-700 dark:text-zinc-300 leading-6">
                触发拥堵告警时，允许系统自动接管并优化信号灯配时。关闭后只保留告警提示和人工决策建议。
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

function ExplainCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950/60 p-4">
      <div className="text-sm font-medium text-gray-900 dark:text-zinc-100">{title}</div>
      <div className="mt-2 text-sm leading-6 text-gray-500 dark:text-zinc-400">{description}</div>
    </div>
  );
}


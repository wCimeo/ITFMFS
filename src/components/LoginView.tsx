import React, { useState } from 'react';
import { LockKeyhole, LogIn, ShieldCheck } from 'lucide-react';

export function LoginView({
  submitting,
  error,
  onSubmit
}: {
  submitting: boolean;
  error: string;
  onSubmit: (payload: { username: string; password: string }) => Promise<void>;
}) {
  const [username, setUsername] = useState('admin_traffic');
  const [password, setPassword] = useState('');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit({ username, password });
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.18),_transparent_40%),linear-gradient(180deg,#f8fafc_0%,#ecfdf5_100%)] dark:bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.22),_transparent_35%),linear-gradient(180deg,#0a0f0d_0%,#111827_100%)] text-gray-900 dark:text-zinc-50 flex items-center justify-center px-6">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-8 items-stretch">
        <section className="rounded-[28px] border border-white/60 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/60 backdrop-blur-xl p-8 shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 text-sm font-medium">
            <ShieldCheck className="w-4 h-4" />
            超级管理员登录入口
          </div>
          <h1 className="mt-6 text-3xl md:text-4xl font-semibold tracking-tight">基于大数据分析的智能交通流量监控与预测系统</h1>
          <p className="mt-4 text-base leading-7 text-gray-600 dark:text-zinc-300">
            系统已切换为登录保护模式。首次登录后会保存 7 天有效会话，超期后需要重新认证。当前工程实现仅开放超级管理员账号使用。
          </p>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoCard title="会话时长" description="登录成功后默认保留 7 天。重新启动 npm run dev 不会清空这段有效会话。" />
            <InfoCard title="系统范围" description="路网管理已扩展到 10 个路口，当前 LST-GCN 权重仍覆盖 A1-G7。" />
            <InfoCard title="地图来源" description="地图底图来自 OpenStreetMap / CARTO，路口数据来自 MySQL 或已导入的 PeMS 数据。" />
            <InfoCard title="默认账号" description="用户名默认为 admin_traffic，密码可通过 .env 中的 ADMIN_PASSWORD 覆盖。" />
          </div>
        </section>

        <section className="rounded-[28px] border border-white/60 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/70 backdrop-blur-xl p-8 shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/25">
            <LockKeyhole className="w-6 h-6" />
          </div>
          <h2 className="mt-5 text-2xl font-semibold">登录系统</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-zinc-400">请输入超级管理员账号信息后进入控制台。</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <Field label="用户名">
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                placeholder="请输入用户名"
              />
            </Field>

            <Field label="密码">
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                placeholder="请输入密码"
              />
            </Field>

            {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={submitting || !username || !password}
              className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white dark:text-zinc-950 px-4 py-3 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white dark:border-zinc-950 border-t-transparent rounded-full animate-spin" />
                  正在登录...
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  进入系统
                </>
              )}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-2 text-sm font-medium text-gray-700 dark:text-zinc-300">{label}</div>
      {children}
    </label>
  );
}

function InfoCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-zinc-800 bg-gray-50/80 dark:bg-zinc-950/60 p-4">
      <div className="text-sm font-medium text-gray-900 dark:text-zinc-100">{title}</div>
      <div className="mt-2 text-sm leading-6 text-gray-500 dark:text-zinc-400">{description}</div>
    </div>
  );
}

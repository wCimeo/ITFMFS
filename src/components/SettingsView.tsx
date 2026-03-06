import React from 'react';
import { User, Moon, Sun, Database, Bell, Save } from 'lucide-react';

export function SettingsView({ isDarkMode, toggleTheme }: { isDarkMode: boolean, toggleTheme: () => void }) {
  return (
    <div className="space-y-6 max-w-4xl animate-in fade-in duration-500">
      <div>
        <h2 className="text-lg font-medium text-gray-900 dark:text-zinc-100">系统设置</h2>
        <p className="text-sm text-gray-500 dark:text-zinc-400">管理个人信息、外观偏好及模型预测参数</p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        
        {/* 用户信息 */}
        <section className="p-6 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50">
          <h3 className="text-md font-medium mb-4 flex items-center gap-2 text-gray-900 dark:text-zinc-100">
            <User className="w-5 h-5 text-emerald-500" />
            管理员信息
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 dark:text-zinc-400 mb-1">用户名</label>
              <input type="text" defaultValue="Admin_Traffic" className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-zinc-200 focus:outline-none focus:border-emerald-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-zinc-400 mb-1">角色权限</label>
              <input type="text" defaultValue="超级管理员 (Super Admin)" disabled className="w-full bg-gray-100 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm text-gray-500 dark:text-zinc-500 cursor-not-allowed" />
            </div>
          </div>
        </section>

        {/* 外观设置 */}
        <section className="p-6 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50">
          <h3 className="text-md font-medium mb-4 flex items-center gap-2 text-gray-900 dark:text-zinc-100">
            {isDarkMode ? <Moon className="w-5 h-5 text-emerald-500" /> : <Sun className="w-5 h-5 text-emerald-500" />}
            主题与外观
          </h3>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-zinc-200">深色模式 (Dark Mode)</div>
              <div className="text-xs text-gray-500 dark:text-zinc-400 mt-1">切换系统的亮色/暗色主题，暗色主题更适合大屏监控场景。</div>
            </div>
            <button 
              onClick={toggleTheme}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isDarkMode ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-zinc-700'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isDarkMode ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </section>

        {/* 模型参数设置 */}
        <section className="p-6 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50">
          <h3 className="text-md font-medium mb-4 flex items-center gap-2 text-gray-900 dark:text-zinc-100">
            <Database className="w-5 h-5 text-emerald-500" />
            LST-GCN 模型参数配置
          </h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 dark:text-zinc-400 mb-1">预测时间窗口 (Prediction Horizon)</label>
                <select className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-zinc-200 focus:outline-none focus:border-emerald-500">
                  <option>未来 15 分钟</option>
                  <option>未来 30 分钟</option>
                  <option>未来 60 分钟</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-zinc-400 mb-1">历史数据滑动窗口 (Sliding Window)</label>
                <select className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-zinc-200 focus:outline-none focus:border-emerald-500">
                  <option>过去 1 小时 (12个时间步)</option>
                  <option>过去 2 小时 (24个时间步)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-zinc-400 mb-1">自动重新训练周期</label>
              <div className="flex items-center gap-4">
                <input type="range" min="1" max="30" defaultValue="7" className="flex-1 accent-emerald-500" />
                <span className="text-sm font-mono text-emerald-500 w-12">7 天</span>
              </div>
            </div>
          </div>
        </section>

        {/* 告警阈值 */}
        <section className="p-6 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50">
          <h3 className="text-md font-medium mb-4 flex items-center gap-2 text-gray-900 dark:text-zinc-100">
            <Bell className="w-5 h-5 text-emerald-500" />
            监控告警阈值
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 dark:text-zinc-400 mb-1">严重拥堵判定阈值 (车辆/小时)</label>
              <input type="number" defaultValue="130" className="w-full md:w-1/2 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-zinc-200 focus:outline-none focus:border-emerald-500" />
            </div>
            <div className="flex items-start gap-2 mt-4">
              <input type="checkbox" defaultChecked className="accent-emerald-500 rounded mt-1" id="auto-signal" />
              <label htmlFor="auto-signal" className="text-sm text-gray-700 dark:text-zinc-300">触发拥堵告警时，允许系统自动接管并优化信号灯配时</label>
            </div>
          </div>
        </section>

        <div className="flex justify-end pt-4">
          <button className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 text-white dark:text-zinc-950 hover:bg-emerald-600 dark:hover:bg-emerald-400 rounded-lg text-sm font-medium transition-colors">
            <Save className="w-4 h-4" />
            保存所有配置
          </button>
        </div>

      </div>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Map as MapIcon,
  Navigation,
  Settings
} from 'lucide-react';
import { FlowChart } from './components/FlowChart';
import { IncidentsView } from './components/IncidentsView';
import { LiveMap } from './components/LiveMap';
import { RoutingView } from './components/RoutingView';
import { SettingsView } from './components/SettingsView';

type ActiveTab = 'dashboard' | 'map' | 'incidents' | 'routing' | 'settings';

interface DashboardMetrics {
  timestamp: string | null;
  flow: number;
  speed: number;
  occupancy: number;
}

interface FlowChartPayload {
  date: string | null;
  nodeId: string;
  availableNodes: string[];
  focusRange: { startIndex: number; endIndex: number };
  peaks: { key: string; label: string; startHour: number; endHour: number }[];
  latestPrediction: {
    target_time: string;
    predicted_flow: number;
    confidence: number;
    model_version: string;
  } | null;
  data: {
    hour: number;
    time: string;
    historical: number | null;
    predicted: number | null;
    periodLabel: string;
  }[];
}

interface SignalStatus {
  intersection_id: string;
  phase: string;
  duration: number;
  optimized_at: string;
  source: string;
}

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
  const [exporting, setExporting] = useState(false);
  const [headerMessage, setHeaderMessage] = useState('');

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

  const switchTab = (tab: ActiveTab) => {
    window.location.hash = `#${tab}`;
  };

  const handleExportReport = async () => {
    setExporting(true);
    setHeaderMessage('');
    try {
      const response = await fetch('/api/report/export');
      if (!response.ok) {
        throw new Error('报告导出失败');
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
      setHeaderMessage('运行报告已导出到本地。');
    } catch (error) {
      setHeaderMessage(error instanceof Error ? error.message : '导出失败');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-50 font-sans transition-colors duration-300">
      <aside className="w-64 border-r border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 flex flex-col transition-colors duration-300">
        <div className="p-6">
          <h1 className="text-xl font-bold tracking-tight text-emerald-500 dark:text-emerald-400 flex items-center gap-2">
            <Activity className="w-6 h-6" />
            智能交通系统
          </h1>
          <p className="text-xs text-gray-500 dark:text-zinc-500 mt-1 font-mono">基于大数据分析与 LST-GCN 的工程原型</p>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          <NavItem icon={<BarChart3 />} label="控制台总览" active={activeTab === 'dashboard'} onClick={() => switchTab('dashboard')} />
          <NavItem icon={<MapIcon />} label="实时路网地图" active={activeTab === 'map'} onClick={() => switchTab('map')} />
          <NavItem icon={<AlertTriangle />} label="突发事件监控" active={activeTab === 'incidents'} onClick={() => switchTab('incidents')} />
          <NavItem icon={<Navigation />} label="智能路线推荐" active={activeTab === 'routing'} onClick={() => switchTab('routing')} />
          <NavItem icon={<Settings />} label="系统设置" active={activeTab === 'settings'} onClick={() => switchTab('settings')} />
        </nav>

        <div className="p-4 border-t border-gray-200 dark:border-zinc-800 transition-colors duration-300">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-xs font-mono text-gray-500 dark:text-zinc-400">系统运行中</span>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <header className="h-16 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between px-8 bg-white/80 dark:bg-zinc-900/30 backdrop-blur-sm sticky top-0 z-10 transition-colors duration-300">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-medium">{TAB_LABELS[activeTab]}</h2>
            {headerMessage && <span className="text-sm text-emerald-600 dark:text-emerald-400">{headerMessage}</span>}
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
          {activeTab === 'dashboard' && <DashboardView />}
          {activeTab === 'map' && <LiveMap />}
          {activeTab === 'incidents' && <IncidentsView />}
          {activeTab === 'routing' && <RoutingView />}
          {activeTab === 'settings' && <SettingsView isDarkMode={isDarkMode} toggleTheme={() => setIsDarkMode((prev) => !prev)} />}
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

function DashboardView() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [chartPayload, setChartPayload] = useState<FlowChartPayload | null>(null);
  const [signalStatus, setSignalStatus] = useState<SignalStatus | null>(null);
  const [selectedNode, setSelectedNode] = useState('A1');
  const [selectedDate, setSelectedDate] = useState('');
  const [chartRange, setChartRange] = useState({ startIndex: 0, endIndex: 23 });
  const [loading, setLoading] = useState(true);
  const [signalMessage, setSignalMessage] = useState('');
  const [optimizing, setOptimizing] = useState(false);

  const fetchDashboard = async (nodeId = selectedNode, date = selectedDate) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ nodeId });
      if (date) {
        params.set('date', date);
      }

      const [metricsRes, chartRes, signalRes] = await Promise.all([
        fetch('/api/data/realtime'),
        fetch(`/api/visual/flowchart?${params.toString()}`),
        fetch('/api/signal/status')
      ]);

      const metricsData = await metricsRes.json();
      const chartData = await chartRes.json();
      const signalData = await signalRes.json();

      setMetrics(metricsData);
      setChartPayload(chartData);
      setSignalStatus(signalData);
      setSelectedNode(chartData.nodeId || nodeId);
      if (chartData.date && !date) {
        setSelectedDate(chartData.date);
      }
      if (chartData.focusRange) {
        setChartRange(chartData.focusRange);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const handleOptimizeSignal = async () => {
    setOptimizing(true);
    setSignalMessage('');
    try {
      const response = await fetch('/api/signal/optimize', { method: 'POST' });
      const result = await response.json();
      if (!response.ok || result.status !== 'success') {
        throw new Error(result.message || '信号优化失败');
      }
      setSignalStatus(result.signal);
      setSignalMessage(result.message);
    } catch (error) {
      setSignalMessage(error instanceof Error ? error.message : '信号优化失败');
    } finally {
      setOptimizing(false);
    }
  };

  const focusButtons = [
    { key: 'full', label: '全天', range: { startIndex: 0, endIndex: 23 } },
    { key: 'morning', label: '早高峰', range: { startIndex: 6, endIndex: 10 } },
    { key: 'midday', label: '午高峰', range: { startIndex: 11, endIndex: 15 } },
    { key: 'evening', label: '晚高峰', range: { startIndex: 16, endIndex: 20 } }
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="当前总流量" value={metrics?.flow ?? '--'} unit="辆/小时" trend={metrics ? '实时更新' : undefined} />
        <StatCard title="平均车速" value={metrics?.speed ?? '--'} unit="km/h" />
        <StatCard title="道路占有率" value={metrics ? (metrics.occupancy * 100).toFixed(1) : '--'} unit="%" />
        <StatCard title="活跃信号策略" value={signalStatus?.intersection_id ?? '--'} unit={signalStatus?.phase ?? ''} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-6 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 transition-colors duration-300">
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-medium">交通流量预测（日内 1-24 点）</h3>
                <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
                  支持查看全天趋势，并重点聚焦早高峰、午高峰和晚高峰。
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={selectedNode}
                  onChange={(event) => setSelectedNode(event.target.value)}
                  className="px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950 text-sm"
                >
                  {(chartPayload?.availableNodes ?? ['A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7']).map((nodeId) => (
                    <option key={nodeId} value={nodeId}>
                      节点 {nodeId}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950 text-sm"
                />
                <button
                  onClick={() => fetchDashboard(selectedNode, selectedDate)}
                  className="px-3 py-2 rounded-lg bg-emerald-500 text-white text-sm hover:bg-emerald-600 transition-colors"
                >
                  刷新图表
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {focusButtons.map((button) => (
                <button
                  key={button.key}
                  onClick={() => setChartRange(button.range)}
                  className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                    chartRange.startIndex === button.range.startIndex && chartRange.endIndex === button.range.endIndex
                      ? 'bg-emerald-500 text-white'
                      : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300'
                  }`}
                >
                  {button.label}
                </button>
              ))}
            </div>
          </div>

          {loading || !chartPayload ? (
            <div className="h-[340px] flex items-center justify-center text-sm text-gray-500 dark:text-zinc-400">
              正在加载图表数据...
            </div>
          ) : (
            <>
              <FlowChart
                data={chartPayload.data}
                peaks={chartPayload.peaks}
                range={chartRange}
                onRangeChange={setChartRange}
              />
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500 dark:text-zinc-400">
                <span>当前日期：{chartPayload.date ?? '未连接数据库'}</span>
                <span>当前节点：{chartPayload.nodeId}</span>
                <span>
                  最近预测：
                  {chartPayload.latestPrediction
                    ? `${chartPayload.latestPrediction.predicted_flow} 辆/小时`
                    : '暂无写入 predictions 表的结果'}
                </span>
              </div>
            </>
          )}
        </div>

        <div className="p-6 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 flex flex-col transition-colors duration-300">
          <h3 className="font-medium mb-4">信号灯自适应优化</h3>
          <div className="flex-1 flex flex-col justify-center space-y-6">
            <div className="p-4 rounded-lg bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800">
              <div className="text-sm text-gray-500 dark:text-zinc-400">优化路口</div>
              <div className="mt-1 text-xl font-semibold">{signalStatus?.intersection_id ?? 'A1'}</div>
            </div>
            <div className="p-4 rounded-lg bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800">
              <div className="text-sm text-gray-500 dark:text-zinc-400">当前相位</div>
              <div className="mt-1 text-lg font-medium text-emerald-600 dark:text-emerald-400">{signalStatus?.phase ?? 'NS_GREEN'}</div>
              <div className="mt-2 text-sm text-gray-500 dark:text-zinc-400">建议时长：{signalStatus?.duration ?? 45} 秒</div>
            </div>
            <button
              onClick={handleOptimizeSignal}
              disabled={optimizing}
              className="w-full py-2.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {optimizing ? '正在重新优化...' : '强制重新优化'}
            </button>
            {signalMessage && <p className="text-sm text-gray-500 dark:text-zinc-400">{signalMessage}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  unit,
  trend
}: {
  title: string;
  value: string | number;
  unit: string;
  trend?: string;
}) {
  return (
    <div className="p-5 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 transition-colors duration-300">
      <div className="text-sm text-gray-500 dark:text-zinc-400 mb-2">{title}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-light">{value}</span>
        <span className="text-sm text-gray-400 dark:text-zinc-500">{unit}</span>
      </div>
      {trend && <div className="text-xs mt-3 font-medium text-emerald-600 dark:text-emerald-400">{trend}</div>}
    </div>
  );
}

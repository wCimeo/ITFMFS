import React, { useEffect } from 'react';
import { Activity, Map as MapIcon, BarChart3, Settings, AlertTriangle, Navigation } from 'lucide-react';
import { FlowChart } from './components/FlowChart';
import { LiveMap } from './components/LiveMap';
import { IncidentsView } from './components/IncidentsView';
import { RoutingView } from './components/RoutingView';
import { SettingsView } from './components/SettingsView';

export default function App() {
  const [activeTab, setActiveTab] = React.useState('dashboard');
  const [isDarkMode, setIsDarkMode] = React.useState(true);

  // Apply dark mode class to html tag
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-50 font-sans transition-colors duration-300">
      {/* Sidebar */}
      <aside className="w-64 border-r border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 flex flex-col transition-colors duration-300">
        <div className="p-6">
          <h1 className="text-xl font-bold tracking-tight text-emerald-500 dark:text-emerald-400 flex items-center gap-2">
            <Activity className="w-6 h-6" />
            智能交通系统
          </h1>
          <p className="text-xs text-gray-500 dark:text-zinc-500 mt-1 font-mono">基于大数据分析</p>
        </div>
        
        <nav className="flex-1 px-4 space-y-2">
          <NavItem icon={<BarChart3 />} label="控制台总览" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <NavItem icon={<MapIcon />} label="实时路网地图" active={activeTab === 'map'} onClick={() => setActiveTab('map')} />
          <NavItem icon={<AlertTriangle />} label="突发事件监控" active={activeTab === 'incidents'} onClick={() => setActiveTab('incidents')} />
          <NavItem icon={<Navigation />} label="智能路线推荐" active={activeTab === 'routing'} onClick={() => setActiveTab('routing')} />
          <NavItem icon={<Settings />} label="系统设置" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </nav>
        
        <div className="p-4 border-t border-gray-200 dark:border-zinc-800 transition-colors duration-300">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-xs font-mono text-gray-500 dark:text-zinc-400">系统运行中</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <header className="h-16 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between px-8 bg-white/80 dark:bg-zinc-900/30 backdrop-blur-sm sticky top-0 z-10 transition-colors duration-300">
          <h2 className="text-lg font-medium capitalize">
            {activeTab === 'dashboard' && '控制台总览'}
            {activeTab === 'map' && '实时路网地图'}
            {activeTab === 'incidents' && '突发事件监控'}
            {activeTab === 'routing' && '智能路线推荐'}
            {activeTab === 'settings' && '系统设置'}
          </h2>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 dark:text-zinc-400 font-mono">当前模型: LST-GCN v1.2</span>
            <button className="px-3 py-1.5 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-md text-sm transition-colors">
              导出报告
            </button>
          </div>
        </header>

        <div className="p-8">
          {activeTab === 'dashboard' && <DashboardView />}
          {activeTab === 'map' && <LiveMap />}
          {activeTab === 'incidents' && <IncidentsView />}
          {activeTab === 'routing' && <RoutingView />}
          {activeTab === 'settings' && <SettingsView isDarkMode={isDarkMode} toggleTheme={toggleTheme} />}
        </div>
      </main>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick: () => void }) {
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
  const [metrics, setMetrics] = React.useState<any>(null);
  const [chartData, setChartData] = React.useState<any[]>([]);

  React.useEffect(() => {
    // Fetch mock data from our Express backend
    fetch('/api/data/realtime')
      .then(res => res.json())
      .then(data => setMetrics(data))
      .catch(console.error);

    // Fetch chart data
    fetch('/api/visual/flowchart')
      .then(res => res.json())
      .then(data => setChartData(data))
      .catch(console.error);
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Top Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="当前总流量" value={metrics?.flow || '--'} unit="辆/小时" trend="+5.2%" />
        <StatCard title="平均车速" value={metrics?.speed || '--'} unit="km/h" trend="-1.5%" trendDown />
        <StatCard title="道路占有率" value={metrics ? (metrics.occupancy * 100).toFixed(1) : '--'} unit="%" />
        <StatCard title="运行中信号灯" value="124" unit="/ 128" />
      </div>

      {/* Main Charts Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-6 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 transition-colors duration-300">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-medium">交通流量预测 (LST-GCN)</h3>
          </div>
          <FlowChart data={chartData.length > 0 ? chartData : [
            { time: '08:00', historical: 120, predicted: 125 },
            { time: '08:15', historical: 140, predicted: 138 },
            { time: '08:30', historical: 160, predicted: 155 },
            { time: '08:45', historical: 180, predicted: 175 },
            { time: '09:00', historical: 210, predicted: 205 },
            { time: '09:15', historical: 190, predicted: 195 },
            { time: '09:30', historical: 150, predicted: 160 },
            { time: '09:45', historical: 130, predicted: 135 },
            { time: '10:00', historical: 110, predicted: 115 },
            { time: '10:15', historical: null as any, predicted: 105 },
            { time: '10:30', historical: null as any, predicted: 95 },
            { time: '10:45', historical: null as any, predicted: 80 }
          ]} />
        </div>

        <div className="p-6 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 flex flex-col transition-colors duration-300">
          <h3 className="font-medium mb-4">信号灯自适应优化</h3>
          <div className="flex-1 flex flex-col justify-center space-y-6">
            <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 transition-colors duration-300">
              <div>
                <div className="text-sm text-gray-500 dark:text-zinc-400">路口 A1 (主干道)</div>
                <div className="font-mono mt-1 text-emerald-600 dark:text-emerald-400">南北向_绿灯</div>
              </div>
              <div className="text-2xl font-light">45s</div>
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 transition-colors duration-300">
              <div>
                <div className="text-sm text-gray-500 dark:text-zinc-400">路口 B2 (次干道)</div>
                <div className="font-mono mt-1 text-red-500 dark:text-red-400">东西向_红灯</div>
              </div>
              <div className="text-2xl font-light">12s</div>
            </div>
            <button className="w-full py-2.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 rounded-lg text-sm font-medium transition-colors">
              强制重新优化
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, unit, trend, trendDown }: { title: string, value: string | number, unit: string, trend?: string, trendDown?: boolean }) {
  return (
    <div className="p-5 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 transition-colors duration-300">
      <div className="text-sm text-gray-500 dark:text-zinc-400 mb-2">{title}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-light">{value}</span>
        <span className="text-sm text-gray-400 dark:text-zinc-500">{unit}</span>
      </div>
      {trend && (
        <div className={`text-xs mt-3 font-medium ${trendDown ? 'text-red-500 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
          {trend} 较上小时
        </div>
      )}
    </div>
  );
}

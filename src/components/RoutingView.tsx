import React, { useState } from 'react';
import { ArrowRight, Clock, MapPin, Navigation, Zap } from 'lucide-react';
import { SYSTEM_INTERSECTIONS } from '../constants/intersections';
import { apiFetch } from '../lib/api';

interface RouteStep {
  instruction: string;
  distance: string;
  time: string;
}

interface RouteResult {
  path: string[];
  estimated_time: number;
  distance: number;
  savings: number;
  steps: RouteStep[];
}

export function RoutingView({
  onNotify
}: {
  onNotify: (message: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const [start, setStart] = useState('A1');
  const [end, setEnd] = useState('F6');
  const [objective, setObjective] = useState('fastest');
  const [calculating, setCalculating] = useState(false);
  const [route, setRoute] = useState<RouteResult | null>(null);

  const handleCalculate = async () => {
    setCalculating(true);
    try {
      const params = new URLSearchParams({ start, end, objective });
      const response = await apiFetch(`/api/user/route?${params.toString()}`);
      if (!response.ok) {
        throw new Error('路径规划服务暂时不可用。');
      }
      const data = await response.json();
      setRoute(data);
      onNotify('路线规划已完成。', 'success');
    } catch (error) {
      onNotify(error instanceof Error ? error.message : '路径规划失败。', 'error');
    } finally {
      setCalculating(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-zinc-100">智能路线推荐</h2>
          <p className="text-sm text-gray-500 dark:text-zinc-400">路线规划已改为下拉框选点，限定在当前系统维护的 10 个路口范围内。</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="p-6 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 transition-colors duration-300">
            <h3 className="font-medium mb-4 text-gray-900 dark:text-zinc-300">规划路线</h3>

            <div className="space-y-4 relative">
              <div className="absolute left-4 top-10 bottom-10 w-0.5 bg-gray-200 dark:bg-zinc-800 z-0" />

              <div className="relative z-10">
                <label className="block text-xs text-gray-500 dark:text-zinc-500 mb-1 ml-8">起点</label>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center border border-gray-200 dark:border-zinc-700">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                  </div>
                  <select
                    value={start}
                    onChange={(event) => setStart(event.target.value)}
                    className="flex-1 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm"
                  >
                    {SYSTEM_INTERSECTIONS.map((node) => (
                      <option key={node.id} value={node.id}>
                        {node.id} / {node.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="relative z-10">
                <label className="block text-xs text-gray-500 dark:text-zinc-500 mb-1 ml-8">终点</label>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center border border-gray-200 dark:border-zinc-700">
                    <MapPin className="w-4 h-4 text-emerald-500" />
                  </div>
                  <select
                    value={end}
                    onChange={(event) => setEnd(event.target.value)}
                    className="flex-1 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm"
                  >
                    {SYSTEM_INTERSECTIONS.map((node) => (
                      <option key={node.id} value={node.id}>
                        {node.id} / {node.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-zinc-800 transition-colors duration-300">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-gray-500 dark:text-zinc-400">优化目标</span>
                <select
                  value={objective}
                  onChange={(event) => setObjective(event.target.value)}
                  className="bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg px-2 py-1 text-sm text-gray-700 dark:text-zinc-300"
                >
                  <option value="fastest">时间最短</option>
                  <option value="avoid_congestion">避开拥堵</option>
                  <option value="shortest_distance">距离最短</option>
                </select>
              </div>

              <button
                onClick={handleCalculate}
                disabled={calculating || !start || !end}
                className="w-full py-2.5 bg-emerald-500 text-white dark:text-zinc-950 hover:bg-emerald-600 dark:hover:bg-emerald-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {calculating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white dark:border-zinc-950 border-t-transparent rounded-full animate-spin" />
                    计算中...
                  </>
                ) : (
                  <>
                    <Navigation className="w-4 h-4" />
                    开始规划最优路线
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          {route ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="grid grid-cols-3 gap-4">
                <MetricCard icon={<Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-500" />} label="预计时间" value={route.estimated_time} unit="分钟" tone="emerald" />
                <MetricCard icon={<MapPin className="w-4 h-4 text-blue-500 dark:text-blue-400" />} label="总距离" value={route.distance} unit="km" tone="slate" />
                <MetricCard icon={<Zap className="w-4 h-4 text-amber-500 dark:text-amber-400" />} label="节省时间" value={route.savings} unit="分钟" tone="amber" />
              </div>

              <div className="p-6 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 transition-colors duration-300">
                <h3 className="font-medium mb-6 text-gray-900 dark:text-zinc-300">推荐路径节点</h3>
                <div className="flex items-center justify-between px-4 gap-2 flex-wrap">
                  {route.path.map((node, index) => (
                    <React.Fragment key={node}>
                      <div className="flex flex-col items-center gap-2">
                        <div
                          className={`w-12 h-12 rounded-full flex items-center justify-center font-mono text-sm border-2 ${
                            index === 0
                              ? 'bg-blue-50 dark:bg-blue-500/20 border-blue-500 text-blue-600 dark:text-blue-400'
                              : index === route.path.length - 1
                                ? 'bg-emerald-50 dark:bg-emerald-500/20 border-emerald-500 text-emerald-600 dark:text-emerald-400'
                                : 'bg-gray-50 dark:bg-zinc-800 border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-zinc-300'
                          }`}
                        >
                          {node}
                        </div>
                      </div>
                      {index < route.path.length - 1 && (
                        <div className="flex-1 min-w-[40px] h-0.5 bg-gray-200 dark:bg-zinc-800 relative mx-1">
                          <div className="absolute inset-0 bg-emerald-500/50 w-full animate-pulse" />
                          <ArrowRight className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-zinc-600 bg-white dark:bg-zinc-900" />
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              <div className="p-6 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 transition-colors duration-300">
                <h3 className="font-medium mb-4 text-gray-900 dark:text-zinc-300">详细导航指令</h3>
                <div className="space-y-0">
                  {route.steps.map((step, index) => (
                    <div key={index} className="flex items-start gap-4 p-4 hover:bg-gray-50 dark:hover:bg-zinc-800/50 rounded-lg transition-colors border-b border-gray-100 dark:border-zinc-800/50 last:border-0">
                      <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-xs font-mono text-gray-500 dark:text-zinc-400">{index + 1}</span>
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 dark:text-zinc-200">{step.instruction}</div>
                        <div className="text-sm text-gray-500 dark:text-zinc-500 mt-1 flex gap-4">
                          <span>{step.distance}</span>
                          <span>{step.time}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[400px] rounded-xl border border-gray-200 dark:border-zinc-800 border-dashed flex flex-col items-center justify-center text-gray-400 dark:text-zinc-500 bg-gray-50 dark:bg-zinc-900/20 transition-colors duration-300">
              <Navigation className="w-12 h-12 mb-4 opacity-20" />
              <p>请选择起点和终点后计算最优路线。</p>
              <p className="text-sm mt-2 opacity-60">当前路径推荐已限定在 10 个路口范围内，更适合论文中的系统可验证性展示。</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  unit,
  tone
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  unit: string;
  tone: 'emerald' | 'slate' | 'amber';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/5'
      : tone === 'amber'
        ? 'border-amber-500/30 bg-amber-50 dark:bg-amber-500/5'
        : 'border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50';

  return (
    <div className={`p-5 rounded-xl border transition-colors duration-300 ${toneClass}`}>
      <div className="text-sm text-gray-500 dark:text-zinc-400 mb-1 flex items-center gap-2">
        {icon}
        {label}
      </div>
      <div className="text-3xl font-light text-gray-900 dark:text-zinc-100">
        {value}
        <span className="text-base text-gray-400 dark:text-zinc-500 ml-1">{unit}</span>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { Navigation, MapPin, Clock, ArrowRight, Zap } from 'lucide-react';

export function RoutingView() {
  const [start, setStart] = useState('路口 A1');
  const [end, setEnd] = useState('路口 F6');
  const [calculating, setCalculating] = useState(false);
  const [route, setRoute] = useState<any>(null);

  const handleCalculate = () => {
    setCalculating(true);
    // Simulate API call to /api/user/route
    setTimeout(() => {
      setRoute({
        path: ['A1', 'B2', 'D4', 'F6'],
        estimated_time: 22, // minutes
        distance: 8.5, // km
        savings: 5, // minutes saved vs standard route
        steps: [
          { instruction: '向北行驶进入主干道', distance: '1.2 km', time: '3 分钟' },
          { instruction: '右转进入第一大道', distance: '3.5 km', time: '8 分钟' },
          { instruction: '直行通过路口 D4', distance: '2.0 km', time: '6 分钟' },
          { instruction: '到达目的地 F6', distance: '1.8 km', time: '5 分钟' }
        ]
      });
      setCalculating(false);
    }, 1500);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-zinc-100">智能路线推荐</h2>
          <p className="text-sm text-gray-500 dark:text-zinc-400">基于实时路况与 LST-GCN 预测流量的 AI 动态路径规划</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input Panel */}
        <div className="lg:col-span-1 space-y-6">
          <div className="p-6 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 transition-colors duration-300">
            <h3 className="font-medium mb-4 text-gray-900 dark:text-zinc-300">规划路线</h3>
            
            <div className="space-y-4 relative">
              {/* Connecting line between inputs */}
              <div className="absolute left-4 top-10 bottom-10 w-0.5 bg-gray-200 dark:bg-zinc-800 z-0"></div>
              
              <div className="relative z-10">
                <label className="block text-xs text-gray-500 dark:text-zinc-500 mb-1 ml-8">起点</label>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center border border-gray-200 dark:border-zinc-700">
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  </div>
                  <input 
                    type="text" 
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    className="flex-1 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-zinc-200 focus:outline-none focus:border-emerald-500 transition-colors"
                    placeholder="输入起点..."
                  />
                </div>
              </div>

              <div className="relative z-10">
                <label className="block text-xs text-gray-500 dark:text-zinc-500 mb-1 ml-8">终点</label>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center border border-gray-200 dark:border-zinc-700">
                    <MapPin className="w-4 h-4 text-emerald-500" />
                  </div>
                  <input 
                    type="text" 
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    className="flex-1 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-zinc-200 focus:outline-none focus:border-emerald-500 transition-colors"
                    placeholder="输入终点..."
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-zinc-800 transition-colors duration-300">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-gray-500 dark:text-zinc-400">优化目标</span>
                <select className="bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg px-2 py-1 text-sm text-gray-700 dark:text-zinc-300 focus:outline-none">
                  <option>时间最短</option>
                  <option>避开拥堵</option>
                  <option>距离最短</option>
                </select>
              </div>
              
              <button 
                onClick={handleCalculate}
                disabled={calculating || !start || !end}
                className="w-full py-2.5 bg-emerald-500 text-white dark:text-zinc-950 hover:bg-emerald-600 dark:hover:bg-emerald-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {calculating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white dark:border-zinc-950 border-t-transparent rounded-full animate-spin"></div>
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

        {/* Results Panel */}
        <div className="lg:col-span-2">
          {route ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-5 rounded-xl border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/5 transition-colors duration-300">
                  <div className="text-sm text-gray-500 dark:text-zinc-400 mb-1 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-500" />
                    预计时间
                  </div>
                  <div className="text-3xl font-light text-emerald-600 dark:text-emerald-400">{route.estimated_time}<span className="text-base text-gray-400 dark:text-zinc-500 ml-1">分钟</span></div>
                </div>
                <div className="p-5 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 transition-colors duration-300">
                  <div className="text-sm text-gray-500 dark:text-zinc-400 mb-1 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                    总距离
                  </div>
                  <div className="text-3xl font-light text-gray-900 dark:text-zinc-100">{route.distance}<span className="text-base text-gray-400 dark:text-zinc-500 ml-1">km</span></div>
                </div>
                <div className="p-5 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 transition-colors duration-300">
                  <div className="text-sm text-gray-500 dark:text-zinc-400 mb-1 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                    节省时间
                  </div>
                  <div className="text-3xl font-light text-amber-500 dark:text-amber-400">{route.savings}<span className="text-base text-gray-400 dark:text-zinc-500 ml-1">分钟</span></div>
                </div>
              </div>

              {/* Path Visualization */}
              <div className="p-6 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 transition-colors duration-300">
                <h3 className="font-medium mb-6 text-gray-900 dark:text-zinc-300">推荐路径节点</h3>
                <div className="flex items-center justify-between px-4">
                  {route.path.map((node: string, index: number) => (
                    <React.Fragment key={node}>
                      <div className="flex flex-col items-center gap-2">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-mono text-sm border-2 ${
                          index === 0 ? 'bg-blue-50 dark:bg-blue-500/20 border-blue-500 text-blue-600 dark:text-blue-400' :
                          index === route.path.length - 1 ? 'bg-emerald-50 dark:bg-emerald-500/20 border-emerald-500 text-emerald-600 dark:text-emerald-400' :
                          'bg-gray-50 dark:bg-zinc-800 border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-zinc-300'
                        }`}>
                          {node}
                        </div>
                      </div>
                      {index < route.path.length - 1 && (
                        <div className="flex-1 h-0.5 bg-gray-200 dark:bg-zinc-800 relative mx-2">
                          <div className="absolute inset-0 bg-emerald-500/50 w-full animate-pulse"></div>
                          <ArrowRight className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-zinc-600 bg-white dark:bg-zinc-900" />
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {/* Turn-by-turn */}
              <div className="p-6 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 transition-colors duration-300">
                <h3 className="font-medium mb-4 text-gray-900 dark:text-zinc-300">详细导航指令</h3>
                <div className="space-y-0">
                  {route.steps.map((step: any, index: number) => (
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
              <p>输入起点和终点以计算最优路线</p>
              <p className="text-sm mt-2 opacity-60">由 LST-GCN 预测流量分析提供支持</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

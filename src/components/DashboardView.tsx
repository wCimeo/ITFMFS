import React, { useEffect, useState } from 'react';
import { FlowChart } from './FlowChart';
import { apiFetch } from '../lib/api';
import { MODEL_NODE_IDS } from '../constants/intersections';

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
  scopeNote: string;
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

export function DashboardView({
  onNotify
}: {
  onNotify: (message: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [chartPayload, setChartPayload] = useState<FlowChartPayload | null>(null);
  const [signalStatus, setSignalStatus] = useState<SignalStatus | null>(null);
  const [selectedNode, setSelectedNode] = useState(MODEL_NODE_IDS[0]);
  const [selectedDate, setSelectedDate] = useState('');
  const [chartRange, setChartRange] = useState({ startIndex: 0, endIndex: 23 });
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);

  const fetchDashboard = async (showToast = false, nodeId = selectedNode, date = selectedDate, background = false) => {
    if (!background) {
      setLoading(true);
    }
    try {
      const params = new URLSearchParams({ nodeId });
      if (date) {
        params.set('date', date);
      }

      const [metricsRes, chartRes, signalRes] = await Promise.all([
        apiFetch('/api/data/realtime'),
        apiFetch(`/api/visual/flowchart?${params.toString()}`),
        apiFetch('/api/signal/status')
      ]);

      if (!metricsRes.ok || !chartRes.ok || !signalRes.ok) {
        throw new Error('\u63a7\u5236\u53f0\u6570\u636e\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u670d\u52a1\u72b6\u6001\u3002');
      }

      const metricsData = await metricsRes.json();
      const chartData = await chartRes.json();
      const signalData = await signalRes.json();

      setMetrics(metricsData);
      setChartPayload(chartData);
      setSignalStatus(signalData);
      setSelectedNode(chartData.nodeId || nodeId);
      if (chartData.date) {
        setSelectedDate(chartData.date);
      }
      if (chartData.focusRange) {
        setChartRange(chartData.focusRange);
      }

      if (showToast) {
        onNotify('\u56fe\u8868\u6570\u636e\u5df2\u5237\u65b0\u3002', 'success');
      }
    } catch (error) {
      onNotify(error instanceof Error ? error.message : '\u56fe\u8868\u6570\u636e\u52a0\u8f7d\u5931\u8d25\u3002', 'error');
    } finally {
      if (!background) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void fetchDashboard(false, selectedNode, selectedDate);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void fetchDashboard(false, selectedNode, selectedDate, true);
    }, 60000);
    return () => window.clearInterval(interval);
  }, [selectedNode, selectedDate]);

  const handleOptimizeSignal = async () => {
    setOptimizing(true);
    try {
      const response = await apiFetch('/api/signal/optimize', { method: 'POST' });
      const result = await response.json();
      if (!response.ok || result.status !== 'success') {
        throw new Error(result.message || '信号优化失败。');
      }
      setSignalStatus(result.signal);
      onNotify(result.message, 'success');
    } catch (error) {
      onNotify(error instanceof Error ? error.message : '信号优化失败。', 'error');
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
        <StatCard title="当前总流量" value={metrics?.flow ?? '--'} unit="辆/小时" trend={metrics ? '按最新时间片汇总' : undefined} />
        <StatCard title="平均车速" value={metrics?.speed ?? '--'} unit="km/h" />
        <StatCard title="道路占有率" value={metrics ? (metrics.occupancy * 100).toFixed(1) : '--'} unit="%" />
        <StatCard title="当前优化路口" value={signalStatus?.intersection_id ?? '--'} unit={signalStatus?.phase ?? ''} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-6 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 transition-colors duration-300">
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-medium">交通流量预测（日内 1-24 点）</h3>
                <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">支持全天趋势查看、早中晚高峰快速聚焦，以及图表拖拽缩放。</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={selectedNode}
                  onChange={(event) => setSelectedNode(event.target.value)}
                  className="px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950 text-sm"
                >
                  {(chartPayload?.availableNodes ?? [...MODEL_NODE_IDS]).map((nodeId) => (
                    <option key={nodeId} value={nodeId}>
                      {nodeId}
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
                  onClick={() => fetchDashboard(true, selectedNode, selectedDate)}
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
            <div className="h-[340px] flex items-center justify-center text-sm text-gray-500 dark:text-zinc-400">正在加载图表数据...</div>
          ) : (
            <>
              <FlowChart data={chartPayload.data} peaks={chartPayload.peaks} range={chartRange} onRangeChange={setChartRange} />
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500 dark:text-zinc-400">
                <span>当前日期：{chartPayload.date ?? '暂无日期'}</span>
                <span>当前节点：{chartPayload.nodeId}</span>
                <span>
                  最新预测：
                  {chartPayload.latestPrediction
                    ? `${chartPayload.latestPrediction.predicted_flow} 辆/小时`
                    : '\u5c1a\u672a\u751f\u6210\u65b0\u7684\u9884\u6d4b\u7ed3\u679c'}
                </span>
              </div>
            </>
          )}
        </div>

        <div className="p-6 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 flex flex-col transition-colors duration-300">
          <h3 className="font-medium mb-4">信号灯自适应优化</h3>
          <div className="flex-1 flex flex-col justify-center space-y-6">
            <div className="p-4 rounded-lg bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800">
              <div className="text-sm text-gray-500 dark:text-zinc-400">当前优化路口</div>
              <div className="mt-1 text-xl font-semibold">{signalStatus?.intersection_id ?? MODEL_NODE_IDS[0]}</div>
            </div>
            <div className="p-4 rounded-lg bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800">
              <div className="text-sm text-gray-500 dark:text-zinc-400">推荐相位</div>
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

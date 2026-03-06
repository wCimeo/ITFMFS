import React, { useState, useEffect } from 'react';
import { AlertTriangle, Clock, MapPin, CheckCircle2, XCircle } from 'lucide-react';

interface Incident {
  id: string;
  type: '交通事故' | '道路拥堵' | '道路施工' | '恶劣天气';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  location: string;
  description: string;
  timestamp: string;
  status: 'ACTIVE' | 'RESOLVED';
}

export function IncidentsView() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate fetching incidents from an API
    setTimeout(() => {
      setIncidents([
        {
          id: 'INC-001',
          type: '交通事故',
          severity: 'HIGH',
          location: '路口 A1 (主干道 & 第一大道)',
          description: '多车追尾事故，占用两条北向车道。救援车辆已到达现场。',
          timestamp: new Date(Date.now() - 15 * 60000).toISOString(), // 15 mins ago
          status: 'ACTIVE'
        },
        {
          id: 'INC-002',
          type: '道路拥堵',
          severity: 'MEDIUM',
          location: '42号公路南向',
          description: '早高峰车流量激增，超出预测容量 15%，导致严重拥堵。',
          timestamp: new Date(Date.now() - 45 * 60000).toISOString(),
          status: 'ACTIVE'
        },
        {
          id: 'INC-003',
          type: '道路施工',
          severity: 'LOW',
          location: '路口 C3',
          description: '交通信号灯控制器例行维护，当前信号灯处于固定配时模式。',
          timestamp: new Date(Date.now() - 120 * 60000).toISOString(),
          status: 'ACTIVE'
        },
        {
          id: 'INC-004',
          type: '恶劣天气',
          severity: 'MEDIUM',
          location: '全市范围',
          description: '强降雨导致能见度降低，全市平均车速下降 20%。',
          timestamp: new Date(Date.now() - 180 * 60000).toISOString(),
          status: 'RESOLVED'
        }
      ]);
      setLoading(false);
    }, 800);
  }, []);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'HIGH': return 'text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-400/10 border-red-200 dark:border-red-400/20';
      case 'MEDIUM': return 'text-amber-500 dark:text-amber-400 bg-amber-50 dark:bg-amber-400/10 border-amber-200 dark:border-amber-400/20';
      case 'LOW': return 'text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-400/10 border-blue-200 dark:border-blue-400/20';
      default: return 'text-gray-500 dark:text-zinc-400 bg-gray-50 dark:bg-zinc-400/10 border-gray-200 dark:border-zinc-400/20';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case '交通事故': return <AlertTriangle className="w-5 h-5" />;
      case '道路拥堵': return <Clock className="w-5 h-5" />;
      case '道路施工': return <MapPin className="w-5 h-5" />;
      default: return <AlertTriangle className="w-5 h-5" />;
    }
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const activeIncidents = incidents.filter(i => i.status === 'ACTIVE');
  const resolvedIncidents = incidents.filter(i => i.status === 'RESOLVED');

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-zinc-100">突发事件与警报</h2>
          <p className="text-sm text-gray-500 dark:text-zinc-400">实时异常检测与事件报告</p>
        </div>
        <button className="px-4 py-2 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 rounded-lg text-sm font-medium transition-colors">
          上报新事件
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Incidents List */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="font-medium text-gray-900 dark:text-zinc-300 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
            当前活跃警报 ({activeIncidents.length})
          </h3>
          
          {activeIncidents.map(incident => (
            <div key={incident.id} className="p-5 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors duration-300">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg border ${getSeverityColor(incident.severity)}`}>
                    {getTypeIcon(incident.type)}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-zinc-100">{incident.type}</div>
                    <div className="text-xs text-gray-500 dark:text-zinc-500 font-mono">{incident.id}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-zinc-400">
                  <Clock className="w-4 h-4" />
                  {formatTime(incident.timestamp)}
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-gray-400 dark:text-zinc-500" />
                  <span className="text-gray-700 dark:text-zinc-300">{incident.location}</span>
                </div>
                <p className="text-sm text-gray-500 dark:text-zinc-400 pl-6">
                  {incident.description}
                </p>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-zinc-800/50 flex justify-end gap-3">
                <button className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-200 transition-colors">
                  在地图上查看
                </button>
                <button className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-900 dark:text-zinc-100 rounded transition-colors">
                  更新状态
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Sidebar Stats & Resolved */}
        <div className="space-y-6">
          <div className="p-5 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 transition-colors duration-300">
            <h3 className="font-medium mb-4 text-gray-900 dark:text-zinc-300">路网影响评估</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-500 dark:text-zinc-400">路网容量占用</span>
                  <span className="text-amber-500 dark:text-amber-400">85%</span>
                </div>
                <div className="h-1.5 w-full bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 dark:bg-amber-400 w-[85%]"></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-500 dark:text-zinc-400">平均延迟增加</span>
                  <span className="text-red-500 dark:text-red-400">+12 分钟</span>
                </div>
                <div className="h-1.5 w-full bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-red-500 dark:bg-red-400 w-[40%]"></div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-medium text-gray-900 dark:text-zinc-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              最近已解决
            </h3>
            {resolvedIncidents.map(incident => (
              <div key={incident.id} className="p-4 rounded-xl border border-gray-100 dark:border-zinc-800/50 bg-gray-50 dark:bg-zinc-900/30 opacity-75 transition-colors duration-300">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-600 dark:text-zinc-400">{incident.type}</span>
                  <span className="text-xs text-gray-400 dark:text-zinc-500">{formatTime(incident.timestamp)}</span>
                </div>
                <div className="text-sm text-gray-500 dark:text-zinc-500 truncate">{incident.location}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

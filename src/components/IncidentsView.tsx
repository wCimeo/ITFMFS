import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, MapPin, PlusCircle } from 'lucide-react';
import { SYSTEM_INTERSECTIONS } from '../constants/intersections';
import { apiFetch } from '../lib/api';

interface Incident {
  id: string;
  type: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  location: string;
  description: string;
  relatedNodeId?: string | null;
  timestamp: string;
  status: 'ACTIVE' | 'RESOLVED';
}

const INCIDENT_TYPES = ['道路拥堵', '交通事故', '道路施工', '恶劣天气', '设备异常'];

const emptyForm = {
  type: '道路拥堵',
  severity: 'MEDIUM' as 'HIGH' | 'MEDIUM' | 'LOW',
  relatedNodeId: 'A1',
  description: ''
};

export function IncidentsView({
  onNotify
}: {
  onNotify: (message: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const selectedNodeName = useMemo(
    () => SYSTEM_INTERSECTIONS.find((item) => item.id === form.relatedNodeId)?.name ?? SYSTEM_INTERSECTIONS[0].name,
    [form.relatedNodeId]
  );

  const loadIncidents = async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/incidents');
      if (!response.ok) {
        throw new Error('事件列表加载失败。');
      }
      const data = await response.json();
      setIncidents(data);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : '事件列表加载失败。', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIncidents();
  }, []);

  const handleCreateIncident = async () => {
    try {
      const response = await apiFetch('/api/incidents', {
        method: 'POST',
        body: JSON.stringify(form)
      });
      const result = await response.json();
      if (!response.ok || result.status !== 'success') {
        throw new Error(result.message || '事件上报失败。');
      }
      setForm(emptyForm);
      setShowForm(false);
      onNotify(result.message, 'success');
      await loadIncidents();
    } catch (error) {
      onNotify(error instanceof Error ? error.message : '事件上报失败。', 'error');
    }
  };

  const handleUpdateStatus = async (incident: Incident) => {
    const nextStatus = incident.status === 'ACTIVE' ? 'RESOLVED' : 'ACTIVE';
    try {
      const response = await apiFetch(`/api/incidents/${incident.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus })
      });
      const result = await response.json();
      if (!response.ok || result.status !== 'success') {
        throw new Error(result.message || '事件状态更新失败。');
      }
      onNotify(result.message, 'success');
      await loadIncidents();
    } catch (error) {
      onNotify(error instanceof Error ? error.message : '事件状态更新失败。', 'error');
    }
  };

  const handleViewOnMap = (incident: Incident) => {
    if (incident.relatedNodeId) {
      localStorage.setItem('mapFocusNodeId', incident.relatedNodeId);
    }
    window.location.hash = '#map';
    onNotify(`已定位到 ${incident.location}。`, 'info');
  };

  const activeIncidents = incidents.filter((incident) => incident.status === 'ACTIVE');
  const resolvedIncidents = incidents.filter((incident) => incident.status === 'RESOLVED');
  const networkImpact = Math.min(95, 60 + activeIncidents.length * 8);
  const delayMinutes = activeIncidents.length * 4;

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-zinc-100">突发事件与告警</h2>
        </div>
        <button
          onClick={() => setShowForm((prev) => !prev)}
          className="px-4 py-2 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          <PlusCircle className="w-4 h-4" />
          {showForm ? '收起事件表单' : '上报新事件'}
        </button>
      </div>

      {showForm && (
        <div className="p-5 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 dark:text-zinc-400 mb-1">事件类型</label>
              <select
                value={form.type}
                onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
                className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm"
              >
                {INCIDENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-zinc-400 mb-1">严重程度</label>
              <select
                value={form.severity}
                onChange={(event) => setForm((prev) => ({ ...prev, severity: event.target.value as 'HIGH' | 'MEDIUM' | 'LOW' }))}
                className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm"
              >
                <option value="HIGH">高</option>
                <option value="MEDIUM">中</option>
                <option value="LOW">低</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-zinc-400 mb-1">关联路口</label>
              <select
                value={form.relatedNodeId}
                onChange={(event) => setForm((prev) => ({ ...prev, relatedNodeId: event.target.value }))}
                className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm"
              >
                {SYSTEM_INTERSECTIONS.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.id} / {node.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-zinc-400 mb-1">事件位置</label>
              <input
                value={selectedNodeName}
                disabled
                className="w-full bg-gray-100 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm text-gray-500 dark:text-zinc-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-gray-500 dark:text-zinc-400 mb-1">事件描述</label>
              <textarea
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                rows={3}
                className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm"
                placeholder="请输入事件描述..."
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleCreateIncident}
              className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm hover:bg-emerald-600 transition-colors"
            >
              提交事件
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <h3 className="font-medium text-gray-900 dark:text-zinc-300 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            当前活跃告警 ({activeIncidents.length})
          </h3>

          {activeIncidents.map((incident) => (
            <div key={incident.id} className="p-5 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors duration-300">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg border ${getSeverityColor(incident.severity)}`}>{getTypeIcon(incident.type)}</div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-zinc-100">{incident.type}</div>
                    <div className="text-xs text-gray-500 dark:text-zinc-500 font-mono">{incident.id}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-zinc-400">
                  <Clock className="w-4 h-4" />
                  {new Date(incident.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-gray-400 dark:text-zinc-500" />
                  <span className="text-gray-700 dark:text-zinc-300">{incident.location}</span>
                </div>
                <p className="text-sm text-gray-500 dark:text-zinc-400 pl-6">{incident.description}</p>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-zinc-800/50 flex justify-end gap-3">
                <button
                  onClick={() => handleViewOnMap(incident)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-200 transition-colors"
                >
                  在地图上查看
                </button>
                <button
                  onClick={() => handleUpdateStatus(incident)}
                  className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-900 dark:text-zinc-100 rounded transition-colors"
                >
                  标记为已处理
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-6">
          <div className="p-5 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 transition-colors duration-300">
            <h3 className="font-medium mb-4 text-gray-900 dark:text-zinc-300">路网影响评估</h3>
            <div className="space-y-4">
              <ImpactBar label="路网容量占用" value={`${networkImpact}%`} width={networkImpact} color="bg-amber-500 dark:bg-amber-400" />
              <ImpactBar label="平均延误增加" value={`+${delayMinutes} 分钟`} width={Math.min(90, delayMinutes * 6)} color="bg-red-500 dark:bg-red-400" />
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-medium text-gray-900 dark:text-zinc-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              最近已解决
            </h3>
            {resolvedIncidents.map((incident) => (
              <div key={incident.id} className="p-4 rounded-xl border border-gray-100 dark:border-zinc-800/50 bg-gray-50 dark:bg-zinc-900/30 opacity-75 transition-colors duration-300">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-600 dark:text-zinc-400">{incident.type}</span>
                  <span className="text-xs text-gray-400 dark:text-zinc-500">
                    {new Date(incident.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
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

function ImpactBar({ label, value, width, color }: { label: string; value: string; width: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-500 dark:text-zinc-400">{label}</span>
        <span className="text-gray-900 dark:text-zinc-100">{value}</span>
      </div>
      <div className="h-1.5 w-full bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function getSeverityColor(severity: string) {
  switch (severity) {
    case 'HIGH':
      return 'text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-400/10 border-red-200 dark:border-red-400/20';
    case 'MEDIUM':
      return 'text-amber-500 dark:text-amber-400 bg-amber-50 dark:bg-amber-400/10 border-amber-200 dark:border-amber-400/20';
    case 'LOW':
      return 'text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-400/10 border-blue-200 dark:border-blue-400/20';
    default:
      return 'text-gray-500 dark:text-zinc-400 bg-gray-50 dark:bg-zinc-400/10 border-gray-200 dark:border-zinc-400/20';
  }
}

function getTypeIcon(type: string) {
  if (type.includes('事故')) return <AlertTriangle className="w-5 h-5" />;
  if (type.includes('拥堵')) return <Clock className="w-5 h-5" />;
  return <MapPin className="w-5 h-5" />;
}

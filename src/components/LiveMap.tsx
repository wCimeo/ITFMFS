import React, { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import { apiFetch } from '../lib/api';

const defaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow
});
L.Marker.prototype.options.icon = defaultIcon;

interface TrafficNode {
  id: string;
  lat: number;
  lng: number;
  flow: number;
  name: string;
  speed: number | null;
  occupancy: number | null;
  hasRealtimeData: boolean;
}

interface MapPayload {
  source: string;
  regionLabel: string;
  baseMapSource: string;
  updateMode: string;
  realtimeNote: string;
  lastUpdated: string | null;
  nodes: TrafficNode[];
  summary: {
    stationCount: number;
    avgFlow: number;
  };
}

function MapFocus({ node }: { node: TrafficNode | null }) {
  const map = useMap();

  useEffect(() => {
    if (!node) {
      return;
    }
    map.flyTo([node.lat, node.lng], 12, { duration: 0.8 });
  }, [map, node]);

  return null;
}

export function LiveMap({
  onNotify
}: {
  onNotify: (message: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const [payload, setPayload] = useState<MapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const fetchMapData = async (showToast = false) => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/visual/map');
      if (!response.ok) {
        throw new Error('地图数据加载失败。');
      }
      const data = await response.json();
      setPayload({
        ...data,
        nodes: data.nodes.map((node: any) => ({
          ...node,
          lat: Number(node.lat),
          lng: Number(node.lng),
          flow: Number(node.flow),
          speed: node.speed != null ? Number(node.speed) : null,
          occupancy: node.occupancy != null ? Number(node.occupancy) : null,
          hasRealtimeData: Boolean(node.hasRealtimeData)
        }))
      });
      if (showToast) {
        onNotify('地图数据已刷新。', 'success');
      }
    } catch (error) {
      onNotify(error instanceof Error ? error.message : '地图数据加载失败。', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMapData(false);
    const interval = window.setInterval(() => fetchMapData(false), 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const focusNodeId = localStorage.getItem('mapFocusNodeId');
    if (focusNodeId) {
      setSelectedNodeId(focusNodeId);
      localStorage.removeItem('mapFocusNodeId');
    }
  }, [payload?.nodes.length]);

  const center: [number, number] = useMemo(() => {
    if (!payload?.nodes?.length) {
      return [30.5702, 104.0743];
    }
    const focusNode = payload.nodes.find((node) => node.id === selectedNodeId);
    if (focusNode) {
      return [focusNode.lat, focusNode.lng];
    }
    return [payload.nodes[0].lat, payload.nodes[0].lng];
  }, [payload?.nodes, selectedNodeId]);

  const isDarkMode = document.documentElement.classList.contains('dark');
  const selectedNode = payload?.nodes.find((node) => node.id === selectedNodeId) ?? null;

  const getMarkerColor = (node: TrafficNode) => {
    if (!node.hasRealtimeData) return '#94a3b8';
    if (node.flow < 80) return '#10b981';
    if (node.flow < 130) return '#f59e0b';
    return '#ef4444';
  };

  if (loading && !payload) {
    return (
      <div className="h-[600px] rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 flex items-center justify-center transition-colors duration-300">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-500 dark:text-zinc-400 font-mono">加载地图数据中...</span>
        </div>
      </div>
    );
  }

  const nodes = payload?.nodes ?? [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_0.7fr] gap-6">
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-medium text-gray-900 dark:text-zinc-100">实时路网地图</h2>
            <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">当前地图底图来自 {payload?.baseMapSource ?? 'OpenStreetMap / CARTO'}，路况点位来自数据库最新时间片或已导入的 PeMS 快照。</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MetaCard label="当前区域" value={payload?.regionLabel ?? '中国四川成都'} />
            <MetaCard label="数据来源" value={payload?.source ?? '成都本地路口库'} />
            <MetaCard label="更新模式" value={payload?.updateMode ?? '数据库最新时间戳'} />
            <MetaCard label="当前点位数" value={`${payload?.summary.stationCount ?? 0} 个`} />
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
            {payload?.realtimeNote}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-5 space-y-4">
          <div className="text-sm text-gray-500 dark:text-zinc-400">当前手动操作</div>
          <select
            value={selectedNodeId ?? ''}
            onChange={(event) => setSelectedNodeId(event.target.value || null)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm"
          >
            <option value="">聚焦全部路口</option>
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.id} / {node.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => fetchMapData(true)}
            className="w-full px-3 py-2 rounded-lg bg-emerald-500 text-white text-sm hover:bg-emerald-600 transition-colors"
          >
            刷新地图
          </button>
          <div className="text-xs text-gray-500 dark:text-zinc-500 leading-6">
            最近更新时间：{payload?.lastUpdated ? new Date(payload.lastUpdated).toLocaleString('zh-CN') : '暂无'}
          </div>
        </div>
      </div>

      <div className="flex gap-4 text-sm flex-wrap">
        <LegendDot color="#10b981" label="畅通（<80）" />
        <LegendDot color="#f59e0b" label="拥挤（80-130）" />
        <LegendDot color="#ef4444" label="拥堵（>130）" />
        <LegendDot color="#94a3b8" label="暂无实时流量" />
      </div>

      <div className="h-[640px] rounded-xl overflow-hidden border border-gray-200 dark:border-zinc-800 relative z-0 transition-colors duration-300">
        <MapContainer center={center} zoom={11} style={{ height: '100%', width: '100%', background: isDarkMode ? '#09090b' : '#f9fafb' }}>
          <MapFocus node={selectedNode} />

          {isDarkMode ? (
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />
          ) : (
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            />
          )}

          {nodes.map((node) => (
            <CircleMarker
              key={node.id}
              center={[node.lat, node.lng]}
              radius={Math.max(8, Math.min(node.flow / 15, 20))}
              pathOptions={{
                color: getMarkerColor(node),
                fillColor: getMarkerColor(node),
                fillOpacity: selectedNodeId && selectedNodeId !== node.id ? 0.25 : 0.7,
                weight: selectedNodeId === node.id ? 4 : 2
              }}
            >
              <Popup className="custom-popup">
                <div className="p-1 min-w-[220px]">
                  <div className="font-medium text-gray-900">{node.name}</div>
                  <div className="text-sm text-gray-600 mt-2">路口编号：{node.id}</div>
                  <div className="text-sm text-gray-600 mt-1">
                    当前流量：<strong className="text-gray-900">{node.hasRealtimeData ? `${node.flow} 辆/小时` : '暂无实时数据'}</strong>
                  </div>
                  {node.speed != null && <div className="text-sm text-gray-600 mt-1">平均车速：{node.speed.toFixed(1)} km/h</div>}
                  {node.occupancy != null && <div className="text-sm text-gray-600 mt-1">占有率：{(node.occupancy * 100).toFixed(1)}%</div>}
                  <div className="text-xs text-gray-500 mt-2 font-mono">
                    {Number(node.lat).toFixed(4)}, {Number(node.lng).toFixed(4)}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-4">
      <div className="text-xs text-gray-500 dark:text-zinc-500">{label}</div>
      <div className="mt-2 text-sm font-medium text-gray-900 dark:text-zinc-100">{value}</div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-gray-600 dark:text-zinc-400">{label}</span>
    </div>
  );
}

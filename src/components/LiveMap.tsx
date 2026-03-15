import React, { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

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
  speed?: number;
  occupancy?: number;
}

interface MapPayload {
  source: string;
  lastUpdated: string | null;
  nodes: TrafficNode[];
  summary: {
    stationCount: number;
    avgFlow: number;
  };
  importGuide?: string;
}

function MapFocus({ node }: { node: TrafficNode | null }) {
  const map = useMap();

  useEffect(() => {
    if (!node) return;
    map.flyTo([node.lat, node.lng], 11, { duration: 0.8 });
  }, [map, node]);

  return null;
}

export function LiveMap() {
  const [payload, setPayload] = useState<MapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const fetchMapData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/visual/map');
      const data = await response.json();
      setPayload({
        ...data,
        nodes: data.nodes.map((node: any) => ({
          ...node,
          lat: Number(node.lat),
          lng: Number(node.lng),
          flow: Number(node.flow),
          speed: node.speed != null ? Number(node.speed) : undefined,
          occupancy: node.occupancy != null ? Number(node.occupancy) : undefined
        }))
      });
    } catch (error) {
      console.error('Failed to fetch map data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMapData();
    const interval = window.setInterval(fetchMapData, 60000);
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
    if (!payload?.nodes?.length) return [39.9042, 116.4074];
    const firstNode = payload.nodes[0];
    return [firstNode.lat, firstNode.lng];
  }, [payload?.nodes]);

  const isDarkMode = document.documentElement.classList.contains('dark');
  const selectedNode = payload?.nodes.find((node) => node.id === selectedNodeId) ?? null;

  const getMarkerColor = (flow: number) => {
    if (flow < 80) return '#10b981';
    if (flow < 130) return '#f59e0b';
    return '#ef4444';
  };

  if (loading && !payload) {
    return (
      <div className="h-[600px] rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 flex items-center justify-center transition-colors duration-300">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm text-gray-500 dark:text-zinc-400 font-mono">加载地图数据中...</span>
        </div>
      </div>
    );
  }

  const nodes = payload?.nodes ?? [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-zinc-100">实时路网交通状态</h2>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
            当前数据源：{payload?.source ?? '未知'} · 监控站点 {payload?.summary.stationCount ?? 0} 个 · 平均流量 {payload?.summary.avgFlow ?? 0} 辆/小时
          </p>
          {payload?.lastUpdated && (
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">最近更新时间：{new Date(payload.lastUpdated).toLocaleString('zh-CN')}</p>
          )}
          {payload?.importGuide && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">{payload.importGuide}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedNodeId ?? ''}
            onChange={(event) => setSelectedNodeId(event.target.value || null)}
            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm"
          >
            <option value="">聚焦全部站点</option>
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.name}
              </option>
            ))}
          </select>
          <button
            onClick={fetchMapData}
            className="px-3 py-2 rounded-lg bg-emerald-500 text-white text-sm hover:bg-emerald-600 transition-colors"
          >
            刷新地图
          </button>
        </div>
      </div>

      <div className="flex gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
          <span className="text-gray-600 dark:text-zinc-400">畅通 (&lt;80)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-amber-500"></div>
          <span className="text-gray-600 dark:text-zinc-400">拥挤 (80-130)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <span className="text-gray-600 dark:text-zinc-400">拥堵 (&gt;130)</span>
        </div>
      </div>

      <div className="h-[640px] rounded-xl overflow-hidden border border-gray-200 dark:border-zinc-800 relative z-0 transition-colors duration-300">
        <MapContainer center={center} zoom={8} style={{ height: '100%', width: '100%', background: isDarkMode ? '#09090b' : '#f9fafb' }}>
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
                color: getMarkerColor(node.flow),
                fillColor: getMarkerColor(node.flow),
                fillOpacity: selectedNodeId && selectedNodeId !== node.id ? 0.25 : 0.7,
                weight: selectedNodeId === node.id ? 4 : 2
              }}
            >
              <Popup className="custom-popup">
                <div className="p-1 min-w-[180px]">
                  <div className="font-medium text-gray-900">{node.name}</div>
                  <div className="text-sm text-gray-600 mt-2">当前流量：<strong className="text-gray-900">{node.flow} 辆/小时</strong></div>
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

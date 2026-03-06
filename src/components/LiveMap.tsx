import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for Leaflet icons in React
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow
});
L.Marker.prototype.options.icon = DefaultIcon;

interface TrafficNode {
  id: string;
  lat: number;
  lng: number;
  flow: number;
  name: string;
}

export function LiveMap() {
  const [nodes, setNodes] = useState<TrafficNode[]>([]);
  const [loading, setLoading] = useState(true);

  // Center of the map (e.g., Beijing or a specific city center)
  const center: [number, number] = [39.9042, 116.4074];

  useEffect(() => {
    // Fetch mock map data from our Express backend
    fetch('/api/visual/map')
      .then(res => res.json())
      .then(data => {
        // Enhance mock data with names for the UI
        const enhancedNodes = data.nodes.map((n: any, i: number) => ({
          ...n,
          name: `路口 ${n.id}`,
          // Add some random variation to flow for demo purposes if it's static
          flow: n.flow + Math.floor(Math.random() * 50) 
        }));
        setNodes(enhancedNodes);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch map data:", err);
        setLoading(false);
      });
  }, []);

  // Function to determine marker color based on traffic flow
  const getMarkerColor = (flow: number) => {
    if (flow < 80) return '#10b981'; // Green (Light traffic)
    if (flow < 130) return '#f59e0b'; // Orange (Moderate traffic)
    return '#ef4444'; // Red (Heavy traffic)
  };

  if (loading) {
    return (
      <div className="h-[600px] rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 flex items-center justify-center transition-colors duration-300">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm text-gray-500 dark:text-zinc-400 font-mono">加载地图数据中...</span>
        </div>
      </div>
    );
  }

  // Check if dark mode is active to switch tile layers
  const isDarkMode = document.documentElement.classList.contains('dark');

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-zinc-100">实时路网交通状态</h2>
          <p className="text-sm text-gray-500 dark:text-zinc-400">正在监控 {nodes.length} 个活跃路口</p>
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
      </div>

      <div className="h-[600px] rounded-xl overflow-hidden border border-gray-200 dark:border-zinc-800 relative z-0 transition-colors duration-300">
        <MapContainer 
          center={center} 
          zoom={13} 
          style={{ height: '100%', width: '100%', background: isDarkMode ? '#09090b' : '#f9fafb' }}
        >
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
              radius={node.flow / 10} // Size based on flow
              pathOptions={{
                color: getMarkerColor(node.flow),
                fillColor: getMarkerColor(node.flow),
                fillOpacity: 0.6,
                weight: 2
              }}
            >
              <Popup className="custom-popup">
                <div className="p-1">
                  <div className="font-medium text-gray-900">{node.name}</div>
                  <div className="text-sm text-gray-600 mt-1">
                    当前流量: <strong className="text-gray-900">{node.flow} 辆/小时</strong>
                  </div>
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

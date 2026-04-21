export interface IntersectionDefinition {
  id: string;
  name: string;
  lat: number;
  lng: number;
  seedFlow: number;
}

export const SYSTEM_INTERSECTIONS: IntersectionDefinition[] = [
  { id: 'A1', name: '成都天府大道-锦城大道路口', lat: 30.5702, lng: 104.0743, seedFlow: 168 },
  { id: 'B2', name: '成都益州大道-锦城大道路口', lat: 30.5738, lng: 104.0618, seedFlow: 132 },
  { id: 'C3', name: '成都天府大道-府城大道路口', lat: 30.5621, lng: 104.0749, seedFlow: 154 },
  { id: 'D4', name: '成都交子大道-天府大道路口', lat: 30.5784, lng: 104.0726, seedFlow: 126 },
  { id: 'E5', name: '成都剑南大道-锦城大道路口', lat: 30.5739, lng: 104.0468, seedFlow: 118 },
  { id: 'F6', name: '成都天府二街-益州大道路口', lat: 30.5476, lng: 104.0646, seedFlow: 145 },
  { id: 'G7', name: '成都天府三街-天府大道路口', lat: 30.5436, lng: 104.0768, seedFlow: 138 },
  { id: 'H8', name: '成都科华南路-锦尚西二路路口', lat: 30.5654, lng: 104.0835, seedFlow: 112 },
  { id: 'I9', name: '成都中环路火车南站段-科华南路路口', lat: 30.5952, lng: 104.0821, seedFlow: 108 },
  { id: 'J10', name: '成都成都东站西广场-邛崃山路路口', lat: 30.6188, lng: 104.1215, seedFlow: 124 }
];

export const SYSTEM_NODE_IDS = SYSTEM_INTERSECTIONS.map((item) => item.id);
export const PREDICTION_NODE_IDS = [...SYSTEM_NODE_IDS];

const SYSTEM_NODE_SET = new Set<string>(SYSTEM_NODE_IDS);

export function normalizeSystemNodeId(value: unknown) {
  if (typeof value !== 'string') {
    return SYSTEM_NODE_IDS[0];
  }

  const normalized = value.toUpperCase().trim();
  return SYSTEM_NODE_SET.has(normalized) ? normalized : SYSTEM_NODE_IDS[0];
}

export function getIntersectionDefinition(nodeId: string) {
  return SYSTEM_INTERSECTIONS.find((item) => item.id === nodeId) ?? SYSTEM_INTERSECTIONS[0];
}

export function getIntersectionName(nodeId: string) {
  return getIntersectionDefinition(nodeId).name;
}

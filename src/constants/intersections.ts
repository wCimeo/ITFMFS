export interface IntersectionOption {
  id: string;
  name: string;
  modelEnabled: boolean;
}

export const MODEL_NODE_IDS = ['A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7'] as const;

export const SYSTEM_INTERSECTIONS: IntersectionOption[] = [
  { id: 'A1', name: '成都天府大道-锦城大道路口', modelEnabled: true },
  { id: 'B2', name: '成都益州大道-锦城大道路口', modelEnabled: true },
  { id: 'C3', name: '成都天府大道-府城大道路口', modelEnabled: true },
  { id: 'D4', name: '成都交子大道-天府大道路口', modelEnabled: true },
  { id: 'E5', name: '成都剑南大道-锦城大道路口', modelEnabled: true },
  { id: 'F6', name: '成都天府二街-益州大道路口', modelEnabled: true },
  { id: 'G7', name: '成都天府三街-天府大道路口', modelEnabled: true },
  { id: 'H8', name: '成都科华南路-锦尚西二路路口', modelEnabled: false },
  { id: 'I9', name: '成都中环路火车南站段-科华南路路口', modelEnabled: false },
  { id: 'J10', name: '成都成都东站西广场-邛崃山路路口', modelEnabled: false }
];

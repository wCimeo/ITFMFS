export interface IntersectionOption {
  id: string;
  name: string;
}

export const SYSTEM_INTERSECTIONS: IntersectionOption[] = [
  { id: 'A1', name: '成都天府大道-锦城大道路口' },
  { id: 'B2', name: '成都益州大道-锦城大道路口' },
  { id: 'C3', name: '成都天府大道-府城大道路口' },
  { id: 'D4', name: '成都交子大道-天府大道路口' },
  { id: 'E5', name: '成都剑南大道-锦城大道路口' },
  { id: 'F6', name: '成都天府二街-益州大道路口' },
  { id: 'G7', name: '成都天府三街-天府大道路口' },
  { id: 'H8', name: '成都科华南路-锦尚西二路路口' },
  { id: 'I9', name: '成都中环路火车南站段-科华南路路口' },
  { id: 'J10', name: '成都成都东站西广场-邛崃山路路口' }
];

export const PREDICTION_NODE_IDS = SYSTEM_INTERSECTIONS.map((item) => item.id);

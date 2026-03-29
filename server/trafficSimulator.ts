import { pool } from './db.ts';
import { SYSTEM_INTERSECTIONS } from './intersections.ts';

export interface TrafficSimulatorStatus {
  enabled: boolean;
  running: boolean;
  intervalMs: number;
  stepMinutes: number;
  lastGeneratedAt: string | null;
  lastDataTimestamp: string | null;
  lastMessage: string;
}

interface PreviousNodeSnapshot {
  flow: number;
  speed: number | null;
  occupancy: number | null;
}

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_STEP_MINUTES = 15;
const STALE_WINDOW_MULTIPLIER = 2;

const intervalMs = normalizePositiveInt(process.env.TRAFFIC_SIMULATOR_INTERVAL_MS, DEFAULT_INTERVAL_MS);
const stepMinutes = normalizePositiveInt(process.env.TRAFFIC_SIMULATOR_STEP_MINUTES, DEFAULT_STEP_MINUTES);
const enabled = (process.env.ENABLE_TRAFFIC_SIMULATOR ?? 'true').toLowerCase() !== 'false';

let timer: NodeJS.Timeout | null = null;
let tickInProgress = false;

const status: TrafficSimulatorStatus = {
  enabled,
  running: false,
  intervalMs,
  stepMinutes,
  lastGeneratedAt: null,
  lastDataTimestamp: null,
  lastMessage: enabled ? 'Waiting for first auto write.' : 'Auto update disabled.'
};

function normalizePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function addMinutes(date: Date, minutes: number) {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes, 0, 0);
  return next;
}

function floorToStep(date: Date, minutes: number) {
  const next = new Date(date);
  next.setSeconds(0, 0);
  const currentMinutes = next.getMinutes();
  next.setMinutes(currentMinutes - (currentMinutes % minutes));
  return next;
}

function computeDemandFactor(date: Date) {
  const hour = date.getHours() + date.getMinutes() / 60;
  const morningPeak = Math.exp(-Math.pow((hour - 8.2) / 1.35, 2)) * 0.68;
  const middayPeak = Math.exp(-Math.pow((hour - 13) / 1.6, 2)) * 0.24;
  const eveningPeak = Math.exp(-Math.pow((hour - 18.1) / 1.45, 2)) * 0.82;
  const overnightDrop = Math.exp(-Math.pow((hour - 3) / 2.5, 2)) * 0.45;
  return Math.max(0.52, 1 + morningPeak + middayPeak + eveningPeak - overnightDrop);
}

function deterministicNoise(timestampMs: number, index: number) {
  const raw = Math.sin(timestampMs / 60000 / 3.2 + index * 7.13) * 10000;
  const fractional = raw - Math.floor(raw);
  return fractional * 2 - 1;
}

async function getLatestSnapshot() {
  const [timeRows] = await pool.query<any[]>('SELECT MAX(timestamp) AS last_time FROM traffic_flow');
  const lastTimeValue = timeRows[0]?.last_time;
  if (!lastTimeValue) {
    return { lastTime: null as Date | null, previousByNode: new Map<string, PreviousNodeSnapshot>() };
  }

  const lastTime = new Date(lastTimeValue);
  const [rows] = await pool.query<any[]>('SELECT node_id, flow, speed, occupancy FROM traffic_flow WHERE timestamp = ?', [lastTime]);

  const previousByNode = new Map<string, PreviousNodeSnapshot>();
  for (const row of rows) {
    previousByNode.set(String(row.node_id), {
      flow: Number(row.flow ?? 0),
      speed: row.speed == null ? null : Number(row.speed),
      occupancy: row.occupancy == null ? null : Number(row.occupancy)
    });
  }

  return { lastTime, previousByNode };
}

function resolveNextTimestamp(lastTime: Date | null) {
  const nowFloor = floorToStep(new Date(), stepMinutes);
  if (!lastTime) {
    return nowFloor;
  }

  const deltaMs = nowFloor.getTime() - lastTime.getTime();
  const staleThresholdMs = stepMinutes * 60 * 1000 * STALE_WINDOW_MULTIPLIER;
  if (deltaMs > staleThresholdMs) {
    return nowFloor > lastTime ? nowFloor : addMinutes(lastTime, stepMinutes);
  }

  return addMinutes(lastTime, stepMinutes);
}

function buildSyntheticRow(nodeIndex: number, timestamp: Date, previous: PreviousNodeSnapshot | undefined) {
  const intersection = SYSTEM_INTERSECTIONS[nodeIndex];
  const demandFactor = computeDemandFactor(timestamp);
  const noise = deterministicNoise(timestamp.getTime(), nodeIndex);
  const expectedFlow = intersection.seedFlow * demandFactor * (intersection.modelEnabled ? 1.04 : 0.97);
  const previousFlow = previous?.flow ?? intersection.seedFlow;
  const flow = Math.round(clamp(previousFlow * 0.58 + expectedFlow * 0.42 + noise * 14, 30, 420));
  const speed = Number(clamp(62 - flow * 0.12 + noise * 2.5, 18, 72).toFixed(2));
  const occupancy = Number(clamp(0.07 + flow / 430 + Math.abs(noise) * 0.025, 0.04, 0.95).toFixed(4));

  return [intersection.id, timestamp, flow, speed, occupancy] as const;
}

async function generateNextSlice() {
  const { lastTime, previousByNode } = await getLatestSnapshot();
  const nextTimestamp = resolveNextTimestamp(lastTime);
  const rows = SYSTEM_INTERSECTIONS.map((intersection, index) => buildSyntheticRow(index, nextTimestamp, previousByNode.get(intersection.id)));

  await pool.query('INSERT INTO traffic_flow (node_id, timestamp, flow, speed, occupancy) VALUES ?', [rows]);

  status.lastGeneratedAt = new Date().toISOString();
  status.lastDataTimestamp = nextTimestamp.toISOString();
  status.lastMessage = 'Appended ' + rows.length + ' traffic_flow rows, advanced simulated time to ' + nextTimestamp.toISOString();
}

async function runTick() {
  if (!enabled || tickInProgress) {
    return;
  }

  tickInProgress = true;
  try {
    await generateNextSlice();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    status.lastMessage = 'Auto update failed: ' + message;
    console.error('[traffic-simulator] failed to append traffic_flow rows:', error);
  } finally {
    tickInProgress = false;
  }
}

export async function startTrafficFlowSimulator() {
  if (!enabled) {
    status.running = false;
    return getTrafficFlowSimulatorStatus();
  }

  if (timer) {
    status.running = true;
    return getTrafficFlowSimulatorStatus();
  }

  await runTick();
  timer = setInterval(() => {
    void runTick();
  }, intervalMs);
  status.running = true;
  console.log('[traffic-simulator] enabled, interval=' + intervalMs + 'ms, step=' + stepMinutes + 'min');
  return getTrafficFlowSimulatorStatus();
}

export function getTrafficFlowSimulatorStatus(): TrafficSimulatorStatus {
  return {
    ...status,
    running: Boolean(timer) && enabled
  };
}

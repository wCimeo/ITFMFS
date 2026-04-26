import { pool } from './db.ts';
import { SYSTEM_INTERSECTIONS } from './intersections.ts';

export interface TrafficSimulatorStatus {
  enabled: boolean;
  running: boolean;
  intervalMs: number;
  stepMinutes: number;
  retentionSteps: number;
  bootstrapSteps: number;
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
const DEFAULT_RETENTION_STEPS = 288;
const DEFAULT_BOOTSTRAP_STEPS = 12;
const STALE_WINDOW_MULTIPLIER = 2;

const intervalMs = normalizePositiveInt(process.env.TRAFFIC_SIMULATOR_INTERVAL_MS, DEFAULT_INTERVAL_MS);
const stepMinutes = normalizePositiveInt(process.env.TRAFFIC_SIMULATOR_STEP_MINUTES, DEFAULT_STEP_MINUTES);
const retentionSteps = Math.max(DEFAULT_BOOTSTRAP_STEPS, normalizePositiveInt(process.env.TRAFFIC_SIMULATOR_RETENTION_STEPS, DEFAULT_RETENTION_STEPS));
const bootstrapSteps = Math.max(DEFAULT_BOOTSTRAP_STEPS, Math.min(retentionSteps, normalizePositiveInt(process.env.TRAFFIC_SIMULATOR_BOOTSTRAP_STEPS, DEFAULT_BOOTSTRAP_STEPS)));
const enabled = (process.env.ENABLE_TRAFFIC_SIMULATOR ?? 'true').toLowerCase() !== 'false';

let timer: NodeJS.Timeout | null = null;
let tickInProgress = false;

const status: TrafficSimulatorStatus = {
  enabled,
  running: false,
  intervalMs,
  stepMinutes,
  retentionSteps,
  bootstrapSteps,
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
  const now = new Date();
  const [timeRows] = await pool.query<any[]>('SELECT MAX(timestamp) AS last_time FROM traffic_flow WHERE timestamp <= ?', [now]);
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

  if (lastTime >= nowFloor) {
    return null;
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
  const corridorFactor = 0.96 + (nodeIndex % 4) * 0.03;
  const expectedFlow = intersection.seedFlow * demandFactor * corridorFactor;
  const previousFlow = previous?.flow ?? intersection.seedFlow;
  const flow = Math.round(clamp(previousFlow * 0.58 + expectedFlow * 0.42 + noise * 14, 30, 420));
  const speed = Number(clamp(62 - flow * 0.12 + noise * 2.5, 18, 72).toFixed(2));
  const occupancy = Number(clamp(0.07 + flow / 430 + Math.abs(noise) * 0.025, 0.04, 0.95).toFixed(4));
  return [intersection.id, timestamp, flow, speed, occupancy] as const;
}

async function pruneTrafficFlow(latestTimestamp: Date) {
  const cutoff = addMinutes(latestTimestamp, -stepMinutes * (retentionSteps - 1));
  await pool.query('DELETE FROM traffic_flow WHERE timestamp < ?', [cutoff]);
}

function applyRowsToSnapshot(rows: ReadonlyArray<readonly [string, Date, number, number, number]>) {
  const nextSnapshot = new Map<string, PreviousNodeSnapshot>();
  for (const row of rows) {
    nextSnapshot.set(row[0], { flow: row[2], speed: row[3], occupancy: row[4] });
  }
  return nextSnapshot;
}

async function bootstrapInitialHistory() {
  const latestTimestamp = floorToStep(new Date(), stepMinutes);
  const firstTimestamp = addMinutes(latestTimestamp, -stepMinutes * (bootstrapSteps - 1));
  const allRows: Array<readonly [string, Date, number, number, number]> = [];
  let previousByNode = new Map<string, PreviousNodeSnapshot>();

  for (let index = 0; index < bootstrapSteps; index += 1) {
    const currentTimestamp = addMinutes(firstTimestamp, stepMinutes * index);
    const rows = SYSTEM_INTERSECTIONS.map((intersection, nodeIndex) =>
      buildSyntheticRow(nodeIndex, currentTimestamp, previousByNode.get(intersection.id))
    );
    rows.forEach((row) => allRows.push(row));
    previousByNode = applyRowsToSnapshot(rows);
  }

  await pool.query('INSERT INTO traffic_flow (node_id, timestamp, flow, speed, occupancy) VALUES ?', [allRows]);
  await pruneTrafficFlow(latestTimestamp);

  status.lastGeneratedAt = new Date().toISOString();
  status.lastDataTimestamp = latestTimestamp.toISOString();
  status.lastMessage = 'Bootstrapped ' + bootstrapSteps + ' time slices for simulator startup.';
}

async function generateNextSlice() {
  const { lastTime, previousByNode } = await getLatestSnapshot();
  if (!lastTime) {
    await bootstrapInitialHistory();
    return;
  }

  const nextTimestamp = resolveNextTimestamp(lastTime);
  if (!nextTimestamp) {
    status.lastGeneratedAt = new Date().toISOString();
    status.lastDataTimestamp = lastTime.toISOString();
    status.lastMessage = 'Current traffic_flow data is already aligned with the latest real-world time window.';
    return;
  }

  const rows = SYSTEM_INTERSECTIONS.map((intersection, index) => buildSyntheticRow(index, nextTimestamp, previousByNode.get(intersection.id)));

  await pool.query('INSERT INTO traffic_flow (node_id, timestamp, flow, speed, occupancy) VALUES ?', [rows]);
  await pruneTrafficFlow(nextTimestamp);

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
  console.log(
    '[traffic-simulator] started: interval=' +
      intervalMs +
      'ms, step=' +
      stepMinutes +
      'min, retention=' +
      retentionSteps +
      ' steps'
  );
  return getTrafficFlowSimulatorStatus();
}

export function getTrafficFlowSimulatorStatus(): TrafficSimulatorStatus {
  return {
    ...status,
    running: Boolean(timer) && enabled
  };
}

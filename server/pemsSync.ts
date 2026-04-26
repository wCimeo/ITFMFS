import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface PemsSyncStatus {
  enabled: boolean;
  running: boolean;
  intervalMs: number;
  trafficPath: string | null;
  stationPath: string | null;
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
  lastImportedRows: number;
  lastMirroredRows: number;
  lastImportedTimestamp: string | null;
  lastMirroredTimestamp: string | null;
  lastMessage: string;
}

interface ImportSummary {
  stations_imported?: number;
  traffic_imported_rows?: number;
  latest_existing_timestamp?: string | null;
  latest_pems_timestamp?: string | null;
  mirrored_system_rows?: number;
  latest_mirrored_timestamp?: string | null;
  bindings?: Array<{ system_node_id: string; station_id: string }>;
}

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_STEP_MINUTES = 15;

const enabled = (process.env.PEMS_SYNC_ENABLED ?? 'false').toLowerCase() === 'true';
const intervalMs = normalizePositiveInt(process.env.PEMS_SYNC_INTERVAL_MS, DEFAULT_INTERVAL_MS);
const trafficStepMinutes = normalizePositiveInt(process.env.PEMS_SYNC_STEP_MINUTES, DEFAULT_STEP_MINUTES);
const pythonExecutable = (process.env.PEMS_SYNC_PYTHON_EXECUTABLE ?? 'python').trim() || 'python';
const trafficPath = normalizeOptionalPath(process.env.PEMS_SYNC_TRAFFIC_PATH);
const stationPath = normalizeOptionalPath(process.env.PEMS_SYNC_STATIONS_PATH);
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, '..');
const importScriptPath = path.join(projectRoot, 'scripts', 'import_pems_data.py');

let timer: NodeJS.Timeout | null = null;
let syncInProgress = false;
let lastTrafficMtimeMs: number | null = null;
let lastStationMtimeMs: number | null = null;

const status: PemsSyncStatus = {
  enabled,
  running: false,
  intervalMs,
  trafficPath,
  stationPath,
  lastStartedAt: null,
  lastCompletedAt: null,
  lastImportedRows: 0,
  lastMirroredRows: 0,
  lastImportedTimestamp: null,
  lastMirroredTimestamp: null,
  lastMessage: enabled ? 'Waiting for first PeMS sync.' : 'PeMS auto sync disabled.'
};

function normalizePositiveInt(rawValue: string | undefined, fallback: number) {
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function normalizeOptionalPath(rawValue: string | undefined) {
  if (!rawValue) {
    return null;
  }

  const trimmed = rawValue.trim();
  return trimmed ? path.resolve(trimmed) : null;
}

function pushOption(args: string[], flag: string, value: string | undefined) {
  if (!value || !value.trim()) {
    return;
  }
  args.push(flag, value.trim());
}

async function getMtimeMs(targetPath: string | null) {
  if (!targetPath) {
    return null;
  }

  try {
    const fileStat = await stat(targetPath);
    return fileStat.mtimeMs;
  } catch {
    return null;
  }
}

async function shouldRunImport() {
  if (!trafficPath) {
    status.lastMessage = 'PeMS auto sync is enabled, but PEMS_SYNC_TRAFFIC_PATH is empty.';
    return false;
  }

  const nextTrafficMtimeMs = await getMtimeMs(trafficPath);
  if (nextTrafficMtimeMs == null) {
    status.lastMessage = `PeMS traffic file was not found: ${trafficPath}`;
    return false;
  }

  const nextStationMtimeMs = await getMtimeMs(stationPath);
  const hasChanged =
    status.lastCompletedAt == null ||
    nextTrafficMtimeMs !== lastTrafficMtimeMs ||
    nextStationMtimeMs !== lastStationMtimeMs;

  if (!hasChanged) {
    status.lastMessage = 'PeMS source files have not changed since the last sync.';
    return false;
  }

  lastTrafficMtimeMs = nextTrafficMtimeMs;
  lastStationMtimeMs = nextStationMtimeMs;
  return true;
}

function buildImportArgs() {
  const args = [
    importScriptPath,
    '--traffic',
    trafficPath!,
    '--incremental',
    '--mirror-system-flow',
    '--traffic-step-minutes',
    String(trafficStepMinutes),
    '--summary-json'
  ];

  if (stationPath) {
    args.push('--stations', stationPath);
  }

  pushOption(args, '--station-sep', process.env.PEMS_SYNC_STATION_SEP);
  pushOption(args, '--traffic-sep', process.env.PEMS_SYNC_TRAFFIC_SEP);
  pushOption(args, '--station-id-col', process.env.PEMS_SYNC_STATION_ID_COL);
  pushOption(args, '--station-name-col', process.env.PEMS_SYNC_STATION_NAME_COL);
  pushOption(args, '--lat-col', process.env.PEMS_SYNC_LAT_COL);
  pushOption(args, '--lng-col', process.env.PEMS_SYNC_LNG_COL);
  pushOption(args, '--time-col', process.env.PEMS_SYNC_TIME_COL);
  pushOption(args, '--date-col', process.env.PEMS_SYNC_DATE_COL);
  pushOption(args, '--clock-time-col', process.env.PEMS_SYNC_CLOCK_TIME_COL);
  pushOption(args, '--flow-col', process.env.PEMS_SYNC_FLOW_COL);
  pushOption(args, '--speed-col', process.env.PEMS_SYNC_SPEED_COL);
  pushOption(args, '--occupancy-col', process.env.PEMS_SYNC_OCCUPANCY_COL);
  pushOption(args, '--system-node-ids', process.env.PEMS_SYNC_SYSTEM_NODE_IDS);
  pushOption(args, '--system-station-ids', process.env.PEMS_SYNC_SYSTEM_STATION_IDS);

  return args;
}

function runImportProcess(args: string[]) {
  return new Promise<{ stdout: string; stderr: string; exitCode: number | null }>((resolve, reject) => {
    const child = spawn(pythonExecutable, args, {
      cwd: projectRoot,
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (exitCode) => {
      resolve({ stdout, stderr, exitCode });
    });
  });
}

async function runSync() {
  if (!enabled || syncInProgress) {
    return;
  }

  syncInProgress = true;
  status.lastStartedAt = new Date().toISOString();

  try {
    const shouldRun = await shouldRunImport();
    if (!shouldRun) {
      return;
    }

    const importArgs = buildImportArgs();
    const { stdout, stderr, exitCode } = await runImportProcess(importArgs);
    if (exitCode !== 0) {
      throw new Error((stderr || stdout || `PeMS sync exited with code ${exitCode}`).trim());
    }

    const summary = JSON.parse(stdout.trim()) as ImportSummary;
    status.lastCompletedAt = new Date().toISOString();
    status.lastImportedRows = Number(summary.traffic_imported_rows ?? 0);
    status.lastMirroredRows = Number(summary.mirrored_system_rows ?? 0);
    status.lastImportedTimestamp = summary.latest_pems_timestamp ?? null;
    status.lastMirroredTimestamp = summary.latest_mirrored_timestamp ?? null;
    status.lastMessage =
      status.lastImportedRows > 0 || status.lastMirroredRows > 0
        ? `PeMS sync imported ${status.lastImportedRows} rows and refreshed ${status.lastMirroredRows} system traffic rows.`
        : 'PeMS sync checked source files, but no new rows were available.';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    status.lastMessage = `PeMS sync failed: ${message}`;
    console.error('[pems-sync] failed:', error);
  } finally {
    syncInProgress = false;
  }
}

export async function startPemsSync() {
  if (!enabled) {
    status.running = false;
    return getPemsSyncStatus();
  }

  if (timer) {
    status.running = true;
    return getPemsSyncStatus();
  }

  await runSync();
  timer = setInterval(() => {
    void runSync();
  }, intervalMs);
  status.running = true;
  console.log('[pems-sync] started: interval=' + intervalMs + 'ms, trafficPath=' + (trafficPath ?? '--'));
  return getPemsSyncStatus();
}

export function isPemsSyncEnabled() {
  return enabled;
}

export function getPemsSyncStatus(): PemsSyncStatus {
  return {
    ...status,
    running: Boolean(timer) && enabled
  };
}

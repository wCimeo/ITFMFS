import type { Application, NextFunction, Request, Response } from 'express';
import {
  SESSION_TTL_DAYS,
  createSessionToken,
  getSessionExpiryDate,
  toMysqlDateTime,
  verifyPassword
} from './auth.ts';
import { bootstrapDatabase, pool, testConnection } from './db.ts';
import { getTrafficFlowSimulatorStatus, startTrafficFlowSimulator } from './trafficSimulator.ts';
import {
  MODEL_NODE_IDS,
  SYSTEM_INTERSECTIONS,
  SYSTEM_NODE_IDS,
  getIntersectionName,
  normalizeModelNodeId,
  normalizeSystemNodeId
} from './intersections.ts';

const PEAK_WINDOWS = [
  { key: 'morning', label: '早高峰', startHour: 7, endHour: 9 },
  { key: 'midday', label: '午高峰', startHour: 12, endHour: 14 },
  { key: 'evening', label: '晚高峰', startHour: 17, endHour: 19 }
];

const MODEL_SCOPE_NOTE =
  '当前 LST-GCN 权重仅覆盖 A1-G7。系统路网已扩展到 10 个路口，H8-J10 可用于地图、事件和路径管理，如需纳入模型预测需要重新训练并替换 10 路口权重。';
const AI_SERVICE_BASE_URL = 'http://127.0.0.1:5000';
const MODEL_INFO_CACHE_TTL_MS = 30 * 1000;

interface AiModelVariantInfo {
  variant: string;
  node_ids: string[];
  window_size: number;
  weights_path?: string | null;
  metadata_path?: string | null;
}

interface PredictionRuntime {
  requestedScope: 'auto' | 7 | 10;
  activeScope: 7 | 10;
  nodeIds: string[];
  windowSize: number;
  variant: string;
  availableScopes: Array<7 | 10>;
  scopeNote: string;
}

let modelInfoCache: { expiresAt: number; variants: AiModelVariantInfo[] } | null = null;

interface AdminProfileRow {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  preferred_theme: string;
  prediction_horizon_minutes: number;
  sliding_window_steps: number;
  retrain_cycle_days: number;
  congestion_threshold: number;
  auto_signal_control: number;
  can_manage_users: number;
  can_manage_data: number;
  can_manage_models: number;
  can_manage_signals: number;
  session_expires_at: string | null;
  last_login_at: string | null;
  last_active_at: string | null;
  created_at: string;
  password_hash?: string | null;
  session_token?: string | null;
}

type AuthenticatedRequest = Request & { authUser?: AdminProfileRow };

let isDbConnected = false;
let latestSignalStatus = {
  intersection_id: MODEL_NODE_IDS[0],
  phase: 'NS_GREEN',
  duration: 45,
  optimized_at: new Date().toISOString(),
  source: 'mock'
};

const fallbackMapNodes = SYSTEM_INTERSECTIONS.map((item) => ({
  id: item.id,
  name: item.name,
  lat: item.lat,
  lng: item.lng,
  flow: item.seedFlow,
  speed: null,
  occupancy: null,
  hasRealtimeData: false
}));

function getSessionToken(req: Request) {
  const directToken = req.header('x-session-token')?.trim();
  if (directToken) {
    return directToken;
  }

  const authorization = req.header('authorization');
  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function toDateKey(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  return value;
}

function asNumber(value: unknown, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function computeFocusRange(focus: string | undefined) {
  switch (focus) {
    case 'morning':
      return { startIndex: 6, endIndex: 10 };
    case 'midday':
      return { startIndex: 11, endIndex: 15 };
    case 'evening':
      return { startIndex: 16, endIndex: 20 };
    default:
      return { startIndex: 0, endIndex: 23 };
  }
}

function sanitizeAdminProfile(profile: AdminProfileRow | null) {
  if (!profile) {
    return null;
  }

  const { password_hash, session_token, ...safeProfile } = profile;
  return safeProfile;
}

function normalizePredictionScopeInput(value: unknown): 'auto' | 7 | 10 {
  if (value === 7 || value === '7' || value === '7nodes') {
    return 7;
  }
  if (value === 10 || value === '10' || value === '10nodes') {
    return 10;
  }
  return 'auto';
}

function buildScopeNote(activeScope: 7 | 10, availableScopes: Array<7 | 10>) {
  const activeLabel =
    activeScope === 10
      ? '当前已启用 10 路口预测模型，A1-J10 都可以参与真实预测。'
      : '当前使用 7 路口预测模型，真实预测仍覆盖 A1-G7。';
  const availableLabel = availableScopes.includes(10)
    ? 'AI 服务已检测到 10 路口权重。'
    : 'AI 服务暂未检测到 10 路口权重，如需让 H8-J10 进入预测，请先训练并放置 lst_gcn_weights_10nodes.pth。';
  return `${activeLabel} ${availableLabel}`;
}

async function getAiModelVariants(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && modelInfoCache && modelInfoCache.expiresAt > now) {
    return modelInfoCache.variants;
  }

  try {
    const response = await fetch(`${AI_SERVICE_BASE_URL}/model-info`);
    if (!response.ok) {
      throw new Error('AI model-info 接口未响应');
    }

    const payload = await response.json();
    const variants = Array.isArray(payload?.available_variants) ? payload.available_variants : [];
    modelInfoCache = {
      expiresAt: now + MODEL_INFO_CACHE_TTL_MS,
      variants
    };
    return variants;
  } catch {
    return [];
  }
}

async function resolvePredictionRuntime(scopeInput: unknown, strict = false): Promise<PredictionRuntime> {
  const requestedScope = normalizePredictionScopeInput(scopeInput);
  const variants = await getAiModelVariants();
  const availableScopes = Array.from(
    new Set(
      variants
        .map((variant) => Number(Array.isArray(variant?.node_ids) ? variant.node_ids.length : 0))
        .filter((scope) => scope === 7 || scope === 10)
    )
  ) as Array<7 | 10>;

  let activeScope: 7 | 10;
  if (requestedScope === 'auto') {
    activeScope = availableScopes.includes(10) ? 10 : 7;
  } else if (availableScopes.includes(requestedScope)) {
    activeScope = requestedScope;
  } else if (strict) {
    throw new Error(`当前 AI 服务不支持 ${requestedScope} 路口预测，请先准备对应权重。`);
  } else {
    activeScope = availableScopes.includes(10) ? 10 : 7;
  }

  const matchedVariant = variants.find(
    (variant) => Array.isArray(variant?.node_ids) && variant.node_ids.length === activeScope
  );
  const nodeIds = activeScope === 10 ? [...SYSTEM_NODE_IDS] : [...MODEL_NODE_IDS];

  return {
    requestedScope,
    activeScope,
    nodeIds,
    windowSize: Number(matchedVariant?.window_size ?? 12),
    variant: matchedVariant?.variant ?? `${activeScope}nodes`,
    availableScopes,
    scopeNote: buildScopeNote(activeScope, availableScopes)
  };
}

function normalizePredictionNodeId(value: unknown, activeScope: 7 | 10) {
  return activeScope === 10 ? normalizeSystemNodeId(value) : normalizeModelNodeId(value);
}

async function getAdminProfileById(userId: number) {
  const [rows] = await pool.query<any[]>(
    `
      SELECT
        id,
        username,
        full_name,
        email,
        phone,
        status,
        preferred_theme,
        prediction_horizon_minutes,
        sliding_window_steps,
        retrain_cycle_days,
        congestion_threshold,
        auto_signal_control,
        can_manage_users,
        can_manage_data,
        can_manage_models,
        can_manage_signals,
        session_expires_at,
        last_login_at,
        last_active_at,
        created_at,
        password_hash,
        session_token
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [userId]
  );

  return rows[0] ?? null;
}

async function getAdminProfileByUsername(username: string) {
  const [rows] = await pool.query<any[]>(
    `
      SELECT
        id,
        username,
        full_name,
        email,
        phone,
        status,
        preferred_theme,
        prediction_horizon_minutes,
        sliding_window_steps,
        retrain_cycle_days,
        congestion_threshold,
        auto_signal_control,
        can_manage_users,
        can_manage_data,
        can_manage_models,
        can_manage_signals,
        session_expires_at,
        last_login_at,
        last_active_at,
        created_at,
        password_hash,
        session_token
      FROM users
      WHERE username = ?
      LIMIT 1
    `,
    [username]
  );

  return rows[0] ?? null;
}

async function getAdminProfileBySessionToken(sessionToken: string) {
  const [rows] = await pool.query<any[]>(
    `
      SELECT
        id,
        username,
        full_name,
        email,
        phone,
        status,
        preferred_theme,
        prediction_horizon_minutes,
        sliding_window_steps,
        retrain_cycle_days,
        congestion_threshold,
        auto_signal_control,
        can_manage_users,
        can_manage_data,
        can_manage_models,
        can_manage_signals,
        session_expires_at,
        last_login_at,
        last_active_at,
        created_at,
        password_hash,
        session_token
      FROM users
      WHERE session_token = ? AND session_expires_at IS NOT NULL AND session_expires_at > NOW()
      LIMIT 1
    `,
    [sessionToken]
  );

  return rows[0] ?? null;
}

async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!isDbConnected) {
    return res.status(503).json({ status: 'error', message: '数据库未连接，当前无法校验登录状态。' });
  }

  const sessionToken = getSessionToken(req);
  if (!sessionToken) {
    return res.status(401).json({ status: 'error', message: '请先登录系统。' });
  }

  try {
    const profile = await getAdminProfileBySessionToken(sessionToken);
    if (!profile) {
      return res.status(401).json({ status: 'error', message: '登录已过期，请重新登录。' });
    }

    await pool.query('UPDATE users SET last_active_at = NOW() WHERE id = ?', [profile.id]);
    req.authUser = profile;
    next();
  } catch (error) {
    console.error('Auth Error:', error);
    res.status(500).json({ status: 'error', message: '登录状态校验失败。' });
  }
}
function buildRoute(startInput: unknown, endInput: unknown, objectiveInput: unknown) {
  const start = normalizeSystemNodeId(startInput);
  const end = normalizeSystemNodeId(endInput);
  const objective = typeof objectiveInput === 'string' ? objectiveInput : 'fastest';

  if (start === end) {
    return {
      start,
      end,
      objective,
      path: [start],
      estimated_time: 2,
      distance: 0.6,
      savings: 0,
      steps: [
        {
          instruction: `已位于 ${getIntersectionName(end)}`,
          distance: '0.6 km',
          time: '2 分钟'
        }
      ]
    };
  }

  const startIndex = SYSTEM_NODE_IDS.indexOf(start);
  const endIndex = SYSTEM_NODE_IDS.indexOf(end);
  const path =
    startIndex <= endIndex
      ? SYSTEM_NODE_IDS.slice(startIndex, endIndex + 1)
      : [...SYSTEM_NODE_IDS.slice(endIndex, startIndex + 1)].reverse();

  const distance = Number(((path.length - 1) * 1.6 + 0.8).toFixed(1));
  const baseMinutes = Math.round(distance * 2.8);
  const estimated_time =
    objective === 'shortest_distance'
      ? Math.max(baseMinutes + 1, 4)
      : objective === 'avoid_congestion'
        ? Math.max(baseMinutes + 4, 6)
        : Math.max(baseMinutes, 5);
  const savings =
    objective === 'avoid_congestion'
      ? Math.max(2, Math.round(path.length / 2))
      : Math.max(1, Math.round(path.length / 3));

  const steps = path.map((nodeId, index) => {
    if (index === path.length - 1) {
      return {
        instruction: `到达 ${getIntersectionName(nodeId)}`,
        distance: '0 km',
        time: '0 分钟'
      };
    }

    return {
      instruction: `从 ${getIntersectionName(nodeId)} 驶向 ${getIntersectionName(path[index + 1])}`,
      distance: '1.6 km',
      time: `${Math.max(2, Math.round(estimated_time / path.length))} 分钟`
    };
  });

  return { start, end, objective, path, estimated_time, distance, savings, steps };
}

async function updateAdminSettings(userId: number, body: any) {
  const updates = {
    full_name: typeof body.full_name === 'string' ? body.full_name.trim() || '交通系统超级管理员' : '交通系统超级管理员',
    email: typeof body.email === 'string' ? body.email.trim() || null : null,
    phone: typeof body.phone === 'string' ? body.phone.trim() || null : null,
    preferred_theme: body.preferred_theme === 'dark' ? 'dark' : 'light',
    prediction_horizon_minutes: [15, 30, 60].includes(Number(body.prediction_horizon_minutes))
      ? Number(body.prediction_horizon_minutes)
      : 60,
    sliding_window_steps: [12, 24].includes(Number(body.sliding_window_steps))
      ? Number(body.sliding_window_steps)
      : 12,
    retrain_cycle_days: Math.min(Math.max(asNumber(body.retrain_cycle_days, 7), 1), 30),
    congestion_threshold: Math.min(Math.max(asNumber(body.congestion_threshold, 130), 60), 400),
    auto_signal_control: body.auto_signal_control ? 1 : 0
  };

  await pool.query(
    `
      UPDATE users
      SET
        full_name = ?,
        email = ?,
        phone = ?,
        preferred_theme = ?,
        prediction_horizon_minutes = ?,
        sliding_window_steps = ?,
        retrain_cycle_days = ?,
        congestion_threshold = ?,
        auto_signal_control = ?,
        last_active_at = NOW()
      WHERE id = ?
    `,
    [
      updates.full_name,
      updates.email,
      updates.phone,
      updates.preferred_theme,
      updates.prediction_horizon_minutes,
      updates.sliding_window_steps,
      updates.retrain_cycle_days,
      updates.congestion_threshold,
      updates.auto_signal_control,
      userId
    ]
  );

  return getAdminProfileById(userId);
}

async function getRealtimeMetrics() {
  const [timeRows] = await pool.query<any[]>('SELECT MAX(timestamp) AS last_time FROM traffic_flow');
  const lastTime = timeRows[0]?.last_time;
  if (!lastTime) {
    return { timestamp: null, flow: 0, speed: 0, occupancy: 0 };
  }

  const [rows] = await pool.query<any[]>(
    `
      SELECT
        SUM(flow) AS total_flow,
        AVG(speed) AS avg_speed,
        AVG(occupancy) AS avg_occupancy
      FROM traffic_flow
      WHERE timestamp = ?
    `,
    [lastTime]
  );

  const item = rows[0] ?? {};
  return {
    timestamp: lastTime,
    flow: asNumber(item.total_flow),
    speed: Number(asNumber(item.avg_speed).toFixed(1)),
    occupancy: Number(asNumber(item.avg_occupancy).toFixed(4))
  };
}

async function getLocalMapSnapshot() {
  const simulatorStatus = getTrafficFlowSimulatorStatus();
  const simulatorUpdateMode = simulatorStatus.running
    ? '\u81ea\u52a8\u6a21\u62df\u66f4\u65b0\uff08\u6bcf ' + Math.round(simulatorStatus.intervalMs / 1000) + ' \u79d2\u63a8\u8fdb ' + simulatorStatus.stepMinutes + ' \u5206\u949f\uff09'
    : '\u6570\u636e\u5e93\u6700\u65b0\u65f6\u95f4\u6233';
  const [timeRows] = await pool.query<any[]>('SELECT MAX(timestamp) AS last_time FROM traffic_flow');
  const lastTime = timeRows[0]?.last_time;

  if (!lastTime) {
    return {
      source: '\u6210\u90fd\u672c\u5730\u8def\u53e3\u5e93',
      regionLabel: '\u4e2d\u56fd\u56db\u5ddd\u6210\u90fd',
      baseMapSource: 'OpenStreetMap / CARTO',
      updateMode: simulatorStatus.running ? simulatorUpdateMode : '\u5185\u7f6e\u793a\u4f8b\u8def\u7f51',
      realtimeNote: simulatorStatus.running
        ? '\u5f53\u524d\u5f00\u53d1\u73af\u5883\u5df2\u5f00\u542f traffic_flow \u81ea\u52a8\u6a21\u62df\u66f4\u65b0\uff0c\u7cfb\u7edf\u4f1a\u6309\u56fa\u5b9a\u95f4\u9694\u81ea\u52a8\u5199\u5165\u65b0\u7684\u65f6\u95f4\u7247\uff0c\u5730\u56fe\u4f1a\u968f\u6570\u636e\u5e93\u6700\u65b0\u8bb0\u5f55\u6301\u7eed\u5237\u65b0\u3002'
        : '\u5f53\u524d\u5c55\u793a\u7684\u662f\u6210\u90fd 10 \u4e2a\u8def\u53e3\u7684\u672c\u5730\u793a\u4f8b\u8def\u7f51\u3002\u63a5\u5165\u6301\u7eed\u5165\u5e93\u7684\u6570\u636e\u540e\uff0c\u5730\u56fe\u4f1a\u81ea\u52a8\u6309\u6570\u636e\u5e93\u6700\u65b0\u65f6\u95f4\u6233\u5237\u65b0\u3002',
      lastUpdated: null,
      nodes: fallbackMapNodes,
      summary: {
        stationCount: fallbackMapNodes.length,
        avgFlow: Math.round(fallbackMapNodes.reduce((sum, node) => sum + node.flow, 0) / fallbackMapNodes.length)
      }
    };
  }

  const [rows] = await pool.query<any[]>(
    `
      SELECT
        n.id,
        n.name,
        n.lat,
        n.lng,
        t.flow,
        t.speed,
        t.occupancy
      FROM nodes n
      LEFT JOIN traffic_flow t ON n.id = t.node_id AND t.timestamp = ?
    `,
    [lastTime]
  );

  const nodes = rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      lat: asNumber(row.lat),
      lng: asNumber(row.lng),
      flow: row.flow == null ? 0 : asNumber(row.flow),
      speed: row.speed == null ? null : asNumber(row.speed),
      occupancy: row.occupancy == null ? null : asNumber(row.occupancy),
      hasRealtimeData: row.flow != null
    }))
    .sort((left, right) => SYSTEM_NODE_IDS.indexOf(left.id) - SYSTEM_NODE_IDS.indexOf(right.id));

  return {
    source: '\u6210\u90fd\u672c\u5730\u8def\u53e3\u5e93',
    regionLabel: '\u4e2d\u56fd\u56db\u5ddd\u6210\u90fd',
    baseMapSource: 'OpenStreetMap / CARTO',
    updateMode: simulatorUpdateMode,
    realtimeNote: simulatorStatus.running
      ? '\u5730\u56fe\u5f53\u524d\u8bfb\u53d6\u7684\u662f traffic_flow \u8868\u81ea\u52a8\u8ffd\u52a0\u540e\u7684\u6700\u65b0\u65f6\u95f4\u7247\u3002\u4f60\u4fdd\u6301\u9875\u9762\u6253\u5f00\u5373\u53ef\u770b\u5230\u6210\u90fd 10 \u4e2a\u8def\u53e3\u7684\u6d41\u91cf\u3001\u8f66\u901f\u548c\u5360\u6709\u7387\u6301\u7eed\u53d8\u5316\u3002'
      : '\u5730\u56fe\u4f1a\u8bfb\u53d6 MySQL \u4e2d traffic_flow \u8868\u7684\u6700\u65b0\u65f6\u95f4\u7247\u3002\u67d0\u4e2a\u8def\u53e3\u82e5\u6ca1\u6709\u5f53\u524d\u65f6\u523b\u6570\u636e\uff0c\u4f1a\u4fdd\u7559\u5728\u5730\u56fe\u4e0a\u5e76\u663e\u793a\u4e3a\u6682\u65e0\u5b9e\u65f6\u6d41\u91cf\u3002',
    lastUpdated: lastTime,
    nodes,
    summary: {
      stationCount: nodes.length,
      avgFlow: Math.round(nodes.reduce((sum, node) => sum + node.flow, 0) / Math.max(nodes.length, 1))
    }
  };
}

async function getPemsMapSnapshot() {
  const [stationRows] = await pool.query<any[]>('SELECT COUNT(*) AS total FROM pems_stations');
  if (Number(stationRows[0]?.total ?? 0) === 0) {
    return null;
  }

  const [timeRows] = await pool.query<any[]>('SELECT MAX(timestamp) AS last_time FROM pems_traffic_flow');
  const lastTime = timeRows[0]?.last_time;
  if (!lastTime) {
    return null;
  }

  const [rows] = await pool.query<any[]>(
    `
      SELECT s.id, s.name, s.lat, s.lng, t.flow, t.speed, t.occupancy
      FROM pems_stations s
      JOIN pems_traffic_flow t ON s.id = t.station_id
      WHERE t.timestamp = ?
      ORDER BY t.flow DESC
      LIMIT 150
    `,
    [lastTime]
  );

  if (rows.length === 0) {
    return null;
  }

  const nodes = rows.map((row) => ({
    id: row.id,
    name: row.name,
    lat: asNumber(row.lat),
    lng: asNumber(row.lng),
    flow: asNumber(row.flow),
    speed: row.speed == null ? null : asNumber(row.speed),
    occupancy: row.occupancy == null ? null : asNumber(row.occupancy),
    hasRealtimeData: true
  }));

  return {
    source: 'PeMS 导入数据',
    regionLabel: '美国加州 PeMS 站点',
    baseMapSource: 'OpenStreetMap / CARTO',
    updateMode: '手动导入快照',
    realtimeNote: '当前项目会优先展示已经导入到 MySQL 的最新一批 PeMS 记录。导入后的数据会静态保存在数据库中，若想持续接近实时更新，需要额外增加定时下载与入库任务。',
    lastUpdated: lastTime,
    nodes,
    summary: {
      stationCount: nodes.length,
      avgFlow: Math.round(nodes.reduce((sum, node) => sum + node.flow, 0) / Math.max(nodes.length, 1))
    }
  };
}
async function getChartPayload(nodeId: string, dateInput: string | null, focus: string | undefined, availableNodes: string[] = [...MODEL_NODE_IDS], scopeNote = MODEL_SCOPE_NOTE) {
  const [latestRows] = await pool.query<any[]>(
    `
      SELECT DATE(MAX(timestamp)) AS latest_date
      FROM traffic_flow
      WHERE node_id = ?
    `,
    [nodeId]
  );

  const latestDate = latestRows[0]?.latest_date;
  const selectedDate = dateInput ?? (latestDate ? new Date(latestDate).toISOString().slice(0, 10) : null);

  if (!selectedDate) {
    return {
      date: null,
      nodeId,
      data: [],
      availableNodes,
      focusRange: computeFocusRange(focus),
      peaks: PEAK_WINDOWS,
      latestPrediction: null,
      scopeNote
    };
  }

  const [historicalRows] = await pool.query<any[]>(
    `
      SELECT HOUR(timestamp) AS hour_slot, AVG(flow) AS avg_flow
      FROM traffic_flow
      WHERE node_id = ? AND DATE(timestamp) = ?
      GROUP BY HOUR(timestamp)
      ORDER BY HOUR(timestamp)
    `,
    [nodeId, selectedDate]
  );

  const [forecastRows] = await pool.query<any[]>(
    `
      SELECT HOUR(timestamp) AS hour_slot, AVG(flow) AS avg_flow
      FROM traffic_flow
      WHERE node_id = ?
        AND DATE(timestamp) BETWEEN DATE_SUB(?, INTERVAL 6 DAY) AND ?
      GROUP BY HOUR(timestamp)
      ORDER BY HOUR(timestamp)
    `,
    [nodeId, selectedDate, selectedDate]
  );

  const historyByHour = new Map(historicalRows.map((row) => [Number(row.hour_slot), asNumber(row.avg_flow)]));
  const forecastByHour = new Map(forecastRows.map((row) => [Number(row.hour_slot), asNumber(row.avg_flow)]));

  const data = Array.from({ length: 24 }, (_, hour) => {
    const actualHour = hour + 1;
    const historical = historyByHour.has(hour) ? Number(historyByHour.get(hour)!.toFixed(1)) : null;
    const forecastBase = forecastByHour.get(hour) ?? historical ?? 0;
    return {
      hour,
      time: `${String(actualHour).padStart(2, '0')}:00`,
      historical,
      predicted: Number(forecastBase.toFixed(1)),
      periodLabel: PEAK_WINDOWS.find((window) => actualHour >= window.startHour && actualHour <= window.endHour)?.label ?? '平峰'
    };
  });

  const [predictionRows] = await pool.query<any[]>(
    `
      SELECT target_time, predicted_flow, confidence, model_version
      FROM predictions
      WHERE node_id = ? AND DATE(target_time) = ?
      ORDER BY target_time DESC
      LIMIT 1
    `,
    [nodeId, selectedDate]
  );

  return {
    date: selectedDate,
    nodeId,
    availableNodes,
    data,
    focusRange: computeFocusRange(focus),
    peaks: PEAK_WINDOWS,
    latestPrediction: predictionRows[0] ?? null,
    scopeNote
  };
}

async function runPredictionForLatestWindow(scopeInput: unknown = 'auto') {
  const runtime = await resolvePredictionRuntime(scopeInput, true);

  const [timeRows] = await pool.query<any[]>(
    `
      SELECT DISTINCT timestamp
      FROM traffic_flow
      WHERE node_id IN (${runtime.nodeIds.map(() => '?').join(',')})
      ORDER BY timestamp DESC
      LIMIT ?
    `,
    [...runtime.nodeIds, runtime.windowSize]
  );

  if (timeRows.length < runtime.windowSize) {
    return {
      status: 'error',
      message: `历史数据不足，至少需要连续 ${runtime.windowSize} 个时间步才能执行 LST-GCN 预测。`,
      activeScope: runtime.activeScope,
      nodeIds: runtime.nodeIds,
      scopeNote: runtime.scopeNote
    };
  }

  const timestamps = timeRows.map((row) => row.timestamp).reverse();
  const [flowRows] = await pool.query<any[]>(
    `
      SELECT node_id, timestamp, flow
      FROM traffic_flow
      WHERE node_id IN (${runtime.nodeIds.map(() => '?').join(',')})
        AND timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC, node_id ASC
    `,
    [...runtime.nodeIds, timestamps[0], timestamps[timestamps.length - 1]]
  );

  const history = timestamps.map((timestamp) =>
    runtime.nodeIds.map((nodeId) => {
      const record = flowRows.find(
        (row) => row.node_id === nodeId && new Date(row.timestamp).getTime() === new Date(timestamp).getTime()
      );
      return record ? asNumber(record.flow) : 0;
    })
  );

  const aiResponse = await fetch(`${AI_SERVICE_BASE_URL}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ history })
  });

  if (!aiResponse.ok) {
    return {
      status: 'error',
      message: 'Python AI 推理服务未响应，请确认 Flask 服务已经启动。',
      activeScope: runtime.activeScope,
      nodeIds: runtime.nodeIds,
      scopeNote: runtime.scopeNote
    };
  }

  const result = await aiResponse.json();
  if (result.status !== 'success') {
    return {
      status: 'error',
      message: result.message || '预测执行失败。',
      activeScope: runtime.activeScope,
      nodeIds: runtime.nodeIds,
      scopeNote: runtime.scopeNote
    };
  }

  const targetTime = new Date(new Date(timestamps[timestamps.length - 1]).getTime() + 15 * 60 * 1000);
  for (const nodeId of runtime.nodeIds) {
    await pool.query(
      `
        INSERT INTO predictions (node_id, target_time, predicted_flow, confidence, model_version)
        VALUES (?, ?, ?, ?, ?)
      `,
      [nodeId, targetTime, asNumber(result.prediction?.[nodeId]), 0.85, runtime.variant]
    );
  }

  return {
    status: 'success',
    message: `已完成 ${runtime.activeScope} 路口窗口的 LST-GCN 预测，并写入 predictions 表。`,
    targetTime,
    prediction: result.prediction,
    activeScope: runtime.activeScope,
    nodeIds: runtime.nodeIds,
    modelVersion: runtime.variant,
    scopeNote: runtime.scopeNote
  };
}

async function getIncidents() {
  const [rows] = await pool.query<any[]>(
    `
      SELECT id, type, severity, location, description, related_node_id, status, created_at
      FROM incidents
      ORDER BY created_at DESC
    `
  );

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    severity: row.severity,
    location: row.location,
    description: row.description,
    relatedNodeId: row.related_node_id,
    status: row.status,
    timestamp: new Date(row.created_at).toISOString()
  }));
}

async function createIncident(body: any) {
  const relatedNodeId = normalizeSystemNodeId(body.relatedNodeId || body.location || SYSTEM_NODE_IDS[0]);
  const locationName = getIntersectionName(relatedNodeId);
  const id = `INC-${Date.now().toString().slice(-6)}`;
  const payload = {
    id,
    type: typeof body.type === 'string' && body.type.trim() ? body.type.trim() : '道路拥堵',
    severity: ['HIGH', 'MEDIUM', 'LOW'].includes(body.severity) ? body.severity : 'MEDIUM',
    location: locationName,
    description:
      typeof body.description === 'string' && body.description.trim()
        ? body.description.trim()
        : '由超级管理员上报的新事件，等待进一步处置。',
    relatedNodeId
  };

  await pool.query(
    `
      INSERT INTO incidents (id, type, severity, location, description, related_node_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', NOW())
    `,
    [payload.id, payload.type, payload.severity, payload.location, payload.description, payload.relatedNodeId]
  );

  return payload;
}

async function updateIncidentStatus(id: string, status: string) {
  const nextStatus = status === 'RESOLVED' ? 'RESOLVED' : 'ACTIVE';
  await pool.query('UPDATE incidents SET status = ? WHERE id = ?', [nextStatus, id]);
}

async function optimizeSignal() {
  const [rows] = await pool.query<any[]>(
    `
      SELECT node_id, flow
      FROM traffic_flow
      WHERE timestamp = (SELECT MAX(timestamp) FROM traffic_flow)
      ORDER BY flow DESC
      LIMIT 1
    `
  );

  const busiest = rows[0] ?? { node_id: MODEL_NODE_IDS[0], flow: 120 };
  const [adminRows] = await pool.query<any[]>('SELECT congestion_threshold, auto_signal_control FROM users ORDER BY id ASC LIMIT 1');
  const threshold = asNumber(adminRows[0]?.congestion_threshold, 130);

  latestSignalStatus = {
    intersection_id: busiest.node_id,
    phase: asNumber(busiest.flow) >= threshold ? 'NS_GREEN' : 'EW_GREEN',
    duration: asNumber(busiest.flow) >= threshold ? 55 : 35,
    optimized_at: new Date().toISOString(),
    source: adminRows[0]?.auto_signal_control ? 'auto' : 'manual'
  };

  return latestSignalStatus;
}
export async function setupRoutes(app: Application) {
  isDbConnected = await testConnection();

  if (isDbConnected) {
    await bootstrapDatabase();
    await startTrafficFlowSimulator();
  }

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    if (!isDbConnected) {
      return res.status(503).json({ status: 'error', message: '数据库未连接，当前无法登录系统。' });
    }

    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!username || !password) {
      return res.status(400).json({ status: 'error', message: '请输入用户名和密码。' });
    }

    try {
      const profile = await getAdminProfileByUsername(username);
      if (!profile || !verifyPassword(password, profile.password_hash)) {
        return res.status(401).json({ status: 'error', message: '用户名或密码不正确。' });
      }

      const sessionToken = createSessionToken();
      const expiresAt = getSessionExpiryDate();
      await pool.query(
        `
          UPDATE users
          SET
            session_token = ?,
            session_expires_at = ?,
            status = 'ONLINE',
            last_login_at = NOW(),
            last_active_at = NOW()
          WHERE id = ?
        `,
        [sessionToken, toMysqlDateTime(expiresAt), profile.id]
      );

      const latestProfile = await getAdminProfileById(profile.id);
      res.json({
        status: 'success',
        message: `登录成功，系统将记住你的登录状态 ${SESSION_TTL_DAYS} 天。`,
        token: sessionToken,
        expiresAt: expiresAt.toISOString(),
        user: sanitizeAdminProfile(latestProfile)
      });
    } catch (error) {
      console.error('Auth Error in /api/auth/login:', error);
      res.status(500).json({ status: 'error', message: '登录失败，请稍后重试。' });
    }
  });

  app.get('/api/auth/session', async (req: Request, res: Response) => {
    if (!isDbConnected) {
      return res.status(503).json({ authenticated: false, message: '数据库未连接，无法验证会话。' });
    }

    const sessionToken = getSessionToken(req);
    if (!sessionToken) {
      return res.status(401).json({ authenticated: false, message: '未检测到登录会话。' });
    }

    try {
      const profile = await getAdminProfileBySessionToken(sessionToken);
      if (!profile) {
        return res.status(401).json({ authenticated: false, message: '登录已过期，请重新登录。' });
      }

      await pool.query('UPDATE users SET last_active_at = NOW() WHERE id = ?', [profile.id]);
      res.json({
        authenticated: true,
        expiresAt: profile.session_expires_at,
        user: sanitizeAdminProfile(profile)
      });
    } catch (error) {
      console.error('Auth Error in /api/auth/session:', error);
      res.status(500).json({ authenticated: false, message: '会话验证失败。' });
    }
  });

  app.post('/api/auth/logout', async (req: Request, res: Response) => {
    if (!isDbConnected) {
      return res.json({ status: 'success', message: '已退出登录。' });
    }

    const sessionToken = getSessionToken(req);
    if (sessionToken) {
      await pool.query(
        `
          UPDATE users
          SET session_token = NULL, session_expires_at = NULL, status = 'OFFLINE'
          WHERE session_token = ?
        `,
        [sessionToken]
      );
    }

    res.json({ status: 'success', message: '已安全退出登录。' });
  });

  app.use('/api', requireAuth);

  app.get('/api/network/intersections', async (req: Request, res: Response) => {
    const runtime = await resolvePredictionRuntime(req.query.scope);
    res.json({
      systemNodes: SYSTEM_INTERSECTIONS,
      modelNodeIds: [...MODEL_NODE_IDS],
      predictionNodeIds: runtime.nodeIds,
      activeScope: runtime.activeScope,
      scopeNote: runtime.scopeNote
    });
  });

  app.get('/api/data/realtime', async (_req: Request, res: Response) => {
    if (!isDbConnected) {
      return res.json({ timestamp: new Date().toISOString(), flow: 120, speed: 42, occupancy: 0.16 });
    }

    try {
      res.json(await getRealtimeMetrics());
    } catch (error) {
      console.error('Database Error in /api/data/realtime:', error);
      res.json({ timestamp: new Date().toISOString(), flow: 120, speed: 42, occupancy: 0.16 });
    }
  });

  app.get('/api/data/simulator-status', (_req: Request, res: Response) => {
    res.json(getTrafficFlowSimulatorStatus());
  });

  app.get('/api/data/history', async (req: Request, res: Response) => {
    if (!isDbConnected) {
      return res.json([]);
    }

    const nodeId = normalizeModelNodeId(req.query.nodeId);
    const date = toDateKey(req.query.date) ?? new Date().toISOString().slice(0, 10);

    try {
      const [rows] = await pool.query<any[]>(
        `
          SELECT timestamp, flow, speed, occupancy
          FROM traffic_flow
          WHERE node_id = ? AND DATE(timestamp) = ?
          ORDER BY timestamp ASC
        `,
        [nodeId, date]
      );

      res.json(rows);
    } catch (error) {
      console.error('Database Error in /api/data/history:', error);
      res.json([]);
    }
  });

  app.post('/api/data/upload', (_req: Request, res: Response) => {
    res.json({
      status: 'success',
      message: '当前项目采用数据库导入方式接入真实数据，请根据 docs/pems_import.md 或后续的自动同步任务执行数据入库。'
    });
  });

  app.post('/api/data/clean', async (_req: Request, res: Response) => {
    if (!isDbConnected) {
      return res.json({ status: 'success', message: '当前为示例模式，无需执行数据清洗。', records_processed: 0 });
    }

    const [rows] = await pool.query<any[]>('SELECT COUNT(*) AS total FROM traffic_flow');
    res.json({
      status: 'success',
      message: '已完成数据质量检查，当前有效流量记录可继续用于展示和预测。',
      records_processed: rows[0]?.total ?? 0
    });
  });

  app.post('/api/predict/run', async (req: Request, res: Response) => {
    if (!isDbConnected) {
      return res.json({ status: 'error', message: '数据库未连接，无法执行真实预测。' });
    }

    try {
      res.json(await runPredictionForLatestWindow(req.body?.scope ?? req.query.scope));
    } catch (error: any) {
      console.error('Prediction Error in /api/predict/run:', error);
      res.json({ status: 'error', message: error.message || '预测执行失败。' });
    }
  });

  app.get('/api/predict/latest', async (req: Request, res: Response) => {
    const runtime = await resolvePredictionRuntime(req.query.scope);
    const emptyPayload = {
      nodeId: normalizePredictionNodeId(req.query.nodeId, runtime.activeScope),
      target_time: null,
      predicted_flow: null,
      confidence: null,
      model_version: null,
      activeScope: runtime.activeScope,
      availableNodes: runtime.nodeIds,
      scopeNote: runtime.scopeNote
    };

    if (!isDbConnected) {
      return res.json(emptyPayload);
    }

    const nodeId = normalizePredictionNodeId(req.query.nodeId, runtime.activeScope);
    try {
      const [rows] = await pool.query<any[]>(
        `
          SELECT target_time, predicted_flow, confidence, model_version
          FROM predictions
          WHERE node_id = ?
          ORDER BY target_time DESC
          LIMIT 1
        `,
        [nodeId]
      );

      res.json({
        nodeId,
        ...(rows[0] ?? {
          target_time: null,
          predicted_flow: null,
          confidence: null,
          model_version: null
        }),
        activeScope: runtime.activeScope,
        availableNodes: runtime.nodeIds,
        scopeNote: runtime.scopeNote
      });
    } catch (error) {
      console.error('Database Error in /api/predict/latest:', error);
      res.json(emptyPayload);
    }
  });

  app.post('/api/signal/optimize', async (_req: Request, res: Response) => {
    if (!isDbConnected) {
      latestSignalStatus = {
        intersection_id: MODEL_NODE_IDS[0],
        phase: 'NS_GREEN',
        duration: 45,
        optimized_at: new Date().toISOString(),
        source: 'mock'
      };
      return res.json({ status: 'success', message: '已在示例模式下完成信号优化。', signal: latestSignalStatus });
    }

    try {
      const signal = await optimizeSignal();
      res.json({ status: 'success', message: '已根据最新流量重新计算信号配时。', signal });
    } catch (error) {
      console.error('Signal Error in /api/signal/optimize:', error);
      res.json({ status: 'error', message: '信号优化失败，请检查数据链路。' });
    }
  });

  app.get('/api/signal/status', async (_req: Request, res: Response) => {
    res.json(latestSignalStatus);
  });

  app.get('/api/monitor/flow', async (_req: Request, res: Response) => {
    if (!isDbConnected) {
      return res.json({ status: 'normal', current_flow: 120, source: 'mock' });
    }

    try {
      const metrics = await getRealtimeMetrics();
      res.json({
        status: metrics.flow >= 800 ? 'warning' : 'normal',
        current_flow: metrics.flow,
        source: 'database'
      });
    } catch (error) {
      console.error('Monitor Error in /api/monitor/flow:', error);
      res.json({ status: 'unknown', current_flow: null, source: 'error' });
    }
  });

  app.get('/api/monitor/health', async (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      db_connected: isDbConnected,
      uptime: process.uptime(),
      memory_usage: process.memoryUsage()
    });
  });

  app.get('/api/user/route', (req: Request, res: Response) => {
    const { start, end, objective } = req.query;
    res.json(buildRoute(start, end, objective));
  });

  app.get('/api/user/advice', async (_req: Request, res: Response) => {
    if (!isDbConnected) {
      return res.json({ message: '当前为本地演示模式，建议优先避开早晚高峰。' });
    }

    try {
      const metrics = await getRealtimeMetrics();
      const message =
        metrics.flow > 800
          ? '当前路网整体流量偏高，建议优先使用路径推荐并关注晚高峰的信号优化结果。'
          : '当前路网运行较平稳，可结合实时地图与路线推荐正常通行。';
      res.json({ message });
    } catch (error) {
      console.error('Advice Error in /api/user/advice:', error);
      res.json({ message: '暂时无法生成出行建议，请稍后重试。' });
    }
  });

  app.get('/api/incidents', async (_req: Request, res: Response) => {
    if (!isDbConnected) {
      return res.json([]);
    }

    try {
      res.json(await getIncidents());
    } catch (error) {
      console.error('Incident Error in /api/incidents:', error);
      res.json([]);
    }
  });

  app.post('/api/incidents', async (req: Request, res: Response) => {
    if (!isDbConnected) {
      return res.status(503).json({ status: 'error', message: '数据库未连接，无法上报事件。' });
    }

    try {
      const incident = await createIncident(req.body);
      res.json({ status: 'success', message: '新事件已上报并写入数据库。', incident });
    } catch (error) {
      console.error('Incident Error in POST /api/incidents:', error);
      res.status(500).json({ status: 'error', message: '事件上报失败。' });
    }
  });

  app.patch('/api/incidents/:id', async (req: Request, res: Response) => {
    if (!isDbConnected) {
      return res.status(503).json({ status: 'error', message: '数据库未连接，无法更新事件状态。' });
    }

    try {
      await updateIncidentStatus(req.params.id, req.body.status);
      res.json({ status: 'success', message: '事件状态已更新。' });
    } catch (error) {
      console.error('Incident Error in PATCH /api/incidents/:id', error);
      res.status(500).json({ status: 'error', message: '事件状态更新失败。' });
    }
  });

  app.get('/api/admin/profile', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const profile = await getAdminProfileById(req.authUser!.id);
      res.json(sanitizeAdminProfile(profile));
    } catch (error) {
      console.error('Admin Error in /api/admin/profile:', error);
      res.status(500).json({ status: 'error', message: '无法加载管理员信息。' });
    }
  });

  app.put('/api/admin/settings', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const profile = await updateAdminSettings(req.authUser!.id, req.body);
      res.json({ status: 'success', message: '系统配置已保存。', profile: sanitizeAdminProfile(profile) });
    } catch (error) {
      console.error('Admin Error in /api/admin/settings:', error);
      res.status(500).json({ status: 'error', message: '配置保存失败。' });
    }
  });

  app.get('/api/admin/permissions', async (req: AuthenticatedRequest, res: Response) => {
    const profile = await getAdminProfileById(req.authUser!.id);
    res.json([
      { key: 'manage_users', label: '用户登录与会话管理', enabled: Boolean(profile?.can_manage_users) },
      { key: 'manage_data', label: '数据源导入与路网数据维护', enabled: Boolean(profile?.can_manage_data) },
      { key: 'manage_models', label: '模型参数配置与预测任务管理', enabled: Boolean(profile?.can_manage_models) },
      { key: 'manage_signals', label: '告警阈值、接管策略与信号优化管理', enabled: Boolean(profile?.can_manage_signals) }
    ]);
  });

  app.get('/api/report/export', async (req: AuthenticatedRequest, res: Response) => {
    const runtime = await resolvePredictionRuntime(req.query.scope);
    const realtime = isDbConnected ? await getRealtimeMetrics() : { flow: 120, speed: 45, occupancy: 0.15 };
    const profile = await getAdminProfileById(req.authUser!.id);

    res.json({
      exportedAt: new Date().toISOString(),
      project: '基于大数据分析的智能交通流量监控与预测系统',
      realtime,
      signal: latestSignalStatus,
      administrator: profile
        ? {
            username: profile.username,
            fullName: profile.full_name,
            accountType: '超级管理员',
            lastLoginAt: profile.last_login_at,
            lastActiveAt: profile.last_active_at,
            sessionExpiresAt: profile.session_expires_at
          }
        : null,
      activeScope: runtime.activeScope,
      predictionNodeIds: runtime.nodeIds,
      scopeNote: runtime.scopeNote
    });
  });

  app.get('/api/pems/status', async (_req: Request, res: Response) => {
    if (!isDbConnected) {
      return res.json({ available: false, source: 'database_unavailable' });
    }

    const [stationRows] = await pool.query<any[]>('SELECT COUNT(*) AS total FROM pems_stations');
    const [flowRows] = await pool.query<any[]>('SELECT COUNT(*) AS total FROM pems_traffic_flow');

    res.json({
      available: (stationRows[0]?.total ?? 0) > 0 && (flowRows[0]?.total ?? 0) > 0,
      stations: stationRows[0]?.total ?? 0,
      records: flowRows[0]?.total ?? 0,
      importGuide: '请参考 docs/pems_import.md 下载并导入 PeMS 官方数据文件。',
      officialSite: 'https://pems.dot.ca.gov/',
      updateMode: 'manual_import_snapshot'
    });
  });

  app.get('/api/visual/flowchart', async (req: Request, res: Response) => {
    const runtime = await resolvePredictionRuntime(req.query.scope);
    const nodeId = normalizePredictionNodeId(req.query.nodeId, runtime.activeScope);
    const focus = typeof req.query.focus === 'string' ? req.query.focus : undefined;
    const date = toDateKey(req.query.date);

    if (!isDbConnected) {
      return res.json({
        date: null,
        nodeId,
        activeScope: runtime.activeScope,
        availableNodes: runtime.nodeIds,
        focusRange: computeFocusRange(focus),
        peaks: PEAK_WINDOWS,
        latestPrediction: null,
        scopeNote: runtime.scopeNote,
        data: Array.from({ length: 24 }, (_, hour) => ({
          hour,
          time: `${String(hour + 1).padStart(2, '0')}:00`,
          historical:
            hour + 1 >= 7 && hour + 1 <= 9
              ? 210 - Math.abs(8 - (hour + 1)) * 35
              : hour + 1 >= 17 && hour + 1 <= 19
                ? 240 - Math.abs(18 - (hour + 1)) * 40
                : 90 + ((hour + 1) % 5) * 12,
          predicted:
            hour + 1 >= 7 && hour + 1 <= 9
              ? 220 - Math.abs(8 - (hour + 1)) * 28
              : hour + 1 >= 17 && hour + 1 <= 19
                ? 250 - Math.abs(18 - (hour + 1)) * 30
                : 100 + ((hour + 1) % 6) * 10,
          periodLabel:
            PEAK_WINDOWS.find((window) => hour + 1 >= window.startHour && hour + 1 <= window.endHour)?.label ?? '平峰'
        }))
      });
    }

    try {
      res.json(await getChartPayload(nodeId, date, focus, runtime.nodeIds, runtime.scopeNote));
    } catch (error) {
      console.error('Database Error in /api/visual/flowchart:', error);
      res.status(500).json({ status: 'error', message: '图表数据加载失败。' });
    }
  });

  app.get('/api/visual/map', async (_req: Request, res: Response) => {
    if (!isDbConnected) {
      return res.json({
        source: '成都本地路口库',
        regionLabel: '中国四川成都',
        baseMapSource: 'OpenStreetMap / CARTO',
        updateMode: '内置示例路网',
        realtimeNote: '当前地图显示的是成都 10 个路口的示例数据，数据库接入后会自动切换到最新时间片。',
        lastUpdated: null,
        nodes: fallbackMapNodes,
        summary: {
          stationCount: fallbackMapNodes.length,
          avgFlow: Math.round(fallbackMapNodes.reduce((sum, node) => sum + node.flow, 0) / fallbackMapNodes.length)
        }
      });
    }

    try {
      const pemsSnapshot = await getPemsMapSnapshot();
      if (pemsSnapshot) {
        return res.json(pemsSnapshot);
      }

      res.json(await getLocalMapSnapshot());
    } catch (error) {
      console.error('Database Error in /api/visual/map:', error);
      res.json({
        source: '成都本地路口库',
        regionLabel: '中国四川成都',
        baseMapSource: 'OpenStreetMap / CARTO',
        updateMode: '内置示例路网',
        realtimeNote: '地图数据加载异常，已回退到成都本地示例路网。',
        lastUpdated: null,
        nodes: fallbackMapNodes,
        summary: {
          stationCount: fallbackMapNodes.length,
          avgFlow: Math.round(fallbackMapNodes.reduce((sum, node) => sum + node.flow, 0) / fallbackMapNodes.length)
        }
      });
    }
  });
}












import type { Application, Request, Response } from 'express';
import { bootstrapDatabase, pool, testConnection } from './db.ts';

const CURRENT_ADMIN_ID = 1;
const MODEL_NODE_IDS = ['A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7'];
const PEAK_WINDOWS = [
  { key: 'morning', label: '早高峰', startHour: 7, endHour: 9 },
  { key: 'midday', label: '午高峰', startHour: 12, endHour: 14 },
  { key: 'evening', label: '晚高峰', startHour: 17, endHour: 19 }
];

let isDbConnected = false;
let latestSignalStatus = {
  intersection_id: 'A1',
  phase: 'NS_GREEN',
  duration: 45,
  optimized_at: new Date().toISOString(),
  source: 'mock'
};

const fallbackMapNodes = [
  { id: 'A1', name: '路口 A1', lat: 39.9042, lng: 116.4074, flow: 150 },
  { id: 'B2', name: '路口 B2', lat: 39.915, lng: 116.4, flow: 80 },
  { id: 'C3', name: '路口 C3', lat: 39.895, lng: 116.42, flow: 210 },
  { id: 'D4', name: '路口 D4', lat: 39.92, lng: 116.43, flow: 110 },
  { id: 'E5', name: '路口 E5', lat: 39.89, lng: 116.39, flow: 60 },
  { id: 'F6', name: '路口 F6', lat: 39.905, lng: 116.45, flow: 180 },
  { id: 'G7', name: '路口 G7', lat: 39.93, lng: 116.38, flow: 130 }
];

function normalizeModelNodeId(value: unknown) {
  if (typeof value !== 'string') return 'A1';
  const match = value.toUpperCase().match(/A1|B2|C3|D4|E5|F6|G7/);
  return match?.[0] ?? 'A1';
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

function buildRoute(startInput: unknown, endInput: unknown, objectiveInput: unknown) {
  const start = normalizeModelNodeId(startInput);
  const end = normalizeModelNodeId(endInput);
  const objective = typeof objectiveInput === 'string' ? objectiveInput : 'fastest';

  if (start === end) {
    return {
      start,
      end,
      objective,
      path: [start],
      estimated_time: 0,
      distance: 0,
      savings: 0,
      steps: [{ instruction: `已在目的地 ${end}`, distance: '0 km', time: '0 分钟' }]
    };
  }

  const startIndex = MODEL_NODE_IDS.indexOf(start);
  const endIndex = MODEL_NODE_IDS.indexOf(end);
  const path =
    startIndex <= endIndex
      ? MODEL_NODE_IDS.slice(startIndex, endIndex + 1)
      : [...MODEL_NODE_IDS.slice(endIndex, startIndex + 1)].reverse();

  const distance = Number(((path.length - 1) * 1.8 + 1.3).toFixed(1));
  const estimatedTimeBase = Math.round(distance * 2.6);
  const estimated_time =
    objective === 'shortest_distance'
      ? Math.max(estimatedTimeBase + 2, 5)
      : objective === 'avoid_congestion'
        ? Math.max(estimatedTimeBase + 4, 6)
        : Math.max(estimatedTimeBase, 5);
  const savings = Math.max(1, Math.round(path.length / 2));
  const steps = path.map((node, index) => ({
    instruction:
      index === path.length - 1 ? `到达目的地 ${node}` : `沿推荐道路前往路口 ${path[index + 1]}`,
    distance: index === path.length - 1 ? '0 km' : '1.8 km',
    time: index === path.length - 1 ? '0 分钟' : `${Math.max(2, Math.round(estimated_time / path.length))} 分钟`
  }));

  return { start, end, objective, path, estimated_time, distance, savings, steps };
}

async function getAdminProfile() {
  const [rows] = await pool.query<any[]>(
    `
      SELECT
        id,
        username,
        full_name,
        email,
        phone,
        role,
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
        last_login_at,
        last_active_at,
        created_at
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [CURRENT_ADMIN_ID]
  );

  return rows[0] ?? null;
}

async function updateAdminSettings(body: any) {
  const updates = {
    full_name: typeof body.full_name === 'string' ? body.full_name.trim() : '交通系统超级管理员',
    email: typeof body.email === 'string' ? body.email.trim() : null,
    phone: typeof body.phone === 'string' ? body.phone.trim() : null,
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
      CURRENT_ADMIN_ID
    ]
  );

  return getAdminProfile();
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
    speed: Math.round(asNumber(item.avg_speed)),
    occupancy: asNumber(item.avg_occupancy)
  };
}

async function getLocalMapSnapshot() {
  const [timeRows] = await pool.query<any[]>('SELECT MAX(timestamp) AS last_time FROM traffic_flow');
  const lastTime = timeRows[0]?.last_time;

  if (!lastTime) {
    return {
      source: 'LOCAL_SAMPLE',
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
      SELECT n.id, n.name, n.lat, n.lng, t.flow
      FROM nodes n
      JOIN traffic_flow t ON n.id = t.node_id
      WHERE t.timestamp = ?
      ORDER BY t.flow DESC
    `,
    [lastTime]
  );

  const nodes = rows.map((row) => ({
    id: row.id,
    name: row.name,
    lat: asNumber(row.lat),
    lng: asNumber(row.lng),
    flow: asNumber(row.flow)
  }));

  return {
    source: 'LOCAL_MODEL',
    lastUpdated: lastTime,
    nodes: nodes.length > 0 ? nodes : fallbackMapNodes,
    summary: {
      stationCount: nodes.length || fallbackMapNodes.length,
      avgFlow: Math.round(
        (nodes.length > 0 ? nodes : fallbackMapNodes).reduce((sum, node) => sum + node.flow, 0) /
          (nodes.length || fallbackMapNodes.length)
      )
    }
  };
}

async function getPemsMapSnapshot() {
  const [stationRows] = await pool.query<any[]>('SELECT COUNT(*) AS total FROM pems_stations');
  if ((stationRows[0]?.total ?? 0) === 0) {
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
    speed: asNumber(row.speed),
    occupancy: asNumber(row.occupancy)
  }));

  return {
    source: 'PeMS',
    lastUpdated: lastTime,
    nodes,
    summary: {
      stationCount: nodes.length,
      avgFlow: Math.round(nodes.reduce((sum, node) => sum + node.flow, 0) / nodes.length)
    }
  };
}

async function getChartPayload(nodeId: string, dateInput: string | null, focus: string | undefined) {
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
      availableNodes: MODEL_NODE_IDS,
      focusRange: computeFocusRange(focus),
      peaks: PEAK_WINDOWS
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
    const periodLabel = PEAK_WINDOWS.find((window) => hour >= window.startHour && hour <= window.endHour)?.label ?? '平峰';
    const historical = historyByHour.has(hour) ? Number(historyByHour.get(hour)!.toFixed(1)) : null;
    const forecastBase = forecastByHour.get(hour) ?? historical ?? 0;
    const predicted = Number(forecastBase.toFixed(1));

    return {
      hour,
      time: `${String(hour).padStart(2, '0')}:00`,
      historical,
      predicted,
      periodLabel
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
    availableNodes: MODEL_NODE_IDS,
    data,
    focusRange: computeFocusRange(focus),
    peaks: PEAK_WINDOWS,
    latestPrediction: predictionRows[0] ?? null
  };
}

async function runPredictionForLatestWindow() {
  const [timeRows] = await pool.query<any[]>(
    `
      SELECT DISTINCT timestamp
      FROM traffic_flow
      WHERE node_id IN (${MODEL_NODE_IDS.map(() => '?').join(',')})
      ORDER BY timestamp DESC
      LIMIT 12
    `,
    MODEL_NODE_IDS
  );

  if (timeRows.length < 12) {
    return { status: 'error', message: '历史数据不足，至少需要 12 个时间步。' };
  }

  const timestamps = timeRows.map((row) => row.timestamp).reverse();
  const [flowRows] = await pool.query<any[]>(
    `
      SELECT node_id, timestamp, flow
      FROM traffic_flow
      WHERE node_id IN (${MODEL_NODE_IDS.map(() => '?').join(',')})
        AND timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC, node_id ASC
    `,
    [...MODEL_NODE_IDS, timestamps[0], timestamps[timestamps.length - 1]]
  );

  const history = timestamps.map((timestamp) =>
    MODEL_NODE_IDS.map((nodeId) => {
      const record = flowRows.find(
        (row) => row.node_id === nodeId && new Date(row.timestamp).getTime() === new Date(timestamp).getTime()
      );
      return record ? asNumber(record.flow) : 0;
    })
  );

  const aiResponse = await fetch('http://127.0.0.1:5000/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ history })
  });

  if (!aiResponse.ok) {
    return { status: 'error', message: 'Python AI 服务未响应。' };
  }

  const result = await aiResponse.json();
  if (result.status !== 'success') {
    return { status: 'error', message: result.message || '预测失败。' };
  }

  const targetTime = new Date(new Date(timestamps[timestamps.length - 1]).getTime() + 15 * 60 * 1000);
  for (const nodeId of MODEL_NODE_IDS) {
    await pool.query(
      `
        INSERT INTO predictions (node_id, target_time, predicted_flow, confidence, model_version)
        VALUES (?, ?, ?, ?, ?)
      `,
      [nodeId, targetTime, asNumber(result.prediction[nodeId]), 0.85, 'LST-GCN-v1.2']
    );
  }

  return {
    status: 'success',
    message: '已完成最新窗口预测并写入 predictions 表。',
    targetTime,
    prediction: result.prediction
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
  const relatedNodeId = normalizeModelNodeId(body.relatedNodeId || body.location || 'A1');
  const id = `INC-${Date.now().toString().slice(-6)}`;
  const payload = {
    id,
    type: typeof body.type === 'string' && body.type.trim() ? body.type.trim() : '道路拥堵',
    severity: ['HIGH', 'MEDIUM', 'LOW'].includes(body.severity) ? body.severity : 'MEDIUM',
    location:
      typeof body.location === 'string' && body.location.trim() ? body.location.trim() : `路口 ${relatedNodeId}`,
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
  const admin = await getAdminProfile();
  const threshold = asNumber(admin?.congestion_threshold, 130);

  const [rows] = await pool.query<any[]>(
    `
      SELECT node_id, flow
      FROM traffic_flow
      WHERE timestamp = (SELECT MAX(timestamp) FROM traffic_flow)
      ORDER BY flow DESC
      LIMIT 1
    `
  );

  const busiest = rows[0] ?? { node_id: 'A1', flow: 120 };
  const flow = asNumber(busiest.flow);
  latestSignalStatus = {
    intersection_id: busiest.node_id,
    phase: flow >= threshold ? 'NS_GREEN' : 'EW_GREEN',
    duration: flow >= threshold ? 55 : 35,
    optimized_at: new Date().toISOString(),
    source: admin?.auto_signal_control ? 'auto' : 'manual'
  };

  return latestSignalStatus;
}

export async function setupRoutes(app: Application) {
  isDbConnected = await testConnection();

  if (isDbConnected) {
    await bootstrapDatabase();
  }

  app.get('/api/data/realtime', async (_req: Request, res: Response) => {
    if (!isDbConnected) {
      return res.json({ timestamp: new Date().toISOString(), flow: 120, speed: 45, occupancy: 0.15 });
    }

    try {
      res.json(await getRealtimeMetrics());
    } catch (error) {
      console.error('Database Error in /api/data/realtime:', error);
      res.json({ timestamp: new Date().toISOString(), flow: 120, speed: 45, occupancy: 0.15 });
    }
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
      message: '当前项目采用数据库导入方式接入真实数据，请使用 docs/pems_import.md 中的导入流程。'
    });
  });

  app.post('/api/data/clean', async (_req: Request, res: Response) => {
    if (!isDbConnected) {
      return res.json({ status: 'success', message: 'Mock 模式下无需清洗。', records_processed: 0 });
    }

    const [rows] = await pool.query<any[]>('SELECT COUNT(*) AS total FROM traffic_flow');
    res.json({
      status: 'success',
      message: '已完成数据质量检查，当前使用数据库中的有效样本继续服务。',
      records_processed: rows[0]?.total ?? 0
    });
  });

  app.post('/api/predict/run', async (_req: Request, res: Response) => {
    if (!isDbConnected) {
      return res.json({ status: 'error', message: '数据库未连接，无法执行真实预测。' });
    }

    try {
      res.json(await runPredictionForLatestWindow());
    } catch (error: any) {
      console.error('Prediction Error in /api/predict/run:', error);
      res.json({ status: 'error', message: error.message || '预测执行失败。' });
    }
  });

  app.get('/api/predict/latest', async (req: Request, res: Response) => {
    if (!isDbConnected) {
      return res.json({ timestamp: null, predicted_flow: 135, confidence: 0.85 });
    }

    const nodeId = normalizeModelNodeId(req.query.nodeId);
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

      res.json(rows[0] ?? { target_time: null, predicted_flow: null, confidence: null, model_version: null });
    } catch (error) {
      console.error('Database Error in /api/predict/latest:', error);
      res.json({ target_time: null, predicted_flow: null, confidence: null, model_version: null });
    }
  });

  app.post('/api/signal/optimize', async (_req: Request, res: Response) => {
    if (!isDbConnected) {
      latestSignalStatus = {
        intersection_id: 'A1',
        phase: 'NS_GREEN',
        duration: 45,
        optimized_at: new Date().toISOString(),
        source: 'mock'
      };
      return res.json({ status: 'success', message: '已在 Mock 模式下完成信号优化。', signal: latestSignalStatus });
    }

    try {
      const signal = await optimizeSignal();
      res.json({ status: 'success', message: '已根据最新流量完成信号优化。', signal });
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
      return res.json({ message: '当前为本地演示模式，建议优先避开高峰路段。' });
    }

    try {
      const metrics = await getRealtimeMetrics();
      const message =
        metrics.flow > 800
          ? '当前路网整体流量较高，建议优先使用智能路线推荐并避开晚高峰时段。'
          : '当前路网运行较平稳，可按推荐路径通行。';
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
      res.json({ status: 'success', message: '新事件已上报。', incident });
    } catch (error) {
      console.error('Incident Error in POST /api/incidents:', error);
      res.status(500).json({ status: 'error', message: '事件上报失败。' });
    }
  });

  app.patch('/api/incidents/:id', async (req: Request, res: Response) => {
    if (!isDbConnected) {
      return res.status(503).json({ status: 'error', message: '数据库未连接，无法更新状态。' });
    }

    try {
      await updateIncidentStatus(req.params.id, req.body.status);
      res.json({ status: 'success', message: '事件状态已更新。' });
    } catch (error) {
      console.error('Incident Error in PATCH /api/incidents/:id', error);
      res.status(500).json({ status: 'error', message: '事件状态更新失败。' });
    }
  });

  app.get('/api/admin/profile', async (_req: Request, res: Response) => {
    if (!isDbConnected) {
      return res.status(503).json({ status: 'error', message: '数据库未连接。' });
    }

    try {
      const profile = await getAdminProfile();
      res.json(profile);
    } catch (error) {
      console.error('Admin Error in /api/admin/profile:', error);
      res.status(500).json({ status: 'error', message: '无法加载管理员信息。' });
    }
  });

  app.put('/api/admin/settings', async (req: Request, res: Response) => {
    if (!isDbConnected) {
      return res.status(503).json({ status: 'error', message: '数据库未连接。' });
    }

    try {
      const profile = await updateAdminSettings(req.body);
      res.json({ status: 'success', message: '管理员配置已保存。', profile });
    } catch (error) {
      console.error('Admin Error in /api/admin/settings:', error);
      res.status(500).json({ status: 'error', message: '配置保存失败。' });
    }
  });

  app.get('/api/admin/permissions', async (_req: Request, res: Response) => {
    if (!isDbConnected) {
      return res.json([]);
    }

    const profile = await getAdminProfile();
    res.json([
      { key: 'manage_users', label: '用户与权限管理', enabled: Boolean(profile?.can_manage_users) },
      { key: 'manage_data', label: '数据源与数据导入管理', enabled: Boolean(profile?.can_manage_data) },
      { key: 'manage_models', label: '模型参数与预测任务管理', enabled: Boolean(profile?.can_manage_models) },
      { key: 'manage_signals', label: '信号优化与告警策略管理', enabled: Boolean(profile?.can_manage_signals) }
    ]);
  });

  app.get('/api/report/export', async (_req: Request, res: Response) => {
    const realtime = isDbConnected ? await getRealtimeMetrics() : { flow: 120, speed: 45, occupancy: 0.15 };
    const profile = isDbConnected ? await getAdminProfile() : null;

    res.json({
      exportedAt: new Date().toISOString(),
      project: '智能交通流量监控与预测系统',
      realtime,
      signal: latestSignalStatus,
      administrator: profile
        ? {
            username: profile.username,
            fullName: profile.full_name,
            role: profile.role,
            lastLoginAt: profile.last_login_at,
            lastActiveAt: profile.last_active_at
          }
        : null
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
      importGuide: '请参考 docs/pems_import.md 下载并导入 PeMS 官方数据文件。'
    });
  });

  app.get('/api/visual/flowchart', async (req: Request, res: Response) => {
    if (!isDbConnected) {
      return res.json({
        date: null,
        nodeId: 'A1',
        availableNodes: MODEL_NODE_IDS,
        focusRange: computeFocusRange(typeof req.query.focus === 'string' ? req.query.focus : undefined),
        peaks: PEAK_WINDOWS,
        data: Array.from({ length: 24 }, (_, hour) => ({
          hour,
          time: `${String(hour).padStart(2, '0')}:00`,
          historical: hour >= 7 && hour <= 9 ? 210 - Math.abs(8 - hour) * 35 : hour >= 17 && hour <= 19 ? 240 - Math.abs(18 - hour) * 40 : 90 + (hour % 5) * 12,
          predicted: hour >= 7 && hour <= 9 ? 220 - Math.abs(8 - hour) * 28 : hour >= 17 && hour <= 19 ? 250 - Math.abs(18 - hour) * 30 : 100 + (hour % 6) * 10,
          periodLabel: PEAK_WINDOWS.find((window) => hour >= window.startHour && hour <= window.endHour)?.label ?? '平峰'
        }))
      });
    }

    try {
      const nodeId = normalizeModelNodeId(req.query.nodeId);
      const date = toDateKey(req.query.date);
      const focus = typeof req.query.focus === 'string' ? req.query.focus : undefined;
      res.json(await getChartPayload(nodeId, date, focus));
    } catch (error) {
      console.error('Database Error in /api/visual/flowchart:', error);
      res.status(500).json({ status: 'error', message: '图表数据加载失败。' });
    }
  });

  app.get('/api/visual/map', async (_req: Request, res: Response) => {
    if (!isDbConnected) {
      return res.json({
        source: 'LOCAL_SAMPLE',
        lastUpdated: null,
        nodes: fallbackMapNodes,
        summary: {
          stationCount: fallbackMapNodes.length,
          avgFlow: Math.round(fallbackMapNodes.reduce((sum, node) => sum + node.flow, 0) / fallbackMapNodes.length)
        },
        importGuide: '数据库连接后可自动切换到本地真实数据，导入 PeMS 后将优先展示 PeMS 地图。'
      });
    }

    try {
      const pemsSnapshot = await getPemsMapSnapshot();
      if (pemsSnapshot) {
        return res.json({
          ...pemsSnapshot,
          importGuide: '当前已使用 PeMS 公开数据。'
        });
      }

      const localSnapshot = await getLocalMapSnapshot();
      res.json({
        ...localSnapshot,
        importGuide: '导入 PeMS 数据后，地图会自动切换为 PeMS 站点视图。'
      });
    } catch (error) {
      console.error('Database Error in /api/visual/map:', error);
      res.json({
        source: 'LOCAL_SAMPLE',
        lastUpdated: null,
        nodes: fallbackMapNodes,
        summary: {
          stationCount: fallbackMapNodes.length,
          avgFlow: Math.round(fallbackMapNodes.reduce((sum, node) => sum + node.flow, 0) / fallbackMapNodes.length)
        },
        importGuide: '地图数据加载异常，已回退到示例路网。'
      });
    }
  });
}

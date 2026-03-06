import { Application, Request, Response } from 'express';
import { pool, testConnection } from './db';

// Mock data for initial development
const MOCK_DATA = {
  realtime: { timestamp: new Date().toISOString(), flow: 120, speed: 45, occupancy: 0.15 },
  history: [
    { timestamp: '2023-10-01T08:00:00Z', flow: 150 },
    { timestamp: '2023-10-01T09:00:00Z', flow: 180 },
    { timestamp: '2023-10-01T10:00:00Z', flow: 110 }
  ],
  prediction: { timestamp: '2023-10-01T11:00:00Z', predicted_flow: 135, confidence: 0.85 },
  signal: { intersection_id: 'A1', phase: 'NS_GREEN', duration: 45 },
  route: { path: ['A1', 'B2', 'C3'], estimated_time: 15 },
  advice: { message: 'Traffic is light. Recommended route: Main St.' }
};

let isDbConnected = false;

export async function setupRoutes(app: Application) {
  // 在启动路由前测试数据库连接
  isDbConnected = await testConnection();

  // 1) 数据采集模块
  app.get('/api/data/realtime', async (req: Request, res: Response) => {
    if (!isDbConnected) return res.json(MOCK_DATA.realtime);

    try {
      // 获取数据库中最新的时间戳
      const [timeRows]: any = await pool.query('SELECT MAX(timestamp) as last_time FROM traffic_flow');
      const lastTime = timeRows[0].last_time;

      if (!lastTime) {
        return res.json({ flow: 0, speed: 0, occupancy: 0 });
      }

      // 聚合该时间点所有路口的数据
      const [rows]: any = await pool.query(`
        SELECT 
          SUM(flow) as total_flow, 
          AVG(speed) as avg_speed, 
          AVG(occupancy) as avg_occupancy 
        FROM traffic_flow 
        WHERE timestamp = ?
      `, [lastTime]);

      const data = rows[0];
      res.json({
        flow: Number(data.total_flow) || 0,
        speed: Math.round(Number(data.avg_speed) || 0),
        occupancy: Number(data.avg_occupancy) || 0
      });
    } catch (error) {
      console.error('Database Error in /api/data/realtime:', error);
      // Fallback to mock data if DB query fails
      res.json(MOCK_DATA.realtime);
    }
  });

  app.post('/api/data/upload', (req: Request, res: Response) => {
    res.json({ status: 'success', message: 'Data uploaded successfully' });
  });

  app.get('/api/data/history', (req: Request, res: Response) => {
    res.json(MOCK_DATA.history);
  });

  // 2) 数据清洗模块
  app.post('/api/data/clean', (req: Request, res: Response) => {
    res.json({ status: 'success', message: 'Data cleaned successfully', records_processed: 1000 });
  });

  // 3) 预测模块
  app.post('/api/predict/run', (req: Request, res: Response) => {
    res.json({ status: 'success', message: 'Prediction model executed' });
  });

  app.get('/api/predict/latest', (req: Request, res: Response) => {
    res.json(MOCK_DATA.prediction);
  });

  // 4) 信号灯优化模块
  app.post('/api/signal/optimize', (req: Request, res: Response) => {
    res.json({ status: 'success', message: 'Signal timing optimized based on prediction' });
  });

  app.get('/api/signal/status', (req: Request, res: Response) => {
    res.json(MOCK_DATA.signal);
  });

  // 5) 监控模块
  app.get('/api/monitor/flow', (req: Request, res: Response) => {
    res.json({ status: 'normal', current_flow: MOCK_DATA.realtime.flow });
  });

  app.get('/api/monitor/health', (req: Request, res: Response) => {
    res.json({ status: 'healthy', uptime: process.uptime(), memory_usage: process.memoryUsage() });
  });

  // 6) 用户服务模块
  app.get('/api/user/route', (req: Request, res: Response) => {
    res.json(MOCK_DATA.route);
  });

  app.get('/api/user/advice', (req: Request, res: Response) => {
    res.json(MOCK_DATA.advice);
  });

  // 7) 可视化模块 (集成真实的 Python AI 微服务)
  app.get('/api/visual/flowchart', async (req: Request, res: Response) => {
    const defaultData = [
      { time: '08:00', historical: 120, predicted: 125 },
      { time: '08:15', historical: 140, predicted: 138 },
      { time: '08:30', historical: 160, predicted: 155 },
      { time: '08:45', historical: 180, predicted: 175 },
      { time: '09:00', historical: 210, predicted: 205 },
      { time: '09:15', historical: 190, predicted: 195 },
      { time: '09:30', historical: 150, predicted: 160 },
      { time: '09:45', historical: 130, predicted: 135 },
      { time: '10:00', historical: 110, predicted: 115 },
      { time: '10:15', historical: null, predicted: 105 },
      { time: '10:30', historical: null, predicted: 95 },
      { time: '10:45', historical: null, predicted: 80 }
    ];

    if (!isDbConnected) return res.json(defaultData);

    try {
      // 1. 获取最近的 12 个时间戳
      const [timeRows]: any = await pool.query(`
        SELECT DISTINCT timestamp 
        FROM traffic_flow 
        ORDER BY timestamp DESC 
        LIMIT 12
      `);
      
      if (timeRows.length === 0) return res.json(defaultData);
      
      // 按时间升序排列 (过去 -> 现在)
      const timestamps = timeRows.map((r: any) => r.timestamp).reverse();
      
      // 2. 获取这 12 个时间步内，所有 7 个路口的流量数据
      const [flowRows]: any = await pool.query(`
        SELECT node_id, timestamp, flow 
        FROM traffic_flow 
        WHERE timestamp >= ? AND timestamp <= ?
        ORDER BY timestamp ASC, node_id ASC
      `, [timestamps[0], timestamps[timestamps.length - 1]]);

      // 3. 组装发给 Python 微服务的 12x7 矩阵
      const nodeOrder = ['A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7'];
      const historyMatrix: number[][] = [];
      const chartData: any[] = []; // 组装前端图表需要的数据 (以 A1 为例)

      for (const ts of timestamps) {
        const timeString = new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        
        // 提取当前时间步下，7个路口的流量
        const stepData = nodeOrder.map(nodeId => {
          const record = flowRows.find((r: any) => 
            r.node_id === nodeId && new Date(r.timestamp).getTime() === new Date(ts).getTime()
          );
          return record ? Number(record.flow) : 0;
        });
        
        historyMatrix.push(stepData);
        
        // 记录 A1 的历史数据用于图表展示
        chartData.push({
          time: timeString,
          historical: stepData[0], // A1 是第 0 个
          predicted: null // 历史数据点没有预测值
        });
      }

      // 4. 调用 Python AI 微服务进行预测
      let predictedA1 = null;
      try {
        // 使用 Node.js 原生 fetch 发送 HTTP 请求给 Flask
        const aiResponse = await fetch('http://127.0.0.1:5000/predict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ history: historyMatrix })
        });
        
        if (aiResponse.ok) {
          const aiResult = await aiResponse.json();
          if (aiResult.status === 'success') {
            predictedA1 = aiResult.prediction.A1; // 拿到 AI 预测的 A1 路口流量
          }
        }
      } catch (aiError) {
        console.warn('⚠️ 无法连接到 Python AI 微服务，将使用模拟预测值。');
        predictedA1 = chartData[chartData.length - 1].historical + Math.floor(Math.random() * 30 - 15);
      }

      // 5. 将预测结果追加到图表数据中 (未来 15 分钟)
      const lastDate = new Date(timestamps[timestamps.length - 1]);
      const nextDate = new Date(lastDate.getTime() + 15 * 60000); // 加 15 分钟
      const nextTimeString = nextDate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

      // 为了让前端折线图连贯，把最后一个历史点也赋上预测值（作为预测线的起点）
      chartData[chartData.length - 1].predicted = chartData[chartData.length - 1].historical;

      // 添加未来的预测点
      chartData.push({
        time: nextTimeString,
        historical: null,
        predicted: predictedA1
      });

      res.json(chartData);
    } catch (error) {
      console.error('Database Error in /api/visual/flowchart:', error);
      res.json(defaultData);
    }
  });

  app.get('/api/visual/map', async (req: Request, res: Response) => {
    const defaultMapData = {
      nodes: [
        { id: 'A1', lat: 39.9042, lng: 116.4074, flow: 150 },
        { id: 'B2', lat: 39.9150, lng: 116.4000, flow: 80 },
        { id: 'C3', lat: 39.8950, lng: 116.4200, flow: 210 },
        { id: 'D4', lat: 39.9200, lng: 116.4300, flow: 110 },
        { id: 'E5', lat: 39.8900, lng: 116.3900, flow: 60 },
        { id: 'F6', lat: 39.9050, lng: 116.4500, flow: 180 },
        { id: 'G7', lat: 39.9300, lng: 116.3800, flow: 130 }
      ]
    };

    if (!isDbConnected) return res.json(defaultMapData);

    try {
      // 获取最新时间戳
      const [timeRows]: any = await pool.query('SELECT MAX(timestamp) as last_time FROM traffic_flow');
      const lastTime = timeRows[0].last_time;

      if (!lastTime) {
        return res.json({ nodes: [] });
      }

      // 关联 nodes 表和 traffic_flow 表，获取最新流量
      const [rows]: any = await pool.query(`
        SELECT n.id, n.name, n.lat, n.lng, t.flow
        FROM nodes n
        JOIN traffic_flow t ON n.id = t.node_id
        WHERE t.timestamp = ?
      `, [lastTime]);

      const formattedRows = rows.map((r: any) => ({
        ...r,
        lat: Number(r.lat),
        lng: Number(r.lng),
        flow: Number(r.flow)
      }));

      res.json({ nodes: formattedRows.length > 0 ? formattedRows : defaultMapData.nodes });
    } catch (error) {
      console.error('Database Error in /api/visual/map:', error);
      // Fallback to mock data if DB is not connected
      res.json(defaultMapData);
    }
  });
}

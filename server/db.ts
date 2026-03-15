import mysql from 'mysql2/promise';
import 'dotenv/config';

export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME || 'traffic_system',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const bootstrapStatements = [
  `
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) NOT NULL UNIQUE,
      full_name VARCHAR(100) NOT NULL,
      email VARCHAR(100) DEFAULT NULL,
      phone VARCHAR(30) DEFAULT NULL,
      role VARCHAR(30) NOT NULL DEFAULT 'SUPER_ADMIN',
      status VARCHAR(20) NOT NULL DEFAULT 'ONLINE',
      preferred_theme VARCHAR(20) NOT NULL DEFAULT 'light',
      prediction_horizon_minutes INT NOT NULL DEFAULT 60,
      sliding_window_steps INT NOT NULL DEFAULT 12,
      retrain_cycle_days INT NOT NULL DEFAULT 7,
      congestion_threshold INT NOT NULL DEFAULT 130,
      auto_signal_control TINYINT(1) NOT NULL DEFAULT 1,
      can_manage_users TINYINT(1) NOT NULL DEFAULT 1,
      can_manage_data TINYINT(1) NOT NULL DEFAULT 1,
      can_manage_models TINYINT(1) NOT NULL DEFAULT 1,
      can_manage_signals TINYINT(1) NOT NULL DEFAULT 1,
      last_login_at DATETIME DEFAULT NULL,
      last_active_at DATETIME DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS incidents (
      id VARCHAR(30) NOT NULL PRIMARY KEY,
      type VARCHAR(30) NOT NULL,
      severity VARCHAR(10) NOT NULL,
      location VARCHAR(120) NOT NULL,
      description TEXT NOT NULL,
      related_node_id VARCHAR(20) DEFAULT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
      created_at DATETIME NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS pems_stations (
      id VARCHAR(30) NOT NULL PRIMARY KEY,
      district VARCHAR(20) DEFAULT NULL,
      freeway VARCHAR(20) DEFAULT NULL,
      direction VARCHAR(20) DEFAULT NULL,
      name VARCHAR(120) NOT NULL,
      lat DECIMAL(10, 6) NOT NULL,
      lng DECIMAL(10, 6) NOT NULL,
      lane_count INT DEFAULT NULL,
      station_type VARCHAR(30) DEFAULT NULL,
      data_source VARCHAR(30) NOT NULL DEFAULT 'PeMS',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS pems_traffic_flow (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      station_id VARCHAR(30) NOT NULL,
      timestamp DATETIME NOT NULL,
      flow DECIMAL(10, 2) NOT NULL,
      speed DECIMAL(10, 2) DEFAULT NULL,
      occupancy DECIMAL(6, 4) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_pems_station
        FOREIGN KEY (station_id) REFERENCES pems_stations(id)
        ON DELETE CASCADE,
      INDEX idx_pems_station_time (station_id, timestamp),
      INDEX idx_pems_timestamp (timestamp)
    )
  `
];

export async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ 成功连接到 MySQL 数据库');
    connection.release();
    return true;
  } catch (error: any) {
    console.warn('⚠️ 无法连接到 MySQL 数据库。');
    console.warn('   系统将自动降级使用 Mock 数据。');
    console.warn(`   错误详情: ${error.message}`);

    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.warn('   💡 提示: 数据库密码错误，请检查根目录 .env 中的 DB_PASSWORD。');
    } else if (error.code === 'ECONNREFUSED') {
      console.warn('   💡 提示: MySQL 服务未启动，或端口不是 3306。');
    }

    return false;
  }
}

export async function bootstrapDatabase() {
  const connection = await pool.getConnection();
  try {
    for (const statement of bootstrapStatements) {
      await connection.query(statement);
    }

    const [userRows] = await connection.query<any[]>('SELECT COUNT(*) AS total FROM users');
    if ((userRows[0]?.total ?? 0) === 0) {
      await connection.query(
        `
          INSERT INTO users (
            username, full_name, email, phone, role, status, preferred_theme,
            prediction_horizon_minutes, sliding_window_steps, retrain_cycle_days,
            congestion_threshold, auto_signal_control, can_manage_users,
            can_manage_data, can_manage_models, can_manage_signals,
            last_login_at, last_active_at
          ) VALUES (
            'admin_traffic',
            '交通系统超级管理员',
            'admin@traffic-system.local',
            '18200574338',
            'SUPER_ADMIN',
            'ONLINE',
            'light',
            60,
            12,
            7,
            130,
            1,
            1,
            1,
            1,
            1,
            NOW(),
            NOW()
          )
        `
      );
    }

    const [incidentRows] = await connection.query<any[]>('SELECT COUNT(*) AS total FROM incidents');
    if ((incidentRows[0]?.total ?? 0) === 0) {
      await connection.query(
        `
          INSERT INTO incidents (id, type, severity, location, description, related_node_id, status, created_at)
          VALUES
            ('INC-001', '交通事故', 'HIGH', '路口 A1（主干道 & 第一大道）', '多车追尾事故，占用两条北向车道，现场已安排处置。', 'A1', 'ACTIVE', DATE_SUB(NOW(), INTERVAL 15 MINUTE)),
            ('INC-002', '道路拥堵', 'MEDIUM', '路口 B2（次干道）', '晚高峰流量增幅明显，当前拥堵程度高于阈值。', 'B2', 'ACTIVE', DATE_SUB(NOW(), INTERVAL 45 MINUTE)),
            ('INC-003', '道路施工', 'LOW', '路口 C3', '信号控制设备例行维护，当前处于固定配时模式。', 'C3', 'ACTIVE', DATE_SUB(NOW(), INTERVAL 2 HOUR)),
            ('INC-004', '恶劣天气', 'MEDIUM', '城区主干道路网', '降雨导致平均车速下降，当前事件已解除。', NULL, 'RESOLVED', DATE_SUB(NOW(), INTERVAL 3 HOUR))
        `
      );
    }

    console.log('✅ 已完成数据库补充建表与默认数据初始化');
  } finally {
    connection.release();
  }
}

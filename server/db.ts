import mysql from 'mysql2/promise';
import 'dotenv/config';
import { hashPassword } from './auth.ts';
import { SYSTEM_INTERSECTIONS } from './intersections.ts';

const DEFAULT_ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin_traffic';
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Traffic@123456';

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
    CREATE TABLE IF NOT EXISTS nodes (
      id VARCHAR(20) NOT NULL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      lat DECIMAL(10, 6) NOT NULL,
      lng DECIMAL(10, 6) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS traffic_flow (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      node_id VARCHAR(20) NOT NULL,
      timestamp DATETIME NOT NULL,
      flow INT NOT NULL,
      speed DECIMAL(6, 2) DEFAULT NULL,
      occupancy DECIMAL(6, 4) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_traffic_node FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
      INDEX idx_node_time (node_id, timestamp),
      INDEX idx_time (timestamp)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS predictions (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      node_id VARCHAR(20) NOT NULL,
      target_time DATETIME NOT NULL,
      predicted_flow INT NOT NULL,
      confidence DECIMAL(4, 3) DEFAULT NULL,
      model_version VARCHAR(40) DEFAULT 'LST-GCN-v1.2',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_prediction_node FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
      INDEX idx_node_target (node_id, target_time)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) NOT NULL UNIQUE,
      full_name VARCHAR(100) NOT NULL,
      email VARCHAR(100) DEFAULT NULL,
      phone VARCHAR(30) DEFAULT NULL,
      password_hash TEXT DEFAULT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'OFFLINE',
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
      session_token VARCHAR(128) DEFAULT NULL,
      session_expires_at DATETIME DEFAULT NULL,
      last_login_at DATETIME DEFAULT NULL,
      last_active_at DATETIME DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_users_session_token (session_token)
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
      CONSTRAINT fk_pems_station FOREIGN KEY (station_id) REFERENCES pems_stations(id) ON DELETE CASCADE,
      INDEX idx_pems_station_time (station_id, timestamp),
      INDEX idx_pems_timestamp (timestamp)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS pems_node_bindings (
      system_node_id VARCHAR(20) NOT NULL PRIMARY KEY,
      station_id VARCHAR(30) NOT NULL,
      binding_source VARCHAR(30) NOT NULL DEFAULT 'auto',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_pems_binding_station (station_id)
    )
  `
];

async function hasColumn(connection: mysql.PoolConnection, tableName: string, columnName: string) {
  const [rows] = await connection.query<any[]>(
    `
      SELECT COUNT(*) AS total
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
    `,
    [tableName, columnName]
  );

  return Number(rows[0]?.total ?? 0) > 0;
}

async function ensureColumn(connection: mysql.PoolConnection, tableName: string, columnName: string, definition: string) {
  if (!(await hasColumn(connection, tableName, columnName))) {
    await connection.query(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
  }
}

async function dropColumnIfExists(connection: mysql.PoolConnection, tableName: string, columnName: string) {
  if (await hasColumn(connection, tableName, columnName)) {
    await connection.query(`ALTER TABLE ${tableName} DROP COLUMN ${columnName}`);
  }
}

async function ensureUsersTableShape(connection: mysql.PoolConnection) {
  await ensureColumn(connection, 'users', 'password_hash', 'password_hash TEXT DEFAULT NULL AFTER phone');
  await ensureColumn(connection, 'users', 'status', `status VARCHAR(20) NOT NULL DEFAULT 'OFFLINE' AFTER password_hash`);
  await ensureColumn(connection, 'users', 'preferred_theme', `preferred_theme VARCHAR(20) NOT NULL DEFAULT 'light' AFTER status`);
  await ensureColumn(connection, 'users', 'prediction_horizon_minutes', 'prediction_horizon_minutes INT NOT NULL DEFAULT 60 AFTER preferred_theme');
  await ensureColumn(connection, 'users', 'sliding_window_steps', 'sliding_window_steps INT NOT NULL DEFAULT 12 AFTER prediction_horizon_minutes');
  await ensureColumn(connection, 'users', 'retrain_cycle_days', 'retrain_cycle_days INT NOT NULL DEFAULT 7 AFTER sliding_window_steps');
  await ensureColumn(connection, 'users', 'congestion_threshold', 'congestion_threshold INT NOT NULL DEFAULT 130 AFTER retrain_cycle_days');
  await ensureColumn(connection, 'users', 'auto_signal_control', 'auto_signal_control TINYINT(1) NOT NULL DEFAULT 1 AFTER congestion_threshold');
  await ensureColumn(connection, 'users', 'can_manage_users', 'can_manage_users TINYINT(1) NOT NULL DEFAULT 1 AFTER auto_signal_control');
  await ensureColumn(connection, 'users', 'can_manage_data', 'can_manage_data TINYINT(1) NOT NULL DEFAULT 1 AFTER can_manage_users');
  await ensureColumn(connection, 'users', 'can_manage_models', 'can_manage_models TINYINT(1) NOT NULL DEFAULT 1 AFTER can_manage_data');
  await ensureColumn(connection, 'users', 'can_manage_signals', 'can_manage_signals TINYINT(1) NOT NULL DEFAULT 1 AFTER can_manage_models');
  await ensureColumn(connection, 'users', 'session_token', 'session_token VARCHAR(128) DEFAULT NULL AFTER can_manage_signals');
  await ensureColumn(connection, 'users', 'session_expires_at', 'session_expires_at DATETIME DEFAULT NULL AFTER session_token');
  await ensureColumn(connection, 'users', 'last_login_at', 'last_login_at DATETIME DEFAULT NULL AFTER session_expires_at');
  await ensureColumn(connection, 'users', 'last_active_at', 'last_active_at DATETIME DEFAULT NULL AFTER last_login_at');
  await dropColumnIfExists(connection, 'users', 'role');
}

async function seedSystemIntersections(connection: mysql.PoolConnection) {
  const values = SYSTEM_INTERSECTIONS.map((item) => [item.id, item.name, item.lat, item.lng]);
  await connection.query(
    `
      INSERT INTO nodes (id, name, lat, lng)
      VALUES ?
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        lat = VALUES(lat),
        lng = VALUES(lng)
    `,
    [values]
  );
}

async function seedDefaultAdmin(connection: mysql.PoolConnection) {
  const [rows] = await connection.query<any[]>('SELECT id, password_hash FROM users ORDER BY id ASC LIMIT 1');
  const passwordHash = hashPassword(DEFAULT_ADMIN_PASSWORD);

  if (!rows[0]) {
    await connection.query(
      `
        INSERT INTO users (
          username,
          full_name,
          email,
          phone,
          password_hash,
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
          can_manage_signals
        ) VALUES (?, ?, ?, ?, ?, 'OFFLINE', 'light', 60, 12, 7, 130, 1, 1, 1, 1, 1)
      `,
      [
        DEFAULT_ADMIN_USERNAME,
        '交通系统超级管理员',
        'admin@traffic-system.local',
        '18200574338',
        passwordHash
      ]
    );
    return;
  }

  if (!rows[0].password_hash) {
    await connection.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, rows[0].id]);
  }
}

async function seedIncidents(connection: mysql.PoolConnection) {
  const [rows] = await connection.query<any[]>('SELECT COUNT(*) AS total FROM incidents');
  if (Number(rows[0]?.total ?? 0) > 0) {
    return;
  }

  await connection.query(
    `
      INSERT INTO incidents (id, type, severity, location, description, related_node_id, status, created_at)
      VALUES
        ('INC-001', '交通事故', 'HIGH', '成都天府大道-锦城大道路口', '晚高峰期间发生轻微追尾，占用北向一条车道，已安排现场处置。', 'A1', 'ACTIVE', DATE_SUB(NOW(), INTERVAL 20 MINUTE)),
        ('INC-002', '道路拥堵', 'MEDIUM', '成都益州大道-锦城大道路口', '车流量持续接近告警阈值，建议关注信号配时是否需要接管。', 'B2', 'ACTIVE', DATE_SUB(NOW(), INTERVAL 50 MINUTE)),
        ('INC-003', '道路施工', 'LOW', '成都天府三街-天府大道路口', '道路维护施工已接近结束，当前保持固定配时，待现场撤场后恢复。', 'G7', 'ACTIVE', DATE_SUB(NOW(), INTERVAL 2 HOUR))
    `
  );
}

export async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('[db] MySQL connected.');
    connection.release();
    return true;
  } catch (error: any) {
    console.warn('[db] MySQL unavailable, fallback to local demo mode.');
    console.warn('[db] Error: ' + error.message);
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.warn('[db] Hint: check DB_PASSWORD in .env.');
    } else if (error.code === 'ECONNREFUSED') {
      console.warn('[db] Hint: ensure MySQL is running and listening on the expected port.');
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

    await ensureUsersTableShape(connection);
    await seedSystemIntersections(connection);
    await seedDefaultAdmin(connection);
    await seedIncidents(connection);

    console.log('[db] Bootstrap completed.');
  } finally {
    connection.release();
  }
}

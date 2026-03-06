import mysql from 'mysql2/promise';
import 'dotenv/config';

// 创建数据库连接池
export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '123456', // 请替换为你本地 MySQL 的密码
  database: process.env.DB_NAME || 'traffic_system',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// 测试数据库连接
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
      console.warn('   💡 提示: 数据库密码错误！请检查你的 .env 文件或直接修改 db.ts 中的 password 字段，确保与你 Navicat 登录的密码一致。');
    } else if (error.code === 'ECONNREFUSED') {
      console.warn('   💡 提示: 数据库服务未启动，或端口不是 3306。');
    }
    
    return false;
  }
}



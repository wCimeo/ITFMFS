import pymysql
import random
import math
from datetime import datetime, timedelta

# ==========================================
# 数据库连接配置 (请根据你的本地 MySQL 修改)
# ==========================================
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    '': '123456', # 替换为你的 MySQL 密码
    'database': 'traffic_system',
    'charset': 'utf8mb4'
}

# 模拟的 7 个路口节点 (与前端地图对应)
NODES = [
    {'id': 'A1', 'name': '路口 A1 (市中心)', 'lat': 39.9042, 'lng': 116.4074},
    {'id': 'B2', 'name': '路口 B2 (西北角)', 'lat': 39.9150, 'lng': 116.4000},
    {'id': 'C3', 'name': '路口 C3 (东南角)', 'lat': 39.8950, 'lng': 116.4200},
    {'id': 'D4', 'name': '路口 D4 (东北角)', 'lat': 39.9200, 'lng': 116.4300},
    {'id': 'E5', 'name': '路口 E5 (西南角)', 'lat': 39.8900, 'lng': 116.3900},
    {'id': 'F6', 'name': '路口 F6 (远东区)', 'lat': 39.9050, 'lng': 116.4500},
    {'id': 'G7', 'name': '路口 G7 (远西北)', 'lat': 39.9300, 'lng': 116.3800}
]

def generate_flow_for_time(dt, node_id):
    """
    根据时间和路口生成具有真实规律的模拟车流量
    - 早上 8:00 左右是早高峰
    - 下午 18:00 左右是晚高峰
    - 凌晨 3:00 流量最低
    """
    hour = dt.hour + dt.minute / 60.0
    
    # 基础流量 (不同路口繁华程度不同)
    base_flow = 100 if node_id in ['A1', 'C3', 'F6'] else 60
    
    # 早高峰 (8:00) 模拟 (正态分布曲线)
    morning_peak = 150 * math.exp(-0.5 * ((hour - 8.0) / 1.5) ** 2)
    
    # 晚高峰 (18:00) 模拟
    evening_peak = 120 * math.exp(-0.5 * ((hour - 18.0) / 2.0) ** 2)
    
    # 凌晨低谷 (3:00)
    night_dip = -40 * math.exp(-0.5 * ((hour - 3.0) / 2.0) ** 2)
    
    # 加入随机噪声 (模拟真实世界的波动)
    noise = random.uniform(-15, 15)
    
    # 计算最终流量 (保证不为负数)
    flow = int(base_flow + morning_peak + evening_peak + night_dip + noise)
    flow = max(10, flow) # 至少有 10 辆车
    
    # 根据流量估算车速 (流量越大，车速越慢)
    # 假设限速 60km/h
    speed = max(15.0, 60.0 - (flow / 300.0) * 45.0 + random.uniform(-5, 5))
    
    # 估算道路占有率 (0-1)
    occupancy = min(0.95, flow / 400.0 + random.uniform(0, 0.05))
    
    return flow, round(speed, 2), round(occupancy, 4)

def main():
    print("正在连接数据库...")
    try:
        connection = pymysql.connect(**DB_CONFIG)
        cursor = connection.cursor()
    except Exception as e:
        print(f"数据库连接失败: {e}")
        print("请确保你已经在本地安装了 MySQL，创建了 traffic_system 数据库，并修改了脚本中的密码！")
        return

    try:
        # 1. 插入节点数据
        print("正在插入路网节点数据 (nodes)...")
        for node in NODES:
            sql = "INSERT IGNORE INTO nodes (id, name, lat, lng) VALUES (%s, %s, %s, %s)"
            cursor.execute(sql, (node['id'], node['name'], node['lat'], node['lng']))
        connection.commit()

        # 2. 生成历史交通流数据 (过去 30 天，每 15 分钟一条)
        # 30天 * 24小时 * 4次/小时 * 7个路口 = 20,160 条数据
        days_to_generate = 30
        end_time = datetime.now().replace(minute=0, second=0, microsecond=0)
        start_time = end_time - timedelta(days=days_to_generate)
        
        print(f"正在生成从 {start_time} 到 {end_time} 的模拟交通流数据...")
        print("预计生成 20,160 条记录，请稍候...")
        
        current_time = start_time
        records_to_insert = []
        
        while current_time < end_time:
            for node in NODES:
                flow, speed, occupancy = generate_flow_for_time(current_time, node['id'])
                records_to_insert.append((
                    node['id'],
                    current_time.strftime('%Y-%m-%d %H:%M:%S'),
                    flow,
                    speed,
                    occupancy
                ))
            
            # 每 15 分钟一个时间步 (LST-GCN 常用的时间粒度)
            current_time += timedelta(minutes=15)
            
            # 批量插入 (每 1000 条插入一次，提高速度)
            if len(records_to_insert) >= 1000:
                sql = "INSERT INTO traffic_flow (node_id, timestamp, flow, speed, occupancy) VALUES (%s, %s, %s, %s, %s)"
                cursor.executemany(sql, records_to_insert)
                connection.commit()
                records_to_insert = []
                print(f"已生成至 {current_time.strftime('%Y-%m-%d %H:%M:%S')}...")

        # 插入剩余的数据
        if records_to_insert:
            sql = "INSERT INTO traffic_flow (node_id, timestamp, flow, speed, occupancy) VALUES (%s, %s, %s, %s, %s)"
            cursor.executemany(sql, records_to_insert)
            connection.commit()

        print("🎉 数据生成完毕！成功插入约 20,000 条模拟交通流数据。")

    except Exception as e:
        print(f"发生错误: {e}")
        connection.rollback()
    finally:
        cursor.close()
        connection.close()

if __name__ == "__main__":
    main()

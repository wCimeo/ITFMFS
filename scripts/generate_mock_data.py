import math
import random
from datetime import datetime, timedelta

import pymysql

DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': '123456',
    'database': 'traffic_system',
    'charset': 'utf8mb4'
}

NODES = [
    {'id': 'A1', 'name': '成都天府大道-锦城大道路口', 'lat': 30.5702, 'lng': 104.0743},
    {'id': 'B2', 'name': '成都益州大道-锦城大道路口', 'lat': 30.5738, 'lng': 104.0618},
    {'id': 'C3', 'name': '成都天府大道-府城大道路口', 'lat': 30.5621, 'lng': 104.0749},
    {'id': 'D4', 'name': '成都交子大道-天府大道路口', 'lat': 30.5784, 'lng': 104.0726},
    {'id': 'E5', 'name': '成都剑南大道-锦城大道路口', 'lat': 30.5739, 'lng': 104.0468},
    {'id': 'F6', 'name': '成都天府二街-益州大道路口', 'lat': 30.5476, 'lng': 104.0646},
    {'id': 'G7', 'name': '成都天府三街-天府大道路口', 'lat': 30.5436, 'lng': 104.0768},
    {'id': 'H8', 'name': '成都科华南路-锦尚西二路路口', 'lat': 30.5654, 'lng': 104.0835},
    {'id': 'I9', 'name': '成都中环路火车南站段-科华南路路口', 'lat': 30.5952, 'lng': 104.0821},
    {'id': 'J10', 'name': '成都成都东站西广场-邛崃山路路口', 'lat': 30.6188, 'lng': 104.1215}
]

MODEL_NODES = {'A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7'}


def generate_flow_for_time(dt, node_id):
    hour = dt.hour + dt.minute / 60.0
    base_flow = 105 if node_id in MODEL_NODES else 80

    morning_peak = 150 * math.exp(-0.5 * ((hour - 8.0) / 1.4) ** 2)
    midday_peak = 60 * math.exp(-0.5 * ((hour - 13.0) / 1.7) ** 2)
    evening_peak = 135 * math.exp(-0.5 * ((hour - 18.0) / 1.8) ** 2)
    night_dip = -38 * math.exp(-0.5 * ((hour - 3.0) / 2.0) ** 2)
    noise = random.uniform(-12, 12)

    flow = int(base_flow + morning_peak + midday_peak + evening_peak + night_dip + noise)
    flow = max(12, flow)

    speed = max(15.0, 58.0 - (flow / 320.0) * 42.0 + random.uniform(-4, 4))
    occupancy = min(0.95, flow / 420.0 + random.uniform(0, 0.04))

    return flow, round(speed, 2), round(occupancy, 4)


def main():
    print('正在连接数据库...')
    try:
        connection = pymysql.connect(**DB_CONFIG)
        cursor = connection.cursor()
    except Exception as error:
        print(f'数据库连接失败: {error}')
        return

    try:
        print('正在写入成都 10 个路口节点...')
        for node in NODES:
            sql = '''
                INSERT INTO nodes (id, name, lat, lng)
                VALUES (%s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                  name = VALUES(name),
                  lat = VALUES(lat),
                  lng = VALUES(lng)
            '''
            cursor.execute(sql, (node['id'], node['name'], node['lat'], node['lng']))
        connection.commit()

        days_to_generate = 30
        end_time = datetime.now().replace(minute=0, second=0, microsecond=0)
        start_time = end_time - timedelta(days=days_to_generate)

        print(f'正在生成 {start_time} 到 {end_time} 的模拟交通流数据...')
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

            current_time += timedelta(minutes=15)

            if len(records_to_insert) >= 1000:
                cursor.executemany(
                    'INSERT INTO traffic_flow (node_id, timestamp, flow, speed, occupancy) VALUES (%s, %s, %s, %s, %s)',
                    records_to_insert
                )
                connection.commit()
                records_to_insert = []
                print(f'已生成至 {current_time.strftime("%Y-%m-%d %H:%M:%S")}')

        if records_to_insert:
            cursor.executemany(
                'INSERT INTO traffic_flow (node_id, timestamp, flow, speed, occupancy) VALUES (%s, %s, %s, %s, %s)',
                records_to_insert
            )
            connection.commit()

        print('模拟数据生成完成。')
        print('注意: 当前 LST-GCN 权重仍只覆盖 A1-G7，若要预测 H8-J10，需要重新训练并替换权重文件。')
    except Exception as error:
        connection.rollback()
        print(f'执行过程中发生错误: {error}')
    finally:
        cursor.close()
        connection.close()


if __name__ == '__main__':
    main()

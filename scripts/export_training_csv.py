from __future__ import annotations

import argparse
from pathlib import Path

import pymysql
import pymysql.cursors
from dotenv import load_dotenv
import os

load_dotenv()

SYSTEM_NODE_IDS = ['A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7', 'H8', 'I9', 'J10']
MODEL_NODE_IDS = ['A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7']


def parse_args():
    parser = argparse.ArgumentParser(description='导出用于训练的真实 CSV')
    parser.add_argument('--output', default='ai_service/flow_10nodes.csv', help='输出 CSV 路径')
    parser.add_argument('--scope', choices=['7', '10'], default='10', help='导出 7 路口或 10 路口范围')
    parser.add_argument('--start', default=None, help='起始时间，例如 2026-01-01 00:00:00')
    parser.add_argument('--end', default=None, help='结束时间，例如 2026-01-31 23:45:00')
    return parser.parse_args()


def get_connection():
    return pymysql.connect(
        host=os.getenv('DB_HOST', 'localhost'),
        user=os.getenv('DB_USER', 'root'),
        password=os.getenv('DB_PASSWORD', '123456'),
        database=os.getenv('DB_NAME', 'traffic_system'),
        charset='utf8mb4',
        cursorclass=pymysql.cursors.DictCursor
    )


def main():
    args = parse_args()
    node_ids = MODEL_NODE_IDS if args.scope == '7' else SYSTEM_NODE_IDS
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    placeholders = ','.join(['%s'] * len(node_ids))
    sql = f'''
        SELECT timestamp, node_id, flow
        FROM traffic_flow
        WHERE node_id IN ({placeholders})
    '''
    params: list[str] = list(node_ids)

    if args.start:
        sql += ' AND timestamp >= %s'
        params.append(args.start)
    if args.end:
        sql += ' AND timestamp <= %s'
        params.append(args.end)

    sql += ' ORDER BY timestamp ASC, node_id ASC'

    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(sql, params)
            rows = cursor.fetchall()

        if not rows:
            print('没有查到可导出的流量数据。')
            return

        import pandas as pd

        df = pd.DataFrame(rows)
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df = df[['timestamp', 'node_id', 'flow']]
        df.to_csv(output_path, index=False, encoding='utf-8-sig')

        print(f'导出完成: {output_path}')
        print(f'记录数: {len(df)}')
        print(f'路口范围: {node_ids}')
        print('该 CSV 可直接用于 thesis_10nodes.ipynb 或 train_lst_gcn_10nodes.py')
    finally:
        connection.close()


if __name__ == '__main__':
    main()

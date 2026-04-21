from __future__ import annotations

import argparse
import os
from pathlib import Path

import pymysql
import pymysql.cursors
from dotenv import load_dotenv

load_dotenv()

SYSTEM_NODE_IDS = ['A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7', 'H8', 'I9', 'J10']


def parse_args():
    parser = argparse.ArgumentParser(description='Export traffic_flow rows for 10-node training.')
    parser.add_argument('--output', default='ai_service/flow_10nodes.csv', help='Output CSV path')
    parser.add_argument('--start', default=None, help='Start timestamp, for example 2026-01-01 00:00:00')
    parser.add_argument('--end', default=None, help='End timestamp, for example 2026-01-31 23:45:00')
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
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    placeholders = ','.join(['%s'] * len(SYSTEM_NODE_IDS))
    sql = f'''
        SELECT timestamp, node_id, flow
        FROM traffic_flow
        WHERE node_id IN ({placeholders})
    '''
    params: list[str] = list(SYSTEM_NODE_IDS)

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
            print('No 10-node traffic_flow rows were found for export.')
            return

        import pandas as pd

        df = pd.DataFrame(rows)
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df = df[['timestamp', 'node_id', 'flow']]
        df.to_csv(output_path, index=False, encoding='utf-8-sig')

        print(f'Export completed: {output_path}')
        print(f'Rows: {len(df)}')
        print(f'Node scope: {SYSTEM_NODE_IDS}')
        print('This CSV can be used directly in thesis_10nodes.ipynb.')
    finally:
        connection.close()


if __name__ == '__main__':
    main()

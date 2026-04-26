import argparse
import json
from datetime import timedelta
from pathlib import Path

import pandas as pd
import pymysql

from script_utils import get_db_config, resolve_project_path

DB_CONFIG = get_db_config()
SYSTEM_NODE_IDS = ['A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7', 'H8', 'I9', 'J10']

STATION_CANDIDATES = {
    "id": ["station_id", "station", "id", "vds", "stationid"],
    "name": ["name", "station_name", "description", "location"],
    "lat": ["lat", "latitude", "y"],
    "lng": ["lng", "lon", "longitude", "x"],
    "district": ["district", "district_id"],
    "freeway": ["freeway", "fwy"],
    "direction": ["direction", "dir"],
    "lane_count": ["lane_count", "lanes", "num_lanes"],
    "station_type": ["station_type", "type"],
}

TRAFFIC_CANDIDATES = {
    "station_id": ["station_id", "station", "id", "vds", "stationid"],
    "timestamp": ["timestamp", "sample_time", "time", "datetime"],
    "date": ["date", "sample_date"],
    "clock_time": ["clock_time", "tod", "hour", "time_of_day"],
    "flow": ["flow", "total_flow", "volume", "samples"],
    "speed": ["speed", "avg_speed"],
    "occupancy": ["occupancy", "occ", "avg_occupancy"],
}


def parse_args():
    parser = argparse.ArgumentParser(
        description="Import PeMS station metadata and traffic flow files into MySQL."
    )
    parser.add_argument("--stations", type=Path, help="Path to the PeMS station metadata file.")
    parser.add_argument("--traffic", type=Path, required=True, help="Path to the PeMS traffic file.")
    parser.add_argument("--station-sep", default=None, help="Station file separator. Leave empty for auto detection.")
    parser.add_argument("--traffic-sep", default=None, help="Traffic file separator. Leave empty for auto detection.")
    parser.add_argument("--station-id-col", default=None)
    parser.add_argument("--station-name-col", default=None)
    parser.add_argument("--lat-col", default=None)
    parser.add_argument("--lng-col", default=None)
    parser.add_argument("--time-col", default=None)
    parser.add_argument("--date-col", default=None)
    parser.add_argument("--clock-time-col", default=None)
    parser.add_argument("--flow-col", default=None)
    parser.add_argument("--speed-col", default=None)
    parser.add_argument("--occupancy-col", default=None)
    parser.add_argument("--limit", type=int, default=None, help="Optional row limit for dry runs or testing.")
    parser.add_argument("--incremental", action="store_true", help="Only import rows newer than the latest PeMS timestamp already stored.")
    parser.add_argument("--mirror-system-flow", action="store_true", help="Mirror imported PeMS rows into the system traffic_flow table for A1-J10.")
    parser.add_argument("--traffic-step-minutes", type=int, default=15, help="Bucket size used when mirroring PeMS rows into traffic_flow.")
    parser.add_argument("--system-node-ids", default=",".join(SYSTEM_NODE_IDS), help="Comma-separated system node ids to mirror into traffic_flow.")
    parser.add_argument("--system-station-ids", default=None, help="Optional comma-separated PeMS station ids mapped to system nodes in order.")
    parser.add_argument("--summary-json", action="store_true", help="Print only a machine-readable JSON summary.")
    return parser.parse_args()


def log(args, message: str):
    if not args.summary_json:
        print(message)


def resolve_input_path(raw_path: Path | None):
    if raw_path is None:
        return None
    return resolve_project_path(str(raw_path))


def smart_read_csv(path: Path, sep: str | None):
    compression = "gzip" if path.suffix == ".gz" else "infer"
    return pd.read_csv(path, sep=sep if sep else None, engine="python", compression=compression)


def normalize_columns(frame: pd.DataFrame):
    frame.columns = [str(column).strip().lower() for column in frame.columns]
    return frame


def infer_column(frame: pd.DataFrame, explicit: str | None, candidates: list[str], required: bool = True):
    if explicit:
        explicit_normalized = explicit.strip().lower()
        if explicit_normalized in frame.columns:
            return explicit_normalized
        raise ValueError(f"Column '{explicit}' was not found in file columns: {list(frame.columns)}")

    for candidate in candidates:
        if candidate in frame.columns:
            return candidate

    if required:
        raise ValueError(f"Unable to infer column from candidates {candidates}. Available columns: {list(frame.columns)}")
    return None


def parse_csv_list(raw_value: str | None, label: str):
    if raw_value is None:
        return []

    values = [item.strip() for item in str(raw_value).split(",") if item.strip()]
    if not values:
        raise ValueError(f"{label} cannot be empty when provided.")
    return values


def ensure_tables(connection):
    with connection.cursor() as cursor:
        cursor.execute(
            """
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
            """
        )
        cursor.execute(
            """
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
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS pems_node_bindings (
              system_node_id VARCHAR(20) NOT NULL PRIMARY KEY,
              station_id VARCHAR(30) NOT NULL,
              binding_source VARCHAR(30) NOT NULL DEFAULT 'auto',
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              INDEX idx_pems_binding_station (station_id)
            )
            """
        )
    connection.commit()


def import_stations(connection, args):
    if not args.stations:
        log(args, "No station metadata file provided. Existing pems_stations table will be reused.")
        return 0

    stations = normalize_columns(smart_read_csv(args.stations, args.station_sep))
    station_id_col = infer_column(stations, args.station_id_col, STATION_CANDIDATES["id"])
    name_col = infer_column(stations, args.station_name_col, STATION_CANDIDATES["name"])
    lat_col = infer_column(stations, args.lat_col, STATION_CANDIDATES["lat"])
    lng_col = infer_column(stations, args.lng_col, STATION_CANDIDATES["lng"])
    district_col = infer_column(stations, None, STATION_CANDIDATES["district"], required=False)
    freeway_col = infer_column(stations, None, STATION_CANDIDATES["freeway"], required=False)
    direction_col = infer_column(stations, None, STATION_CANDIDATES["direction"], required=False)
    lane_count_col = infer_column(stations, None, STATION_CANDIDATES["lane_count"], required=False)
    station_type_col = infer_column(stations, None, STATION_CANDIDATES["station_type"], required=False)

    stations = stations.dropna(subset=[station_id_col, name_col, lat_col, lng_col]).copy()
    stations[station_id_col] = stations[station_id_col].astype(str)

    rows = [
        (
            row[station_id_col],
            str(row[district_col]) if district_col and pd.notna(row[district_col]) else None,
            str(row[freeway_col]) if freeway_col and pd.notna(row[freeway_col]) else None,
            str(row[direction_col]) if direction_col and pd.notna(row[direction_col]) else None,
            str(row[name_col]),
            float(row[lat_col]),
            float(row[lng_col]),
            int(row[lane_count_col]) if lane_count_col and pd.notna(row[lane_count_col]) else None,
            str(row[station_type_col]) if station_type_col and pd.notna(row[station_type_col]) else None,
        )
        for _, row in stations.iterrows()
    ]

    if not rows:
        return 0

    with connection.cursor() as cursor:
        cursor.executemany(
            """
            INSERT INTO pems_stations (id, district, freeway, direction, name, lat, lng, lane_count, station_type)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
              district = VALUES(district),
              freeway = VALUES(freeway),
              direction = VALUES(direction),
              name = VALUES(name),
              lat = VALUES(lat),
              lng = VALUES(lng),
              lane_count = VALUES(lane_count),
              station_type = VALUES(station_type)
            """,
            rows,
        )
    connection.commit()
    log(args, f"Imported or updated {len(rows)} PeMS stations.")
    return len(rows)


def load_traffic_frame(args):
    traffic = normalize_columns(smart_read_csv(args.traffic, args.traffic_sep))
    if args.limit:
        traffic = traffic.head(args.limit)

    station_id_col = infer_column(traffic, args.station_id_col, TRAFFIC_CANDIDATES["station_id"])
    flow_col = infer_column(traffic, args.flow_col, TRAFFIC_CANDIDATES["flow"])
    speed_col = infer_column(traffic, args.speed_col, TRAFFIC_CANDIDATES["speed"], required=False)
    occupancy_col = infer_column(traffic, args.occupancy_col, TRAFFIC_CANDIDATES["occupancy"], required=False)
    timestamp_col = infer_column(traffic, args.time_col, TRAFFIC_CANDIDATES["timestamp"], required=False)
    date_col = infer_column(traffic, args.date_col, TRAFFIC_CANDIDATES["date"], required=False)
    clock_time_col = infer_column(traffic, args.clock_time_col, TRAFFIC_CANDIDATES["clock_time"], required=False)

    if not timestamp_col and not (date_col and clock_time_col):
        raise ValueError("Unable to build timestamp. Provide --time-col or both --date-col and --clock-time-col.")

    traffic = traffic.dropna(subset=[station_id_col, flow_col]).copy()
    traffic[station_id_col] = traffic[station_id_col].astype(str)

    if timestamp_col:
        parsed_timestamp = pd.to_datetime(traffic[timestamp_col], errors="coerce")
    else:
        parsed_timestamp = pd.to_datetime(
            traffic[date_col].astype(str) + " " + traffic[clock_time_col].astype(str),
            errors="coerce",
        )

    flow_values = pd.to_numeric(traffic[flow_col], errors="coerce")
    speed_values = pd.to_numeric(traffic[speed_col], errors="coerce") if speed_col else pd.Series([pd.NA] * len(traffic), index=traffic.index)
    occupancy_values = pd.to_numeric(traffic[occupancy_col], errors="coerce") if occupancy_col else pd.Series([pd.NA] * len(traffic), index=traffic.index)

    frame = pd.DataFrame(
        {
            "station_id": traffic[station_id_col].astype(str),
            "parsed_timestamp": parsed_timestamp,
            "flow": flow_values,
            "speed": speed_values,
            "occupancy": occupancy_values,
        }
    )
    frame = frame.dropna(subset=["station_id", "parsed_timestamp", "flow"]).copy()
    frame = frame.sort_values(["parsed_timestamp", "station_id"]).reset_index(drop=True)
    return frame


def get_latest_pems_timestamp(connection):
    with connection.cursor() as cursor:
        cursor.execute("SELECT MAX(timestamp) AS latest_time FROM pems_traffic_flow")
        row = cursor.fetchone()
    return row[0] if row and row[0] else None


def insert_traffic_rows(connection, frame: pd.DataFrame):
    if frame.empty:
        return 0, None

    rows = []
    for row in frame.itertuples(index=False):
        rows.append(
            (
                row.station_id,
                row.parsed_timestamp.to_pydatetime(),
                float(row.flow),
                None if pd.isna(row.speed) else float(row.speed),
                None if pd.isna(row.occupancy) else float(row.occupancy),
            )
        )

    with connection.cursor() as cursor:
        cursor.executemany(
            """
            INSERT INTO pems_traffic_flow (station_id, timestamp, flow, speed, occupancy)
            VALUES (%s, %s, %s, %s, %s)
            """,
            rows,
        )
    connection.commit()
    latest_timestamp = frame["parsed_timestamp"].max().to_pydatetime()
    return len(rows), latest_timestamp


def import_traffic(connection, args):
    frame = load_traffic_frame(args)
    latest_existing_timestamp = get_latest_pems_timestamp(connection) if args.incremental else None

    if latest_existing_timestamp is not None:
        frame = frame[frame["parsed_timestamp"] > pd.Timestamp(latest_existing_timestamp)].copy()

    imported_rows, latest_timestamp = insert_traffic_rows(connection, frame)
    if imported_rows:
        log(args, f"Imported {imported_rows} PeMS traffic rows.")
    else:
        log(args, "No new PeMS traffic rows were imported.")

    return frame, {
        "imported_rows": imported_rows,
        "latest_existing_timestamp": latest_existing_timestamp.isoformat() if latest_existing_timestamp else None,
        "latest_timestamp": latest_timestamp.isoformat() if latest_timestamp else None,
    }


def load_existing_bindings(connection, node_ids: list[str]):
    if not node_ids:
        return {}

    placeholders = ", ".join(["%s"] * len(node_ids))
    with connection.cursor(pymysql.cursors.DictCursor) as cursor:
        cursor.execute(
            f"""
            SELECT system_node_id, station_id
            FROM pems_node_bindings
            WHERE system_node_id IN ({placeholders})
            ORDER BY system_node_id ASC
            """,
            node_ids,
        )
        rows = cursor.fetchall()
    return {row["system_node_id"]: row["station_id"] for row in rows}


def fetch_candidate_station_ids(connection, limit: int):
    with connection.cursor(pymysql.cursors.DictCursor) as cursor:
        cursor.execute(
            """
            SELECT station_id, COUNT(*) AS total_rows, MAX(timestamp) AS latest_time
            FROM pems_traffic_flow
            GROUP BY station_id
            ORDER BY total_rows DESC, latest_time DESC, station_id ASC
            LIMIT %s
            """,
            [limit],
        )
        rows = cursor.fetchall()
    return [row["station_id"] for row in rows]


def upsert_bindings(connection, rows: list[tuple[str, str, str]]):
    if not rows:
        return

    with connection.cursor() as cursor:
        cursor.executemany(
            """
            INSERT INTO pems_node_bindings (system_node_id, station_id, binding_source)
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE
              station_id = VALUES(station_id),
              binding_source = VALUES(binding_source)
            """,
            rows,
        )
    connection.commit()


def resolve_system_bindings(connection, node_ids: list[str], explicit_station_ids: list[str] | None):
    if explicit_station_ids:
        if len(explicit_station_ids) != len(node_ids):
            raise ValueError("When --system-station-ids is provided, it must match the number of --system-node-ids entries.")

        binding_rows = [
            (node_id, station_id, "explicit")
            for node_id, station_id in zip(node_ids, explicit_station_ids)
        ]
        upsert_bindings(connection, binding_rows)
        return {node_id: station_id for node_id, station_id in zip(node_ids, explicit_station_ids)}

    bindings = load_existing_bindings(connection, node_ids)
    missing_node_ids = [node_id for node_id in node_ids if node_id not in bindings]

    if missing_node_ids:
        candidates = fetch_candidate_station_ids(connection, len(node_ids) * 4)
        used_station_ids = set(bindings.values())
        new_rows = []

        for node_id in missing_node_ids:
            station_id = next((candidate for candidate in candidates if candidate not in used_station_ids), None)
            if not station_id:
                break
            bindings[node_id] = station_id
            used_station_ids.add(station_id)
            new_rows.append((node_id, station_id, "auto"))

        upsert_bindings(connection, new_rows)

    return bindings


def query_pems_rows(connection, station_ids: list[str], start_time, end_time):
    if not station_ids:
        return pd.DataFrame(columns=["station_id", "timestamp", "flow", "speed", "occupancy"])

    placeholders = ", ".join(["%s"] * len(station_ids))
    with connection.cursor(pymysql.cursors.DictCursor) as cursor:
        cursor.execute(
            f"""
            SELECT station_id, timestamp, flow, speed, occupancy
            FROM pems_traffic_flow
            WHERE station_id IN ({placeholders})
              AND timestamp >= %s
              AND timestamp < %s
            ORDER BY timestamp ASC, station_id ASC
            """,
            [*station_ids, start_time, end_time],
        )
        rows = cursor.fetchall()

    return pd.DataFrame(rows)


def mirror_system_flow(connection, imported_frame: pd.DataFrame, args):
    summary = {
        "mirrored_rows": 0,
        "latest_mirrored_timestamp": None,
        "bindings": [],
    }
    if not args.mirror_system_flow or imported_frame.empty:
        return summary

    node_ids = parse_csv_list(args.system_node_ids, "--system-node-ids")
    explicit_station_ids = parse_csv_list(args.system_station_ids, "--system-station-ids") if args.system_station_ids else None
    bindings = resolve_system_bindings(connection, node_ids, explicit_station_ids)
    if not bindings:
        return summary

    station_to_node = {station_id: node_id for node_id, station_id in bindings.items()}
    relevant_imported = imported_frame[imported_frame["station_id"].isin(station_to_node.keys())].copy()
    if relevant_imported.empty:
        summary["bindings"] = [
            {"system_node_id": node_id, "station_id": station_id}
            for node_id, station_id in bindings.items()
        ]
        return summary

    bucket_freq = f"{max(1, int(args.traffic_step_minutes))}min"
    relevant_imported["bucket_timestamp"] = relevant_imported["parsed_timestamp"].dt.floor(bucket_freq)
    min_bucket = relevant_imported["bucket_timestamp"].min().to_pydatetime()
    max_bucket = relevant_imported["bucket_timestamp"].max().to_pydatetime() + timedelta(minutes=max(1, int(args.traffic_step_minutes)))

    raw_frame = query_pems_rows(connection, list(station_to_node.keys()), min_bucket, max_bucket)
    if raw_frame.empty:
        summary["bindings"] = [
            {"system_node_id": node_id, "station_id": station_id}
            for node_id, station_id in bindings.items()
        ]
        return summary

    raw_frame["parsed_timestamp"] = pd.to_datetime(raw_frame["timestamp"], errors="coerce")
    raw_frame = raw_frame.dropna(subset=["parsed_timestamp"]).copy()
    raw_frame["bucket_timestamp"] = raw_frame["parsed_timestamp"].dt.floor(bucket_freq)
    raw_frame["system_node_id"] = raw_frame["station_id"].map(station_to_node)
    raw_frame = raw_frame.dropna(subset=["system_node_id"]).copy()

    grouped = (
        raw_frame.groupby(["system_node_id", "bucket_timestamp"], as_index=False)
        .agg(
            flow=("flow", "mean"),
            speed=("speed", "mean"),
            occupancy=("occupancy", "mean"),
        )
        .sort_values(["bucket_timestamp", "system_node_id"])
    )

    if grouped.empty:
        summary["bindings"] = [
            {"system_node_id": node_id, "station_id": station_id}
            for node_id, station_id in bindings.items()
        ]
        return summary

    delete_rows = []
    insert_rows = []
    for row in grouped.itertuples(index=False):
        bucket_timestamp = row.bucket_timestamp.to_pydatetime()
        delete_rows.append((row.system_node_id, bucket_timestamp))
        insert_rows.append(
            (
                row.system_node_id,
                bucket_timestamp,
                int(round(float(row.flow))),
                None if pd.isna(row.speed) else round(float(row.speed), 2),
                None if pd.isna(row.occupancy) else round(float(row.occupancy), 4),
            )
        )

    with connection.cursor() as cursor:
        cursor.executemany(
            "DELETE FROM traffic_flow WHERE node_id = %s AND timestamp = %s",
            delete_rows,
        )
        cursor.executemany(
            """
            INSERT INTO traffic_flow (node_id, timestamp, flow, speed, occupancy)
            VALUES (%s, %s, %s, %s, %s)
            """,
            insert_rows,
        )
    connection.commit()

    summary["mirrored_rows"] = len(insert_rows)
    summary["latest_mirrored_timestamp"] = grouped["bucket_timestamp"].max().to_pydatetime().isoformat()
    summary["bindings"] = [
        {"system_node_id": node_id, "station_id": station_id}
        for node_id, station_id in bindings.items()
    ]
    return summary


def main():
    args = parse_args()
    args.stations = resolve_input_path(args.stations)
    args.traffic = resolve_input_path(args.traffic)

    if args.stations and not args.stations.exists():
        raise FileNotFoundError(f"Station metadata file was not found: {args.stations}")
    if not args.traffic.exists():
        raise FileNotFoundError(f"Traffic flow file was not found: {args.traffic}")

    summary = {
        "stations_imported": 0,
        "traffic_imported_rows": 0,
        "latest_existing_timestamp": None,
        "latest_pems_timestamp": None,
        "mirrored_system_rows": 0,
        "latest_mirrored_timestamp": None,
        "bindings": [],
    }

    log(args, "Connecting to MySQL...")
    connection = pymysql.connect(**DB_CONFIG)
    try:
        ensure_tables(connection)
        summary["stations_imported"] = import_stations(connection, args)
        imported_frame, traffic_summary = import_traffic(connection, args)
        summary["traffic_imported_rows"] = traffic_summary["imported_rows"]
        summary["latest_existing_timestamp"] = traffic_summary["latest_existing_timestamp"]
        summary["latest_pems_timestamp"] = traffic_summary["latest_timestamp"]

        mirror_summary = mirror_system_flow(connection, imported_frame, args)
        summary["mirrored_system_rows"] = mirror_summary["mirrored_rows"]
        summary["latest_mirrored_timestamp"] = mirror_summary["latest_mirrored_timestamp"]
        summary["bindings"] = mirror_summary["bindings"]

        if args.summary_json:
            print(json.dumps(summary, ensure_ascii=False))
        else:
            print("PeMS data import completed successfully.")
            print(json.dumps(summary, ensure_ascii=False, indent=2))
    finally:
        connection.close()


if __name__ == "__main__":
    main()

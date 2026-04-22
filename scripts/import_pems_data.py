import argparse
from pathlib import Path

import pandas as pd
import pymysql

from script_utils import get_db_config

DB_CONFIG = get_db_config()

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
    return parser.parse_args()


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
    connection.commit()


def import_stations(connection, args):
    if not args.stations:
        print("No station metadata file provided. Existing pems_stations table will be reused.")
        return

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
    print(f"Imported or updated {len(rows)} PeMS stations.")


def import_traffic(connection, args):
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
        traffic["parsed_timestamp"] = pd.to_datetime(traffic[timestamp_col], errors="coerce")
    else:
        traffic["parsed_timestamp"] = pd.to_datetime(
            traffic[date_col].astype(str) + " " + traffic[clock_time_col].astype(str),
            errors="coerce",
        )

    traffic = traffic.dropna(subset=["parsed_timestamp"])

    rows = []
    for _, row in traffic.iterrows():
        rows.append(
            (
                row[station_id_col],
                row["parsed_timestamp"].to_pydatetime(),
                float(row[flow_col]),
                float(row[speed_col]) if speed_col and pd.notna(row[speed_col]) else None,
                float(row[occupancy_col]) if occupancy_col and pd.notna(row[occupancy_col]) else None,
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
    print(f"Imported {len(rows)} PeMS traffic rows.")


def main():
    args = parse_args()
    if args.stations and not args.stations.exists():
        raise FileNotFoundError(f"Station metadata file was not found: {args.stations}")
    if not args.traffic.exists():
        raise FileNotFoundError(f"Traffic flow file was not found: {args.traffic}")

    print("Connecting to MySQL...")
    connection = pymysql.connect(**DB_CONFIG)
    try:
        ensure_tables(connection)
        import_stations(connection, args)
        import_traffic(connection, args)
        print("PeMS data import completed successfully.")
    finally:
        connection.close()


if __name__ == "__main__":
    main()

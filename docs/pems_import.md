# PeMS 数据导入说明

本项目的实时路网地图已经支持优先读取 `PeMS` 导入数据。

由于 PeMS 官方数据通常需要用户自行登录或下载原始文件，因此这里采用“你下载文件，我本地导入数据库”的方案。导入成功后，地图接口会自动优先显示 `PeMS` 站点与流量数据。

## 一、准备文件

建议准备两类文件：

1. 站点元数据文件：至少包含站点编号、名称、经纬度
2. 流量数据文件：至少包含站点编号、时间、流量

## 二、推荐来源

- PeMS 官方入口：https://pems.dot.ca.gov/
- PeMS 数据说明页面：https://pems.dot.ca.gov/?dnode=Clearinghouse

## 三、导入前确认

```powershell
conda activate thesis
pip install pandas==3.0.1 pymysql==1.4.6
```

并确保：

1. MySQL 已启动
2. `traffic_system` 数据库已存在
3. 项目根目录 `.env` 中的 `DB_*` 配置已填写正确，导入脚本会自动读取

## 四、导入命令

### 同时导入站点和流量

```powershell
conda activate thesis
cd /d D:\Projects\VS_Code\ITFMFS
python scripts\import_pems_data.py --stations "D:\PeMS\stations.csv" --traffic "D:\PeMS\flow.csv"
```

### 手动指定列名

```powershell
python scripts\import_pems_data.py ^
  --stations "D:\PeMS\station_meta.csv" ^
  --traffic "D:\PeMS\station_flow.csv" ^
  --station-id-col station_id ^
  --station-name-col station_name ^
  --lat-col latitude ^
  --lng-col longitude ^
  --time-col timestamp ^
  --flow-col flow ^
  --speed-col speed ^
  --occupancy-col occupancy
```

### 时间拆分为日期列和时刻列

```powershell
python scripts\import_pems_data.py ^
  --stations "D:\PeMS\stations.csv" ^
  --traffic "D:\PeMS\traffic.csv" ^
  --date-col date ^
  --clock-time-col time ^
  --flow-col flow
```

## 五、导入成功后

导入成功后：

1. 数据会进入 `pems_stations` 和 `pems_traffic_flow`
2. `实时路网地图` 页面会自动优先显示 PeMS 数据
3. 页面顶部会显示当前数据源为 `PeMS`

## 六、建议做法

第一次导入时建议先用少量样本测试：

```powershell
python scripts\import_pems_data.py --stations "D:\PeMS\stations.csv" --traffic "D:\PeMS\flow.csv" --limit 5000
```

## 七、自动同步任务

如果你已经有会持续更新的 `stations.csv` / `flow.csv` 或 `.gz` 文件，可以在项目根目录 `.env` 中开启：

```env
ENABLE_TRAFFIC_SIMULATOR=false
PEMS_SYNC_ENABLED=true
PEMS_SYNC_INTERVAL_MS=60000
PEMS_SYNC_STEP_MINUTES=15
PEMS_SYNC_PYTHON_EXECUTABLE=python
PEMS_SYNC_STATIONS_PATH=D:\PeMS\stations.csv
PEMS_SYNC_TRAFFIC_PATH=D:\PeMS\flow.csv
PEMS_SYNC_SYSTEM_NODE_IDS=A1,B2,C3,D4,E5,F6,G7,H8,I9,J10
PEMS_SYNC_SYSTEM_STATION_IDS=
```

开启后，Express 服务会定时调用 `scripts/import_pems_data.py --incremental --mirror-system-flow`：

1. 把新增 PeMS 记录增量写入 `pems_stations` / `pems_traffic_flow`
2. 把选中的 10 个 PeMS 站点稳定映射到 `A1-J10`
3. 按 `15` 分钟时间粒度把真实数据镜像到 `traffic_flow`
4. 让预测模块直接使用与真实时间对齐后的最新数据窗口

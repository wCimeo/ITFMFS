# 基于大数据分析的智能交通流量监控与预测系统

本项目是一个面向毕业论文开发的智能交通原型系统，围绕交通流量监控、短时预测、可视化展示和基础路径推荐展开实现。

当前采用的实际技术栈如下：

- 前端：React 19 + TypeScript + Vite + Tailwind CSS
- 后端：Express + TypeScript
- 数据库：MySQL 8
- AI 推理服务：Flask + PyTorch
- 模型：LST-GCN

## 项目结构

```text
ITFMFS/
├─ ai_service/               # Flask 推理服务与模型权重
├─ database/                 # 数据库结构脚本
├─ scripts/                  # 数据生成脚本
├─ server/                   # Express 路由与数据库连接
├─ src/                      # React 前端
├─ server.ts                 # 项目启动入口
├─ package.json
└─ README.md
```

## 当前已实现功能

- 实时交通指标展示
- 路网流量地图可视化
- 基于历史流量的 LST-GCN 预测展示
- 基础路径推荐接口与前端页面联动
- MySQL 数据读取与回退 mock 数据机制

## 运行环境

### 1. Node.js

建议使用 Node.js 20 及以上版本。

### 2. Python

建议使用 Conda 虚拟环境，当前项目已确认可用环境如下：

- Python 3.12.12
- Flask 3.1.3
- numpy 2.0.1
- pytorch 2.5.1
- pymysql 1.1.2
- pandas 3.0.1
- matplotlib 3.10.8

### 3. MySQL

建议使用 MySQL 8.x，本项目默认数据库名为 `traffic_system`。

## 本地启动步骤

### 第一步：导入数据库

先创建数据库：

```powershell
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS traffic_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

再导入表结构：

```powershell
mysql -u root -p traffic_system < "c:\Users\陈梦\Desktop\traffic_system.sql"
```

如果你已经在本地 MySQL 中保留了现有测试数据，也可以继续直接使用，不必重复清空导入。

### 第二步：配置 `.env`

在项目根目录创建或修改 `.env`：

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=123456
DB_NAME=traffic_system
```

请将 `DB_PASSWORD` 改成你本机实际的 MySQL 密码。

### 第三步：安装前端和服务端依赖

在项目根目录执行：

```powershell
cd /d e:\Obsidian\graduationThesis\ITFMFS
npm.cmd install
```

### 第四步：准备 Python 环境

如果已有可用 Conda 环境，直接激活即可。若需新建环境，可执行：

```powershell
conda create -n thesis python=3.12.12 -y
conda activate thesis
pip install flask==3.1.3 numpy==2.0.1 torch==2.5.1 pymysql==1.1.2 pandas==3.0.1 matplotlib==3.10.8
```

### 第五步：启动 AI 推理服务

打开一个终端：

```powershell
conda activate thesis
cd /d e:\Obsidian\graduationThesis\ITFMFS\ai_service
python app.py
```

正常情况下会监听：

```text
http://127.0.0.1:5000
```

### 第六步：启动前端与 Express 服务

再打开一个终端：

```powershell
cd /d e:\Obsidian\graduationThesis\ITFMFS
npm.cmd run dev
```

启动后访问：

```text
http://localhost:3000
```

## 生成测试数据

如果数据库表存在但 `traffic_flow` 数据不足，可使用脚本生成模拟交通流量数据：

```powershell
conda activate thesis
cd /d e:\Obsidian\graduationThesis\ITFMFS
python scripts\generate_mock_data.py
```

该脚本会向 `nodes` 和 `traffic_flow` 表写入测试数据。

## 常用命令

### 启动开发环境

```powershell
npm.cmd run dev
```

### 类型检查

```powershell
npm.cmd run lint
```

### 前端构建

```powershell
npm.cmd run build
```

### 启动项目服务

```powershell
npm.cmd run start
```

## 数据流说明

系统核心数据流目前如下：

1. MySQL 中保存历史交通流量数据。
2. Express 从 `traffic_flow` 和 `nodes` 表读取最近时段数据。
3. `/api/visual/flowchart` 将最近 12 个时间步的 7 节点流量组装为历史矩阵。
4. Flask 推理服务读取 `lst_gcn_weights.pth`，执行 LST-GCN 推理。
5. 前端页面展示实时指标、预测折线图和路网地图。

## 关键文件说明

- [server.ts](/e:/Obsidian/graduationThesis/ITFMFS/server.ts)：Node 服务启动入口
- [server/routes.ts](/e:/Obsidian/graduationThesis/ITFMFS/server/routes.ts)：主要后端接口
- [server/db.ts](/e:/Obsidian/graduationThesis/ITFMFS/server/db.ts)：MySQL 连接配置
- [ai_service/app.py](/e:/Obsidian/graduationThesis/ITFMFS/ai_service/app.py)：Flask 推理接口
- [ai_service/lst_gcn_weights.pth](/e:/Obsidian/graduationThesis/ITFMFS/ai_service/lst_gcn_weights.pth)：训练好的模型权重
- [scripts/generate_mock_data.py](/e:/Obsidian/graduationThesis/ITFMFS/scripts/generate_mock_data.py)：测试数据生成脚本
- [database/schema.sql](/e:/Obsidian/graduationThesis/ITFMFS/database/schema.sql)：数据库结构定义

## 当前注意事项

- 当前系统中部分模块仍为原型实现，真实联通程度最高的是实时指标、地图和预测图。
- 路径推荐功能目前已完成前后端联调，但后端仍是规则化 mock 逻辑，不是完整图搜索算法。
- 信号灯优化、异常事件监控等模块目前仍偏展示型实现，后续可继续扩展。
- 论文写作应以当前真实实现架构为准，即 `React + Express + MySQL + Flask/PyTorch`。

## 常见问题排查

### 1. 页面能打开，但图表是默认数据

可能原因：

- MySQL 未连接成功
- `traffic_flow` 表没有数据
- `.env` 数据库配置错误

建议先检查后端终端日志。

### 2. 地图正常，但预测图没有真实预测结果

可能原因：

- Flask 推理服务未启动
- `5000` 端口不可访问
- `lst_gcn_weights.pth` 缺失或加载失败

### 3. MySQL 报密码错误

请检查根目录 `.env` 中的 `DB_PASSWORD` 是否与你本机一致。

### 4. Python 启动时报缺少依赖

请确认当前已激活正确的 Conda 环境，并安装：

```powershell
pip install flask==3.1.3 numpy==2.0.1 torch==2.5.1 pymysql==1.1.2 pandas==3.0.1 matplotlib==3.10.8
```

### 5. 端口被占用

- 前端/后端默认端口：`3000`
- Flask 默认端口：`5000`

若端口冲突，请先关闭已有进程后再重新运行。

## 后续优化方向

- 引入 Redis 缓存高频预测结果和实时数据
- 将预测结果写入 `predictions` 表
- 接入公开交通数据集用于论文实验
- 完善路径规划与信号灯优化算法
- 增强系统监控、异常告警与运行日志记录

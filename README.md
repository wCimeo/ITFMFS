# 基于大数据分析的智能交通流量监控与预测系统

本项目是一个面向毕业论文的智能交通原型系统，当前以工程实现为主线，围绕交通流量监控、短时预测、可视化展示、事件管理、路线推荐和系统设置等模块展开开发。

当前项目已经从开题阶段的设想方案，收敛为一套真实可运行的实现架构：`React + Express + MySQL + Flask/PyTorch`。后续论文撰写、系统截图和答辩展示，建议统一以这一实际实现口径为准。

## 一、现阶段结论

当前版本已经完成了“登录鉴权 + 数据库联通 + 实时地图 + 1-24 点流量图 + LST-GCN 预测 + 事件上报 + 路线推荐 + 设置页 + 报表导出”的核心闭环，已经具备阶段汇报、导师检查和论文系统实现章节撰写的基础。

按当前代码完成度估计：

- 工程原型整体进度约为 `70% - 75%`
- 核心演示链路已经完成
- 后续重点转向“公开数据集接入、10 路口预测完善、算法增强、论文整理”

说明：以上进度判断是基于当前仓库代码、接口联通情况和可演示程度做出的阶段性评估，适合用于中期检查或导师汇报。

## 二、当前技术栈

- 前端：React 19 + TypeScript + Vite + Tailwind CSS + Recharts + Leaflet
- 后端：Express + TypeScript
- 数据层：MySQL 8
- AI 推理服务：Flask + PyTorch
- 模型：LST-GCN
- 开发环境：Node.js + Conda（Python 3.12.12）

当前已确认的 Python 虚拟环境配置如下：

- 环境名：`thesis`
- Python：`3.12.12`
- Flask：`3.1.3`
- numpy：`2.0.1`
- pytorch：`2.11.0+cu128`
- pymysql：`1.4.6`
- pandas：`3.0.1`
- matplotlib：`3.10.8`

## 三、系统总体架构

```text
React 前端界面
    ↓
Express / TypeScript 接口层
    ↓
MySQL 数据库（nodes / traffic_flow / predictions / users / incidents / pems_*）
    ↓
Flask / PyTorch 推理服务
    ↓
LST-GCN 权重推理与预测结果回写
```

当前系统中的主要数据链路如下：

1. `traffic_flow -> Express -> /api/visual/flowchart -> 前端图表`
2. `traffic_flow + nodes -> /api/visual/map -> 前端路网地图`
3. `历史窗口 -> Flask /predict -> predictions -> 前端按小时聚合展示真实预测结果`
4. `incidents -> 事件列表/状态更新 -> 地图联动`
5. `users -> 登录会话 -> 超级管理员设置页`

## 四、当前已实现功能

### 1. 登录与会话管理

- 系统已增加超级管理员登录入口
- 每次启动项目，默认先进入登录页
- 登录信息默认保存 `7 天`
- 会话过期后需要重新登录
- 设置页支持主动退出登录
- 当前系统只有一种角色：超级管理员

默认账号可由 `.env` 控制：

```env
ADMIN_USERNAME=admin_traffic
ADMIN_PASSWORD=Traffic@123456
```

### 2. 控制台总览

- 展示实时总流量、平均车速、道路占有率、当前优化路口等指标
- 支持查看 `1-24` 点的日内流量变化图
- 支持早高峰、午高峰、晚高峰快速聚焦
- 支持图表缩放与日期切换
- 支持手动触发一次预测和信号优化相关联动

### 3. 实时路网地图

- 地图默认展示中国四川成都路网范围
- 当前系统范围已扩展到 `10` 个路口
- 支持地图点位聚焦、节点查看和手动刷新
- 支持优先显示本地数据库中的最新时间片
- 支持本地自动模拟写入 `traffic_flow`，形成可演示的持续变化效果
- 若导入 PeMS 数据，则地图可切换为显示已导入的 PeMS 快照

### 4. 交通流量预测

- 已接入 LST-GCN 推理服务
- 当前预测模块仅保留 `10` 路口范围，A1-J10 都会参与模型推理
- 当前模型输入窗口默认为 `12` 个时间步
- 当前系统粒度按 `15 分钟` 组织历史数据和预测结果
- 预测结果会写入 `predictions` 表，控制台图表按小时聚合这些真实预测结果后再展示

### 5. 事件管理

- 支持事件上报、事件列表展示、事件状态更新
- 支持从事件列表跳转地图并聚焦到对应路口
- 路口范围已收敛为下拉框，避免手工输入超出系统边界

### 6. 智能路线推荐

- 支持起点、终点和优化目标选择
- 支持最短时间、避开拥堵、最短距离三种目标
- 已完成前后端联调与结果展示
- 当前后端仍为规则化原型逻辑，不是完整图搜索算法

### 7. 设置与系统管理

- 支持管理员信息查看与保存
- 支持主题切换
- 支持模型参数和告警阈值配置说明
- 所有关键交互动作均提供弹窗反馈

### 8. 报表导出

- 当前支持导出系统运行报告
- 为了兼容性，当前导出格式为 `CSV`
- 导出的 `CSV` 可以直接用 Excel 打开
- 导出内容包含管理员信息、运行指标、预测结果、信号状态等

## 五、当前模块进度

| 模块 | 当前状态 | 说明 |
| --- | --- | --- |
| 系统整体架构 | 已完成 | 前后端、数据库、AI 推理服务已打通 |
| 登录与会话机制 | 已完成 | 支持登录、7 天会话、退出登录 |
| 控制台与图表展示 | 已完成 | 支持 1-24 点图表、高峰聚焦、刷新 |
| 实时路网地图 | 已完成 | 成都 10 路口地图可演示，支持持续刷新 |
| LST-GCN 预测闭环 | 已完成 | 已支持预测调用、结果存储和图表展示 |
| 事件管理 | 已完成 | 支持上报、状态更新、地图联动 |
| 路线推荐 | 已完成基础版本 | 已可演示，后续可升级为更真实的图搜索算法 |
| 设置页与管理员信息 | 已完成 | 支持参数说明、保存和退出登录 |
| PeMS 数据导入 | 已完成基础能力 | 支持手动导入快照，尚未做自动同步 |
| 10 路口真实预测 | 进行中 | 需要重新训练并替换 10 路口权重 |
| 公开数据集实验 | 进行中 | 已明确采用 PeMS 路线，后续补实验结果 |
| Redis 缓存优化 | 待开展 | 可作为工程优化项补充 |
| 论文正文整理 | 进行中 | 已具备撰写系统实现章节的基础 |

## 六、当前数据与模型状态

### 1. 路口范围

- 当前系统地图、事件、路线推荐等模块已扩展到 `10` 个成都路口
- 当前预测模块固定为 `10` 个成都路口，系统范围与模型范围保持一致

### 2. 模型权重状态

当前 AI 服务逻辑如下：

- 如果存在 `ai_service/lst_gcn_weights_10nodes.pth`，则可启用 `10` 路口预测
- 相关元数据可通过 `ai_service/lst_gcn_10nodes_metadata.json` 辅助读取
- 当前仓库仅保留 `10` 路口权重与对应元数据，不再维护 `7` 路口预测分支

### 3. 当前训练与推理相关文件

- `ai_service/thesis_10nodes.ipynb`：按原 notebook 风格扩展的 10 路口版本
- `ai_service/app.py`：当前实际使用的 Flask 推理服务
- `scripts/export_training_csv.py`：从 MySQL 导出训练 CSV
- `scripts/script_utils.py`：脚本共享的 `.env` 和项目根路径读取逻辑
- 说明：当前仓库只保留 10 路口训练与推理相关文件

### 4. 当前实时更新方式

当前项目中的“实时”主要分为两类：

- 本地演示数据：通过服务端自动模拟写入 `traffic_flow` 实现持续变化
- PeMS 数据：当前支持手动导入数据库快照，不是自动实时抓取

## 七、项目目录结构

```text
ITFMFS/
├─ ai_service/               # Flask 推理服务、训练 notebook、模型权重
├─ database/                 # 数据库结构脚本
├─ docs/                     # 启动说明、PeMS 导入说明等文档
├─ scripts/                  # 数据生成、PeMS 导入、训练数据导出脚本
│  ├─ script_utils.py        # 脚本共享的 .env / 路径读取工具
│  ├─ generate_mock_data.py
│  ├─ import_pems_data.py
│  └─ export_training_csv.py
├─ server/                   # Express 路由、数据库连接、模拟器逻辑
├─ src/                      # React 前端
├─ .env.example              # 环境变量模板
├─ server.ts                 # 服务启动入口
├─ package.json
└─ README.md
```

说明：`node_modules/`、`dist/`、`.npm-cache/` 等本地生成目录不纳入仓库目录说明，也不应提交到版本库。

## 八、快速启动

详细启动说明见：[docs/setup.md](docs/setup.md)

### 1. 配置数据库与 `.env`

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=123456
DB_NAME=traffic_system
ADMIN_USERNAME=admin_traffic
ADMIN_PASSWORD=Traffic@123456
ENABLE_TRAFFIC_SIMULATOR=true
TRAFFIC_SIMULATOR_INTERVAL_MS=60000
TRAFFIC_SIMULATOR_STEP_MINUTES=15
```

### 2. 启动 AI 推理服务

```powershell
conda activate thesis
cd /d D:\Projects\VS_Code\ITFMFS\ai_service
python app.py
```

### 3. 启动前端与 Express 服务

```powershell
cd /d D:\Projects\VS_Code\ITFMFS
npm.cmd install
npm.cmd run dev
```

说明：系统里安装了 Node.js 只表示 `node` / `npm` 可用，项目自己的前端依赖仍然需要在仓库根目录执行一次 `npm.cmd install`，这样才会生成本地 `node_modules/`。

### 4. 浏览器访问

```text
http://localhost:3000
```

## 九、当前可直接进行的操作

这一部分适合后续你继续开发、写论文或做展示时直接使用。

补充说明：`scripts/` 下的 Python 脚本现在会统一读取项目根目录 `.env` 中的 `DB_HOST / DB_USER / DB_PASSWORD / DB_NAME` 配置，不再各自写死数据库连接信息。

### 1. 启动系统并演示当前版本

```powershell
npm.cmd run dev
```

```powershell
cd /d D:\Projects\VS_Code\ITFMFS\ai_service
python app.py
```

### 2. 生成或补充本地测试数据

```powershell
conda activate thesis
cd /d D:\Projects\VS_Code\ITFMFS
python scripts\generate_mock_data.py
```

### 3. 导入 PeMS 公开数据快照

详细说明见：[docs/pems_import.md](docs/pems_import.md)

```powershell
conda activate thesis
cd /d D:\Projects\VS_Code\ITFMFS
python scripts\import_pems_data.py --stations "D:\PeMS\stations.csv" --traffic "D:\PeMS\flow.csv"
```

### 4. 导出训练用 CSV

```powershell
conda activate thesis
cd /d D:\Projects\VS_Code\ITFMFS
python scripts\export_training_csv.py --output ai_service\flow_10nodes.csv
```

### 5. 训练 10 路口权重

可在 Colab 中使用：

- `ai_service/thesis_10nodes.ipynb`

训练完成后，将新的 `lst_gcn_weights_10nodes.pth` 放回 `ai_service/` 目录，即可让系统进入 10 路口真实预测模式。

### 6. 导出阶段汇报或演示用报表

系统顶部支持直接导出运行报告，当前为 Excel 可打开的 `CSV` 文件。

## 十、当前已知边界

为了给导师汇报时口径一致，下面这些点建议明确说明：

1. 当前系统已经是“可运行原型”，但还不是生产系统。
2. 路线推荐模块目前是规则化原型，不是完整图搜索最优解。
3. 信号优化模块目前更偏演示与规则控制，还可以继续增强算法性。
4. PeMS 目前是“导入快照后显示”，尚未实现自动定时同步。
5. 10 路口地图和业务模块已完成，但 10 路口真实预测还依赖新权重训练。
6. 当前报表导出优先选择兼容性更好的 `CSV`，而不是原生 `xlsx`。

## 十一、后续建议优先级

### 第一优先级：保证论文与演示闭环

- 使用 PeMS 或其他公开数据集补论文实验数据来源
- 训练并替换 10 路口权重，形成“系统范围与预测范围一致”
- 补充系统测试截图、接口截图和数据库截图
- 开始撰写论文中的系统设计、模块实现、实验环境章节

### 第二优先级：增强工程真实性

- 将 PeMS 导入从“手动快照”升级为“定时同步任务”
- 为高频接口增加 Redis 缓存
- 为管理员操作补充更完整的日志记录和审计信息
- 优化报表格式和系统异常提示

### 第三优先级：提升算法和功能深度

- 将路径推荐升级为更真实的图搜索或代价函数算法
- 优化信号配时策略，增强与预测结果的联动
- 补充更多评价指标，如 `MAE`、`RMSE`、`MAPE`
- 完善多数据源输入和更真实的实时更新机制

## 十二、适合给导师汇报的重点

如果你要基于这个 README 做 PPT，建议重点讲以下 5 点：

1. 当前项目已经不再停留在开题方案，而是形成了真实可运行的工程架构。
2. 系统已经完成从数据库到模型再到前端按小时聚合展示真实预测结果的核心闭环。
3. 当前最强的展示点是“登录后进入系统 -> 地图与图表刷新 -> 预测展示 -> 事件联动 -> 报表导出”。
4. 当前仍保留可继续深入的空间，尤其是公开数据集、10 路口预测和缓存优化。
5. 论文方向与当前项目是匹配的，适合按“开发类论文 / 工程实现类论文”继续推进。

## 十三、关键文件说明

- `server.ts`：Node 服务启动入口
- `server/routes.ts`：主要后端接口与业务逻辑
- `server/db.ts`：MySQL 连接与初始化逻辑
- `server/trafficSimulator.ts`：本地交通流自动模拟更新
- `src/App.tsx`：前端主入口与登录/导出逻辑
- `src/components/LiveMap.tsx`：实时路网地图
- `src/components/DashboardView.tsx`：控制台与流量图表
- `src/components/IncidentsView.tsx`：事件管理
- `src/components/RoutingView.tsx`：路线推荐
- `src/components/SettingsView.tsx`：设置与超级管理员信息
- `ai_service/app.py`：Flask 推理服务
- `ai_service/thesis_10nodes.ipynb`：10 路口训练 notebook
- `database/schema.sql`：数据库结构
- `docs/setup.md`：从零启动说明
- `docs/pems_import.md`：PeMS 导入说明

## 十四、常用命令

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

---

如果后续继续迭代，建议优先围绕“公开数据集 + 10 路口预测 + 论文章节整理”这三条线同步推进，这样最有利于尽快形成完整的毕业论文成果。

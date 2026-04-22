# 项目启动说明

本文档用于说明如何从零启动本项目，包括数据库准备、环境配置、服务启动和常见问题排查。

## 一、环境要求

### Node.js

- 建议版本：Node.js 20 及以上

### Python

- 建议使用 Conda 虚拟环境
- 当前已验证环境：
  - 环境名：`thesis`
  - Python 3.12.12
  - Flask 3.1.3
  - numpy 2.0.1
  - pytorch 2.11.0+cu128
  - pymysql 1.4.6
  - pandas 3.0.1
  - matplotlib 3.10.8

### MySQL

- 建议版本：MySQL 8.x
- 默认数据库名：`traffic_system`

## 二、数据库准备

### 1. 创建数据库

```powershell
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS traffic_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

### 2. 导入表结构

```powershell
mysql -u root -p traffic_system < "D:\Projects\VS_Code\ITFMFS\database\schema.sql"
```

如果你本地数据库中已经保留了测试数据，也可以直接继续使用。

## 三、配置 `.env`

在项目根目录创建 `.env` 文件：

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=123456
DB_NAME=traffic_system
```

说明：

- `DB_PASSWORD` 请替换为你本机实际 MySQL 密码
- `.env.example` 可作为参考模板

## 四、安装依赖

### 1. Node 依赖

```powershell
cd /d D:\Projects\VS_Code\ITFMFS
npm.cmd install
```

说明：即使已经把 Node.js 配到系统环境变量里，项目依赖也不会自动出现在仓库里；只有在项目根目录执行 `npm.cmd install` 之后，`node_modules/` 才会创建出来。

### 2. Python 依赖

如果你已经有 `thesis` 环境，直接激活即可：

```powershell
conda activate thesis
pip install flask==3.1.3 numpy==2.0.1 pymysql==1.4.6 pandas==3.0.1 matplotlib==3.10.8
python -m pip install --upgrade torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
```

如果需要新建环境：

```powershell
conda create -n thesis python=3.12.12 -y
conda activate thesis
pip install flask==3.1.3 numpy==2.0.1 pymysql==1.4.6 pandas==3.0.1 matplotlib==3.10.8
python -m pip install --upgrade torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
```

说明：这台 `RTX 5060 Laptop GPU` 需要使用官方 `cu128` 或更新的 PyTorch Windows 轮子。旧的 `torch 2.5.1 + cu124` 虽然能识别显卡，但实际执行 CUDA 张量运算会报 `no kernel image is available for execution on the device`。

建议安装完成后验证一次：

```powershell
conda run -n thesis python -c "import torch; print(torch.__version__); print(torch.version.cuda); print(torch.cuda.is_available()); print(torch.cuda.get_device_name(0))"
```

## 五、启动项目

项目运行建议使用两个终端。

### 终端 1：启动 AI 推理服务

```powershell
conda activate thesis
cd /d D:\Projects\VS_Code\ITFMFS\ai_service
python app.py
```

启动成功后默认监听：

```text
http://127.0.0.1:5000
```

### 终端 2：启动前端和 Express 服务

```powershell
cd /d D:\Projects\VS_Code\ITFMFS
npm.cmd run dev
```

启动成功后访问：

```text
http://localhost:3000
```

## 六、生成测试数据

如果数据库表已存在，但 `traffic_flow` 数据不足，可运行数据生成脚本：

```powershell
conda activate thesis
cd /d D:\Projects\VS_Code\ITFMFS
python scripts\generate_mock_data.py
```

该脚本会向 `nodes` 和 `traffic_flow` 表写入测试数据。

## 七、常用命令

### 启动开发环境

```powershell
npm.cmd run dev
```

### 类型检查

```powershell
npm.cmd run lint
```

### 构建前端

```powershell
npm.cmd run build
```

### 启动项目服务

```powershell
npm.cmd run start
```

## 八、启动验证

项目启动后建议按以下顺序检查：

1. 访问 `http://localhost:3000`
2. 首页是否能正常打开
3. 地图页面是否显示路口节点或 PeMS 站点
4. 折线图是否返回 1-24 点历史流量，以及从 `predictions` 表聚合出来的预测结果
5. 控制台是否出现 MySQL 连接成功日志
6. Flask 终端是否收到 `/predict` 请求

## 九、常见问题排查

### 1. 页面能打开，但图表是默认数据

可能原因：

- MySQL 未连接成功
- `traffic_flow` 表没有数据
- `.env` 配置错误

排查建议：

- 检查后端终端日志
- 检查数据库中是否存在最近时间的流量记录

### 2. 地图正常，但预测图没有真实预测结果

可能原因：

- Flask 推理服务未启动
- `5000` 端口不可访问
- 权重文件加载失败

排查建议：

- 检查 `ai_service` 终端输出
- 确认 `ai_service/lst_gcn_weights_10nodes.pth` 存在

### 3. MySQL 报密码错误

请检查 `.env` 中的：

```env
DB_PASSWORD=你的密码
```

### 4. Python 启动时报依赖缺失

请确认已经激活正确环境，并执行：

```powershell
pip install flask==3.1.3 numpy==2.0.1 pymysql==1.4.6 pandas==3.0.1 matplotlib==3.10.8
python -m pip install --upgrade torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
```

### 5. 端口被占用

默认端口：

- 前端/Express：`3000`
- Flask：`5000`

如端口冲突，请先关闭已有进程，再重新启动。

## 十、补充说明

- 当前项目中真实联通程度最高的模块是实时指标、地图和预测图。
- 路径推荐功能已完成前后端联调，但后端目前仍是规则化演示逻辑。
- 信号灯优化、异常监控等模块已补齐基础工程逻辑，后续仍可继续扩展。
- 论文写作建议统一使用当前真实实现架构：`React + Express + MySQL + Flask/PyTorch`。

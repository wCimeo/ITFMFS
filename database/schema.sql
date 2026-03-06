-- 创建数据库
CREATE DATABASE IF NOT EXISTS traffic_system DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE traffic_system;

-- 1. 路网节点表 (nodes)
-- 存储各个路口或传感器的静态地理信息
CREATE TABLE `nodes` (
    `id` VARCHAR(20) NOT NULL COMMENT '路口/节点唯一ID',
    `name` VARCHAR(50) NOT NULL COMMENT '路口名称',
    `lat` DECIMAL(10, 6) NOT NULL COMMENT '纬度',
    `lng` DECIMAL(10, 6) NOT NULL COMMENT '经度',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
    PRIMARY KEY (`id`)
) ENGINE=InnoDB COMMENT='路网节点信息表';

-- 2. 历史交通流量表 (traffic_flow)
-- 存储每隔一定时间（如15分钟）采集的真实交通数据，用于模型训练和历史回放
CREATE TABLE `traffic_flow` (
    `id` BIGINT AUTO_INCREMENT NOT NULL COMMENT '主键自增ID',
    `node_id` VARCHAR(20) NOT NULL COMMENT '关联的节点ID',
    `timestamp` DATETIME NOT NULL COMMENT '数据采集的时间戳',
    `flow` INT NOT NULL COMMENT '车流量 (辆/小时)',
    `speed` DECIMAL(5, 2) COMMENT '平均车速 (km/h)',
    `occupancy` DECIMAL(5, 4) COMMENT '道路占有率 (0到1之间)',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '记录写入时间',
    PRIMARY KEY (`id`),
    FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON DELETE CASCADE,
    -- 联合索引：在查询某个路口某段时间的流量时，极大提升查询速度
    INDEX `idx_node_time` (`node_id`, `timestamp`)
) ENGINE=InnoDB COMMENT='历史交通流量数据表';

-- 3. 模型预测结果表 (predictions)
-- 存储 LST-GCN 模型对未来时间段的预测结果
CREATE TABLE `predictions` (
    `id` BIGINT AUTO_INCREMENT NOT NULL COMMENT '主键自增ID',
    `node_id` VARCHAR(20) NOT NULL COMMENT '关联的节点ID',
    `target_time` DATETIME NOT NULL COMMENT '预测的目标时间',
    `predicted_flow` INT NOT NULL COMMENT '预测的车流量',
    `confidence` DECIMAL(4, 3) COMMENT '预测置信度 (0到1之间)',
    `model_version` VARCHAR(20) DEFAULT 'LST-GCN-v1.0' COMMENT '生成该预测的模型版本',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '预测生成的时间',
    PRIMARY KEY (`id`),
    FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON DELETE CASCADE,
    -- 联合索引：查询某个路口未来的预测数据
    INDEX `idx_node_target` (`node_id`, `target_time`)
) ENGINE=InnoDB COMMENT='交通流量预测结果表';

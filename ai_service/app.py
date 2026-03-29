from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from flask import Flask, jsonify, request

app = Flask(__name__)
BASE_DIR = Path(__file__).resolve().parent
DEFAULT_WINDOW_SIZE = 12

SEVEN_NODE_SPEC = {
    'variant': '7nodes',
    'node_ids': ['A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7'],
    'hidden_dim': 64,
    'window_size': 12,
    'max_flow': 250.0,
    'weights_path': BASE_DIR / 'lst_gcn_weights.pth',
    'metadata_path': None,
    'adjacency': [
        [1, 1, 1, 0, 0, 0, 0],
        [1, 1, 0, 1, 0, 0, 0],
        [1, 0, 1, 0, 1, 0, 0],
        [0, 1, 0, 1, 0, 1, 0],
        [0, 0, 1, 0, 1, 0, 1],
        [0, 0, 0, 1, 0, 1, 0],
        [0, 0, 0, 0, 1, 0, 1]
    ]
}

TEN_NODE_SPEC = {
    'variant': '10nodes',
    'node_ids': ['A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7', 'H8', 'I9', 'J10'],
    'hidden_dim': 64,
    'window_size': 12,
    'max_flow': 250.0,
    'weights_path': BASE_DIR / 'lst_gcn_weights_10nodes.pth',
    'metadata_path': BASE_DIR / 'lst_gcn_10nodes_metadata.json',
    'adjacency': [
        [1, 1, 1, 1, 0, 0, 0, 0, 0, 0],
        [1, 1, 0, 0, 1, 1, 0, 0, 0, 0],
        [1, 0, 1, 1, 0, 0, 1, 0, 0, 0],
        [1, 0, 1, 1, 0, 0, 0, 1, 0, 0],
        [0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
        [0, 1, 0, 0, 1, 1, 1, 0, 0, 1],
        [0, 0, 1, 0, 0, 1, 1, 1, 0, 0],
        [0, 0, 0, 1, 0, 0, 1, 1, 1, 0],
        [0, 0, 0, 0, 1, 0, 0, 1, 1, 1],
        [0, 0, 0, 0, 0, 1, 0, 0, 1, 1]
    ]
}


class GCNLayer(nn.Module):
    def __init__(self, in_features: int, out_features: int):
        super().__init__()
        self.weight = nn.Parameter(torch.FloatTensor(in_features, out_features))
        nn.init.xavier_uniform_(self.weight)

    def forward(self, x: torch.Tensor, adj: torch.Tensor):
        support = torch.matmul(x, self.weight)
        output = torch.matmul(adj, support)
        return torch.relu(output)


class LSTGCN(nn.Module):
    def __init__(self, num_nodes: int, in_dim: int, hidden_dim: int, out_dim: int):
        super().__init__()
        self.gcn = GCNLayer(in_dim, hidden_dim)
        self.lstm = nn.LSTM(num_nodes * hidden_dim, hidden_dim, batch_first=True)
        self.fc = nn.Linear(hidden_dim, num_nodes * out_dim)
        self.num_nodes = num_nodes

    def forward(self, x: torch.Tensor, adj: torch.Tensor):
        batch_size, seq_len, num_nodes = x.shape
        gcn_out = torch.zeros(batch_size, seq_len, num_nodes, self.gcn.weight.shape[1], device=x.device)
        for t in range(seq_len):
            gcn_out[:, t, :, :] = self.gcn(x[:, t, :].unsqueeze(-1), adj)
        lstm_in = gcn_out.view(batch_size, seq_len, -1)
        lstm_out, _ = self.lstm(lstm_in)
        out = self.fc(lstm_out[:, -1, :])
        return out.view(batch_size, num_nodes)


def build_normalized_adjacency(adjacency_matrix: list[list[float]]):
    matrix = np.array(adjacency_matrix, dtype=np.float32)
    degree = np.diag(np.sum(matrix, axis=1))
    degree_inv_sqrt = np.linalg.inv(np.sqrt(degree))
    normalized = degree_inv_sqrt @ matrix @ degree_inv_sqrt
    return torch.FloatTensor(normalized)


def with_metadata(spec: dict):
    metadata_path = spec.get('metadata_path')
    if not metadata_path or not Path(metadata_path).exists():
        return spec

    with open(metadata_path, 'r', encoding='utf-8') as file:
        metadata = json.load(file)

    merged = dict(spec)
    merged['node_ids'] = metadata.get('node_ids', merged['node_ids'])
    merged['hidden_dim'] = int(metadata.get('hidden_dim', merged['hidden_dim']))
    merged['window_size'] = int(metadata.get('window_size', merged['window_size']))
    merged['max_flow'] = float(metadata.get('max_flow', merged['max_flow']))
    if metadata.get('adjacency_matrix'):
        merged['adjacency'] = metadata['adjacency_matrix']
    return merged


def load_runtime(spec: dict):
    weights_path = Path(spec['weights_path'])
    if not weights_path.exists():
        return None

    model = LSTGCN(
        num_nodes=len(spec['node_ids']),
        in_dim=1,
        hidden_dim=int(spec['hidden_dim']),
        out_dim=1
    )
    state_dict = torch.load(weights_path, map_location=torch.device('cpu'))
    model.load_state_dict(state_dict)
    model.eval()

    return {
        'variant': spec['variant'],
        'node_ids': spec['node_ids'],
        'window_size': int(spec.get('window_size', DEFAULT_WINDOW_SIZE)),
        'max_flow': float(spec.get('max_flow', 250.0)),
        'weights_path': str(weights_path),
        'metadata_path': str(spec['metadata_path']) if spec.get('metadata_path') else None,
        'adjacency_tensor': build_normalized_adjacency(spec['adjacency']),
        'model': model
    }


AVAILABLE_MODELS: dict[int, dict] = {}
for raw_spec in (SEVEN_NODE_SPEC, with_metadata(TEN_NODE_SPEC)):
    runtime = load_runtime(raw_spec)
    if runtime:
        AVAILABLE_MODELS[len(runtime['node_ids'])] = runtime


@app.route('/model-info', methods=['GET'])
def model_info():
    return jsonify({
        'status': 'success',
        'available_variants': [
            {
                'variant': runtime['variant'],
                'node_ids': runtime['node_ids'],
                'window_size': runtime['window_size'],
                'weights_path': runtime['weights_path'],
                'metadata_path': runtime['metadata_path']
            }
            for runtime in AVAILABLE_MODELS.values()
        ]
    })


@app.route('/predict', methods=['POST'])
def predict():
    try:
        payload = request.get_json(force=True, silent=False) or {}
        history = payload.get('history')
        if history is None:
            return jsonify({'status': 'error', 'message': '请求体缺少 history 字段。'}), 400

        history_data = np.array(history, dtype=np.float32)
        if history_data.ndim != 2:
            return jsonify({'status': 'error', 'message': 'history 必须是二维数组，形如 [时间步][节点]。'}), 400

        seq_len, node_count = history_data.shape
        runtime = AVAILABLE_MODELS.get(node_count)
        if not runtime:
            available = sorted(AVAILABLE_MODELS.keys())
            return jsonify({
                'status': 'error',
                'message': f'当前 AI 服务仅支持节点数 {available} 的模型输入，收到的是 {node_count} 节点。'
            }), 400

        if seq_len != runtime['window_size']:
            return jsonify({
                'status': 'error',
                'message': f"模型 {runtime['variant']} 需要 {runtime['window_size']} 个历史时间步，收到的是 {seq_len}。"
            }), 400

        history_norm = history_data / runtime['max_flow']
        input_tensor = torch.FloatTensor(history_norm).unsqueeze(0)

        with torch.no_grad():
            prediction_norm = runtime['model'](input_tensor, runtime['adjacency_tensor'])

        prediction = (prediction_norm.numpy() * runtime['max_flow']).round().astype(int)
        result = {
            node_id: int(prediction[0][index])
            for index, node_id in enumerate(runtime['node_ids'])
        }

        return jsonify({
            'status': 'success',
            'variant': runtime['variant'],
            'node_ids': runtime['node_ids'],
            'prediction': result
        })
    except Exception as error:
        return jsonify({'status': 'error', 'message': str(error)}), 500


if __name__ == '__main__':
    print('AI 预测微服务已启动，监听端口 5000...')
    print('当前可用模型:')
    if AVAILABLE_MODELS:
        for runtime in AVAILABLE_MODELS.values():
            print(f"- {runtime['variant']}: {len(runtime['node_ids'])} 路口, 权重文件 {runtime['weights_path']}")
    else:
        print('- 未找到可用权重文件，请先放置 lst_gcn_weights.pth 或 lst_gcn_weights_10nodes.pth')
    app.run(host='0.0.0.0', port=5000)

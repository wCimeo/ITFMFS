from __future__ import annotations

import os
import json
from pathlib import Path

# Windows scientific stacks can load duplicate OpenMP runtimes when NumPy and
# PyTorch come from different binary builds. Allow the Flask service to start.
os.environ.setdefault('KMP_DUPLICATE_LIB_OK', 'TRUE')

import numpy as np
import torch
import torch.nn as nn
from flask import Flask, jsonify, request

app = Flask(__name__)
BASE_DIR = Path(__file__).resolve().parent
DEFAULT_WINDOW_SIZE = 12

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
        [0, 0, 0, 0, 0, 1, 0, 0, 1, 1],
    ],
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
        for step_index in range(seq_len):
            gcn_out[:, step_index, :, :] = self.gcn(x[:, step_index, :].unsqueeze(-1), adj)
        lstm_in = gcn_out.view(batch_size, seq_len, -1)
        lstm_out, _ = self.lstm(lstm_in)
        out = self.fc(lstm_out[:, -1, :])
        return out.view(batch_size, num_nodes)


def resolve_runtime_device() -> tuple[torch.device, str | None]:
    if not torch.cuda.is_available():
        return torch.device('cpu'), None

    try:
        device = torch.device('cuda')
        torch.zeros(1, device=device)
        return device, torch.cuda.get_device_name(0)
    except Exception as error:
        print(f"CUDA probe failed, falling back to CPU: {error}")
        return torch.device('cpu'), None


DEVICE, DEVICE_NAME = resolve_runtime_device()


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
    merged['max_flow'] = float(metadata.get('max_flow', metadata.get('max_val', merged['max_flow'])))
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
        out_dim=1,
    )
    state_dict = torch.load(weights_path, map_location=DEVICE)
    model.load_state_dict(state_dict)
    model.to(DEVICE)
    model.eval()

    return {
        'variant': spec['variant'],
        'node_ids': spec['node_ids'],
        'window_size': int(spec.get('window_size', DEFAULT_WINDOW_SIZE)),
        'max_flow': float(spec.get('max_flow', 250.0)),
        'weights_path': str(weights_path),
        'metadata_path': str(spec['metadata_path']) if spec.get('metadata_path') else None,
        'adjacency_tensor': build_normalized_adjacency(spec['adjacency']).to(DEVICE),
        'device': DEVICE.type,
        'device_name': DEVICE_NAME,
        'model': model,
    }


RUNTIME = load_runtime(with_metadata(TEN_NODE_SPEC))


@app.route('/model-info', methods=['GET'])
def model_info():
    return jsonify({
        'status': 'success',
        'runtime_device': DEVICE.type,
        'runtime_device_name': DEVICE_NAME,
        'available_variants': [] if not RUNTIME else [
            {
                'variant': RUNTIME['variant'],
                'node_ids': RUNTIME['node_ids'],
                'window_size': RUNTIME['window_size'],
                'weights_path': RUNTIME['weights_path'],
                'metadata_path': RUNTIME['metadata_path'],
                'device': RUNTIME['device'],
                'device_name': RUNTIME['device_name'],
            }
        ],
    })


@app.route('/predict', methods=['POST'])
def predict():
    try:
        if not RUNTIME:
            return jsonify({
                'status': 'error',
                'message': 'Missing 10-node weights file: lst_gcn_weights_10nodes.pth',
            }), 500

        payload = request.get_json(force=True, silent=False) or {}
        history = payload.get('history')
        if history is None:
            return jsonify({'status': 'error', 'message': 'Request body must include history.'}), 400

        history_data = np.array(history, dtype=np.float32)
        if history_data.ndim != 2:
            return jsonify({
                'status': 'error',
                'message': 'history must be a 2D array shaped like [time][node].',
            }), 400

        seq_len, node_count = history_data.shape
        if node_count != len(RUNTIME['node_ids']):
            return jsonify({
                'status': 'error',
                'message': (
                    f"This AI service only accepts {len(RUNTIME['node_ids'])} nodes, "
                    f"but received {node_count}."
                ),
            }), 400

        if seq_len != RUNTIME['window_size']:
            return jsonify({
                'status': 'error',
                'message': (
                    f"Model {RUNTIME['variant']} expects {RUNTIME['window_size']} time steps, "
                    f"but received {seq_len}."
                ),
            }), 400

        history_norm = history_data / RUNTIME['max_flow']
        input_tensor = torch.FloatTensor(history_norm).unsqueeze(0).to(DEVICE)

        with torch.inference_mode():
            prediction_norm = RUNTIME['model'](input_tensor, RUNTIME['adjacency_tensor'])

        prediction = (prediction_norm.detach().cpu().numpy() * RUNTIME['max_flow']).round().astype(int)
        result = {
            node_id: int(prediction[0][index])
            for index, node_id in enumerate(RUNTIME['node_ids'])
        }

        return jsonify({
            'status': 'success',
            'variant': RUNTIME['variant'],
            'node_ids': RUNTIME['node_ids'],
            'device': RUNTIME['device'],
            'device_name': RUNTIME['device_name'],
            'prediction': result,
        })
    except Exception as error:
        return jsonify({'status': 'error', 'message': str(error)}), 500


if __name__ == '__main__':
    print('AI prediction service started on http://127.0.0.1:5000')
    print(f'Runtime device: {DEVICE.type}')
    if DEVICE_NAME:
        print(f'Runtime GPU: {DEVICE_NAME}')

    if RUNTIME:
        print(f"Active 10-node weights: {RUNTIME['weights_path']}")
    else:
        print('10-node weights file not found: lst_gcn_weights_10nodes.pth')

    app.run(host='0.0.0.0', port=5000)

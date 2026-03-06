# ai_service/app.py
from flask import Flask, request, jsonify
import torch
import torch.nn as nn
import numpy as np

app = Flask(__name__)

# ==========================================
# 1. 重新定义模型结构 (必须和训练时完全一致)
# ==========================================
class GCNLayer(nn.Module):
    def __init__(self, in_features, out_features):
        super(GCNLayer, self).__init__()
        self.weight = nn.Parameter(torch.FloatTensor(in_features, out_features))
        nn.init.xavier_uniform_(self.weight)

    def forward(self, x, adj):
        support = torch.matmul(x, self.weight)
        output = torch.matmul(adj, support)
        return torch.relu(output)

class LSTGCN(nn.Module):
    def __init__(self, num_nodes, in_dim, hidden_dim, out_dim):
        super(LSTGCN, self).__init__()
        self.gcn = GCNLayer(in_dim, hidden_dim)
        self.lstm = nn.LSTM(num_nodes * hidden_dim, hidden_dim, batch_first=True)
        self.fc = nn.Linear(hidden_dim, num_nodes * out_dim)
        self.num_nodes = num_nodes

    def forward(self, x, adj):
        batch_size, seq_len, num_nodes = x.shape
        gcn_out = torch.zeros(batch_size, seq_len, num_nodes, self.gcn.weight.shape[1])
        for t in range(seq_len):
            gcn_out[:, t, :, :] = self.gcn(x[:, t, :].unsqueeze(-1), adj)
        lstm_in = gcn_out.view(batch_size, seq_len, -1)
        lstm_out, _ = self.lstm(lstm_in)
        out = self.fc(lstm_out[:, -1, :])
        return out.view(batch_size, num_nodes)

# ==========================================
# 2. 初始化模型并加载权重
# ==========================================
num_nodes = 7
# 注意：在本地部署推理时，通常使用 CPU 即可 (map_location='cpu')
model = LSTGCN(num_nodes=7, in_dim=1, hidden_dim=64, out_dim=1)
model.load_state_dict(torch.load('lst_gcn_weights.pth', map_location=torch.device('cpu')))
model.eval()

# 重新构建邻接矩阵 (与训练时相同)
A = np.array([
    [1, 1, 1, 0, 0, 0, 0], [1, 1, 0, 1, 0, 0, 0], [1, 0, 1, 0, 1, 0, 0],
    [0, 1, 0, 1, 0, 1, 0], [0, 0, 1, 0, 1, 0, 1], [0, 0, 0, 1, 0, 1, 0],
    [0, 0, 0, 0, 1, 0, 1]
])
D = np.diag(np.sum(A, axis=1))
D_inv_sqrt = np.linalg.inv(np.sqrt(D))
A_hat = np.dot(np.dot(D_inv_sqrt, A), D_inv_sqrt)
A_hat_tensor = torch.FloatTensor(A_hat)

# 假设训练时的最大流量值是 250 (用于反归一化)
MAX_FLOW_VAL = 250.0 

# ==========================================
# 3. 定义 API 接口
# ==========================================
@app.route('/predict', methods=['POST'])
def predict():
    try:
        # 接收 Node.js 发来的历史数据 (过去 12 个时间步，7 个路口的流量)
        # 数据格式期望: {"history": [[flow_A1, flow_B2...], [flow_A1, flow_B2...], ... 12个]}
        data = request.json
        history_data = np.array(data['history'])
        
        # 归一化
        history_norm = history_data / MAX_FLOW_VAL
        
        # 转换为 PyTorch Tensor，形状: (batch_size=1, seq_len=12, num_nodes=7)
        input_tensor = torch.FloatTensor(history_norm).unsqueeze(0)
        
        # 模型推理
        with torch.no_grad():
            prediction_norm = model(input_tensor, A_hat_tensor)
        
        # 反归一化
        prediction = (prediction_norm.numpy() * MAX_FLOW_VAL).round().astype(int)
        
        # 返回预测结果 (7个路口在下一个时间步的预测流量)
        result = {
            "A1": int(prediction[0][0]), "B2": int(prediction[0][1]),
            "C3": int(prediction[0][2]), "D4": int(prediction[0][3]),
            "E5": int(prediction[0][4]), "F6": int(prediction[0][5]),
            "G7": int(prediction[0][6])
        }
        return jsonify({"status": "success", "prediction": result})

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    # 启动 Flask 服务，运行在 5000 端口
    print("🚀 AI 预测微服务已启动，监听端口 5000...")
    app.run(host='0.0.0.0', port=5000)
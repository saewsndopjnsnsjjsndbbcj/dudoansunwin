// server_simple_ai.js
// Node.js + Express - Tài Xỉu Predictor Nội Bộ
// Chạy: node server_simple_ai.js
// Yêu cầu: npm install express axios

const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const HISTORY_API_URL = 'https://sunwin-hcga.onrender.com/';

// -------------------- Helpers --------------------
function getTimeVN() {
    return new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function normalizeResult(val) {
    if (val === undefined || val === null) return '';
    const s = String(val).trim().toLowerCase();
    if (s.includes('t')) return 'Tài';
    if (s.includes('x')) return 'Xỉu';
    const n = Number(s);
    if (!isNaN(n)) return n >= 11 ? 'Tài' : 'Xỉu';
    return '';
}

function randConfidence(min = 50, max = 90) {
    return (Math.random() * (max - min) + min).toFixed(1) + '%';
}

// -------------------- Dự đoán nội bộ --------------------
function predictInternal(history) {
    if (!history || history.length === 0) return { prediction: 'Tài', reason: 'Không có dữ liệu', confidence: 0.5 };

    let demT = 0, demX = 0;
    for (let i = 0; i < Math.min(history.length, 15); i++) {
        const r = normalizeResult(history[i].ket_qua);
        if (r === 'Tài') demT++;
        else if (r === 'Xỉu') demX++;
    }

    let prediction = 'Tài';
    let reason = '';
    let confidence = 0.5;

    if (demT > demX) {
        prediction = 'Tài';
        reason = `Lịch sử ${demT} Tài > ${demX} Xỉu`;
        confidence = 0.5 + (demT / (demT + demX)) * 0.5;
    } else if (demX > demT) {
        prediction = 'Xỉu';
        reason = `Lịch sử ${demX} Xỉu > ${demT} Tài`;
        confidence = 0.5 + (demX / (demT + demX)) * 0.5;
    } else {
        prediction = Math.random() > 0.5 ? 'Tài' : 'Xỉu';
        reason = `Cân bằng trong lịch sử, chọn ngẫu nhiên`;
        confidence = 0.5 + Math.random() * 0.4;
    }

    return { prediction, reason, confidence };
}

// -------------------- Endpoint --------------------
app.get('/api/lookup_predict', async (req, res) => {
    try {
        const response = await axios.get(HISTORY_API_URL, { timeout: 7000 });
        const data = Array.isArray(response.data) ? response.data : [response.data];

        if (!data || data.length === 0) {
            return res.json({ id: 'AI_001', error: 'Không có dữ liệu lịch sử', time_vn: getTimeVN() });
        }

        const phienTruoc = data[0].Phien;
        const xucXac = [data[0].Xuc_xac_1, data[0].Xuc_xac_2, data[0].Xuc_xac_3];
        const tongXucXac = xucXac.reduce((a, b) => a + b, 0);
        const ketQua = normalizeResult(data[0].ket_qua);
        const phienSau = String(Number(phienTruoc) + 1);

        const aiResult = predictInternal(data);

        return res.json({
            id: 'AI_001',
            phien_truoc: phienTruoc,
            xucxac: xucXac,
            tongxucxac: tongXucXac,
            ketqua: ketQua,
            phiensau: phienSau,
            dudoan: aiResult.prediction,
            giai_thich: aiResult.reason,
            do_tin_cay: (aiResult.confidence * 100).toFixed(1) + '%',
            time_vn: getTimeVN()
        });

    } catch (err) {
        console.error('Lỗi khi lấy lịch sử:', err.message || err);
        return res.status(500).json({ id: 'AI_ERR', error: 'Không lấy được dữ liệu lịch sử', time_vn: getTimeVN() });
    }
});

app.get('/', (req, res) => {
    res.send('👑 AI Predictor Nội Bộ - Endpoint: /api/lookup_predict');
});

app.listen(PORT, () => {
    console.log(`🚀 Server chạy cổng ${PORT} - Time VN: ${getTimeVN()}`);
});
